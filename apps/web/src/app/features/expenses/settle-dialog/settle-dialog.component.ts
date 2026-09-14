import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { provideNativeDateAdapter } from '@angular/material/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { AuthService } from '../../../core/auth';
import { SettlementInput } from '../../../core/expenses/expense.models';
import { HouseholdMember } from '../../../core/households/household.models';
import { HouseholdService } from '../../../core/households/household.service';
import { toIsoDate } from '../../tasks/task-dialog/task-dialog.component';

export interface SettleDialogData {
  householdId: string;
  currency: string;
  toUserId?: string;
  amount?: number;
  /** Admins may record a settlement on behalf of another member. */
  canChoosePayer: boolean;
}

@Component({
  selector: 'app-settle-dialog',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatDatepickerModule,
    MatButtonModule,
  ],
  providers: [provideNativeDateAdapter()],
  template: `
    <h2 mat-dialog-title>Record a payment</h2>
    <form [formGroup]="form" (ngSubmit)="save()" novalidate>
      <mat-dialog-content class="content">
        <p class="hint">
          Paying someone back outside the app? Record it here so balances stay accurate.
        </p>
        @if (data.canChoosePayer) {
          <mat-form-field appearance="outline">
            <mat-label>Paid by</mat-label>
            <mat-select formControlName="fromUserId" required>
              @for (m of members(); track m.userId) {
                <mat-option [value]="m.userId">{{ m.displayName }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
        }
        <mat-form-field appearance="outline">
          <mat-label>Paid to</mat-label>
          <mat-select formControlName="toUserId" required>
            @for (m of members(); track m.userId) {
              @if (m.userId !== form.controls.fromUserId.value) {
                <mat-option [value]="m.userId">{{ m.displayName }}</mat-option>
              }
            }
          </mat-select>
        </mat-form-field>
        <div class="row">
          <mat-form-field appearance="outline">
            <mat-label>Amount</mat-label>
            <input
              matInput
              type="number"
              step="0.01"
              min="0.01"
              formControlName="amount"
              required
              cdkFocusInitial
            />
            <span matTextSuffix>{{ data.currency }}</span>
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Date</mat-label>
            <input matInput [matDatepicker]="picker" formControlName="date" />
            <mat-datepicker-toggle matIconSuffix [for]="picker"></mat-datepicker-toggle>
            <mat-datepicker #picker></mat-datepicker>
          </mat-form-field>
        </div>
        <mat-form-field appearance="outline">
          <mat-label>Note</mat-label>
          <input
            matInput
            formControlName="note"
            maxlength="500"
            placeholder="e.g. cash, bank transfer"
          />
        </mat-form-field>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" (click)="ref.close()">Cancel</button>
        <button mat-flat-button type="submit" [disabled]="form.invalid">Record</button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    .content {
      display: flex;
      flex-direction: column;
      gap: var(--hb-space-1);
      padding-top: var(--hb-space-2) !important;
      min-width: min(420px, calc(100vw - 64px));
    }
    .hint {
      margin: 0 0 var(--hb-space-3);
      color: var(--hb-text-tertiary);
      font-size: var(--hb-text-sm);
    }
    .row {
      display: flex;
      gap: var(--hb-space-2);
      flex-wrap: wrap;
      mat-form-field {
        flex: 1;
        min-width: 140px;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettleDialogComponent {
  readonly ref = inject(MatDialogRef<SettleDialogComponent, SettlementInput | undefined>);
  readonly data = inject<SettleDialogData>(MAT_DIALOG_DATA);
  private readonly fb = inject(FormBuilder);
  private readonly households = inject(HouseholdService);
  private readonly auth = inject(AuthService);

  readonly members = signal<HouseholdMember[]>([]);
  readonly form = this.fb.nonNullable.group({
    fromUserId: [this.auth.user()?.id ?? '', [Validators.required]],
    toUserId: [this.data.toUserId ?? '', [Validators.required]],
    amount: [
      this.data.amount ?? (null as number | null),
      [Validators.required, Validators.min(0.01)],
    ],
    date: [new Date()],
    note: [''],
  });

  constructor() {
    this.households.get(this.data.householdId).subscribe({
      next: (h) => this.members.set(h.members),
      error: () => this.members.set([]),
    });
  }

  save(): void {
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    const me = this.auth.user()?.id;
    this.ref.close({
      ...(v.fromUserId && v.fromUserId !== me ? { fromUserId: v.fromUserId } : {}),
      toUserId: v.toUserId,
      amount: v.amount ?? 0,
      currency: this.data.currency,
      date: toIsoDate(v.date) ?? undefined,
      note: v.note.trim() || null,
    });
  }
}
