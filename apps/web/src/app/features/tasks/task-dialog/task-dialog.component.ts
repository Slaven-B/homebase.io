import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { provideNativeDateAdapter } from '@angular/material/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { HouseholdMember } from '../../../core/households/household.models';
import { HouseholdService } from '../../../core/households/household.service';
import { PRIORITY_LABELS, Priority, Task, TaskInput } from '../../../core/tasks/task.models';

export interface TaskDialogData {
  householdId: string;
  /** Present when editing. */
  task?: Task;
}

/** Local calendar date -> YYYY-MM-DD (no timezone shift). */
export function toIsoDate(date: Date | null): string | null {
  if (!date) return null;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** YYYY-MM-DD -> local calendar date. */
export function fromIsoDate(value: string | null): Date | null {
  if (!value) return null;
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d);
}

@Component({
  selector: 'app-task-dialog',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatDatepickerModule,
    MatButtonModule,
  ],
  providers: [provideNativeDateAdapter()],
  templateUrl: './task-dialog.component.html',
  styles: `
    .content {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      padding-top: 0.5rem !important;
      min-width: min(460px, calc(100vw - 64px));
    }
    .row {
      display: flex;
      gap: 0.5rem;
      flex-wrap: wrap;
      mat-form-field {
        flex: 1;
        min-width: 140px;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TaskDialogComponent {
  readonly ref = inject(MatDialogRef<TaskDialogComponent, TaskInput | undefined>);
  readonly data = inject<TaskDialogData>(MAT_DIALOG_DATA);
  private readonly fb = inject(FormBuilder);
  private readonly households = inject(HouseholdService);

  readonly members = signal<HouseholdMember[]>([]);
  readonly priorities: Priority[] = ['LOW', 'MEDIUM', 'HIGH'];
  readonly priorityLabels = PRIORITY_LABELS;
  readonly isEdit = !!this.data.task;

  readonly form = this.fb.nonNullable.group({
    title: [this.data.task?.title ?? '', [Validators.required, Validators.maxLength(140)]],
    description: [this.data.task?.description ?? '', [Validators.maxLength(2000)]],
    assigneeId: [this.data.task?.assignee?.id ?? ''],
    dueAt: [fromIsoDate(this.data.task?.dueAt ?? null) as Date | null],
    priority: [this.data.task?.priority ?? ('MEDIUM' as Priority)],
  });

  constructor() {
    this.households.get(this.data.householdId).subscribe({
      next: (h) => this.members.set(h.members),
      error: () => this.members.set([]),
    });
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    this.ref.close({
      title: v.title.trim(),
      description: v.description.trim() || null,
      assigneeId: v.assigneeId || null,
      dueAt: toIsoDate(v.dueAt),
      priority: v.priority,
    });
  }
}
