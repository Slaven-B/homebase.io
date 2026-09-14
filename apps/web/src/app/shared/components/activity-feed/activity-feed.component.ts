import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { ActivityEntry } from '../../../core/activity/activity.models';
import { describeActivity, relativeTime } from '../../../core/activity/activity-text';

/** Renders a list of activity entries as "Actor did something · 5 min ago". */
@Component({
  selector: 'app-activity-feed',
  imports: [MatIconModule],
  template: `
    @if (entries().length === 0) {
      <p class="feed__empty hb-muted">{{ emptyMessage() }}</p>
    } @else {
      @for (entry of entries(); track entry.id) {
        <div class="hb-row feed__item">
          <span class="feed__icon" aria-hidden="true">
            <mat-icon>{{ describe(entry).icon }}</mat-icon>
          </span>
          <span class="hb-row__body">
            <span class="feed__text">
              <strong>{{ entry.actor?.displayName ?? 'Someone' }}</strong>
              {{ describe(entry).text }}
            </span>
            <span class="hb-subtle">{{ when(entry) }}</span>
          </span>
        </div>
      }
    }
  `,
  styles: `
    .feed__empty {
      margin: 0;
      padding: var(--hb-space-3) var(--hb-space-4) var(--hb-space-4);
      font-size: var(--hb-text-sm);
      line-height: var(--hb-text-sm-lh);
    }
    .feed__item {
      min-height: 48px;
      padding-block: var(--hb-space-2);
    }
    .feed__icon {
      display: grid;
      place-items: center;
      width: 32px;
      height: 32px;
      border-radius: var(--hb-radius-full);
      background: var(--hb-bg-brand-primary);
      color: var(--hb-fg-brand-primary);
      flex-shrink: 0;

      mat-icon {
        font-size: 18px;
        width: 18px;
        height: 18px;
      }
    }
    .feed__text {
      font-size: var(--hb-text-sm);
      line-height: var(--hb-text-sm-lh);
      color: var(--hb-text-secondary);
      overflow-wrap: anywhere;

      strong {
        font-weight: 500;
        color: var(--hb-text-primary);
      }
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
