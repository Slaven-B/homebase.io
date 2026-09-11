import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth';
import { canAdminister } from '../../../core/households/household.models';
import { HouseholdService } from '../../../core/households/household.service';
import {
  PRIORITY_LABELS,
  STATUS_LABELS,
  TaskComment,
  TaskDetail,
  TaskInput,
  TaskStatus,
} from '../../../core/tasks/task.models';
import { TasksService } from '../../../core/tasks/tasks.service';
import { confirm } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { TaskDialogComponent, TaskDialogData } from '../task-dialog/task-dialog.component';

@Component({
  selector: 'app-task-detail',
  imports: [
    DatePipe,
    ReactiveFormsModule,
    RouterLink,
    MatCardModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatIconModule,
    MatMenuModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './task-detail.component.html',
  styleUrl: './task-detail.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TaskDetailComponent {
  private readonly tasksService = inject(TasksService);
  private readonly householdService = inject(HouseholdService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  readonly taskId = input.required<string>();
  readonly current = this.householdService.current;
  readonly task = signal<TaskDetail | null>(null);
  readonly notFound = signal(false);
  readonly posting = signal(false);
  readonly statusLabels = STATUS_LABELS;
  readonly priorityLabels = PRIORITY_LABELS;
  readonly statuses: TaskStatus[] = ['TODO', 'IN_PROGRESS', 'DONE'];
  readonly comment = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.maxLength(2000)],
  });

  readonly myId = computed(() => this.auth.user()?.id ?? null);
  readonly isAdmin = computed(() => canAdminister(this.current()?.role));
  readonly canDelete = computed(
    () =>
      this.isAdmin() || (!!this.task()?.createdBy && this.task()!.createdBy!.id === this.myId()),
  );

  constructor() {
    effect(() => {
      const household = this.current();
      const taskId = this.taskId();
      this.task.set(null);
      this.notFound.set(false);
      if (!household) return;
      this.tasksService.get(household.id, taskId).subscribe({
        next: (task) => this.task.set(task),
        error: () => this.notFound.set(true),
      });
    });
  }

  setStatus(status: TaskStatus): void {
    const household = this.current();
    const task = this.task();
    if (!household || !task || task.status === status) return;
    this.tasksService.update(household.id, task.id, { status }).subscribe({
      next: (updated) => this.task.set(updated),
      error: () => this.toast('Could not update the status.'),
    });
  }

  edit(): void {
    const household = this.current();
    const task = this.task();
    if (!household || !task) return;
    this.dialog
      .open<TaskDialogComponent, TaskDialogData, TaskInput | undefined>(TaskDialogComponent, {
        data: { householdId: household.id, task },
        maxWidth: 'calc(100vw - 32px)',
      })
      .afterClosed()
      .subscribe((input) => {
        if (!input) return;
        this.tasksService.update(household.id, task.id, input).subscribe({
          next: (updated) => this.task.set(updated),
          error: () => this.toast('Could not save the task.'),
        });
      });
  }

  remove(): void {
    const household = this.current();
    const task = this.task();
    if (!household || !task) return;
    confirm(this.dialog, {
      title: `Delete "${task.title}"?`,
      message: 'The task and its comments will be removed.',
      confirmLabel: 'Delete',
      destructive: true,
    }).subscribe((ok) => {
      if (!ok) return;
      this.tasksService.delete(household.id, task.id).subscribe({
        next: () => void this.router.navigate(['/tasks']),
        error: () => this.toast('Could not delete the task.'),
      });
    });
  }

  postComment(): void {
    const household = this.current();
    const task = this.task();
    if (!household || !task || this.comment.invalid || this.posting()) return;
    this.posting.set(true);
    this.tasksService.addComment(household.id, task.id, this.comment.value.trim()).subscribe({
      next: (created) => {
        this.posting.set(false);
        this.comment.reset('');
        this.task.update((t) =>
          t ? { ...t, comments: [...t.comments, created], commentCount: t.commentCount + 1 } : t,
        );
      },
      error: () => {
        this.posting.set(false);
        this.toast('Could not post the comment.');
      },
    });
  }

  canDeleteComment(c: TaskComment): boolean {
    return this.isAdmin() || c.author?.id === this.myId();
  }

  deleteComment(c: TaskComment): void {
    const household = this.current();
    const task = this.task();
    if (!household || !task) return;
    this.tasksService.deleteComment(household.id, task.id, c.id).subscribe({
      next: () =>
        this.task.update((t) =>
          t
            ? {
                ...t,
                comments: t.comments.filter((x) => x.id !== c.id),
                commentCount: Math.max(0, t.commentCount - 1),
              }
            : t,
        ),
      error: () => this.toast('Could not delete the comment.'),
    });
  }

  dueLabel(dueAt: string): string {
    const [y, m, d] = dueAt.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
  }

  private toast(message: string): void {
    this.snackBar.open(message, 'Dismiss', { duration: 4000 });
  }
}
