import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router, RouterLink } from '@angular/router';
import { HouseholdService } from '../../../core/households/household.service';
import { ShoppingListSummary } from '../../../core/shopping/shopping.models';
import { ShoppingService } from '../../../core/shopping/shopping.service';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';

@Component({
  selector: 'app-shopping-lists',
  imports: [
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
  templateUrl: './shopping-lists.component.html',
  styleUrl: './shopping-lists.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShoppingListsComponent {
  private readonly shopping = inject(ShoppingService);
  private readonly householdService = inject(HouseholdService);
  private readonly router = inject(Router);
  private readonly snackBar = inject(MatSnackBar);

  readonly current = this.householdService.current;
  readonly lists = signal<ShoppingListSummary[] | null>(null);
  readonly creating = signal(false);
  readonly error = signal<string | null>(null);
  readonly nameControl = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.maxLength(80)],
  });

  constructor() {
    effect(() => {
      const household = this.current();
      this.lists.set(null);
      this.error.set(null);
      if (!household) return;
      this.shopping.lists(household.id).subscribe({
        next: (lists) => this.lists.set(lists),
        error: () => this.error.set('Could not load your shopping lists.'),
      });
    });
  }

  create(): void {
    const household = this.current();
    if (!household || this.nameControl.invalid || this.creating()) {
      this.nameControl.markAsTouched();
      return;
    }
    this.creating.set(true);
    this.shopping.createList(household.id, this.nameControl.value.trim()).subscribe({
      next: (list) => {
        this.creating.set(false);
        this.nameControl.reset('');
        void this.router.navigate(['/shopping', list.id]);
      },
      error: () => {
        this.creating.set(false);
        this.snackBar.open('Could not create the list.', 'Dismiss', { duration: 4000 });
      },
    });
  }
}
