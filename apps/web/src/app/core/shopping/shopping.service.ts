import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  ShoppingItem,
  ShoppingItemInput,
  ShoppingItemPatch,
  ShoppingListDetail,
  ShoppingListSummary,
} from './shopping.models';

/** Thin HTTP client for shopping lists. State lives in the components (per list). */
@Injectable({ providedIn: 'root' })
export class ShoppingService {
  private readonly http = inject(HttpClient);

  private base(householdId: string): string {
    return `${environment.apiUrl}/households/${householdId}/shopping-lists`;
  }

  lists(householdId: string, includeArchived = false): Observable<ShoppingListSummary[]> {
    const params = includeArchived ? new HttpParams().set('includeArchived', 'true') : undefined;
    return this.http.get<ShoppingListSummary[]>(this.base(householdId), { params });
  }

  createList(householdId: string, name: string): Observable<ShoppingListDetail> {
    return this.http.post<ShoppingListDetail>(this.base(householdId), { name });
  }

  getList(householdId: string, listId: string): Observable<ShoppingListDetail> {
    return this.http.get<ShoppingListDetail>(`${this.base(householdId)}/${listId}`);
  }

  updateList(
    householdId: string,
    listId: string,
    patch: { name?: string; isArchived?: boolean },
  ): Observable<ShoppingListDetail> {
    return this.http.patch<ShoppingListDetail>(`${this.base(householdId)}/${listId}`, patch);
  }

  deleteList(householdId: string, listId: string): Observable<void> {
    return this.http.delete<void>(`${this.base(householdId)}/${listId}`);
  }

  addItem(householdId: string, listId: string, input: ShoppingItemInput): Observable<ShoppingItem> {
    return this.http.post<ShoppingItem>(`${this.base(householdId)}/${listId}/items`, input);
  }

  updateItem(
    householdId: string,
    listId: string,
    itemId: string,
    patch: ShoppingItemPatch,
  ): Observable<ShoppingItem> {
    return this.http.patch<ShoppingItem>(
      `${this.base(householdId)}/${listId}/items/${itemId}`,
      patch,
    );
  }

  deleteItem(householdId: string, listId: string, itemId: string): Observable<void> {
    return this.http.delete<void>(`${this.base(householdId)}/${listId}/items/${itemId}`);
  }

  clearCompleted(householdId: string, listId: string): Observable<{ removed: number }> {
    return this.http.post<{ removed: number }>(
      `${this.base(householdId)}/${listId}/items/clear-completed`,
      {},
    );
  }
}
