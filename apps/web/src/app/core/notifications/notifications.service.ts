import { HttpClient, HttpParams } from '@angular/common/http';
import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AppNotification, NotificationPage } from './notification.models';

const POLL_INTERVAL_MS = 60_000;

/**
 * Notification API + a polled unread counter for the toolbar badge.
 * Polling is deliberately simple; a WebSocket push can replace `startPolling` later.
 */
@Injectable({ providedIn: 'root' })
export class NotificationsService {
  private readonly http = inject(HttpClient);
  private readonly destroyRef = inject(DestroyRef);
  private readonly base = `${environment.apiUrl}/notifications`;
  private timer: ReturnType<typeof setInterval> | null = null;

  readonly unreadCount = signal(0);

  startPolling(): void {
    if (this.timer) return;
    this.refreshUnread();
    this.timer = setInterval(() => this.refreshUnread(), POLL_INTERVAL_MS);
    this.destroyRef.onDestroy(() => this.stopPolling());
  }

  stopPolling(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.unreadCount.set(0);
  }

  refreshUnread(): void {
    this.http.get<{ count: number }>(`${this.base}/unread-count`).subscribe({
      next: ({ count }) => this.unreadCount.set(count),
      error: () => undefined,
    });
  }

  list(options: { unreadOnly?: boolean; cursor?: string; limit?: number } = {}) {
    let params = new HttpParams();
    if (options.unreadOnly) params = params.set('unreadOnly', 'true');
    if (options.cursor) params = params.set('cursor', options.cursor);
    if (options.limit) params = params.set('limit', options.limit);
    return this.http.get<NotificationPage>(this.base, { params });
  }

  markRead(id: string): Observable<AppNotification> {
    return this.http
      .patch<AppNotification>(`${this.base}/${id}/read`, {})
      .pipe(tap(() => this.unreadCount.update((n) => Math.max(0, n - 1))));
  }

  markAllRead(): Observable<{ updated: number }> {
    return this.http
      .post<{ updated: number }>(`${this.base}/read-all`, {})
      .pipe(tap(() => this.unreadCount.set(0)));
  }

  remove(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }
}
