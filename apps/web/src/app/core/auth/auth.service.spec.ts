import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AuthResponse } from './auth.models';
import { AuthService } from './auth.service';

const session: AuthResponse = {
  user: {
    id: 'u1',
    email: 'anna@example.com',
    displayName: 'Anna',
    avatarUrl: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  accessToken: 'access-1',
  expiresIn: 900,
};

describe('AuthService', () => {
  let service: AuthService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('starts with an unknown session', () => {
    expect(service.status()).toBe('unknown');
    expect(service.isAuthenticated()).toBeFalse();
    expect(service.accessToken).toBeNull();
  });

  it('login stores the user and access token', () => {
    service.login({ email: 'anna@example.com', password: 'secret-secret' }).subscribe();

    const req = http.expectOne('/api/auth/login');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ email: 'anna@example.com', password: 'secret-secret' });
    req.flush(session);

    expect(service.isAuthenticated()).toBeTrue();
    expect(service.user()?.displayName).toBe('Anna');
    expect(service.accessToken).toBe('access-1');
  });

  it('register stores the session too', () => {
    service
      .register({ email: 'anna@example.com', password: 'secret-secret', displayName: 'Anna' })
      .subscribe();
    http.expectOne('/api/auth/register').flush(session);

    expect(service.isAuthenticated()).toBeTrue();
  });

  it('restoreSession refreshes once and becomes authenticated', async () => {
    const promise = service.restoreSession();
    http.expectOne('/api/auth/refresh').flush({ ...session, accessToken: 'access-2' });
    await promise;

    expect(service.status()).toBe('authenticated');
    expect(service.accessToken).toBe('access-2');

    // Second call is a no-op once the status is known.
    await service.restoreSession();
    http.expectNone('/api/auth/refresh');
  });

  it('restoreSession becomes anonymous on 401', async () => {
    const promise = service.restoreSession();
    http.expectOne('/api/auth/refresh').flush(null, { status: 401, statusText: 'Unauthorized' });
    await promise;

    expect(service.status()).toBe('anonymous');
    expect(service.accessToken).toBeNull();
  });

  it('shares one in-flight refresh between concurrent callers', async () => {
    const a = service.refreshAccessToken();
    const b = service.refreshAccessToken();
    http.expectOne('/api/auth/refresh').flush(session);

    expect(await a).toBe('access-1');
    expect(await b).toBe('access-1');
  });

  it('logout clears the session even when the API call fails', () => {
    service.login({ email: 'anna@example.com', password: 'x' }).subscribe();
    http.expectOne('/api/auth/login').flush(session);

    service.logout().subscribe();
    http.expectOne('/api/auth/logout').flush(null, { status: 500, statusText: 'Server Error' });

    expect(service.status()).toBe('anonymous');
    expect(service.user()).toBeNull();
    expect(service.accessToken).toBeNull();
  });

  it('updateProfile replaces the stored user', () => {
    service.login({ email: 'anna@example.com', password: 'x' }).subscribe();
    http.expectOne('/api/auth/login').flush(session);

    service.updateProfile({ displayName: 'Annie' }).subscribe();
    const req = http.expectOne('/api/users/me');
    expect(req.request.method).toBe('PATCH');
    req.flush({ ...session.user, displayName: 'Annie' });

    expect(service.user()?.displayName).toBe('Annie');
  });
});
