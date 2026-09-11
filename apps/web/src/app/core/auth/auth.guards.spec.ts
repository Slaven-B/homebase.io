import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  Router,
  RouterStateSnapshot,
  UrlTree,
  provideRouter,
} from '@angular/router';
import { authGuard, guestGuard } from './auth.guards';
import { AuthService } from './auth.service';

describe('auth guards', () => {
  const authenticated = signal(false);
  let auth: { restoreSession: jasmine.Spy; isAuthenticated: () => boolean };
  let router: Router;

  const run = (guard: typeof authGuard, url = '/profile') =>
    TestBed.runInInjectionContext(() =>
      guard({} as ActivatedRouteSnapshot, { url } as RouterStateSnapshot),
    ) as Promise<boolean | UrlTree>;

  beforeEach(() => {
    authenticated.set(false);
    auth = {
      restoreSession: jasmine.createSpy('restoreSession').and.resolveTo(),
      isAuthenticated: () => authenticated(),
    };
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: AuthService, useValue: auth }],
    });
    router = TestBed.inject(Router);
  });

  describe('authGuard', () => {
    it('restores the session first and allows authenticated users', async () => {
      authenticated.set(true);

      expect(await run(authGuard)).toBeTrue();
      expect(auth.restoreSession).toHaveBeenCalled();
    });

    it('redirects anonymous users to login with the target url', async () => {
      const result = await run(authGuard, '/profile');

      expect(result).toBeInstanceOf(UrlTree);
      expect(router.serializeUrl(result as UrlTree)).toBe('/login?redirect=%2Fprofile');
    });
  });

  describe('guestGuard', () => {
    it('allows anonymous users', async () => {
      expect(await run(guestGuard, '/login')).toBeTrue();
    });

    it('sends authenticated users to the dashboard', async () => {
      authenticated.set(true);
      const result = await run(guestGuard, '/login');

      expect(router.serializeUrl(result as UrlTree)).toBe('/');
    });
  });
});
