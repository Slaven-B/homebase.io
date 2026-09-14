import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { RouterLink } from '@angular/router';
import { ActivityEntry } from '../../core/activity/activity.models';
import { ActivityService } from '../../core/activity/activity.service';
import { HouseholdService } from '../../core/households/household.service';
import { ActivityFeedComponent } from '../../shared/components/activity-feed/activity-feed.component';

const PAGE_SIZE = 25;

/** Full, paginated activity history for the current household. */
@Component({
  selector: 'app-activity-page',
  imports: [
    RouterLink,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    ActivityFeedComponent,
  ],
  template: `
    <h1 class="title">Activity</h1>

    @if (!current()) {
      <mat-card appearance="outlined" class="card card--empty">
        <mat-card-content>
          <p>Pick or create a household to see its activity.</p>
          <a mat-flat-button color="primary" routerLink="/households">Households</a>
        </mat-card-content>
      </mat-card>
    } @else {
      <mat-card appearance="outlined" class="card">
        <mat-card-header>
          <mat-card-title>{{ current()?.name }}</mat-card-title>
        </mat-card-header>
        @if (entries(); as list) {
          <app-activity-feed [entries]="list" />
          @if (error(); as message) {
            <p class="error" role="alert">{{ message }}</p>
          }
          @if (nextCursor()) {
            <mat-card-actions align="end">
              <button mat-button type="button" (click)="loadMore()" [disabled]="loading()">
                {{ loading() ? 'Loading…' : 'Load older' }}
              </button>
            </mat-card-actions>
          }
        } @else {
          <div class="loading"><mat-spinner diameter="32"></mat-spinner></div>
        }
      </mat-card>
    }
  `,
  styles: `
    .title {
      font-size: 1.5rem;
      font-weight: 500;
      margin: 0 0 1rem;
    }
    .card {
      background: var(--hb-bg-primary);
      max-width: 760px;
    }
    .card--empty {
      text-align: center;
      padding: 1rem;
      p {
        color: var(--hb-text-tertiary);
      }
    }
    .loading {
      display: grid;
      place-items: center;
      padding: 2rem;
    }
    .error {
      margin: 0 1rem 1rem;
      color: var(--hb-text-error-primary);
      font-size: 0.875rem;
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
