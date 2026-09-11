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
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth';
import {
  Chore,
  ChoreInput,
  ChorePatch,
  describeDue,
  describeFrequency,
} from '../../../core/chores/chore.models';
import { ChoresService } from '../../../core/chores/chores.service';
import { canAdminister } from '../../../core/households/household.models';
import { HouseholdService } from '../../../core/households/household.service';
import { PRIORITY_LABELS } from '../../../core/tasks/task.models';
import { confirm } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import {
  ChoreDialogComponent,
  ChoreDialogData,
  ChoreDialogResult,
} from '../chore-dialog/chore-dialog.component';

type Filter = 'all' | 'mine';

@Component({
  selector: 'app-chores-page',
  imports: [
    RouterLink,
    MatCardModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatIconModule,
    MatMenuModule,
    MatCheckboxModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './chores-page.component.html',
  styleUrl: './chores-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChoresPageComponent {
  private readonly choresService = inject(ChoresService);
  private readonly householdService = inject(HouseholdService);
  private readonly auth = inject(AuthService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  readonly current = this.householdService.current;
  readonly chores = signal<Chore[] | null>(null);
  readonly filter = signal<Filter>('all');
  readonly showArchived = signal(false);
  readonly error = signal<string | null>(null);
  readonly busy = signal<string | null>(null);
  readonly priorityLabels = PRIORITY_LABELS;
  readonly describeDue = describeDue;
  readonly describeFrequency = describeFrequency;

  readonly visible = computed(() => {
    const me = this.auth.user()?.id;
    const list = this.chores() ?? [];
    return this.filter() === 'mine' ? list.filter((c) => c.assignee?.id === me) : list;
  });
  readonly sections = computed(() => {
    const list = this.visible();
    return [
      { key: 'due', title: 'Due now', chores: list.filter((c) => c.isActive && c.dueInDays <= 0) },
      {
        key: 'upcoming',
        title: 'Upcoming',
        chores: list.filter((c) => c.isActive && c.dueInDays > 0),
      },
      { key: 'archived', title: 'Archived', chores: list.filter((c) => !c.isActive) },
    ].filter((s) => s.chores.length > 0);
  });

  constructor() {
    effect(() => {
      const household = this.current();
      const includeInactive = this.showArchived();
      this.chores.set(null);
      this.error.set(null);
      if (!household) return;
      this.choresService.list(household.id, includeInactive).subscribe({
        next: (chores) => this.chores.set(chores),
        error: () => this.error.set('Could not load chores.'),
      });
    });
  }

  create(): void {
    const household = this.current();
    if (!household) return;
    this.openDialog({ householdId: household.id }).subscribe((result) => {
      if (!result) return;
      this.choresService.create(household.id, result as ChoreInput).subscribe({
        next: (chore) => this.chores.update((list) => [...(list ?? []), chore]),
        error: () => this.toast('Could not create the chore.'),
      });
    });
  }

  edit(chore: Chore): void {
    const household = this.current();
    if (!household) return;
    this.openDialog({ householdId: household.id, chore }).subscribe((result) => {
      if (!result) return;
      this.choresService.update(household.id, chore.id, result as ChorePatch).subscribe({
        next: (updated) => this.replace(updated),
        error: () => this.toast('Could not save the chore.'),
      });
    });
  }

  complete(chore: Chore): void {
    const household = this.current();
    if (!household || this.busy()) return;
    this.busy.set(chore.id);
    this.choresService.complete(household.id, chore.id).subscribe({
      next: (updated) => {
        this.busy.set(null);
        this.replace(updated);
        this.snackBar.open(
          `Done! Next: ${describeDue(updated.dueInDays).toLowerCase()}`,
          undefined,
          {
            duration: 2500,
          },
        );
      },
      error: () => {
        this.busy.set(null);
        this.toast('Could not complete the chore.');
      },
    });
  }

  skip(chore: Chore): void {
    const household = this.current();
    if (!household || this.busy()) return;
    this.busy.set(chore.id);
    this.choresService.skip(household.id, chore.id).subscribe({
      next: (updated) => {
        this.busy.set(null);
        this.replace(updated);
      },
      error: () => {
        this.busy.set(null);
        this.toast('Could not skip the chore.');
      },
    });
  }

  setActive(chore: Chore, isActive: boolean): void {
    const household = this.current();
    if (!household) return;
    this.choresService.update(household.id, chore.id, { isActive }).subscribe({
      next: (updated) => {
        if (!isActive && !this.showArchived()) {
          this.chores.update((list) => (list ?? []).filter((c) => c.id !== chore.id));
        } else {
          this.replace(updated);
        }
      },
      error: () => this.toast('Could not update the chore.'),
    });
  }

  canDelete(chore: Chore): boolean {
    const me = this.auth.user()?.id;
    return canAdminister(this.current()?.role) || chore.createdBy?.id === me;
  }

  remove(chore: Chore): void {
    const household = this.current();
    if (!household) return;
    confirm(this.dialog, {
      title: `Delete "${chore.title}"?`,
      message: 'The chore and its history will be removed for everyone.',
      confirmLabel: 'Delete',
      destructive: true,
    }).subscribe((ok) => {
      if (!ok) return;
      this.choresService.delete(household.id, chore.id).subscribe({
        next: () => this.chores.update((list) => (list ?? []).filter((c) => c.id !== chore.id)),
        error: () => this.toast('Could not delete the chore.'),
      });
    });
  }

  private openDialog(data: ChoreDialogData) {
    return this.dialog
      .open<ChoreDialogComponent, ChoreDialogData, ChoreDialogResult | undefined>(
        ChoreDialogComponent,
        { data, maxWidth: 'calc(100vw - 32px)' },
      )
      .afterClosed();
  }

  private replace(updated: Chore): void {
    this.chores.update((list) => (list ?? []).map((c) => (c.id === updated.id ? updated : c)));
  }

  private toast(message: string): void {
    this.snackBar.open(message, 'Dismiss', { duration: 4000 });
  }
}
