import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { RouterLink } from '@angular/router';
import { HouseholdService } from '../../../core/households/household.service';
import { NoteSummary } from '../../../core/notes/note.models';
import { NotesService } from '../../../core/notes/notes.service';

@Component({
  selector: 'app-notes-page',
  imports: [
    DatePipe,
    ReactiveFormsModule,
    RouterLink,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
  ],
  template: `
    <div class="page-header">
      <h1>Notes</h1>
      @if (current()) {
        <a mat-flat-button color="primary" routerLink="/notes/new">
          <mat-icon>add</mat-icon>
          New note
        </a>
      }
    </div>

    @if (!current()) {
      <mat-card appearance="outlined" class="card card--empty">
        <mat-card-content>
          <mat-icon aria-hidden="true">holiday_village</mat-icon>
          <h2>No household yet</h2>
          <p>Notes belong to a household. Create or join one first.</p>
          <a mat-flat-button color="primary" routerLink="/households">Households</a>
        </mat-card-content>
      </mat-card>
    } @else {
      @if ((notes()?.length ?? 0) > 3) {
        <mat-form-field appearance="outline" class="search" subscriptSizing="dynamic">
          <mat-icon matPrefix aria-hidden="true">search</mat-icon>
          <input matInput [formControl]="search" placeholder="Search notes" />
        </mat-form-field>
      }

      @if (error(); as message) {
        <p class="error" role="alert">{{ message }}</p>
      }

      @if (notes() === null) {
        <div class="loading"><mat-spinner diameter="32"></mat-spinner></div>
      } @else if (notes()!.length === 0) {
        <mat-card appearance="outlined" class="card card--empty">
          <mat-card-content>
            <mat-icon aria-hidden="true">sticky_note_2</mat-icon>
            <h2>Nothing here yet</h2>
            <p>
              Keep the WiFi password, emergency contacts or landlord details where everyone finds
              them.
            </p>
            <a mat-flat-button color="primary" routerLink="/notes/new">
              <mat-icon>add</mat-icon>
              New note
            </a>
          </mat-card-content>
        </mat-card>
      } @else if (visible().length === 0) {
        <p class="muted">No notes match "{{ search.value }}".</p>
      } @else {
        <div class="grid">
          @for (n of visible(); track n.id) {
            <a class="note-link" [routerLink]="['/notes', n.id]">
              <mat-card appearance="outlined" class="note" [class.note--pinned]="n.isPinned">
                <mat-card-content>
                  <div class="note__head">
                    <strong class="note__title">{{ n.title }}</strong>
                    @if (n.isPinned) {
                      <mat-icon class="note__pin" aria-label="Pinned">push_pin</mat-icon>
                    }
                  </div>
                  <p class="note__preview">{{ n.preview || 'Empty note' }}</p>
                  <span class="note__meta">
                    {{ n.lastEditedBy?.displayName ?? n.author?.displayName ?? 'Someone' }} ·
                    {{ n.updatedAt | date: 'mediumDate' }}
                  </span>
                </mat-card-content>
              </mat-card>
            </a>
          }
        </div>
      }
    }
  `,
  styles: `
    .page-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      margin-bottom: 0.75rem;
      h1 {
        font-size: 1.5rem;
        font-weight: 500;
        margin: 0;
      }
    }
    .search {
      width: 100%;
      max-width: 420px;
      margin-bottom: 1rem;
    }
    .grid {
      display: grid;
      gap: 0.75rem;
      grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    }
    .card {
      background: #fff;
      &--empty {
        text-align: center;
        padding: 1.5rem 1rem;
        h2 {
          font-size: 1.125rem;
          margin: 0.5rem 0 0.25rem;
        }
        p {
          margin: 0 auto 1rem;
          max-width: 440px;
          color: rgba(0, 0, 0, 0.6);
        }
        mat-icon {
          font-size: 40px;
          width: 40px;
          height: 40px;
          color: #005cbb;
        }
      }
    }
    .note-link {
      text-decoration: none;
      color: inherit;
    }
    .note {
      background: #fff;
      height: 100%;
      transition: box-shadow 120ms ease;
      &:hover {
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
      }
      &--pinned {
        background: #fffbe9;
      }
    }
    .note__head {
      display: flex;
      align-items: flex-start;
      gap: 0.5rem;
    }
    .note__title {
      flex: 1;
      overflow-wrap: anywhere;
    }
    .note__pin {
      font-size: 18px;
      width: 18px;
      height: 18px;
      color: #7a4b00;
      transform: rotate(45deg);
    }
    .note__preview {
      margin: 0.375rem 0 0.5rem;
      font-size: 0.875rem;
      color: rgba(0, 0, 0, 0.7);
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .note__meta {
      font-size: 0.75rem;
      color: rgba(0, 0, 0, 0.55);
    }
    .muted {
      color: rgba(0, 0, 0, 0.6);
    }
    .loading {
      display: grid;
      place-items: center;
      padding: 2rem;
    }
    .error {
      color: #b3261e;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotesPageComponent {
  private readonly notesService = inject(NotesService);
  private readonly householdService = inject(HouseholdService);

  readonly current = this.householdService.current;
  readonly notes = signal<NoteSummary[] | null>(null);
  readonly error = signal<string | null>(null);
  readonly search = new FormControl('', { nonNullable: true });
  private readonly query = toSignal(this.search.valueChanges, { initialValue: '' });

  readonly visible = computed(() => {
    const q = this.query().trim().toLowerCase();
    const list = this.notes() ?? [];
    if (!q) return list;
    return list.filter(
      (n) => n.title.toLowerCase().includes(q) || n.preview.toLowerCase().includes(q),
    );
  });

  constructor() {
    effect(() => {
      const household = this.current();
      this.notes.set(null);
      this.error.set(null);
      if (!household) return;
      this.notesService.list(household.id).subscribe({
        next: (notes) => this.notes.set(notes),
        error: () => this.error.set('Could not load notes.'),
      });
    });
  }
}
