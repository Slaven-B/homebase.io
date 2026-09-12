import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { catchError, throwError } from 'rxjs';

let lastToastAt = 0;
const TOAST_COOLDOWN_MS = 4000;

/**
 * Last line of defence for HTTP failures the calling code does not handle
 * specifically: network errors and 5xx get one friendly toast (rate limited
 * so a burst of failing requests does not stack messages). Everything else
 * (400/401/403/404/409) is left to the feature code, which knows the context.
 */
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const snackBar = inject(MatSnackBar);
  return next(req).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse && (error.status === 0 || error.status >= 500)) {
        const now = Date.now();
        if (now - lastToastAt > TOAST_COOLDOWN_MS) {
          lastToastAt = now;
          snackBar.open(
            error.status === 0
              ? 'Cannot reach HomeBase. Check your connection and try again.'
              : 'Something went wrong on our side. Please try again in a moment.',
            'Dismiss',
            { duration: 6000 },
          );
        }
      }
      return throwError(() => error);
    }),
  );
};
