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
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth';
import {
  Balance,
  Expense,
  ExpenseInput,
  SPLIT_LABELS,
  currentMonth,
  monthLabel,
  shiftMonth,
} from '../../../core/expenses/expense.models';
import { ExpensesService } from '../../../core/expenses/expenses.service';
import { canAdminister } from '../../../core/households/household.models';
import { HouseholdService } from '../../../core/households/household.service';
import { confirm } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import {
  ExpenseDialogComponent,
  ExpenseDialogData,
} from '../expense-dialog/expense-dialog.component';

@Component({
  selector: 'app-expenses-page',
  imports: [
    CurrencyPipe,
    RouterLink,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './expenses-page.component.html',
  styleUrl: './expenses-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExpensesPageComponent {
  private readonly expensesService = inject(ExpensesService);
  private readonly householdService = inject(HouseholdService);
  private readonly auth = inject(AuthService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  readonly current = this.householdService.current;
  readonly month = signal(currentMonth());
  readonly expenses = signal<Expense[] | null>(null);
  readonly totals = signal<{ currency: string; amountCents: number }[]>([]);
  readonly nextCursor = signal<string | null>(null);
  readonly balance = signal<Balance | null>(null);
  readonly error = signal<string | null>(null);
  readonly splitLabels = SPLIT_LABELS;

  readonly monthTitle = computed(() => monthLabel(this.month()));
  readonly isCurrentMonth = computed(() => this.month() === currentMonth());
  /** Household default currency. */
  readonly currency = computed(() => this.current()?.currency ?? 'EUR');

  constructor() {
    effect(() => {
      const household = this.current();
      const month = this.month();
      this.expenses.set(null);
      this.error.set(null);
      if (!household) return;
      this.expensesService.list(household.id, { month }).subscribe({
        next: (page) => {
          this.expenses.set(page.items);
          this.totals.set(page.totals);
          this.nextCursor.set(page.nextCursor);
        },
        error: () => this.error.set('Could not load expenses.'),
      });
    });
    effect(() => {
      const household = this.current();
      this.balance.set(null);
      if (!household) return;
      this.loadBalance(household.id);
    });
  }

  prevMonth(): void {
    this.month.update((m) => shiftMonth(m, -1));
  }

  nextMonth(): void {
    if (!this.isCurrentMonth()) this.month.update((m) => shiftMonth(m, 1));
  }

  loadMore(): void {
    const household = this.current();
    const cursor = this.nextCursor();
    if (!household || !cursor) return;
    this.expensesService.list(household.id, { month: this.month(), cursor }).subscribe({
      next: (page) => {
        this.expenses.update((list) => [...(list ?? []), ...page.items]);
        this.nextCursor.set(page.nextCursor);
      },
      error: () => this.toast('Could not load more expenses.'),
    });
  }

  add(): void {
    const household = this.current();
    if (!household) return;
    this.openDialog({ householdId: household.id, currency: this.currency() }).subscribe((input) => {
      if (!input) return;
      this.expensesService.create(household.id, input).subscribe({
        next: (expense) => {
          if (expense.date.startsWith(this.month())) {
            this.expenses.update((list) => [expense, ...(list ?? [])]);
            this.bumpTotals(expense.currency, expense.amountCents);
          } else {
            this.snackBar.open('Added to ' + monthLabel(expense.date.slice(0, 7)), undefined, {
              duration: 2500,
            });
          }
          this.loadBalance(household.id);
        },
        error: (err: unknown) => this.toast(messageOf(err, 'Could not add the expense.')),
      });
    });
  }

  edit(expense: Expense): void {
    const household = this.current();
    if (!household) return;
    this.openDialog({ householdId: household.id, currency: expense.currency, expense }).subscribe(
      (input) => {
        if (!input) return;
        this.expensesService.update(household.id, expense.id, input).subscribe({
          next: (updated) => {
            this.expenses.update((list) =>
              (list ?? []).map((e) => (e.id === updated.id ? updated : e)),
            );
            this.bumpTotals(expense.currency, updated.amountCents - expense.amountCents);
            this.loadBalance(household.id);
          },
          error: (err: unknown) => this.toast(messageOf(err, 'Could not save the expense.')),
        });
      },
    );
  }

  canModify(expense: Expense): boolean {
    const me = this.auth.user()?.id;
    return (
      canAdminister(this.current()?.role) ||
      expense.createdBy?.id === me ||
      expense.paidBy?.id === me
    );
  }

  remove(expense: Expense): void {
    const household = this.current();
    if (!household) return;
    confirm(this.dialog, {
      title: `Delete "${expense.description}"?`,
      message: 'Balances will be recalculated without it.',
      confirmLabel: 'Delete',
      destructive: true,
    }).subscribe((ok) => {
      if (!ok) return;
      this.expensesService.delete(household.id, expense.id).subscribe({
        next: () => {
          this.expenses.update((list) => (list ?? []).filter((e) => e.id !== expense.id));
          this.bumpTotals(expense.currency, -expense.amountCents);
          this.loadBalance(household.id);
        },
        error: () => this.toast('Could not delete the expense.'),
      });
    });
  }

  dateLabel(date: string): string {
    const [y, m, d] = date.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, {
      weekday: 'short',
      day: 'numeric',
    });
  }

  private loadBalance(householdId: string): void {
    this.expensesService.balances(householdId).subscribe({
      next: (balances) => this.balance.set(balances[0] ?? null),
      error: () => this.balance.set(null),
    });
  }

  private bumpTotals(currency: string, deltaCents: number): void {
    this.totals.update((totals) => {
      const existing = totals.find((t) => t.currency === currency);
      if (!existing) return [...totals, { currency, amountCents: deltaCents }];
      return totals.map((t) =>
        t.currency === currency ? { ...t, amountCents: t.amountCents + deltaCents } : t,
      );
    });
  }

  private openDialog(data: ExpenseDialogData) {
    return this.dialog
      .open<ExpenseDialogComponent, ExpenseDialogData, ExpenseInput | undefined>(
        ExpenseDialogComponent,
        { data, maxWidth: 'calc(100vw - 32px)', autoFocus: 'first-tabbable' },
      )
      .afterClosed();
  }

  private toast(message: string): void {
    this.snackBar.open(message, 'Dismiss', { duration: 5000 });
  }
}

function messageOf(err: unknown, fallback: string): string {
  const body = (err as { error?: { message?: unknown } } | null)?.error;
  const message = Array.isArray(body?.message) ? body.message[0] : body?.message;
  return typeof message === 'string' && message.length < 160 ? message : fallback;
}
