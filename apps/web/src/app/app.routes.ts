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
        path: 'shopping',
        loadComponent: () =>
          import('./features/shopping/shopping-lists/shopping-lists.component').then(
            (m) => m.ShoppingListsComponent,
          ),
        title: 'Shopping · HomeBase',
      },
      {
        path: 'shopping/:listId',
        loadComponent: () =>
          import('./features/shopping/shopping-list-detail/shopping-list-detail.component').then(
            (m) => m.ShoppingListDetailComponent,
          ),
        title: 'Shopping list · HomeBase',
      },
      {
        path: 'tasks',
        loadComponent: () =>
          import('./features/tasks/tasks-page/tasks-page.component').then(
            (m) => m.TasksPageComponent,
          ),
        title: 'Tasks · HomeBase',
      },
      {
        path: 'tasks/:taskId',
        loadComponent: () =>
          import('./features/tasks/task-detail/task-detail.component').then(
            (m) => m.TaskDetailComponent,
          ),
        title: 'Task · HomeBase',
      },
      {
        path: 'chores',
        loadComponent: () =>
          import('./features/chores/chores-page/chores-page.component').then(
            (m) => m.ChoresPageComponent,
          ),
        title: 'Chores · HomeBase',
      },
      {
        path: 'expenses',
        loadComponent: () =>
          import('./features/expenses/expenses-page/expenses-page.component').then(
            (m) => m.ExpensesPageComponent,
          ),
        title: 'Expenses · HomeBase',
      },
      {
        path: 'expenses/balances',
        loadComponent: () =>
          import('./features/expenses/balances-page/balances-page.component').then(
            (m) => m.BalancesPageComponent,
          ),
        title: 'Balances · HomeBase',
      },
      {
        path: 'bills',
        loadComponent: () =>
          import('./features/bills/bills-page/bills-page.component').then(
            (m) => m.BillsPageComponent,
          ),
        title: 'Bills · HomeBase',
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
