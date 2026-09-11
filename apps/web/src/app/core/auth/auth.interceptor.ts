import {
  HttpErrorResponse,
  HttpHandlerFn,
  HttpInterceptorFn,
  HttpRequest,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { Observable, catchError, from, switchMap, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';

const AUTH_ENDPOINTS = ['/auth/login', '/auth/register', '/auth/refresh', '/auth/logout'];

function isAuthEndpoint(url: string): boolean {
  return AUTH_ENDPOINTS.some((path) => url.startsWith(`${environment.apiUrl}${path}`));
}

function withBearer(req: HttpRequest<unknown>, token: string): HttpRequest<unknown> {
  return req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
}

/**
 * Adds the access token to API requests and, on a 401, refreshes the session once
 * and retries. Auth endpoints themselves are passed through untouched.
 */
export const authInterceptor: HttpInterceptorFn = (
  req,
  next,
): Observable<never> | ReturnType<HttpHandlerFn> => {
  if (!req.url.startsWith(environment.apiUrl) || isAuthEndpoint(req.url)) {
    return next(req);
  }

  const auth = inject(AuthService);
  const token = auth.accessToken;
  const request = token ? withBearer(req, token) : req;

  return next(request).pipe(
    catchError((error: unknown) => {
      if (!(error instanceof HttpErrorResponse) || error.status !== 401) {
        return throwError(() => error);
      }
      return from(auth.refreshAccessToken()).pipe(
        switchMap((fresh) => (fresh ? next(withBearer(req, fresh)) : throwError(() => error))),
      );
    }),
  );
};
