import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { provideNativeDateAdapter } from '@angular/material/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import {
  Chore,
  ChoreFrequency,
  ChoreInput,
  ChorePatch,
  FREQUENCY_LABELS,
} from '../../../core/chores/chore.models';
import { HouseholdMember } from '../../../core/households/household.models';
import { HouseholdService } from '../../../core/households/household.service';
import { PRIORITY_LABELS, Priority } from '../../../core/tasks/task.models';
import { fromIsoDate, toIsoDate } from '../../tasks/task-dialog/task-dialog.component';

export interface ChoreDialogData {
  householdId: string;
  chore?: Chore;
}

/** Result: ChoreInput when creating, ChorePatch when editing. */
export type ChoreDialogResult = ChoreInput | ChorePatch;

@Component({
  selector: 'app-chore-dialog',
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
  templateUrl: './chore-dialog.component.html',
  styles: `
    .content {
      display: flex;
      flex-direction: column;
      gap: var(--hb-space-1);
      padding-top: var(--hb-space-2) !important;
      min-width: min(480px, calc(100vw - 64px));
    }
    .row {
      display: flex;
      gap: var(--hb-space-2);
      flex-wrap: wrap;
      mat-form-field {
        flex: 1;
        min-width: 140px;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChoreDialogComponent {
  readonly ref = inject(MatDialogRef<ChoreDialogComponent, ChoreDialogResult | undefined>);
  readonly data = inject<ChoreDialogData>(MAT_DIALOG_DATA);
  private readonly fb = inject(FormBuilder);
  private readonly households = inject(HouseholdService);

  readonly members = signal<HouseholdMember[]>([]);
  readonly frequencies: ChoreFrequency[] = ['DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY', 'CUSTOM'];
  readonly frequencyLabels = FREQUENCY_LABELS;
  readonly priorities: Priority[] = ['LOW', 'MEDIUM', 'HIGH'];
  readonly priorityLabels = PRIORITY_LABELS;
  readonly isEdit = !!this.data.chore;

  readonly form = this.fb.nonNullable.group({
    title: [this.data.chore?.title ?? '', [Validators.required, Validators.maxLength(140)]],
    description: [this.data.chore?.description ?? '', [Validators.maxLength(2000)]],
    assigneeId: [this.data.chore?.assignee?.id ?? ''],
    frequency: [this.data.chore?.frequency ?? ('WEEKLY' as ChoreFrequency)],
    intervalDays: [this.data.chore?.intervalDays ?? (2 as number | null)],
    dueAt: [fromIsoDate(this.data.chore?.nextDueAt ?? null) ?? new Date()],
    estimatedMinutes: [this.data.chore?.estimatedMinutes ?? (null as number | null)],
    priority: [this.data.chore?.priority ?? ('MEDIUM' as Priority)],
  });

  constructor() {
    this.households.get(this.data.householdId).subscribe({
      next: (h) => this.members.set(h.members),
      error: () => this.members.set([]),
    });
    this.form.controls.frequency.valueChanges.subscribe((f) => {
      const ctrl = this.form.controls.intervalDays;
      if (f === 'CUSTOM') {
        ctrl.setValidators([Validators.required, Validators.min(1), Validators.max(365)]);
      } else {
        ctrl.clearValidators();
      }
      ctrl.updateValueAndValidity();
    });
    if (this.form.controls.frequency.value === 'CUSTOM') {
      this.form.controls.intervalDays.setValidators([
        Validators.required,
        Validators.min(1),
        Validators.max(365),
      ]);
    }
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const common = {
      title: v.title.trim(),
      description: v.description.trim() || null,
      assigneeId: v.assigneeId || null,
      frequency: v.frequency,
      intervalDays: v.frequency === 'CUSTOM' ? Number(v.intervalDays) : null,
      estimatedMinutes: v.estimatedMinutes ? Number(v.estimatedMinutes) : null,
      priority: v.priority,
    };
    const date = toIsoDate(v.dueAt) ?? undefined;
    this.ref.close(this.isEdit ? { ...common, nextDueAt: date } : { ...common, firstDueAt: date });
  }
}
