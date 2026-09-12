import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Note, NoteInput, NotePatch, NoteSummary } from './note.models';

@Injectable({ providedIn: 'root' })
export class NotesService {
  private readonly http = inject(HttpClient);

  private base(householdId: string): string {
    return `${environment.apiUrl}/households/${householdId}/notes`;
  }

  list(householdId: string): Observable<NoteSummary[]> {
    return this.http.get<NoteSummary[]>(this.base(householdId));
  }

  create(householdId: string, input: NoteInput): Observable<Note> {
    return this.http.post<Note>(this.base(householdId), input);
  }

  get(householdId: string, noteId: string): Observable<Note> {
    return this.http.get<Note>(`${this.base(householdId)}/${noteId}`);
  }

  update(householdId: string, noteId: string, patch: NotePatch): Observable<Note> {
    return this.http.patch<Note>(`${this.base(householdId)}/${noteId}`, patch);
  }

  delete(householdId: string, noteId: string): Observable<void> {
    return this.http.delete<void>(`${this.base(householdId)}/${noteId}`);
  }
}
