import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, catchError, firstValueFrom, of, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  AuthResponse,
  LoginRequest,
  RegisterRequest,
  UpdateProfileRequest,
  User,
} from './auth.models';

type SessionStatus = 'unknown' | 'authenticated' | 'anonymous';

/**
 * Holds the current session. The access token lives only in memory; the refresh
 * token is an httpOnly cookie managed by the API, so a page reload restores the
 * session by calling /auth/refresh once (see `restoreSession`).
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/auth`;

  private readonly _user = signal<User | null>(null);
  private readonly _accessToken = signal<string | null>(null);
  private readonly _status = signal<SessionStatus>('unknown');
  private refreshInFlight: Promise<string | null> | null = null;

  readonly user = this._user.asReadonly();
  readonly status = this._status.asReadonly();
  readonly isAuthenticated = computed(() => this._status() === 'authenticated');

  get accessToken(): string | null {
    return this._accessToken();
  }

  /** Called once at startup. Resolves whether or not a session exists. */
  async restoreSession(): Promise<void> {
    if (this._status() !== 'unknown') return;
    await this.refreshAccessToken();
  }

  login(request: LoginRequest): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>(`${this.base}/login`, request)
      .pipe(tap((res) => this.applySession(res)));
  }

  register(request: RegisterRequest): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>(`${this.base}/register`, request)
      .pipe(tap((res) => this.applySession(res)));
  }

  logout(): Observable<void> {
    return this.http.post<void>(`${this.base}/logout`, {}).pipe(
      catchError(() => of(undefined)),
      tap(() => this.clearSession()),
    );
  }

  /**
   * Exchanges the refresh cookie for a new access token. Concurrent callers share
   * one request. Returns the new token, or null when there is no valid session.
   */
  refreshAccessToken(): Promise<string | null> {
    if (!this.refreshInFlight) {
      this.refreshInFlight = firstValueFrom(
        this.http.post<AuthResponse>(`${this.base}/refresh`, {}).pipe(
          tap((res) => this.applySession(res)),
          catchError((error: unknown) => {
            if (error instanceof HttpErrorResponse && error.status === 401) {
              this.clearSession();
            } else if (this._status() === 'unknown') {
              // API unreachable at startup: treat as anonymous, keep the cookie.
              this._status.set('anonymous');
            }
            return of(null);
          }),
        ),
      )
        .then((res) => res?.accessToken ?? null)
        .finally(() => (this.refreshInFlight = null));
    }
    return this.refreshInFlight;
  }

  loadProfile(): Observable<User> {
    return this.http
      .get<User>(`${environment.apiUrl}/users/me`)
      .pipe(tap((user) => this._user.set(user)));
  }

  updateProfile(request: UpdateProfileRequest): Observable<User> {
    return this.http
      .patch<User>(`${environment.apiUrl}/users/me`, request)
      .pipe(tap((user) => this._user.set(user)));
  }

  /** Drops the local session without calling the API (e.g. after a failed refresh). */
  clearSession(): void {
    this._user.set(null);
    this._accessToken.set(null);
    this._status.set('anonymous');
  }

  private applySession(res: AuthResponse): void {
    this._user.set(res.user);
    this._accessToken.set(res.accessToken);
    this._status.set('authenticated');
  }
}
