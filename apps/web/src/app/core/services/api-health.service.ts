import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, of, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { HealthReport } from '../models/health.model';

@Injectable({ providedIn: 'root' })
export class ApiHealthService {
  private readonly http = inject(HttpClient);

  /**
   * Fetches the API health report.
   * A 503 still carries a full report (database down), so it is returned as
   * a value rather than an error. Any other failure is rethrown.
   */
  getHealth(): Observable<HealthReport> {
    return this.http.get<HealthReport>(`${environment.apiUrl}/health`).pipe(
      catchError((error: unknown) => {
        if (
          error instanceof HttpErrorResponse &&
          error.status === 503 &&
          isHealthReport(error.error)
        ) {
          return of(error.error);
        }
        return throwError(() => error);
      }),
    );
  }
}

function isHealthReport(value: unknown): value is HealthReport {
  return (
    typeof value === 'object' &&
    value !== null &&
    'status' in value &&
    'checks' in value &&
    typeof (value as HealthReport).checks?.database === 'object'
  );
}
