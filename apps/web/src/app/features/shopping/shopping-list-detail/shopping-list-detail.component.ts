import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth';
import { canAdminister } from '../../../core/households/household.models';
import { HouseholdService } from '../../../core/households/household.service';
import {
  ShoppingItem,
  ShoppingItemInput,
  ShoppingListDetail,
} from '../../../core/shopping/shopping.models';
import { ShoppingService } from '../../../core/shopping/shopping.service';
import { confirm } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { ItemDialogComponent, ItemDialogData } from '../item-dialog/item-dialog.component';

/**
 * A single shopping list, optimized for quick use: type + Enter to add,
 * tap to check off. Item toggles are optimistic and roll back on failure.
 */
@Component({
  selector: 'app-shopping-list-detail',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './shopping-list-detail.component.html',
  styleUrl: './shopping-list-detail.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShoppingListDetailComponent {
  private readonly shopping = inject(ShoppingService);
  private readonly householdService = inject(HouseholdService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  /** Route parameter. */
  readonly listId = input.required<string>();
  readonly quickAddInput = viewChild<ElementRef<HTMLInputElement>>('quickAddInput');

  readonly current = this.householdService.current;
  readonly list = signal<ShoppingListDetail | null>(null);
  readonly notFound = signal(false);
  readonly adding = signal(false);
  readonly editingName = signal(false);

  readonly openItems = computed(() => this.list()?.items.filter((i) => !i.completed) ?? []);
  readonly doneItems = computed(() => this.list()?.items.filter((i) => i.completed) ?? []);
  readonly canDelete = computed(() => {
    const household = this.current();
    const list = this.list();
    const me = this.auth.user();
    if (!household || !list || !me) return false;
    return canAdminister(household.role) || list.createdBy?.id === me.id;
  });

  readonly quickAdd = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.maxLength(120)],
  });
  readonly nameControl = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.maxLength(80)],
  });

  constructor() {
    effect(() => {
      const household = this.current();
      const listId = this.listId();
      this.list.set(null);
      this.notFound.set(false);
      if (!household) return;
      this.shopping.getList(household.id, listId).subscribe({
        next: (list) => {
          this.list.set(list);
          this.nameControl.setValue(list.name);
        },
        error: () => this.notFound.set(true),
      });
    });
  }

  private get householdId(): string | null {
    return this.current()?.id ?? null;
  }

  /** Adds the typed item. Accepts "2x Milk" / "Milk x2" style quantity prefixes and suffixes. */
  add(): void {
    const householdId = this.householdId;
    const raw = this.quickAdd.value.trim();
    if (!householdId || !raw || this.adding()) return;

    this.adding.set(true);
    this.shopping.addItem(householdId, this.listId(), parseQuickAdd(raw)).subscribe({
      next: (item) => {
        this.adding.set(false);
        this.quickAdd.reset('');
        this.list.update((l) => (l ? { ...l, items: [item, ...l.items] } : l));
        this.quickAddInput()?.nativeElement.focus();
      },
      error: () => {
        this.adding.set(false);
        this.toast('Could not add the item.');
      },
    });
  }

  toggle(item: ShoppingItem, completed: boolean): void {
    const householdId = this.householdId;
    if (!householdId) return;
    const me = this.auth.user();

    // Optimistic update.
    this.patchItem({
      ...item,
      completed,
      completedAt: completed ? new Date().toISOString() : null,
      completedBy: completed && me ? { id: me.id, displayName: me.displayName } : null,
    });

    this.shopping.updateItem(householdId, this.listId(), item.id, { completed }).subscribe({
      next: (updated) => this.patchItem(updated),
      error: () => {
        this.patchItem(item);
        this.toast('Could not update the item.');
      },
    });
  }

  edit(item: ShoppingItem): void {
    this.dialog
      .open<ItemDialogComponent, ItemDialogData, ShoppingItemInput | undefined>(
        ItemDialogComponent,
        { data: { item }, maxWidth: 'calc(100vw - 32px)' },
      )
      .afterClosed()
      .subscribe((patch) => {
        const householdId = this.householdId;
        if (!patch || !householdId) return;
        this.shopping.updateItem(householdId, this.listId(), item.id, patch).subscribe({
          next: (updated) => this.patchItem(updated),
          error: () => this.toast('Could not save the item.'),
        });
      });
  }

  remove(item: ShoppingItem): void {
    const householdId = this.householdId;
    if (!householdId) return;
    this.list.update((l) => (l ? { ...l, items: l.items.filter((i) => i.id !== item.id) } : l));
    this.shopping.deleteItem(householdId, this.listId(), item.id).subscribe({
      error: () => {
        this.list.update((l) => (l ? { ...l, items: [item, ...l.items] } : l));
        this.toast('Could not remove the item.');
      },
    });
  }

  clearCompleted(): void {
    const householdId = this.householdId;
    if (!householdId || this.doneItems().length === 0) return;
    this.shopping.clearCompleted(householdId, this.listId()).subscribe({
      next: ({ removed }) => {
        this.list.update((l) => (l ? { ...l, items: l.items.filter((i) => !i.completed) } : l));
        this.snackBar.open(`Removed ${removed} ${removed === 1 ? 'item' : 'items'}`, undefined, {
          duration: 2500,
        });
      },
      error: () => this.toast('Could not clear completed items.'),
    });
  }

  saveName(): void {
    const householdId = this.householdId;
    if (!householdId || this.nameControl.invalid) return;
    this.shopping
      .updateList(householdId, this.listId(), { name: this.nameControl.value.trim() })
      .subscribe({
        next: (list) => {
          this.list.set(list);
          this.editingName.set(false);
        },
        error: () => this.toast('Could not rename the list.'),
      });
  }

  archive(): void {
    const householdId = this.householdId;
    if (!householdId) return;
    this.shopping.updateList(householdId, this.listId(), { isArchived: true }).subscribe({
      next: () => void this.router.navigate(['/shopping']),
      error: () => this.toast('Could not archive the list.'),
    });
  }

  deleteList(): void {
    const householdId = this.householdId;
    const name = this.list()?.name ?? 'this list';
    if (!householdId) return;
    confirm(this.dialog, {
      title: `Delete ${name}?`,
      message: 'All items on this list will be removed for everyone.',
      confirmLabel: 'Delete list',
      destructive: true,
    }).subscribe((ok) => {
      if (!ok) return;
      this.shopping.deleteList(householdId, this.listId()).subscribe({
        next: () => void this.router.navigate(['/shopping']),
        error: () => this.toast('Could not delete the list.'),
      });
    });
  }

  private patchItem(updated: ShoppingItem): void {
    this.list.update((l) =>
      l ? { ...l, items: l.items.map((i) => (i.id === updated.id ? updated : i)) } : l,
    );
  }

  private toast(message: string): void {
    this.snackBar.open(message, 'Dismiss', { duration: 4000 });
  }
}

/** "2x Milk", "2 x Milk", "Milk x2" → { name: "Milk", quantity: "2" }; otherwise name only. */
export function parseQuickAdd(raw: string): ShoppingItemInput {
  const prefix = /^(\d+(?:[.,]\d+)?)\s*[x×]\s+(.+)$/i.exec(raw);
  if (prefix) return { name: prefix[2].trim(), quantity: prefix[1] };
  const suffix = /^(.+?)\s+[x×]\s*(\d+(?:[.,]\d+)?)$/i.exec(raw);
  if (suffix) return { name: suffix[1].trim(), quantity: suffix[2] };
  return { name: raw };
}
