import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { ShoppingItem, ShoppingItemInput } from '../../../core/shopping/shopping.models';

export interface ItemDialogData {
  item: ShoppingItem;
}

/** Edit name, quantity, category and notes of a shopping item. Returns the patch or undefined. */
@Component({
  selector: 'app-item-dialog',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
  ],
  template: `
    <h2 mat-dialog-title>Edit item</h2>
    <form [formGroup]="form" (ngSubmit)="save()" novalidate>
      <mat-dialog-content class="content">
        <mat-form-field appearance="outline">
          <mat-label>Name</mat-label>
          <input matInput formControlName="name" required maxlength="120" cdkFocusInitial />
          @if (form.controls.name.hasError('required')) {
            <mat-error>Name is required.</mat-error>
          }
        </mat-form-field>
        <div class="row">
          <mat-form-field appearance="outline">
            <mat-label>Quantity</mat-label>
            <input
              matInput
              formControlName="quantity"
              placeholder="2, 500 g, 1 pack"
              maxlength="40"
            />
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Category</mat-label>
            <input
              matInput
              formControlName="category"
              placeholder="Dairy, Household…"
              maxlength="40"
            />
          </mat-form-field>
        </div>
        <mat-form-field appearance="outline">
          <mat-label>Notes</mat-label>
          <textarea matInput formControlName="notes" rows="2" maxlength="500"></textarea>
        </mat-form-field>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" (click)="ref.close()">Cancel</button>
        <button mat-flat-button color="primary" type="submit" [disabled]="form.invalid">
          Save
        </button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    .content {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      padding-top: 0.5rem !important;
      min-width: min(420px, calc(100vw - 64px));
    }
    .row {
      display: flex;
      gap: 0.5rem;
      mat-form-field {
        flex: 1;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ItemDialogComponent {
  readonly ref = inject(MatDialogRef<ItemDialogComponent, ShoppingItemInput | undefined>);
  private readonly data = inject<ItemDialogData>(MAT_DIALOG_DATA);
  private readonly fb = inject(FormBuilder);

  readonly form = this.fb.nonNullable.group({
    name: [this.data.item.name, [Validators.required, Validators.maxLength(120)]],
    quantity: [this.data.item.quantity ?? '', [Validators.maxLength(40)]],
    category: [this.data.item.category ?? '', [Validators.maxLength(40)]],
    notes: [this.data.item.notes ?? '', [Validators.maxLength(500)]],
  });

  save(): void {
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    this.ref.close({
      name: v.name.trim(),
      quantity: v.quantity.trim() || null,
      category: v.category.trim() || null,
      notes: v.notes.trim() || null,
    });
  }
}
