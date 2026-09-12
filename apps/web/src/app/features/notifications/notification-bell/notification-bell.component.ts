import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatBadgeModule } from '@angular/material/badge';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Router, RouterLink } from '@angular/router';
import { relativeTime } from '../../../core/activity/activity-text';
import {
  AppNotification,
  NOTIFICATION_ICONS,
} from '../../../core/notifications/notification.models';
import { NotificationsService } from '../../../core/notifications/notifications.service';

/** Toolbar bell with unread badge and a dropdown of the latest notifications. */
@Component({
  selector: 'app-notification-bell',
  imports: [
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatBadgeModule,
    MatMenuModule,
    MatProgressSpinnerModule,
  ],
  template: `
    <button
      mat-icon-button
      type="button"
      [matMenuTriggerFor]="menu"
      (menuOpened)="load()"
      aria-label="Notifications"
    >
      <mat-icon
        [matBadge]="unread() > 99 ? '99+' : unread()"
        [matBadgeHidden]="unread() === 0"
        matBadgeColor="warn"
        matBadgeSize="small"
        aria-hidden="true"
      >
        {{ unread() > 0 ? 'notifications_active' : 'notifications' }}
      </mat-icon>
    </button>

    <mat-menu #menu="matMenu" xPosition="before" class="bell-menu">
      <div
        class="bell"
        (click)="$event.stopPropagation()"
        (keydown)="$event.stopPropagation()"
        tabindex="-1"
      >
        <div class="bell__head">
          <strong>Notifications</strong>
          @if (unread() > 0) {
            <button mat-button type="button" (click)="markAll()">Mark all read</button>
          }
        </div>
        @if (items() === null) {
          <div class="bell__loading"><mat-spinner diameter="24"></mat-spinner></div>
        } @else if (items()!.length === 0) {
          <p class="bell__empty">You're all caught up.</p>
        } @else {
          @for (n of items(); track n.id) {
            <button type="button" class="item" [class.item--unread]="!n.readAt" (click)="open(n)">
              <mat-icon class="item__icon" aria-hidden="true">{{ icons[n.type] }}</mat-icon>
              <span class="item__text">
                <span class="item__title">{{ n.title }}</span>
                @if (n.body) {
                  <span class="item__body">{{ n.body }}</span>
                }
                <span class="item__time">{{ when(n) }}</span>
              </span>
            </button>
          }
        }
        <a mat-button routerLink="/notifications" class="bell__all">All notifications</a>
      </div>
    </mat-menu>
  `,
  styles: `
    .bell {
      width: min(380px, calc(100vw - 32px));
      padding: 0.25rem 0 0.25rem;
      outline: none;
    }
    .bell__head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.25rem 0.5rem 0.25rem 1rem;
    }
    .bell__loading {
      display: grid;
      place-items: center;
      padding: 1rem;
    }
    .bell__empty {
      margin: 0;
      padding: 1rem;
      color: rgba(0, 0, 0, 0.6);
      font-size: 0.875rem;
    }
    .bell__all {
      display: block;
      margin: 0.25rem 0.5rem 0;
      text-align: center;
    }
    .item {
      display: flex;
      gap: 0.75rem;
      width: 100%;
      text-align: left;
      border: 0;
      background: none;
      font: inherit;
      padding: 0.5rem 1rem;
      cursor: pointer;
      border-top: 1px solid rgba(0, 0, 0, 0.06);
      &:hover {
        background: rgba(0, 0, 0, 0.04);
      }
      &--unread {
        background: #f1f6ff;
        .item__title {
          font-weight: 500;
        }
      }
    }
    .item__icon {
      color: #005cbb;
      flex-shrink: 0;
    }
    .item__text {
      display: flex;
      flex-direction: column;
      min-width: 0;
      font-size: 0.875rem;
    }
    .item__body {
      color: rgba(0, 0, 0, 0.7);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .item__time {
      font-size: 0.75rem;
      color: rgba(0, 0, 0, 0.55);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotificationBellComponent {
  private readonly notifications = inject(NotificationsService);
  private readonly router = inject(Router);

  readonly unread = this.notifications.unreadCount;
  readonly items = signal<AppNotification[] | null>(null);
  readonly icons = NOTIFICATION_ICONS;
  when = (n: AppNotification) => relativeTime(n.createdAt);

  load(): void {
    this.items.set(null);
    this.notifications.list({ limit: 8 }).subscribe({
      next: (page) => this.items.set(page.items),
      error: () => this.items.set([]),
    });
  }

  open(n: AppNotification): void {
    if (!n.readAt) {
      this.notifications.markRead(n.id).subscribe({ error: () => undefined });
      this.items.update((list) =>
        (list ?? []).map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)),
      );
    }
    if (n.link) void this.router.navigateByUrl(n.link);
  }

  markAll(): void {
    this.notifications.markAllRead().subscribe({
      next: () =>
        this.items.update((list) =>
          (list ?? []).map((x) => ({ ...x, readAt: x.readAt ?? new Date().toISOString() })),
        ),
      error: () => undefined,
    });
  }
}
