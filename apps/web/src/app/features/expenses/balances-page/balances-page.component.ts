import { CurrencyPipe, DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth';
import { Balance, Settlement, SettlementInput } from '../../../core/expenses/expense.models';
import { ExpensesService } from '../../../core/expenses/expenses.service';
import { canAdminister } from '../../../core/households/household.models';
import { HouseholdService } from '../../../core/households/household.service';
import { SettleDialogComponent, SettleDialogData } from '../settle-dialog/settle-dialog.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';

@Component({
  selector: 'app-balances-page',
  imports: [
    PageHeaderComponent,
    EmptyStateComponent,
    CurrencyPipe,
    DatePipe,
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatListModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './balances-page.component.html',
  styleUrl: './balances-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BalancesPageComponent {
  private readonly expensesService = inject(ExpensesService);
  private readonly householdService = inject(HouseholdService);
  private readonly auth = inject(AuthService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  readonly current = this.householdService.current;
  readonly balances = signal<Balance[] | null>(null);
  readonly settlements = signal<Settlement[]>([]);
  readonly error = signal<string | null>(null);
  readonly myId = computed(() => this.auth.user()?.id ?? null);
  readonly isAdmin = computed(() => canAdminister(this.current()?.role));

  constructor() {
    effect(() => {
      const household = this.current();
      this.balances.set(null);
      this.error.set(null);
      if (!household) return;
      this.reload(household.id);
    });
  }

  settle(preset?: { toUserId: string; amountCents: number; currency: string }): void {
    const household = this.current();
    if (!household) return;
    this.dialog
      .open<SettleDialogComponent, SettleDialogData, SettlementInput | undefined>(
        SettleDialogComponent,
        {
          data: {
            householdId: household.id,
            currency: preset?.currency ?? this.balances()?.[0]?.currency ?? 'EUR',
            toUserId: preset?.toUserId,
            amount: preset ? preset.amountCents / 100 : undefined,
            canChoosePayer: this.isAdmin(),
          },
          maxWidth: 'calc(100vw - 32px)',
        },
      )
      .afterClosed()
      .subscribe((input) => {
        if (!input) return;
        this.expensesService.settle(household.id, input).subscribe({
          next: () => {
            this.snackBar.open('Settlement recorded', undefined, { duration: 2500 });
            this.reload(household.id);
          },
          error: () => this.toast('Could not record the settlement.'),
        });
      });
  }

  canRemoveSettlement(s: Settlement): boolean {
    const me = this.myId();
    return this.isAdmin() || s.from.id === me || s.createdBy?.id === me;
  }

  removeSettlement(s: Settlement): void {
    const household = this.current();
    if (!household) return;
    this.expensesService.deleteSettlement(household.id, s.id).subscribe({
      next: () => this.reload(household.id),
      error: () => this.toast('Could not remove the settlement.'),
    });
  }

  private reload(householdId: string): void {
    this.expensesService.balances(householdId).subscribe({
      next: (balances) => this.balances.set(balances),
      error: () => this.error.set('Could not load balances.'),
    });
    this.expensesService.settlements(householdId).subscribe({
      next: (settlements) => this.settlements.set(settlements),
      error: () => this.settlements.set([]),
    });
  }

  private toast(message: string): void {
    this.snackBar.open(message, 'Dismiss', { duration: 4000 });
  }
}
