import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { ActivityEntry } from '../../../core/activity/activity.models';
import { describeActivity, relativeTime } from '../../../core/activity/activity-text';

/** Renders a list of activity entries as "Actor did something · 5 min ago". */
@Component({
  selector: 'app-activity-feed',
  imports: [MatListModule, MatIconModule],
  template: `
    @if (entries().length === 0) {
      <p class="feed__empty">{{ emptyMessage() }}</p>
    } @else {
      <mat-list class="feed">
        @for (entry of entries(); track entry.id) {
          <mat-list-item class="feed__item">
            <mat-icon matListItemIcon aria-hidden="true">{{ describe(entry).icon }}</mat-icon>
            <span matListItemTitle class="feed__text">
              <strong>{{ entry.actor?.displayName ?? 'Someone' }}</strong>
              {{ describe(entry).text }}
            </span>
            <span matListItemLine class="feed__time">{{ when(entry) }}</span>
          </mat-list-item>
        }
      </mat-list>
    }
  `,
  styles: `
    .feed__empty {
      margin: 0.5rem 1rem 1rem;
      color: rgba(0, 0, 0, 0.6);
      font-size: 0.875rem;
    }
    .feed__text {
      white-space: normal !important;
      line-height: 1.3;
    }
    .feed__time {
      color: rgba(0, 0, 0, 0.55);
      font-size: 0.75rem;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ActivityFeedComponent {
  readonly entries = input.required<ActivityEntry[]>();
  readonly emptyMessage = input('Nothing has happened yet.');

  describe = describeActivity;
  when = (entry: ActivityEntry) => relativeTime(entry.createdAt);
}
