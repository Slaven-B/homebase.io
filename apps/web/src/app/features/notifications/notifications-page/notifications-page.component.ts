import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Router } from '@angular/router';
import { relativeTime } from '../../../core/activity/activity-text';
import {
  AppNotification,
  NOTIFICATION_ICONS,
} from '../../../core/notifications/notification.models';
import { NotificationsService } from '../../../core/notifications/notifications.service';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';

const PAGE_SIZE = 25;

@Component({
  selector: 'app-notifications-page',
  imports: [
    PageHeaderComponent,
    EmptyStateComponent,
    MatButtonModule,
    MatButtonToggleModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  template: `
    <app-page-header title="Notifications">
      @if (unread() > 0) {
        <button mat-stroked-button type="button" (click)="markAll()">
          <mat-icon>done_all</mat-icon>
          Mark all read
        </button>
      }
    </app-page-header>

    <div class="hb-toolbar">
      <mat-button-toggle-group
        [value]="unreadOnly() ? 'unread' : 'all'"
        (change)="setFilter($event.value === 'unread')"
        hideSingleSelectionIndicator
        aria-label="Filter"
      >
        <mat-button-toggle value="all">All</mat-button-toggle>
        <mat-button-toggle value="unread">Unread ({{ unread() }})</mat-button-toggle>
      </mat-button-toggle-group>
    </div>

    @if (items() === null) {
      <div class="hb-loading"><mat-spinner diameter="32"></mat-spinner></div>
    } @else if (items()!.length === 0) {
      <div class="hb-card hb-readable">
        <app-empty-state
          icon="notifications_none"
          [title]="unreadOnly() ? 'Nothing unread' : 'No notifications yet'"
          message="Assignments, invitations, shared expenses and due bills will show up here."
        />
      </div>
    } @else {
      <div class="hb-card hb-readable">
        @for (n of items(); track n.id) {
          <div class="hb-row item" [class.item--unread]="!n.readAt">
            <span class="item__icon" aria-hidden="true">
              <mat-icon>{{ icons[n.type] }}</mat-icon>
            </span>
            <button type="button" class="hb-row__body item__main" (click)="open(n)">
              <span class="hb-row__title">{{ n.title }}</span>
              @if (n.body) {
                <span class="item__body">{{ n.body }}</span>
              }
              <span class="hb-subtle">{{ when(n) }}</span>
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
          <div class="hb-card__actions">
            <button mat-button type="button" (click)="loadMore()" [disabled]="loading()">
              {{ loading() ? 'Loading…' : 'Load older' }}
            </button>
          </div>
        }
      </div>
    }
  `,
  styles: `
    .item {
      padding-right: var(--hb-space-2);

      &--unread {
        background: var(--hb-bg-brand-primary);
      }
      &--unread .item__icon {
        background: var(--hb-bg-brand-solid);
        color: var(--hb-text-primary-on-brand);
      }
    }
    .item__icon {
      display: grid;
      place-items: center;
      width: 36px;
      height: 36px;
      border-radius: var(--hb-radius-full);
      background: var(--hb-bg-tertiary);
      color: var(--hb-fg-quaternary);
      flex-shrink: 0;

      mat-icon {
        font-size: 20px;
        width: 20px;
        height: 20px;
      }
    }
    .item__main {
      text-align: left;
      border: 0;
      background: none;
      font: inherit;
      color: inherit;
      padding: var(--hb-space-1) 0;
      cursor: pointer;
    }
    .item__body {
      font-size: var(--hb-text-sm);
      line-height: var(--hb-text-sm-lh);
      color: var(--hb-text-secondary);
      overflow-wrap: anywhere;
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
