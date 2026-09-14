import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

/**
 * Friendly empty / not-found state inside a card. Project the primary action.
 *
 * <app-empty-state icon="receipt_long" title="No expenses yet" message="Add your first…">
 *   <button mat-flat-button>Add expense</button>
 * </app-empty-state>
 */
@Component({
  selector: 'app-empty-state',
  imports: [MatIconModule],
  template: `
    <div class="empty" [class.empty--muted]="tone() === 'muted'">
      <span class="empty__icon" aria-hidden="true"
        ><mat-icon>{{ icon() }}</mat-icon></span
      >
      <h2>{{ title() }}</h2>
      @if (message(); as text) {
        <p>{{ text }}</p>
      }
      <div class="empty__actions"><ng-content /></div>
    </div>
  `,
  styles: `
    .empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      padding: var(--hb-space-8) var(--hb-space-4);
      gap: var(--hb-space-1);
    }
    .empty__icon {
      display: grid;
      place-items: center;
      width: 48px;
      height: 48px;
      border-radius: var(--hb-radius-lg);
      background: var(--hb-bg-brand-primary);
      color: var(--hb-fg-brand-primary);
      margin-bottom: var(--hb-space-2);
      box-shadow: var(--hb-shadow-xs);
    }
    .empty--muted .empty__icon {
      background: var(--hb-bg-tertiary);
      color: var(--hb-fg-quaternary);
    }
    h2 {
      margin: 0;
      font-size: var(--hb-text-lg);
      line-height: var(--hb-text-lg-lh);
      font-weight: 600;
    }
    p {
      margin: 0;
      max-width: 44ch;
      color: var(--hb-text-tertiary);
      font-size: var(--hb-text-sm);
      line-height: var(--hb-text-sm-lh);
    }
    .empty__actions {
      display: flex;
      gap: var(--hb-space-2);
      flex-wrap: wrap;
      justify-content: center;
      margin-top: var(--hb-space-3);
    }
    .empty__actions:empty {
      display: none;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EmptyStateComponent {
  readonly icon = input('inbox');
  readonly title = input.required<string>();
  readonly message = input<string | null>(null);
  /** "brand" for inviting empties, "muted" for not-found states. */
  readonly tone = input<'brand' | 'muted'>('brand');
}
