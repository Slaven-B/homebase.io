import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { NotesService } from '../notes/notes.service';
import { NotificationsService } from './notifications.service';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(NotificationsService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    service.stopPolling();
    http.verify();
  });

  it('refreshes the unread count', () => {
    service.refreshUnread();
    http.expectOne('/api/notifications/unread-count').flush({ count: 3 });
    expect(service.unreadCount()).toBe(3);
  });

  it('decrements the badge when one is marked read and clears it on read-all', () => {
    service.refreshUnread();
    http.expectOne('/api/notifications/unread-count').flush({ count: 2 });

    service.markRead('n1').subscribe();
    const one = http.expectOne('/api/notifications/n1/read');
    expect(one.request.method).toBe('PATCH');
    one.flush({ id: 'n1', readAt: new Date().toISOString() });
    expect(service.unreadCount()).toBe(1);

    service.markAllRead().subscribe();
    http.expectOne('/api/notifications/read-all').flush({ updated: 1 });
    expect(service.unreadCount()).toBe(0);
  });

  it('lists with the unread filter and cursor', () => {
    service.list({ unreadOnly: true, cursor: 'c1', limit: 10 }).subscribe();
    http
      .expectOne(
        (r) =>
          r.url === '/api/notifications' &&
          r.params.get('unreadOnly') === 'true' &&
          r.params.get('cursor') === 'c1' &&
          r.params.get('limit') === '10',
      )
      .flush({ items: [], nextCursor: null });
  });

  it('startPolling fetches immediately and is idempotent', () => {
    service.startPolling();
    service.startPolling();
    http.expectOne('/api/notifications/unread-count').flush({ count: 1 });
    expect(service.unreadCount()).toBe(1);
  });
});

describe('NotesService', () => {
  it('uses the household-scoped endpoints', () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const notes = TestBed.inject(NotesService);
    const http = TestBed.inject(HttpTestingController);

    notes.create('h1', { title: 'WiFi', content: 'x' }).subscribe();
    const create = http.expectOne('/api/households/h1/notes');
    expect(create.request.method).toBe('POST');
    create.flush({});

    notes.update('h1', 'n1', { isPinned: true }).subscribe();
    const patch = http.expectOne('/api/households/h1/notes/n1');
    expect(patch.request.method).toBe('PATCH');
    expect(patch.request.body).toEqual({ isPinned: true });
    patch.flush({});

    http.verify();
  });
});
