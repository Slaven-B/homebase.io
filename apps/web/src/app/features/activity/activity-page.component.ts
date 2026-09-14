import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { RouterLink } from '@angular/router';
import { ActivityEntry } from '../../core/activity/activity.models';
import { ActivityService } from '../../core/activity/activity.service';
import { HouseholdService } from '../../core/households/household.service';
import { ActivityFeedComponent } from '../../shared/components/activity-feed/activity-feed.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';

const PAGE_SIZE = 25;

/** Full, paginated activity history for the current household. */
@Component({
  selector: 'app-activity-page',
  imports: [
    RouterLink,
    PageHeaderComponent,
    EmptyStateComponent,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    ActivityFeedComponent,
  ],
  template: `
    <app-page-header title="Activity" [subtitle]="current()?.name ?? null" />

    @if (!current()) {
      <div class="hb-card">
        <app-empty-state
          icon="holiday_village"
          title="No household yet"
          message="Pick or create a household to see its activity."
        >
          <a mat-flat-button routerLink="/households">Households</a>
        </app-empty-state>
      </div>
    } @else {
      <div class="hb-card hb-readable">
        @if (entries(); as list) {
          <app-activity-feed [entries]="list" />
          @if (error(); as message) {
            <div class="hb-alert hb-alert--error activity__error" role="alert">{{ message }}</div>
          }
          @if (nextCursor()) {
            <div class="hb-card__actions">
              <button mat-button type="button" (click)="loadMore()" [disabled]="loading()">
                {{ loading() ? 'Loading…' : 'Load older' }}
              </button>
            </div>
          }
        } @else {
          <div class="hb-loading"><mat-spinner diameter="32"></mat-spinner></div>
        }
      </div>
    }
  `,
  styles: `
    .activity__error {
      margin: var(--hb-space-3) var(--hb-space-4);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ActivityPageComponent {
  private readonly activity = inject(ActivityService);
  private readonly householdService = inject(HouseholdService);

  readonly current = this.householdService.current;
  readonly entries = signal<ActivityEntry[] | null>(null);
  readonly nextCursor = signal<string | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  constructor() {
    effect(() => {
      const household = this.current();
      this.entries.set(null);
      this.nextCursor.set(null);
      this.error.set(null);
      if (household) this.fetch(household.id);
    });
  }

  loadMore(): void {
    const household = this.current();
    const cursor = this.nextCursor();
    if (household && cursor && !this.loading()) this.fetch(household.id, cursor);
  }

  private fetch(householdId: string, cursor?: string): void {
    this.loading.set(true);
    this.activity.list(householdId, { limit: PAGE_SIZE, cursor }).subscribe({
      next: (page) => {
        this.entries.update((list) => [...(list ?? []), ...page.items]);
        this.nextCursor.set(page.nextCursor);
        this.loading.set(false);
      },
      error: () => {
        this.entries.update((list) => list ?? []);
        this.error.set('Could not load activity.');
        this.loading.set(false);
      },
    });
  }
}
