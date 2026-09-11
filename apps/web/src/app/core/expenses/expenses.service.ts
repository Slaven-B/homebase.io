import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  Balance,
  Expense,
  ExpenseInput,
  ExpensePage,
  Settlement,
  SettlementInput,
} from './expense.models';

@Injectable({ providedIn: 'root' })
export class ExpensesService {
  private readonly http = inject(HttpClient);

  private base(householdId: string): string {
    return `${environment.apiUrl}/households/${householdId}`;
  }

  list(
    householdId: string,
    options: { month?: string; category?: string; cursor?: string; limit?: number } = {},
  ): Observable<ExpensePage> {
    let params = new HttpParams();
    if (options.month) params = params.set('month', options.month);
    if (options.category) params = params.set('category', options.category);
    if (options.cursor) params = params.set('cursor', options.cursor);
    if (options.limit) params = params.set('limit', options.limit);
    return this.http.get<ExpensePage>(`${this.base(householdId)}/expenses`, { params });
  }

  create(householdId: string, input: ExpenseInput): Observable<Expense> {
    return this.http.post<Expense>(`${this.base(householdId)}/expenses`, input);
  }

  get(householdId: string, expenseId: string): Observable<Expense> {
    return this.http.get<Expense>(`${this.base(householdId)}/expenses/${expenseId}`);
  }

  update(householdId: string, expenseId: string, input: ExpenseInput): Observable<Expense> {
    return this.http.put<Expense>(`${this.base(householdId)}/expenses/${expenseId}`, input);
  }

  delete(householdId: string, expenseId: string): Observable<void> {
    return this.http.delete<void>(`${this.base(householdId)}/expenses/${expenseId}`);
  }

  balances(householdId: string): Observable<Balance[]> {
    return this.http.get<Balance[]>(`${this.base(householdId)}/balances`);
  }

  settlements(householdId: string): Observable<Settlement[]> {
    return this.http.get<Settlement[]>(`${this.base(householdId)}/settlements`);
  }

  settle(householdId: string, input: SettlementInput): Observable<Settlement> {
    return this.http.post<Settlement>(`${this.base(householdId)}/settlements`, input);
  }

  deleteSettlement(householdId: string, settlementId: string): Observable<void> {
    return this.http.delete<void>(`${this.base(householdId)}/settlements/${settlementId}`);
  }
}
