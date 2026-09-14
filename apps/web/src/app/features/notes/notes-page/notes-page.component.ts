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
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { RouterLink } from '@angular/router';
import { HouseholdService } from '../../../core/households/household.service';
import { NoteSummary } from '../../../core/notes/note.models';
import { NotesService } from '../../../core/notes/notes.service';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';

@Component({
  selector: 'app-notes-page',
  imports: [
    DatePipe,
    ReactiveFormsModule,
    RouterLink,
    PageHeaderComponent,
    EmptyStateComponent,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
  ],
  template: `
    <app-page-header title="Notes">
      @if (current()) {
        <a mat-flat-button routerLink="/notes/new">
          <mat-icon>add</mat-icon>
          New note
        </a>
      }
    </app-page-header>

    @if (!current()) {
      <div class="hb-card">
        <app-empty-state
          icon="holiday_village"
          title="No household yet"
          message="Notes belong to a household. Create or join one first."
        >
          <a mat-flat-button routerLink="/households">Households</a>
        </app-empty-state>
      </div>
    } @else {
      @if ((notes()?.length ?? 0) > 3) {
        <mat-form-field appearance="outline" class="search" subscriptSizing="dynamic">
          <mat-icon matPrefix aria-hidden="true">search</mat-icon>
          <input matInput [formControl]="search" placeholder="Search notes" />
        </mat-form-field>
      }

      @if (error(); as message) {
        <div class="hb-alert hb-alert--error" role="alert">{{ message }}</div>
      }

      @if (notes() === null) {
        <div class="hb-loading"><mat-spinner diameter="32"></mat-spinner></div>
      } @else if (notes()!.length === 0) {
        <div class="hb-card">
          <app-empty-state
            icon="sticky_note_2"
            title="Nothing here yet"
            message="Keep the WiFi password, emergency contacts or landlord details where everyone finds them."
          >
            <a mat-flat-button routerLink="/notes/new">
              <mat-icon>add</mat-icon>
              New note
            </a>
          </app-empty-state>
        </div>
      } @else if (visible().length === 0) {
        <p class="hb-muted">No notes match "{{ search.value }}".</p>
      } @else {
        <div class="hb-grid">
          @for (n of visible(); track n.id) {
            <a
              class="hb-card note"
              [class.note--pinned]="n.isPinned"
              [routerLink]="['/notes', n.id]"
            >
              <span class="note__head">
                <span class="hb-row__title">{{ n.title }}</span>
                @if (n.isPinned) {
                  <mat-icon class="note__pin" aria-label="Pinned">push_pin</mat-icon>
                }
              </span>
              <p class="note__preview">{{ n.preview || 'Empty note' }}</p>
              <span class="hb-subtle">
                {{ n.lastEditedBy?.displayName ?? n.author?.displayName ?? 'Someone' }} ·
                {{ n.updatedAt | date: 'mediumDate' }}
              </span>
            </a>
          }
        </div>
      }
    }
  `,
  styles: `
    .search {
      width: 100%;
      max-width: 420px;
      margin-bottom: var(--hb-space-4);
    }
    .note {
      display: flex;
      flex-direction: column;
      gap: var(--hb-space-2);
      padding: var(--hb-space-4);
      color: inherit;
      text-decoration: none;
      transition:
        box-shadow 120ms ease,
        border-color 120ms ease;

      &:hover {
        box-shadow: var(--hb-shadow-md);
        border-color: var(--hb-border-primary);
      }
      &--pinned {
        background: var(--hb-badge-warning-bg);
      }
    }
    .note__head {
      display: flex;
      align-items: flex-start;
      gap: var(--hb-space-2);

      .hb-row__title {
        flex: 1;
      }
    }
    .note__pin {
      font-size: 18px;
      width: 18px;
      height: 18px;
      color: var(--hb-text-warning-primary);
      transform: rotate(45deg);
    }
    .note__preview {
      margin: 0;
      flex: 1;
      font-size: var(--hb-text-sm);
      line-height: var(--hb-text-sm-lh);
      color: var(--hb-text-secondary);
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
      overflow: hidden;
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
