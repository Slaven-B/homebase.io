import { HttpErrorResponse } from '@angular/common/http';
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
import { MatListModule } from '@angular/material/list';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth';
import {
  AssignableRole,
  CURRENCIES,
  CreatedInvitation,
  HouseholdDetail,
  HouseholdMember,
  Invitation,
  ROLE_LABELS,
  canAdminister,
} from '../../../core/households/household.models';
import { HouseholdService } from '../../../core/households/household.service';
import { confirm } from '../../../shared/components/confirm-dialog/confirm-dialog.component';

@Component({
  selector: 'app-household-detail',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatCardModule,
    MatListModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './household-detail.component.html',
  styleUrl: './household-detail.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HouseholdDetailComponent {
  private readonly fb = inject(FormBuilder);
  private readonly households = inject(HouseholdService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  /** Bound from the route parameter. */
  readonly id = input.required<string>();

  readonly household = signal<HouseholdDetail | null>(null);
  readonly invitations = signal<Invitation[]>([]);
  readonly notFound = signal(false);
  readonly lastInvite = signal<CreatedInvitation | null>(null);
  readonly inviting = signal(false);
  readonly renaming = signal(false);
  readonly editingName = signal(false);
  readonly roleLabels = ROLE_LABELS;
  readonly currencies = CURRENCIES;

  readonly myRole = computed(() => this.household()?.myRole ?? null);
  readonly isAdmin = computed(() => canAdminister(this.myRole()));
  readonly isOwner = computed(() => this.myRole() === 'OWNER');
  readonly myUserId = computed(() => this.auth.user()?.id ?? null);

  readonly inviteForm = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    role: ['MEMBER' as AssignableRole, [Validators.required]],
  });
  readonly nameForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(80)]],
  });

  constructor() {
    effect(() => {
      const id = this.id();
      this.household.set(null);
      this.notFound.set(false);
      this.lastInvite.set(null);
      this.households.select(id);
      this.households.get(id).subscribe({
        next: (h) => {
          this.household.set(h);
          this.nameForm.reset({ name: h.name });
          if (canAdminister(h.myRole)) this.loadInvitations(id);
        },
        error: () => this.notFound.set(true),
      });
    });
  }

  inviteLink(token: string): string {
    return `${location.origin}/invite/${token}`;
  }

  async copy(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      this.snackBar.open('Invite link copied', undefined, { duration: 2000 });
    } catch {
      this.snackBar.open('Could not copy. Select the link and copy it manually.', 'Dismiss');
    }
  }

  invite(): void {
    if (this.inviteForm.invalid || this.inviting()) {
      this.inviteForm.markAllAsTouched();
      return;
    }
    const { email, role } = this.inviteForm.getRawValue();
    this.inviting.set(true);
    this.households.invite(this.id(), email, role).subscribe({
      next: (created) => {
        this.inviting.set(false);
        this.lastInvite.set(created);
        this.invitations.update((list) => [created, ...list]);
        this.inviteForm.reset({ email: '', role: 'MEMBER' });
      },
      error: (err: unknown) => {
        this.inviting.set(false);
        this.toast(
          err,
          err instanceof HttpErrorResponse && err.status === 409
            ? 'That person is already a member or already invited.'
            : 'Could not send the invitation.',
        );
      },
    });
  }

  revoke(invitation: Invitation): void {
    this.households.revokeInvitation(this.id(), invitation.id).subscribe({
      next: () => {
        this.invitations.update((list) => list.filter((i) => i.id !== invitation.id));
        if (this.lastInvite()?.id === invitation.id) this.lastInvite.set(null);
      },
      error: (err: unknown) => this.toast(err, 'Could not revoke the invitation.'),
    });
  }

  saveName(): void {
    if (this.nameForm.invalid || this.renaming()) return;
    this.renaming.set(true);
    this.households.rename(this.id(), this.nameForm.getRawValue().name).subscribe({
      next: (h) => {
        this.renaming.set(false);
        this.editingName.set(false);
        this.household.set(h);
      },
      error: (err: unknown) => {
        this.renaming.set(false);
        this.toast(err, 'Could not rename the household.');
      },
    });
  }

  setCurrency(currency: string): void {
    if (!currency || currency === this.household()?.currency) return;
    this.households.update(this.id(), { currency }).subscribe({
      next: (h) => {
        this.household.set(h);
        this.snackBar.open(`Currency set to ${h.currency}`, undefined, { duration: 2000 });
      },
      error: (err: unknown) => this.toast(err, 'Could not change the currency.'),
    });
  }

  changeRole(member: HouseholdMember, role: AssignableRole): void {
    if (member.role === role) return;
    this.households.updateMemberRole(this.id(), member.id, role).subscribe({
      next: (updated) => this.patchMember(updated),
      error: (err: unknown) => this.toast(err, 'Could not change the role.'),
    });
  }

  removeMember(member: HouseholdMember): void {
    confirm(this.dialog, {
      title: `Remove ${member.displayName}?`,
      message: `${member.displayName} will lose access to this household. You can invite them again later.`,
      confirmLabel: 'Remove',
      destructive: true,
    }).subscribe((ok) => {
      if (!ok) return;
      this.households.removeMember(this.id(), member.id).subscribe({
        next: () =>
          this.household.update((h) =>
            h ? { ...h, members: h.members.filter((m) => m.id !== member.id) } : h,
          ),
        error: (err: unknown) => this.toast(err, 'Could not remove the member.'),
      });
    });
  }

  leave(): void {
    const name = this.household()?.name ?? 'this household';
    confirm(this.dialog, {
      title: `Leave ${name}?`,
      message: 'You will no longer see its lists, chores and expenses.',
      confirmLabel: 'Leave',
      destructive: true,
    }).subscribe((ok) => {
      if (!ok) return;
      this.households.leave(this.id()).subscribe({
        next: () => void this.router.navigate(['/households']),
        error: (err: unknown) => this.toast(err, 'Could not leave the household.'),
      });
    });
  }

  deleteHousehold(): void {
    const name = this.household()?.name ?? 'this household';
    confirm(this.dialog, {
      title: `Delete ${name}?`,
      message: 'This permanently removes the household for every member. This cannot be undone.',
      confirmLabel: 'Delete household',
      destructive: true,
    }).subscribe((ok) => {
      if (!ok) return;
      this.households.delete(this.id()).subscribe({
        next: () => void this.router.navigate(['/households']),
        error: (err: unknown) => this.toast(err, 'Could not delete the household.'),
      });
    });
  }

  private loadInvitations(id: string): void {
    this.households.listInvitations(id).subscribe({
      next: (list) => this.invitations.set(list),
      error: () => this.invitations.set([]),
    });
  }

  private patchMember(updated: HouseholdMember): void {
    this.household.update((h) =>
      h ? { ...h, members: h.members.map((m) => (m.id === updated.id ? updated : m)) } : h,
    );
  }

  private toast(err: unknown, fallback: string): void {
    const body = err instanceof HttpErrorResponse ? (err.error as { message?: unknown }) : null;
    const message =
      typeof body?.message === 'string' && body.message.length < 140 ? body.message : fallback;
    this.snackBar.open(message, 'Dismiss', { duration: 5000 });
  }
}
