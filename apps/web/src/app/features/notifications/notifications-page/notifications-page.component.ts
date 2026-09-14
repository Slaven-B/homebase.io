import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Router } from '@angular/router';
import { relativeTime } from '../../../core/activity/activity-text';
import {
  AppNotification,
  NOTIFICATION_ICONS,
} from '../../../core/notifications/notification.models';
import { NotificationsService } from '../../../core/notifications/notifications.service';

const PAGE_SIZE = 25;

@Component({
  selector: 'app-notifications-page',
  imports: [
    MatCardModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  template: `
    <div class="page-header">
      <h1>Notifications</h1>
      @if (unread() > 0) {
        <button mat-stroked-button type="button" (click)="markAll()">
          <mat-icon>done_all</mat-icon>
          Mark all read
        </button>
      }
    </div>

    <mat-button-toggle-group
      class="filter"
      [value]="unreadOnly() ? 'unread' : 'all'"
      (change)="setFilter($event.value === 'unread')"
      hideSingleSelectionIndicator
      aria-label="Filter"
    >
      <mat-button-toggle value="all">All</mat-button-toggle>
      <mat-button-toggle value="unread">Unread ({{ unread() }})</mat-button-toggle>
    </mat-button-toggle-group>

    @if (items() === null) {
      <div class="loading"><mat-spinner diameter="32"></mat-spinner></div>
    } @else if (items()!.length === 0) {
      <mat-card appearance="outlined" class="card card--empty">
        <mat-card-content>
          <mat-icon aria-hidden="true">notifications_none</mat-icon>
          <h2>{{ unreadOnly() ? 'Nothing unread' : 'No notifications yet' }}</h2>
          <p>Assignments, invitations, shared expenses and due bills will show up here.</p>
        </mat-card-content>
      </mat-card>
    } @else {
      <mat-card appearance="outlined" class="card">
        @for (n of items(); track n.id) {
          <div class="item" [class.item--unread]="!n.readAt">
            <mat-icon class="item__icon" aria-hidden="true">{{ icons[n.type] }}</mat-icon>
            <button type="button" class="item__main" (click)="open(n)">
              <span class="item__title">{{ n.title }}</span>
              @if (n.body) {
                <span class="item__body">{{ n.body }}</span>
              }
              <span class="item__time">{{ when(n) }}</span>
            </button>
            @if (!n.readAt) {
              <button mat-icon-button type="button" (click)="markRead(n)" aria-label="Mark as read">
                <mat-icon>check</mat-icon>
              </button>
            }
            <button
              mat-icon-button
              type="button"
              (click)="remove(n)"
              aria-label="Delete notification"
            >
              <mat-icon>close</mat-icon>
            </button>
          </div>
        }
        @if (nextCursor()) {
          <mat-card-actions align="end">
            <button mat-button type="button" (click)="loadMore()" [disabled]="loading()">
              {{ loading() ? 'Loading…' : 'Load older' }}
            </button>
          </mat-card-actions>
        }
      </mat-card>
    }
  `,
  styles: `
    .page-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      margin-bottom: 0.75rem;
      h1 {
        font-size: 1.5rem;
        font-weight: 500;
        margin: 0;
      }
    }
    .filter {
      margin-bottom: 1rem;
    }
    .card {
      background: var(--hb-bg-primary);
      max-width: 760px;
      &--empty {
        text-align: center;
        padding: 1.5rem 1rem;
        h2 {
          font-size: 1.125rem;
          margin: 0.5rem 0 0.25rem;
        }
        p {
          margin: 0 auto;
          max-width: 420px;
          color: var(--hb-text-tertiary);
        }
        mat-icon {
          font-size: 40px;
          width: 40px;
          height: 40px;
          color: var(--hb-fg-brand-primary);
        }
      }
    }
    .item {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.375rem 0.5rem 0.375rem 1rem;
      border-top: 1px solid var(--hb-border-secondary);
      &:first-child {
        border-top: 0;
      }
      &--unread {
        background: var(--hb-bg-brand-primary);
        .item__title {
          font-weight: 500;
        }
      }
    }
    .item__icon {
      color: var(--hb-fg-brand-primary);
      flex-shrink: 0;
    }
    .item__main {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      text-align: left;
      border: 0;
      background: none;
      font: inherit;
      padding: 0.25rem 0;
      cursor: pointer;
    }
    .item__body {
      font-size: 0.875rem;
      color: var(--hb-text-secondary);
      overflow-wrap: anywhere;
    }
    .item__time {
      font-size: 0.75rem;
      color: var(--hb-text-quaternary);
    }
    .loading {
      display: grid;
      place-items: center;
      padding: 2rem;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotificationsPageComponent implements OnInit {
  private readonly notifications = inject(NotificationsService);
  private readonly router = inject(Router);

  readonly unread = this.notifications.unreadCount;
  readonly unreadOnly = signal(false);
  readonly items = signal<AppNotification[] | null>(null);
  readonly nextCursor = signal<string | null>(null);
  readonly loading = signal(false);
  readonly icons = NOTIFICATION_ICONS;
  when = (n: AppNotification) => relativeTime(n.createdAt);

  ngOnInit(): void {
    this.fetch();
  }

  setFilter(unreadOnly: boolean): void {
    this.unreadOnly.set(unreadOnly);
    this.fetch();
  }

  loadMore(): void {
    const cursor = this.nextCursor();
    if (cursor && !this.loading()) this.fetch(cursor);
  }

  open(n: AppNotification): void {
    if (!n.readAt) this.markRead(n);
    if (n.link) void this.router.navigateByUrl(n.link);
  }

  markRead(n: AppNotification): void {
    this.notifications.markRead(n.id).subscribe({
      next: (updated) =>
        this.items.update((list) => {
          const next = (list ?? []).map((x) => (x.id === n.id ? updated : x));
          return this.unreadOnly() ? next.filter((x) => !x.readAt) : next;
        }),
      error: () => undefined,
    });
  }

  markAll(): void {
    this.notifications
      .markAllRead()
      .subscribe({ next: () => this.fetch(), error: () => undefined });
  }

  remove(n: AppNotification): void {
    this.notifications.remove(n.id).subscribe({
      next: () => {
        this.items.update((list) => (list ?? []).filter((x) => x.id !== n.id));
        if (!n.readAt) this.notifications.refreshUnread();
      },
      error: () => undefined,
    });
  }

  private fetch(cursor?: string): void {
    this.loading.set(true);
    if (!cursor) this.items.set(null);
    this.notifications.list({ unreadOnly: this.unreadOnly(), limit: PAGE_SIZE, cursor }).subscribe({
      next: (page) => {
        this.items.update((list) => [...(cursor ? (list ?? []) : []), ...page.items]);
        this.nextCursor.set(page.nextCursor);
        this.loading.set(false);
      },
      error: () => {
        this.items.update((list) => list ?? []);
        this.loading.set(false);
      },
    });
  }
}
