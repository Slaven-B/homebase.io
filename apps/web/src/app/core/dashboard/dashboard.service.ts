import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { DashboardView } from './dashboard.models';

@Injectable({ providedIn: 'root' })
export class DashboardService {
  private readonly http = inject(HttpClient);

  get(householdId: string): Observable<DashboardView> {
    return this.http.get<DashboardView>(
      `${environment.apiUrl}/households/${householdId}/dashboard`,
    );
  }
}
