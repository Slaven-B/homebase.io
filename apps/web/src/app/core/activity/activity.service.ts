import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ActivityPage } from './activity.models';

@Injectable({ providedIn: 'root' })
export class ActivityService {
  private readonly http = inject(HttpClient);

  list(
    householdId: string,
    options: { limit?: number; cursor?: string } = {},
  ): Observable<ActivityPage> {
    let params = new HttpParams();
    if (options.limit) params = params.set('limit', options.limit);
    if (options.cursor) params = params.set('cursor', options.cursor);
    return this.http.get<ActivityPage>(`${environment.apiUrl}/households/${householdId}/activity`, {
      params,
    });
  }
}
