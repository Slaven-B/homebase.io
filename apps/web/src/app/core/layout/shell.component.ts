import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatToolbarModule } from '@angular/material/toolbar';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../auth';
import { HouseholdService } from '../households/household.service';

/** Authenticated application frame: top bar, navigation, household switcher, user menu. */
@Component({
  selector: 'app-shell',
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
  ],
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShellComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly householdService = inject(HouseholdService);
  private readonly router = inject(Router);

  readonly user = this.auth.user;
  readonly households = this.householdService.households;
  readonly currentHousehold = this.householdService.current;

  ngOnInit(): void {
    if (this.households() === null) {
      this.householdService.load().subscribe({ error: () => undefined });
    }
  }

  switchHousehold(id: string): void {
    this.householdService.select(id);
    void this.router.navigateByUrl('/');
  }

  logout(): void {
    this.auth.logout().subscribe(() => {
      this.householdService.reset();
      void this.router.navigateByUrl('/login');
    });
  }
}
