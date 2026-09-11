import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { HouseholdDetail, HouseholdSummary } from './household.models';
import { HouseholdService } from './household.service';

const summaries: HouseholdSummary[] = [
  { id: 'h1', name: 'Home', role: 'OWNER', memberCount: 2, createdAt: '2026-01-01T00:00:00Z' },
  { id: 'h2', name: 'Cabin', role: 'MEMBER', memberCount: 4, createdAt: '2026-01-02T00:00:00Z' },
];

const detail: HouseholdDetail = {
  id: 'h3',
  name: 'New Place',
  myRole: 'OWNER',
  members: [
    {
      id: 'm1',
      userId: 'u1',
      displayName: 'Me',
      email: 'me@example.com',
      avatarUrl: null,
      role: 'OWNER',
      joinedAt: '2026-01-03T00:00:00Z',
    },
  ],
  createdAt: '2026-01-03T00:00:00Z',
  updatedAt: '2026-01-03T00:00:00Z',
};

describe('HouseholdService', () => {
  let service: HouseholdService;
  let http: HttpTestingController;

  beforeEach(() => {
    try {
      localStorage.clear();
    } catch {
      /* ignore */
    }
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(HouseholdService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('starts unloaded with no current household', () => {
    expect(service.households()).toBeNull();
    expect(service.current()).toBeNull();
  });

  it('loads the list and defaults the current household to the first one', () => {
    service.load().subscribe();
    http.expectOne('/api/households').flush(summaries);

    expect(service.households()?.length).toBe(2);
    expect(service.current()?.id).toBe('h1');
    expect(service.currentId()).toBe('h1');
  });

  it('remembers an explicit selection across reloads', () => {
    service.load().subscribe();
    http.expectOne('/api/households').flush(summaries);

    service.select('h2');
    expect(service.current()?.id).toBe('h2');

    // A fresh service instance reads the stored id back.
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const fresh = TestBed.inject(HouseholdService);
    const freshHttp = TestBed.inject(HttpTestingController);
    fresh.load().subscribe();
    freshHttp.expectOne('/api/households').flush(summaries);

    expect(fresh.current()?.id).toBe('h2');
    freshHttp.verify();
  });

  it('falls back to the first household when the stored one is gone', () => {
    service.select('missing');
    service.load().subscribe();
    http.expectOne('/api/households').flush(summaries);

    expect(service.current()?.id).toBe('h1');
  });

  it('create adds the household to the list as OWNER and selects it', () => {
    service.load().subscribe();
    http.expectOne('/api/households').flush(summaries);

    service.create('New Place').subscribe();
    const req = http.expectOne('/api/households');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ name: 'New Place' });
    req.flush(detail);

    expect(service.households()?.map((h) => h.id)).toEqual(['h1', 'h2', 'h3']);
    expect(service.current()).toEqual(
      jasmine.objectContaining({ id: 'h3', role: 'OWNER', memberCount: 1 }),
    );
  });

  it('leave removes the household and moves the selection', () => {
    service.load().subscribe();
    http.expectOne('/api/households').flush(summaries);
    service.select('h2');

    service.leave('h2').subscribe();
    http.expectOne('/api/households/h2/leave').flush(null);

    expect(service.households()?.map((h) => h.id)).toEqual(['h1']);
    expect(service.current()?.id).toBe('h1');
  });

  it('acceptInvitation posts to the token endpoint and adopts the household', () => {
    service.acceptInvitation('tok-123').subscribe();
    const req = http.expectOne('/api/invitations/tok-123/accept');
    expect(req.request.method).toBe('POST');
    req.flush({ ...detail, myRole: 'MEMBER' });

    expect(service.current()).toEqual(jasmine.objectContaining({ id: 'h3', role: 'MEMBER' }));
  });

  it('reset forgets the loaded list', () => {
    service.load().subscribe();
    http.expectOne('/api/households').flush(summaries);

    service.reset();
    expect(service.households()).toBeNull();
  });
});
