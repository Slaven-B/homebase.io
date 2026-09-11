import { HttpErrorResponse } from '@angular/common/http';

/** Turns an API error into a short, human message for auth forms. */
export function describeAuthError(error: unknown, fallback: string): string {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 0) return 'Cannot reach the server. Check your connection and try again.';
    if (error.status === 401) return 'Invalid email or password.';
    if (error.status === 409) return 'An account with this email already exists.';
    if (error.status === 429) return 'Too many attempts. Please wait a minute and try again.';
    const body = error.error as { message?: string | string[] } | null;
    const message = Array.isArray(body?.message) ? body.message[0] : body?.message;
    if (typeof message === 'string' && message.length < 120) return message;
  }
  return fallback;
}
