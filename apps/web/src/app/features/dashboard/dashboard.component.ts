import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../../core/auth';

/** Placeholder until Phase 4 delivers the real dashboard. */
@Component({
  selector: 'app-dashboard',
  imports: [MatCardModule, MatIconModule],
  template: `
    <h1 class="dashboard__title">Hi {{ user()?.displayName }} 👋</h1>
    <mat-card appearance="outlined" class="dashboard__empty">
      <mat-card-content>
        <mat-icon class="dashboard__icon" aria-hidden="true">holiday_village</mat-icon>
        <h2>No household yet</h2>
        <p>
          Households, shopping lists, chores and expenses are on their way. Next up: create a
          household and invite the people you live with.
        </p>
      </mat-card-content>
    </mat-card>
  `,
  styles: `
    .dashboard__title {
      font-size: 1.5rem;
      font-weight: 500;
      margin: 0 0 1rem;
    }
    .dashboard__empty {
      background: #fff;
      text-align: center;
      padding: 1.5rem 1rem;
      h2 {
        font-size: 1.125rem;
        margin: 0.5rem 0 0.25rem;
      }
      p {
        margin: 0 auto;
        max-width: 420px;
        color: rgba(0, 0, 0, 0.6);
      }
    }
    .dashboard__icon {
      font-size: 48px;
      width: 48px;
      height: 48px;
      color: #005cbb;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardComponent {
  readonly user = inject(AuthService).user;
}
