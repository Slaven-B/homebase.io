import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/auth';

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () =>
      import('./features/auth/login/login.component').then((m) => m.LoginComponent),
    title: 'Sign in · HomeBase',
  },
  {
    path: 'register',
    canActivate: [guestGuard],
    loadComponent: () =>
      import('./features/auth/register/register.component').then((m) => m.RegisterComponent),
    title: 'Create account · HomeBase',
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./core/layout/shell.component').then((m) => m.ShellComponent),
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent),
        title: 'Dashboard · HomeBase',
      },
      {
        path: 'households',
        loadComponent: () =>
          import('./features/household/household-list/household-list.component').then(
            (m) => m.HouseholdListComponent,
          ),
        title: 'Households · HomeBase',
      },
      {
        path: 'households/:id',
        loadComponent: () =>
          import('./features/household/household-detail/household-detail.component').then(
            (m) => m.HouseholdDetailComponent,
          ),
        title: 'Household · HomeBase',
      },
      {
        path: 'invite/:token',
        loadComponent: () =>
          import('./features/household/invitation-accept/invitation-accept.component').then(
            (m) => m.InvitationAcceptComponent,
          ),
        title: 'Invitation · HomeBase',
      },
      {
        path: 'activity',
        loadComponent: () =>
          import('./features/activity/activity-page.component').then(
            (m) => m.ActivityPageComponent,
          ),
        title: 'Activity · HomeBase',
      },
      {
        path: 'profile',
        loadComponent: () =>
          import('./features/profile/profile.component').then((m) => m.ProfileComponent),
        title: 'Profile · HomeBase',
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
