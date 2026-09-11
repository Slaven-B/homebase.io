import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  AssignableRole,
  CreatedInvitation,
  HouseholdDetail,
  HouseholdMember,
  HouseholdSummary,
  Invitation,
  PendingInvitation,
} from './household.models';

const CURRENT_KEY = 'homebase.currentHouseholdId';

/**
 * Household list + "current household" selection. The selection is remembered
 * per browser so the dashboard opens on the right household.
 */
@Injectable({ providedIn: 'root' })
export class HouseholdService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/households`;

  private readonly _households = signal<HouseholdSummary[] | null>(null);
  private readonly _currentId = signal<string | null>(readStored());

  /** null until the first load completes. */
  readonly households = this._households.asReadonly();
  readonly currentId = this._currentId.asReadonly();
  readonly current = computed(() => {
    const list = this._households();
    if (!list || list.length === 0) return null;
    return list.find((h) => h.id === this._currentId()) ?? list[0];
  });

  load(): Observable<HouseholdSummary[]> {
    return this.http.get<HouseholdSummary[]>(this.base).pipe(tap((list) => this.setList(list)));
  }

  select(householdId: string): void {
    this._currentId.set(householdId);
    try {
      localStorage.setItem(CURRENT_KEY, householdId);
    } catch {
      /* storage unavailable: selection just won't persist */
    }
  }

  create(name: string): Observable<HouseholdDetail> {
    return this.http.post<HouseholdDetail>(this.base, { name }).pipe(
      tap((h) => {
        this.upsertSummary(h, 'OWNER');
        this.select(h.id);
      }),
    );
  }

  get(id: string): Observable<HouseholdDetail> {
    return this.http.get<HouseholdDetail>(`${this.base}/${id}`);
  }

  rename(id: string, name: string): Observable<HouseholdDetail> {
    return this.http
      .patch<HouseholdDetail>(`${this.base}/${id}`, { name })
      .pipe(tap((h) => this.upsertSummary(h, h.myRole)));
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`).pipe(tap(() => this.removeSummary(id)));
  }

  leave(id: string): Observable<void> {
    return this.http
      .post<void>(`${this.base}/${id}/leave`, {})
      .pipe(tap(() => this.removeSummary(id)));
  }

  updateMemberRole(
    id: string,
    memberId: string,
    role: AssignableRole,
  ): Observable<HouseholdMember> {
    return this.http.patch<HouseholdMember>(`${this.base}/${id}/members/${memberId}`, { role });
  }

  removeMember(id: string, memberId: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}/members/${memberId}`);
  }

  // --- invitations --------------------------------------------------------

  listInvitations(id: string): Observable<Invitation[]> {
    return this.http.get<Invitation[]>(`${this.base}/${id}/invitations`);
  }

  invite(id: string, email: string, role: AssignableRole): Observable<CreatedInvitation> {
    return this.http.post<CreatedInvitation>(`${this.base}/${id}/invitations`, { email, role });
  }

  revokeInvitation(id: string, invitationId: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}/invitations/${invitationId}`);
  }

  myInvitations(): Observable<PendingInvitation[]> {
    return this.http.get<PendingInvitation[]>(`${environment.apiUrl}/invitations`);
  }

  previewInvitation(token: string): Observable<PendingInvitation> {
    return this.http.get<PendingInvitation>(`${environment.apiUrl}/invitations/${token}`);
  }

  acceptInvitation(token: string): Observable<HouseholdDetail> {
    return this.http
      .post<HouseholdDetail>(`${environment.apiUrl}/invitations/${token}/accept`, {})
      .pipe(
        tap((h) => {
          this.upsertSummary(h, h.myRole);
          this.select(h.id);
        }),
      );
  }

  declineInvitation(token: string): Observable<void> {
    return this.http.post<void>(`${environment.apiUrl}/invitations/${token}/decline`, {});
  }

  /** Forget everything (on logout). */
  reset(): void {
    this._households.set(null);
  }

  private setList(list: HouseholdSummary[]): void {
    this._households.set(list);
    if (list.length > 0 && !list.some((h) => h.id === this._currentId())) {
      this.select(list[0].id);
    }
  }

  private upsertSummary(h: HouseholdDetail, role: HouseholdSummary['role']): void {
    const summary: HouseholdSummary = {
      id: h.id,
      name: h.name,
      role,
      memberCount: h.members.length,
      createdAt: h.createdAt,
    };
    const list = this._households() ?? [];
    const idx = list.findIndex((x) => x.id === h.id);
    this._households.set(
      idx === -1 ? [...list, summary] : list.map((x, i) => (i === idx ? summary : x)),
    );
  }

  private removeSummary(id: string): void {
    const list = (this._households() ?? []).filter((h) => h.id !== id);
    this._households.set(list);
    if (this._currentId() === id) {
      this.select(list[0]?.id ?? '');
    }
  }
}

function readStored(): string | null {
  try {
    return localStorage.getItem(CURRENT_KEY);
  } catch {
    return null;
  }
}
