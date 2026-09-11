import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Bill, BillDetail, BillInput, BillPatch, PayBillInput } from './bill.models';

@Injectable({ providedIn: 'root' })
export class BillsService {
  private readonly http = inject(HttpClient);

  private base(householdId: string): string {
    return `${environment.apiUrl}/households/${householdId}/bills`;
  }

  list(householdId: string, includeInactive = false): Observable<Bill[]> {
    const params = includeInactive ? new HttpParams().set('includeInactive', 'true') : undefined;
    return this.http.get<Bill[]>(this.base(householdId), { params });
  }

  create(householdId: string, input: BillInput): Observable<BillDetail> {
    return this.http.post<BillDetail>(this.base(householdId), input);
  }

  get(householdId: string, billId: string): Observable<BillDetail> {
    return this.http.get<BillDetail>(`${this.base(householdId)}/${billId}`);
  }

  update(householdId: string, billId: string, patch: BillPatch): Observable<BillDetail> {
    return this.http.patch<BillDetail>(`${this.base(householdId)}/${billId}`, patch);
  }

  delete(householdId: string, billId: string): Observable<void> {
    return this.http.delete<void>(`${this.base(householdId)}/${billId}`);
  }

  pay(householdId: string, billId: string, input: PayBillInput): Observable<BillDetail> {
    return this.http.post<BillDetail>(`${this.base(householdId)}/${billId}/pay`, input);
  }
}
