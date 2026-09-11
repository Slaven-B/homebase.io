import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { HouseholdService } from '../../../core/households/household.service';
import { PendingInvitation, ROLE_LABELS } from '../../../core/households/household.models';

@Component({
  selector: 'app-household-list',
  imports: [
    ReactiveFormsModule,
    MatCardModule,
    MatListModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './household-list.component.html',
  styleUrl: './household-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HouseholdListComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly households = inject(HouseholdService);
  private readonly router = inject(Router);
  private readonly snackBar = inject(MatSnackBar);

  readonly list = this.households.households;
  readonly currentId = this.households.currentId;
  readonly invitations = signal<PendingInvitation[] | null>(null);
  readonly creating = signal(false);
  readonly showCreate = signal(false);
  readonly error = signal<string | null>(null);
  readonly roleLabels = ROLE_LABELS;

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(80)]],
  });

  ngOnInit(): void {
    this.households.load().subscribe({
      next: (list) => this.showCreate.set(list.length === 0),
      error: () => this.error.set('Could not load your households.'),
    });
    this.households.myInvitations().subscribe({
      next: (inv) => this.invitations.set(inv),
      error: () => this.invitations.set([]),
    });
  }

  select(id: string): void {
    this.households.select(id);
    void this.router.navigate(['/households', id]);
  }

  create(): void {
    if (this.form.invalid || this.creating()) {
      this.form.markAllAsTouched();
      return;
    }
    this.creating.set(true);
    this.households.create(this.form.getRawValue().name).subscribe({
      next: (h) => {
        this.creating.set(false);
        this.form.reset();
        this.snackBar.open(`"${h.name}" created`, undefined, { duration: 2500 });
        void this.router.navigate(['/households', h.id]);
      },
      error: () => {
        this.creating.set(false);
        this.error.set('Could not create the household. Please try again.');
      },
    });
  }

  accept(invitation: PendingInvitation): void {
    this.households.acceptInvitation(invitation.token).subscribe({
      next: (h) => {
        this.invitations.update((list) => (list ?? []).filter((i) => i.id !== invitation.id));
        this.snackBar.open(`Welcome to ${h.name}!`, undefined, { duration: 2500 });
        void this.router.navigate(['/households', h.id]);
      },
      error: () => this.snackBar.open('Could not accept the invitation.', 'Dismiss'),
    });
  }

  decline(invitation: PendingInvitation): void {
    this.households.declineInvitation(invitation.token).subscribe({
      next: () =>
        this.invitations.update((list) => (list ?? []).filter((i) => i.id !== invitation.id)),
      error: () => this.snackBar.open('Could not decline the invitation.', 'Dismiss'),
    });
  }
}
