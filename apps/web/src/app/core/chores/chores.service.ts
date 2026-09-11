import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Chore, ChoreDetail, ChoreInput, ChorePatch } from './chore.models';

@Injectable({ providedIn: 'root' })
export class ChoresService {
  private readonly http = inject(HttpClient);

  private base(householdId: string): string {
    return `${environment.apiUrl}/households/${householdId}/chores`;
  }

  list(householdId: string, includeInactive = false): Observable<Chore[]> {
    const params = includeInactive ? new HttpParams().set('includeInactive', 'true') : undefined;
    return this.http.get<Chore[]>(this.base(householdId), { params });
  }

  create(householdId: string, input: ChoreInput): Observable<ChoreDetail> {
    return this.http.post<ChoreDetail>(this.base(householdId), input);
  }

  get(householdId: string, choreId: string): Observable<ChoreDetail> {
    return this.http.get<ChoreDetail>(`${this.base(householdId)}/${choreId}`);
  }

  update(householdId: string, choreId: string, patch: ChorePatch): Observable<ChoreDetail> {
    return this.http.patch<ChoreDetail>(`${this.base(householdId)}/${choreId}`, patch);
  }

  delete(householdId: string, choreId: string): Observable<void> {
    return this.http.delete<void>(`${this.base(householdId)}/${choreId}`);
  }

  complete(householdId: string, choreId: string, note?: string | null): Observable<ChoreDetail> {
    return this.http.post<ChoreDetail>(`${this.base(householdId)}/${choreId}/complete`, {
      note: note ?? null,
    });
  }

  skip(householdId: string, choreId: string): Observable<ChoreDetail> {
    return this.http.post<ChoreDetail>(`${this.base(householdId)}/${choreId}/skip`, {});
  }
}
