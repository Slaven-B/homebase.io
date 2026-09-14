import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { provideNativeDateAdapter } from '@angular/material/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import {
  BILL_FREQUENCY_LABELS,
  Bill,
  BillFrequency,
  BillInput,
  BillPatch,
} from '../../../core/bills/bill.models';
import { EXPENSE_CATEGORIES } from '../../../core/expenses/expense.models';
import { HouseholdMember } from '../../../core/households/household.models';
import { HouseholdService } from '../../../core/households/household.service';
import { fromIsoDate, toIsoDate } from '../../tasks/task-dialog/task-dialog.component';

export interface BillDialogData {
  householdId: string;
  currency: string;
  bill?: Bill;
}

export type BillDialogResult = BillInput | BillPatch;

@Component({
  selector: 'app-bill-dialog',
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
    <h2 mat-dialog-title>{{ isEdit ? 'Edit bill' : 'New bill' }}</h2>
    <form [formGroup]="form" (ngSubmit)="save()" novalidate>
      <mat-dialog-content class="content">
        <div class="row">
          <mat-form-field appearance="outline" class="grow">
            <mat-label>Name</mat-label>
            <input matInput formControlName="name" required maxlength="140" cdkFocusInitial />
            @if (form.controls.name.hasError('required')) {
              <mat-error>Name the bill, e.g. Internet.</mat-error>
            }
          </mat-form-field>
          <mat-form-field appearance="outline" class="amount">
            <mat-label>Amount</mat-label>
            <input
              matInput
              type="number"
              step="0.01"
              min="0.01"
              formControlName="amount"
              required
            />
            <span matTextSuffix>{{ data.currency }}</span>
          </mat-form-field>
        </div>
        <div class="row">
          <mat-form-field appearance="outline">
            <mat-label>{{ isEdit ? 'Next due' : 'Due date' }}</mat-label>
            <input matInput [matDatepicker]="picker" formControlName="dueDate" required />
            <mat-datepicker-toggle matIconSuffix [for]="picker"></mat-datepicker-toggle>
            <mat-datepicker #picker></mat-datepicker>
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Repeats</mat-label>
            <mat-select formControlName="frequency">
              @for (f of frequencies; track f) {
                <mat-option [value]="f">{{ frequencyLabels[f] }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
        </div>
        <div class="row">
          <mat-form-field appearance="outline">
            <mat-label>Responsible</mat-label>
            <mat-select formControlName="responsibleId">
              <mat-option value="">Nobody in particular</mat-option>
              @for (m of members(); track m.userId) {
                <mat-option [value]="m.userId">{{ m.displayName }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Category</mat-label>
            <mat-select formControlName="category">
              <mat-option value="">None</mat-option>
              @for (c of categories; track c) {
                <mat-option [value]="c">{{ c }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
        </div>
        <mat-form-field appearance="outline">
          <mat-label>Notes</mat-label>
          <textarea matInput formControlName="notes" rows="2" maxlength="1000"></textarea>
        </mat-form-field>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" (click)="ref.close()">Cancel</button>
        <button mat-flat-button type="submit" [disabled]="form.invalid">
          {{ isEdit ? 'Save' : 'Create bill' }}
        </button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    .content {
      display: flex;
      flex-direction: column;
      gap: var(--hb-space-1);
      padding-top: var(--hb-space-2) !important;
      min-width: min(520px, calc(100vw - 64px));
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
    .grow {
      flex: 2 !important;
    }
    .amount {
      max-width: 180px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BillDialogComponent {
  readonly ref = inject(MatDialogRef<BillDialogComponent, BillDialogResult | undefined>);
  readonly data = inject<BillDialogData>(MAT_DIALOG_DATA);
  private readonly fb = inject(FormBuilder);
  private readonly households = inject(HouseholdService);

  readonly members = signal<HouseholdMember[]>([]);
  readonly frequencies: BillFrequency[] = ['MONTHLY', 'WEEKLY', 'YEARLY', 'ONE_TIME'];
  readonly frequencyLabels = BILL_FREQUENCY_LABELS;
  readonly categories = EXPENSE_CATEGORIES;
  readonly isEdit = !!this.data.bill;

  readonly form = this.fb.nonNullable.group({
    name: [this.data.bill?.name ?? '', [Validators.required, Validators.maxLength(140)]],
    amount: [
      this.data.bill ? this.data.bill.amountCents / 100 : (null as number | null),
      [Validators.required, Validators.min(0.01)],
    ],
    dueDate: [fromIsoDate(this.data.bill?.dueDate ?? null) ?? new Date(), [Validators.required]],
    frequency: [this.data.bill?.frequency ?? ('MONTHLY' as BillFrequency)],
    responsibleId: [this.data.bill?.responsible?.id ?? ''],
    category: [this.data.bill?.category ?? ''],
    notes: [this.data.bill?.notes ?? ''],
  });

  constructor() {
    this.households.get(this.data.householdId).subscribe({
      next: (h) => this.members.set(h.members),
      error: () => this.members.set([]),
    });
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    this.ref.close({
      name: v.name.trim(),
      amount: v.amount ?? 0,
      currency: this.data.currency,
      dueDate: toIsoDate(v.dueDate) ?? undefined,
      frequency: v.frequency,
      responsibleId: v.responsibleId || null,
      category: v.category || null,
      notes: v.notes.trim() || null,
    } as BillDialogResult);
  }
}
