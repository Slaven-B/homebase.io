import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { authInterceptor } from './auth.interceptor';
import { AuthService } from './auth.service';

describe('authInterceptor', () => {
  let http: HttpClient;
  let controller: HttpTestingController;
  let auth: jasmine.SpyObj<AuthService> & { accessToken: string | null };

  beforeEach(() => {
    auth = jasmine.createSpyObj<AuthService>('AuthService', ['refreshAccessToken']) as typeof auth;
    auth.accessToken = null;

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: auth },
      ],
    });
    http = TestBed.inject(HttpClient);
    controller = TestBed.inject(HttpTestingController);
  });

  afterEach(() => controller.verify());

  it('adds a Bearer header to API requests when a token exists', () => {
    auth.accessToken = 'token-1';
    http.get('/api/users/me').subscribe();

    const req = controller.expectOne('/api/users/me');
    expect(req.request.headers.get('Authorization')).toBe('Bearer token-1');
    req.flush({});
  });

  it('leaves auth endpoints and non-API requests untouched', () => {
    auth.accessToken = 'token-1';
    http.post('/api/auth/login', {}).subscribe();
    http.get('/assets/config.json').subscribe();

    expect(
      controller.expectOne('/api/auth/login').request.headers.has('Authorization'),
    ).toBeFalse();
    expect(
      controller.expectOne('/assets/config.json').request.headers.has('Authorization'),
    ).toBeFalse();
    controller.match(() => true).forEach((r) => r.flush({}));
  });

  it('refreshes once and retries with the new token on 401', async () => {
    auth.accessToken = 'stale';
    auth.refreshAccessToken.and.resolveTo('fresh');

    let result: unknown;
    http.get('/api/users/me').subscribe((body) => (result = body));

    controller.expectOne('/api/users/me').flush(null, { status: 401, statusText: 'Unauthorized' });
    await Promise.resolve(); // let the refresh promise settle
    await new Promise((r) => setTimeout(r));

    const retry = controller.expectOne('/api/users/me');
    expect(retry.request.headers.get('Authorization')).toBe('Bearer fresh');
    retry.flush({ id: 'u1' });

    expect(auth.refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ id: 'u1' });
  });

  it('propagates the 401 when the refresh fails', async () => {
    auth.accessToken = 'stale';
    auth.refreshAccessToken.and.resolveTo(null);

    let status: number | undefined;
    http.get('/api/users/me').subscribe({ error: (e: { status: number }) => (status = e.status) });

    controller.expectOne('/api/users/me').flush(null, { status: 401, statusText: 'Unauthorized' });
    await new Promise((r) => setTimeout(r));

    controller.expectNone('/api/users/me');
    expect(status).toBe(401);
  });

  it('does not refresh on other errors', () => {
    auth.accessToken = 'token-1';
    let status: number | undefined;
    http.get('/api/users/me').subscribe({ error: (e: { status: number }) => (status = e.status) });

    controller.expectOne('/api/users/me').flush(null, { status: 500, statusText: 'Server Error' });

    expect(auth.refreshAccessToken).not.toHaveBeenCalled();
    expect(status).toBe(500);
  });
});
