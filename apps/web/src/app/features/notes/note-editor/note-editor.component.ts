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
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
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
import { Note } from '../../../core/notes/note.models';
import { NotesService } from '../../../core/notes/notes.service';
import { confirm } from '../../../shared/components/confirm-dialog/confirm-dialog.component';

/** Create (/notes/new) or edit (/notes/:noteId) a note. Deliberately a plain textarea. */
@Component({
  selector: 'app-note-editor',
  imports: [
    DatePipe,
    ReactiveFormsModule,
    RouterLink,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
  ],
  template: `
    @if (notFound()) {
      <mat-card appearance="outlined" class="card card--empty">
        <mat-card-content>
          <mat-icon aria-hidden="true">search_off</mat-icon>
          <h2>Note not found</h2>
          <p>It may have been deleted or belongs to another household.</p>
          <a mat-flat-button color="primary" routerLink="/notes">Back to notes</a>
        </mat-card-content>
      </mat-card>
    } @else if (loading()) {
      <div class="loading"><mat-spinner diameter="32"></mat-spinner></div>
    } @else {
      <form [formGroup]="form" (ngSubmit)="save()" novalidate class="editor">
        <div class="page-header">
          <a mat-icon-button routerLink="/notes" aria-label="Back to notes">
            <mat-icon>arrow_back</mat-icon>
          </a>
          <mat-form-field appearance="outline" class="title" subscriptSizing="dynamic">
            <input
              matInput
              formControlName="title"
              placeholder="Title"
              maxlength="140"
              required
              aria-label="Title"
            />
          </mat-form-field>
          <button
            mat-icon-button
            type="button"
            (click)="togglePin()"
            [attr.aria-label]="form.controls.isPinned.value ? 'Unpin' : 'Pin'"
            [class.pinned]="form.controls.isPinned.value"
          >
            <mat-icon>push_pin</mat-icon>
          </button>
          @if (isEdit()) {
            <button
              mat-icon-button
              type="button"
              [matMenuTriggerFor]="menu"
              aria-label="Note actions"
            >
              <mat-icon>more_vert</mat-icon>
            </button>
            <mat-menu #menu="matMenu" xPosition="before">
              @if (canDelete()) {
                <button mat-menu-item type="button" (click)="remove()">
                  <mat-icon color="warn">delete</mat-icon>
                  <span>Delete note</span>
                </button>
              } @else {
                <span mat-menu-item disabled>Only the author or an admin can delete</span>
              }
            </mat-menu>
          }
        </div>

        <mat-card appearance="outlined" class="card">
          <mat-card-content>
            <textarea
              matInput
              formControlName="content"
              class="content"
              placeholder="Write anything the household should remember…"
              rows="14"
              maxlength="20000"
              aria-label="Content"
            ></textarea>
          </mat-card-content>
          <mat-card-actions align="end" class="actions">
            @if (note(); as n) {
              <span class="meta">
                {{ n.lastEditedBy?.displayName ?? n.author?.displayName ?? 'Someone' }} ·
                {{ n.updatedAt | date: 'medium' }}
              </span>
            }
            <span class="spacer"></span>
            @if (form.dirty) {
              <button mat-button type="button" (click)="reset()">Discard</button>
            }
            <button
              mat-flat-button
              color="primary"
              type="submit"
              [disabled]="form.invalid || saving() || (isEdit() && !form.dirty)"
            >
              {{ saving() ? 'Saving…' : isEdit() ? 'Save' : 'Create note' }}
            </button>
          </mat-card-actions>
        </mat-card>
      </form>
    }
  `,
  styles: `
    .page-header {
      display: flex;
      align-items: center;
      gap: 0.25rem;
      margin-bottom: 0.75rem;
    }
    .title {
      flex: 1;
      min-width: 0;
      font-size: 1.125rem;
    }
    .pinned {
      color: #7a4b00;
      mat-icon {
        transform: rotate(45deg);
      }
    }
    .card {
      background: #fff;
      max-width: 880px;
      &--empty {
        text-align: center;
        padding: 1.5rem 1rem;
        h2 {
          font-size: 1.125rem;
          margin: 0.5rem 0 0.25rem;
        }
        p {
          color: rgba(0, 0, 0, 0.6);
          margin: 0 0 1rem;
        }
        mat-icon {
          font-size: 40px;
          width: 40px;
          height: 40px;
          color: rgba(0, 0, 0, 0.4);
        }
      }
    }
    .content {
      width: 100%;
      border: 0;
      outline: none;
      resize: vertical;
      font: inherit;
      line-height: 1.5;
      padding: 0.5rem 0;
      background: transparent;
    }
    .actions {
      gap: 0.5rem;
      flex-wrap: wrap;
    }
    .meta {
      font-size: 0.75rem;
      color: rgba(0, 0, 0, 0.55);
      padding-left: 0.5rem;
    }
    .spacer {
      flex: 1;
    }
    .loading {
      display: grid;
      place-items: center;
      padding: 2rem;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NoteEditorComponent {
  private readonly fb = inject(FormBuilder);
  private readonly notesService = inject(NotesService);
  private readonly householdService = inject(HouseholdService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  /** Route param; undefined on /notes/new. */
  readonly noteId = input<string>();
  readonly current = this.householdService.current;
  readonly note = signal<Note | null>(null);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly notFound = signal(false);

  readonly isEdit = computed(() => !!this.noteId());
  readonly canDelete = computed(() => {
    const me = this.auth.user()?.id;
    return canAdminister(this.current()?.role) || this.note()?.author?.id === me;
  });

  readonly form = this.fb.nonNullable.group({
    title: ['', [Validators.required, Validators.maxLength(140)]],
    content: ['', [Validators.maxLength(20000)]],
    isPinned: [false],
  });

  constructor() {
    effect(() => {
      const household = this.current();
      const noteId = this.noteId();
      this.notFound.set(false);
      this.note.set(null);
      if (!household || !noteId) {
        this.form.reset({ title: '', content: '', isPinned: false });
        return;
      }
      this.loading.set(true);
      this.notesService.get(household.id, noteId).subscribe({
        next: (note) => {
          this.note.set(note);
          this.form.reset({ title: note.title, content: note.content, isPinned: note.isPinned });
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.notFound.set(true);
        },
      });
    });
  }

  togglePin(): void {
    this.form.controls.isPinned.setValue(!this.form.controls.isPinned.value);
    this.form.controls.isPinned.markAsDirty();
    this.form.markAsDirty();
  }

  reset(): void {
    const n = this.note();
    this.form.reset(
      n
        ? { title: n.title, content: n.content, isPinned: n.isPinned }
        : { title: '', content: '', isPinned: false },
    );
  }

  save(): void {
    const household = this.current();
    if (!household || this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const input = { title: v.title.trim(), content: v.content, isPinned: v.isPinned };
    this.saving.set(true);
    const noteId = this.noteId();
    const request$ = noteId
      ? this.notesService.update(household.id, noteId, input)
      : this.notesService.create(household.id, input);
    request$.subscribe({
      next: (note) => {
        this.saving.set(false);
        this.note.set(note);
        this.form.reset({ title: note.title, content: note.content, isPinned: note.isPinned });
        this.snackBar.open('Saved', undefined, { duration: 1500 });
        if (!noteId) void this.router.navigate(['/notes', note.id], { replaceUrl: true });
      },
      error: () => {
        this.saving.set(false);
        this.snackBar.open('Could not save the note.', 'Dismiss', { duration: 4000 });
      },
    });
  }

  remove(): void {
    const household = this.current();
    const noteId = this.noteId();
    if (!household || !noteId) return;
    confirm(this.dialog, {
      title: `Delete "${this.note()?.title ?? 'this note'}"?`,
      message: 'The note will be removed for everyone in the household.',
      confirmLabel: 'Delete',
      destructive: true,
    }).subscribe((ok) => {
      if (!ok) return;
      this.notesService.delete(household.id, noteId).subscribe({
        next: () => void this.router.navigate(['/notes']),
        error: () =>
          this.snackBar.open('Could not delete the note.', 'Dismiss', { duration: 4000 }),
      });
    });
  }
}
