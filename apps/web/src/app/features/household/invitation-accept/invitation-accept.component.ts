import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Router, RouterLink } from '@angular/router';
import { PendingInvitation, ROLE_LABELS } from '../../../core/households/household.models';
import { HouseholdService } from '../../../core/households/household.service';

type State = 'loading' | 'ready' | 'accepting' | 'declined' | 'invalid' | 'wrong-account';

/** Landing page for shared invite links: /invite/:token */
@Component({
  selector: 'app-invitation-accept',
  imports: [RouterLink, MatCardModule, MatButtonModule, MatIconModule, MatProgressSpinnerModule],
  templateUrl: './invitation-accept.component.html',
  styleUrl: './invitation-accept.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InvitationAcceptComponent {
  private readonly households = inject(HouseholdService);
  private readonly router = inject(Router);

  readonly token = input.required<string>();
  readonly state = signal<State>('loading');
  readonly invitation = signal<PendingInvitation | null>(null);
  readonly error = signal<string | null>(null);
  readonly roleLabels = ROLE_LABELS;

  constructor() {
    effect(() => {
      const token = this.token();
      this.state.set('loading');
      this.households.previewInvitation(token).subscribe({
        next: (inv) => {
          this.invitation.set(inv);
          this.state.set('ready');
        },
        error: (err: unknown) => this.fail(err),
      });
    });
  }

  accept(): void {
    this.state.set('accepting');
    this.households.acceptInvitation(this.token()).subscribe({
      next: (h) => void this.router.navigate(['/households', h.id]),
      error: (err: unknown) => this.fail(err),
    });
  }

  decline(): void {
    this.households.declineInvitation(this.token()).subscribe({
      next: () => this.state.set('declined'),
      error: (err: unknown) => this.fail(err),
    });
  }

  private fail(err: unknown): void {
    if (err instanceof HttpErrorResponse && err.status === 403) {
      this.state.set('wrong-account');
    } else {
      this.state.set('invalid');
    }
    this.error.set(
      err instanceof HttpErrorResponse && typeof err.error?.message === 'string'
        ? err.error.message
        : null,
    );
  }
}
