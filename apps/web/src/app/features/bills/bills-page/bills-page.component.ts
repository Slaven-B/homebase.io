import { CurrencyPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth';
import {
  BILL_FREQUENCY_LABELS,
  BILL_URGENCY_LABELS,
  Bill,
  BillInput,
  BillPatch,
  BillUrgency,
  PayBillInput,
  describeBillDue,
} from '../../../core/bills/bill.models';
import { BillsService } from '../../../core/bills/bills.service';
import { canAdminister } from '../../../core/households/household.models';
import { HouseholdService } from '../../../core/households/household.service';
import { confirm } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import {
  BillDialogComponent,
  BillDialogData,
  BillDialogResult,
} from '../bill-dialog/bill-dialog.component';
import { PayDialogComponent, PayDialogData } from '../pay-dialog/pay-dialog.component';

@Component({
  selector: 'app-bills-page',
  imports: [
    CurrencyPipe,
    RouterLink,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatCheckboxModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './bills-page.component.html',
  styleUrl: './bills-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BillsPageComponent {
  private readonly billsService = inject(BillsService);
  private readonly householdService = inject(HouseholdService);
  private readonly auth = inject(AuthService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  readonly current = this.householdService.current;
  readonly bills = signal<Bill[] | null>(null);
  readonly showInactive = signal(false);
  readonly error = signal<string | null>(null);
  readonly busy = signal<string | null>(null);
  readonly frequencyLabels = BILL_FREQUENCY_LABELS;
  readonly urgencyLabels = BILL_URGENCY_LABELS;
  readonly describeDue = describeBillDue;

  readonly currency = computed(() => this.bills()?.[0]?.currency ?? 'EUR');
  readonly sections = computed(() => {
    const order: BillUrgency[] = ['OVERDUE', 'DUE_SOON', 'UPCOMING', 'INACTIVE'];
    const list = this.bills() ?? [];
    return order
      .map((urgency) => ({ urgency, bills: list.filter((b) => b.urgency === urgency) }))
      .filter((s) => s.bills.length > 0);
  });
  readonly upcomingTotalCents = computed(() =>
    (this.bills() ?? [])
      .filter((b) => b.isActive && b.dueInDays <= 30)
      .reduce((sum, b) => sum + b.amountCents, 0),
  );

  constructor() {
    effect(() => {
      const household = this.current();
      const includeInactive = this.showInactive();
      this.bills.set(null);
      this.error.set(null);
      if (!household) return;
      this.billsService.list(household.id, includeInactive).subscribe({
        next: (bills) => this.bills.set(bills),
        error: () => this.error.set('Could not load bills.'),
      });
    });
  }

  create(): void {
    const household = this.current();
    if (!household) return;
    this.openDialog({ householdId: household.id, currency: this.currency() }).subscribe(
      (result) => {
        if (!result) return;
        this.billsService.create(household.id, result as BillInput).subscribe({
          next: (bill) => this.bills.update((list) => sortBills([...(list ?? []), bill])),
          error: () => this.toast('Could not create the bill.'),
        });
      },
    );
  }

  edit(bill: Bill): void {
    const household = this.current();
    if (!household) return;
    this.openDialog({ householdId: household.id, currency: bill.currency, bill }).subscribe(
      (result) => {
        if (!result) return;
        this.billsService.update(household.id, bill.id, result as BillPatch).subscribe({
          next: (updated) => this.replace(updated),
          error: () => this.toast('Could not save the bill.'),
        });
      },
    );
  }

  pay(bill: Bill): void {
    const household = this.current();
    if (!household || this.busy()) return;
    this.dialog
      .open<PayDialogComponent, PayDialogData, PayBillInput | undefined>(PayDialogComponent, {
        data: { bill, memberCount: household.memberCount },
        maxWidth: 'calc(100vw - 32px)',
      })
      .afterClosed()
      .subscribe((input) => {
        if (!input) return;
        this.busy.set(bill.id);
        this.billsService.pay(household.id, bill.id, input).subscribe({
          next: (updated) => {
            this.busy.set(null);
            if (!updated.isActive && !this.showInactive()) {
              this.bills.update((list) => (list ?? []).filter((b) => b.id !== bill.id));
            } else {
              this.replace(updated);
            }
            this.snackBar.open(
              updated.isActive
                ? `Paid. Next due ${describeBillDue(updated).toLowerCase()}.`
                : 'Paid.',
              undefined,
              { duration: 3000 },
            );
          },
          error: () => {
            this.busy.set(null);
            this.toast('Could not record the payment.');
          },
        });
      });
  }

  setActive(bill: Bill, isActive: boolean): void {
    const household = this.current();
    if (!household) return;
    this.billsService.update(household.id, bill.id, { isActive }).subscribe({
      next: (updated) => {
        if (!isActive && !this.showInactive()) {
          this.bills.update((list) => (list ?? []).filter((b) => b.id !== bill.id));
        } else {
          this.replace(updated);
        }
      },
      error: () => this.toast('Could not update the bill.'),
    });
  }

  canDelete(bill: Bill): boolean {
    const me = this.auth.user()?.id;
    return canAdminister(this.current()?.role) || bill.createdBy?.id === me;
  }

  remove(bill: Bill): void {
    const household = this.current();
    if (!household) return;
    confirm(this.dialog, {
      title: `Delete "${bill.name}"?`,
      message: 'The bill and its payment history will be removed. Linked expenses stay.',
      confirmLabel: 'Delete',
      destructive: true,
    }).subscribe((ok) => {
      if (!ok) return;
      this.billsService.delete(household.id, bill.id).subscribe({
        next: () => this.bills.update((list) => (list ?? []).filter((b) => b.id !== bill.id)),
        error: () => this.toast('Could not delete the bill.'),
      });
    });
  }

  dueLabel(date: string): string {
    const [y, m, d] = date.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  }

  private openDialog(data: BillDialogData) {
    return this.dialog
      .open<BillDialogComponent, BillDialogData, BillDialogResult | undefined>(
        BillDialogComponent,
        { data, maxWidth: 'calc(100vw - 32px)' },
      )
      .afterClosed();
  }

  private replace(updated: Bill): void {
    this.bills.update((list) =>
      sortBills((list ?? []).map((b) => (b.id === updated.id ? updated : b))),
    );
  }

  private toast(message: string): void {
    this.snackBar.open(message, 'Dismiss', { duration: 4000 });
  }
}

function sortBills(list: Bill[]): Bill[] {
  return [...list].sort(
    (a, b) =>
      Number(b.isActive) - Number(a.isActive) ||
      a.dueDate.localeCompare(b.dueDate) ||
      a.name.localeCompare(b.name),
  );
}
