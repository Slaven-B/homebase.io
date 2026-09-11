import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth';
import { ROLE_LABELS } from '../../core/households/household.models';
import { HouseholdService } from '../../core/households/household.service';

/** Placeholder until Phase 4 delivers the real dashboard. */
@Component({
  selector: 'app-dashboard',
  imports: [RouterLink, MatCardModule, MatIconModule, MatButtonModule, MatProgressSpinnerModule],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardComponent {
  private readonly householdService = inject(HouseholdService);

  readonly user = inject(AuthService).user;
  readonly households = this.householdService.households;
  readonly current = this.householdService.current;
  readonly roleLabels = ROLE_LABELS;
}
