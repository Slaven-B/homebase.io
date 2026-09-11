import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { provideNativeDateAdapter } from '@angular/material/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { Bill, PayBillInput } from '../../../core/bills/bill.models';
import { toIsoDate } from '../../tasks/task-dialog/task-dialog.component';

export interface PayDialogData {
  bill: Bill;
  memberCount: number;
}

@Component({
  selector: 'app-pay-dialog',
  imports: [
    ReactiveFormsModule,
    CurrencyPipe,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatDatepickerModule,
    MatCheckboxModule,
    MatButtonModule,
  ],
  providers: [provideNativeDateAdapter()],
  template: `
    <h2 mat-dialog-title>Mark "{{ data.bill.name }}" as paid</h2>
    <form [formGroup]="form" (ngSubmit)="save()" novalidate>
      <mat-dialog-content class="content">
        <div class="row">
          <mat-form-field appearance="outline">
            <mat-label>Amount paid</mat-label>
            <input
              matInput
              type="number"
              step="0.01"
              min="0.01"
              formControlName="amount"
              required
              cdkFocusInitial
            />
            <span matTextSuffix>{{ data.bill.currency }}</span>
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Paid on</mat-label>
            <input matInput [matDatepicker]="picker" formControlName="paidAt" />
            <mat-datepicker-toggle matIconSuffix [for]="picker"></mat-datepicker-toggle>
            <mat-datepicker #picker></mat-datepicker>
          </mat-form-field>
        </div>
        <mat-form-field appearance="outline">
          <mat-label>Note</mat-label>
          <input matInput formControlName="note" maxlength="500" placeholder="optional" />
        </mat-form-field>
        <mat-checkbox formControlName="recordAsExpense">
          Also add as a shared expense
          <span class="hint">
            split equally between {{ data.memberCount }}
            {{ data.memberCount === 1 ? 'member' : 'members' }}, paid by you
          </span>
        </mat-checkbox>
        @if (data.bill.frequency !== 'ONE_TIME') {
          <p class="hint hint--block">
            The next due date moves forward one
            {{
              data.bill.frequency === 'WEEKLY'
                ? 'week'
                : data.bill.frequency === 'YEARLY'
                  ? 'year'
                  : 'month'
            }}.
          </p>
        } @else {
          <p class="hint hint--block">One-time bill: it will be marked as done.</p>
        }
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" (click)="ref.close()">Cancel</button>
        <button mat-flat-button color="primary" type="submit" [disabled]="form.invalid">
          Mark paid · {{ form.controls.amount.value | currency: data.bill.currency }}
        </button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    .content {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      padding-top: 0.5rem !important;
      min-width: min(440px, calc(100vw - 64px));
    }
    .row {
      display: flex;
      gap: 0.5rem;
      flex-wrap: wrap;
      mat-form-field {
        flex: 1;
        min-width: 140px;
      }
    }
    .hint {
      display: block;
      font-size: 0.8125rem;
      color: rgba(0, 0, 0, 0.6);
    }
    .hint--block {
      margin: 0.5rem 0 0;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PayDialogComponent {
  readonly ref = inject(MatDialogRef<PayDialogComponent, PayBillInput | undefined>);
  readonly data = inject<PayDialogData>(MAT_DIALOG_DATA);
  private readonly fb = inject(FormBuilder);

  readonly form = this.fb.nonNullable.group({
    amount: [this.data.bill.amountCents / 100, [Validators.required, Validators.min(0.01)]],
    paidAt: [new Date()],
    note: [''],
    recordAsExpense: [this.data.memberCount > 1],
  });

  save(): void {
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    this.ref.close({
      amount: v.amount,
      paidAt: toIsoDate(v.paidAt) ?? undefined,
      note: v.note.trim() || null,
      recordAsExpense: v.recordAsExpense,
    });
  }
}
