import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth';
import { HouseholdService } from '../../../core/households/household.service';
import {
  PRIORITY_LABELS,
  STATUS_LABELS,
  Task,
  TaskInput,
  TaskStatus,
} from '../../../core/tasks/task.models';
import { TasksService } from '../../../core/tasks/tasks.service';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { TaskDialogComponent, TaskDialogData } from '../task-dialog/task-dialog.component';

type Filter = 'all' | 'mine';

@Component({
  selector: 'app-tasks-page',
  imports: [
    RouterLink,
    PageHeaderComponent,
    EmptyStateComponent,
    MatButtonModule,
    MatButtonToggleModule,
    MatIconModule,
    MatCheckboxModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './tasks-page.component.html',
  styleUrl: './tasks-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TasksPageComponent {
  private readonly tasksService = inject(TasksService);
  private readonly householdService = inject(HouseholdService);
  private readonly auth = inject(AuthService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  readonly current = this.householdService.current;
  readonly tasks = signal<Task[] | null>(null);
  readonly filter = signal<Filter>('all');
  readonly showDone = signal(false);
  readonly error = signal<string | null>(null);
  readonly statusLabels = STATUS_LABELS;
  readonly priorityLabels = PRIORITY_LABELS;
  readonly today = new Date().toISOString().slice(0, 10);

  readonly visible = computed(() => {
    const me = this.auth.user()?.id;
    const list = this.tasks() ?? [];
    return this.filter() === 'mine' ? list.filter((t) => t.assignee?.id === me) : list;
  });
  readonly groups = computed(() => {
    const order: TaskStatus[] = ['TODO', 'IN_PROGRESS', 'DONE'];
    return order
      .map((status) => ({ status, tasks: this.visible().filter((t) => t.status === status) }))
      .filter((g) => g.status !== 'DONE' || this.showDone());
  });

  constructor() {
    effect(() => {
      const household = this.current();
      const includeDone = this.showDone();
      this.tasks.set(null);
      this.error.set(null);
      if (!household) return;
      this.tasksService.list(household.id, { includeDone }).subscribe({
        next: (tasks) => this.tasks.set(tasks),
        error: () => this.error.set('Could not load tasks.'),
      });
    });
  }

  create(): void {
    const household = this.current();
    if (!household) return;
    this.openDialog({ householdId: household.id }).subscribe((input) => {
      if (!input) return;
      this.tasksService.create(household.id, input).subscribe({
        next: (task) => this.tasks.update((list) => [task, ...(list ?? [])]),
        error: () => this.toast('Could not create the task.'),
      });
    });
  }

  edit(task: Task): void {
    const household = this.current();
    if (!household) return;
    this.openDialog({ householdId: household.id, task }).subscribe((input) => {
      if (!input) return;
      this.tasksService.update(household.id, task.id, input).subscribe({
        next: (updated) => this.replace(updated),
        error: () => this.toast('Could not save the task.'),
      });
    });
  }

  setStatus(task: Task, status: TaskStatus): void {
    const household = this.current();
    if (!household || task.status === status) return;
    const previous = task;
    this.replace({ ...task, status });
    this.tasksService.update(household.id, task.id, { status }).subscribe({
      next: (updated) => {
        if (updated.status === 'DONE' && !this.showDone()) {
          this.tasks.update((list) => (list ?? []).filter((t) => t.id !== updated.id));
        } else {
          this.replace(updated);
        }
      },
      error: () => {
        this.replace(previous);
        this.toast('Could not update the task.');
      },
    });
  }

  isOverdue(task: Task): boolean {
    return !!task.dueAt && task.status !== 'DONE' && task.dueAt < this.today;
  }

  dueLabel(task: Task): string {
    if (!task.dueAt) return '';
    if (task.dueAt === this.today) return 'Today';
    const [y, m, d] = task.dueAt.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  }

  private openDialog(data: TaskDialogData) {
    return this.dialog
      .open<TaskDialogComponent, TaskDialogData, TaskInput | undefined>(TaskDialogComponent, {
        data,
        maxWidth: 'calc(100vw - 32px)',
      })
      .afterClosed();
  }

  private replace(updated: Task): void {
    this.tasks.update((list) => (list ?? []).map((t) => (t.id === updated.id ? updated : t)));
  }

  private toast(message: string): void {
    this.snackBar.open(message, 'Dismiss', { duration: 4000 });
  }
}
