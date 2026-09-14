import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth';
import { DashboardView } from '../../core/dashboard/dashboard.models';
import { DashboardService } from '../../core/dashboard/dashboard.service';
import { ROLE_LABELS, canAdminister } from '../../core/households/household.models';
import { HouseholdService } from '../../core/households/household.service';
import { ActivityFeedComponent } from '../../shared/components/activity-feed/activity-feed.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';

/**
 * Home base: "what's going on in my household right now?"
 * Sections for modules that are not built yet render as friendly placeholders.
 */
@Component({
  selector: 'app-dashboard',
  imports: [
    RouterLink,
    CurrencyPipe,
    MatIconModule,
    MatButtonModule,
    MatMenuModule,
    MatProgressSpinnerModule,
    ActivityFeedComponent,
    EmptyStateComponent,
    PageHeaderComponent,
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardComponent {
  private readonly householdService = inject(HouseholdService);
  private readonly dashboardService = inject(DashboardService);

  readonly user = inject(AuthService).user;
  readonly households = this.householdService.households;
  readonly current = this.householdService.current;
  readonly view = signal<DashboardView | null>(null);
  readonly error = signal<string | null>(null);
  readonly roleLabels = ROLE_LABELS;
  readonly canAdminister = canAdminister;

  constructor() {
    effect(() => {
      const household = this.current();
      this.view.set(null);
      this.error.set(null);
      if (!household) return;
      this.dashboardService.get(household.id).subscribe({
        next: (view) => this.view.set(view),
        error: () => this.error.set('Could not load the dashboard. Please try again.'),
      });
    });
  }

  greeting(): string {
    const hour = new Date().getHours();
    if (hour < 5) return 'Good night';
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  }

  monthLabel(month: string): string {
    const [y, m] = month.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  }
}
