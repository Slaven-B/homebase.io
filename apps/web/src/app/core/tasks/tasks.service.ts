import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Task, TaskComment, TaskDetail, TaskInput, TaskPatch } from './task.models';

@Injectable({ providedIn: 'root' })
export class TasksService {
  private readonly http = inject(HttpClient);

  private base(householdId: string): string {
    return `${environment.apiUrl}/households/${householdId}/tasks`;
  }

  list(
    householdId: string,
    options: { includeDone?: boolean; assigneeId?: string } = {},
  ): Observable<Task[]> {
    let params = new HttpParams();
    if (options.includeDone) params = params.set('includeDone', 'true');
    if (options.assigneeId) params = params.set('assigneeId', options.assigneeId);
    return this.http.get<Task[]>(this.base(householdId), { params });
  }

  create(householdId: string, input: TaskInput): Observable<TaskDetail> {
    return this.http.post<TaskDetail>(this.base(householdId), input);
  }

  get(householdId: string, taskId: string): Observable<TaskDetail> {
    return this.http.get<TaskDetail>(`${this.base(householdId)}/${taskId}`);
  }

  update(householdId: string, taskId: string, patch: TaskPatch): Observable<TaskDetail> {
    return this.http.patch<TaskDetail>(`${this.base(householdId)}/${taskId}`, patch);
  }

  delete(householdId: string, taskId: string): Observable<void> {
    return this.http.delete<void>(`${this.base(householdId)}/${taskId}`);
  }

  addComment(householdId: string, taskId: string, content: string): Observable<TaskComment> {
    return this.http.post<TaskComment>(`${this.base(householdId)}/${taskId}/comments`, {
      content,
    });
  }

  deleteComment(householdId: string, taskId: string, commentId: string): Observable<void> {
    return this.http.delete<void>(`${this.base(householdId)}/${taskId}/comments/${commentId}`);
  }
}
