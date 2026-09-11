import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AuthService } from '../../core/auth';

@Component({
  selector: 'app-profile',
  imports: [
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
  ],
  templateUrl: './profile.component.html',
  styleUrl: './profile.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly snackBar = inject(MatSnackBar);

  readonly user = this.auth.user;
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    displayName: ['', [Validators.required, Validators.maxLength(60)]],
    avatarUrl: ['', [Validators.maxLength(2048), Validators.pattern(/^https:\/\/.+/)]],
  });

  constructor() {
    // Keep the form in sync with the session user (e.g. after a page reload).
    effect(() => {
      const u = this.user();
      if (u && !this.form.dirty) {
        this.form.reset({ displayName: u.displayName, avatarUrl: u.avatarUrl ?? '' });
      }
    });
  }

  save(): void {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    const { displayName, avatarUrl } = this.form.getRawValue();

    this.auth.updateProfile({ displayName, avatarUrl: avatarUrl.trim() || null }).subscribe({
      next: () => {
        this.saving.set(false);
        this.form.markAsPristine();
        this.snackBar.open('Profile saved', undefined, { duration: 2500 });
      },
      error: () => {
        this.saving.set(false);
        this.error.set('Could not save your profile. Please try again.');
      },
    });
  }
}
