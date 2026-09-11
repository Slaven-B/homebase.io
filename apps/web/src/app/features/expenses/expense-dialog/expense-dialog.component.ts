import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { provideNativeDateAdapter } from '@angular/material/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { AuthService } from '../../../core/auth';
import {
  EXPENSE_CATEGORIES,
  Expense,
  ExpenseInput,
  SPLIT_LABELS,
  SplitMethod,
} from '../../../core/expenses/expense.models';
import { HouseholdMember } from '../../../core/households/household.models';
import { HouseholdService } from '../../../core/households/household.service';
import { fromIsoDate, toIsoDate } from '../../tasks/task-dialog/task-dialog.component';

export interface ExpenseDialogData {
  householdId: string;
  currency: string;
  expense?: Expense;
}

interface ParticipantRow {
  userId: string;
  displayName: string;
  included: FormControl<boolean>;
  amount: FormControl<number | null>;
  percent: FormControl<number | null>;
}

/**
 * Create / edit an expense with a live split preview. Mirrors the server's
 * split rules so mistakes are caught before submitting.
 */
@Component({
  selector: 'app-expense-dialog',
  imports: [
    ReactiveFormsModule,
    CurrencyPipe,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatDatepickerModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatCheckboxModule,
  ],
  providers: [provideNativeDateAdapter()],
  templateUrl: './expense-dialog.component.html',
  styleUrl: './expense-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExpenseDialogComponent {
  readonly ref = inject(MatDialogRef<ExpenseDialogComponent, ExpenseInput | undefined>);
  readonly data = inject<ExpenseDialogData>(MAT_DIALOG_DATA);
  private readonly fb = inject(FormBuilder);
  private readonly households = inject(HouseholdService);
  private readonly auth = inject(AuthService);

  readonly categories = EXPENSE_CATEGORIES;
  readonly splitLabels = SPLIT_LABELS;
  readonly methods: SplitMethod[] = ['EQUAL', 'PERCENTAGE', 'CUSTOM'];
  readonly isEdit = !!this.data.expense;
  readonly members = signal<HouseholdMember[]>([]);
  readonly rows = signal<ParticipantRow[]>([]);

  readonly form = this.fb.nonNullable.group({
    description: [
      this.data.expense?.description ?? '',
      [Validators.required, Validators.maxLength(140)],
    ],
    amount: [
      this.data.expense ? this.data.expense.amountCents / 100 : (null as number | null),
      [Validators.required, Validators.min(0.01), Validators.max(1_000_000)],
    ],
    date: [fromIsoDate(this.data.expense?.date ?? null) ?? new Date()],
    category: [this.data.expense?.category ?? ''],
    notes: [this.data.expense?.notes ?? '', [Validators.maxLength(1000)]],
    paidById: [this.data.expense?.paidBy?.id ?? this.auth.user()?.id ?? '', [Validators.required]],
    splitMethod: [this.data.expense?.splitMethod ?? ('EQUAL' as SplitMethod)],
  });

  // Signals derived from form values, for the live preview.
  private readonly amountValue = toSignal(this.form.controls.amount.valueChanges, {
    initialValue: this.form.controls.amount.value,
  });
  private readonly methodValue = toSignal(this.form.controls.splitMethod.valueChanges, {
    initialValue: this.form.controls.splitMethod.value,
  });
  private readonly rowsVersion = signal(0);

  /** Cents per included participant, or an error message. */
  readonly preview = computed<{ shares: Map<string, number>; error: string | null }>(() => {
    this.rowsVersion();
    const totalCents = Math.round((this.amountValue() ?? 0) * 100);
    const method = this.methodValue();
    const included = this.rows().filter((r) => r.included.value);
    const shares = new Map<string, number>();
    if (totalCents <= 0) return { shares, error: null };
    if (included.length === 0) return { shares, error: 'Pick at least one person to split with.' };

    if (method === 'EQUAL') {
      const base = Math.floor(totalCents / included.length);
      let remainder = totalCents - base * included.length;
      for (const r of included) {
        shares.set(r.userId, base + (remainder > 0 ? 1 : 0));
        remainder = Math.max(0, remainder - 1);
      }
      return { shares, error: null };
    }
    if (method === 'PERCENTAGE') {
      const total = included.reduce((s, r) => s + (r.percent.value ?? 0), 0);
      for (const r of included)
        shares.set(r.userId, Math.round((totalCents * (r.percent.value ?? 0)) / 100));
      return {
        shares,
        error:
          Math.abs(total - 100) > 0.01
            ? `Percentages add up to ${total.toFixed(2)}%, not 100%.`
            : null,
      };
    }
    const sum = included.reduce((s, r) => s + Math.round((r.amount.value ?? 0) * 100), 0);
    for (const r of included) shares.set(r.userId, Math.round((r.amount.value ?? 0) * 100));
    return {
      shares,
      error:
        sum !== totalCents
          ? `Amounts add up to ${(sum / 100).toFixed(2)}, the expense is ${(totalCents / 100).toFixed(2)}.`
          : null,
    };
  });

  constructor() {
    this.households.get(this.data.householdId).subscribe({
      next: (h) => {
        this.members.set(h.members);
        this.rows.set(h.members.map((m) => this.rowFor(m)));
        this.touchRows();
      },
      error: () => this.members.set([]),
    });
  }

  method(): SplitMethod {
    return this.methodValue();
  }

  splitEvenly(): void {
    const included = this.rows().filter((r) => r.included.value);
    if (included.length === 0) return;
    const each = Math.floor(10000 / included.length) / 100;
    included.forEach((r, i) =>
      r.percent.setValue(i === 0 ? +(100 - each * (included.length - 1)).toFixed(2) : each),
    );
    this.touchRows();
  }

  touchRows(): void {
    this.rowsVersion.update((v) => v + 1);
  }

  save(): void {
    const { error } = this.preview();
    if (this.form.invalid || error) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const method = v.splitMethod;
    const participants = this.rows()
      .filter((r) => r.included.value)
      .map((r) => ({
        userId: r.userId,
        ...(method === 'CUSTOM' ? { amount: r.amount.value ?? 0 } : {}),
        ...(method === 'PERCENTAGE' ? { percent: r.percent.value ?? 0 } : {}),
      }));
    this.ref.close({
      description: v.description.trim(),
      amount: v.amount ?? 0,
      currency: this.data.currency,
      date: toIsoDate(v.date) ?? undefined,
      category: v.category || null,
      notes: v.notes.trim() || null,
      paidById: v.paidById,
      splitMethod: method,
      participants,
    });
  }

  private rowFor(m: HouseholdMember): ParticipantRow {
    const existing = this.data.expense?.splits.find((s) => s.user.id === m.userId);
    const includedByDefault = this.data.expense ? !!existing : true;
    const row: ParticipantRow = {
      userId: m.userId,
      displayName: m.displayName,
      included: new FormControl(includedByDefault, { nonNullable: true }),
      amount: new FormControl(existing ? existing.amountCents / 100 : null),
      percent: new FormControl(existing?.percent ?? null),
    };
    row.included.valueChanges.subscribe(() => this.touchRows());
    row.amount.valueChanges.subscribe(() => this.touchRows());
    row.percent.valueChanges.subscribe(() => this.touchRows());
    return row;
  }
}
