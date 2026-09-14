import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';

/**
 * Standard page header: optional back link, title, optional subtitle, projected actions.
 *
 * <app-page-header title="Bills" subtitle="Rent, internet, electricity" backLink="/">
 *   <button mat-flat-button>New bill</button>
 * </app-page-header>
 */
@Component({
  selector: 'app-page-header',
  imports: [RouterLink, MatButtonModule, MatIconModule],
  template: `
    <header class="hb-page-header">
      <div class="lead">
        @if (backLink(); as link) {
          <a mat-icon-button [routerLink]="link" [attr.aria-label]="backLabel()">
            <mat-icon>arrow_back</mat-icon>
          </a>
        }
        <div class="text">
          <h1>{{ title() }}</h1>
          @if (subtitle(); as sub) {
            <p class="hb-muted">{{ sub }}</p>
          }
        </div>
      </div>
      <div class="hb-page-header__actions"><ng-content /></div>
    </header>
  `,
  styles: `
    // Grows to take the remaining width so long titles wrap instead of pushing the
    // actions onto their own line; actions still wrap below when there is no room.
    .lead {
      display: flex;
      align-items: center;
      gap: var(--hb-space-1);
      flex: 1 1 200px;
      min-width: 0;
    }
    .hb-page-header__actions {
      flex-shrink: 0;
      margin-left: auto;
    }
    .text {
      min-width: 0;
    }
    p {
      margin: 2px 0 0;
      font-size: var(--hb-text-sm);
      line-height: var(--hb-text-sm-lh);
    }
    h1 {
      overflow-wrap: anywhere;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PageHeaderComponent {
  readonly title = input.required<string>();
  readonly subtitle = input<string | null>(null);
  readonly backLink = input<string | unknown[] | null>(null);
  readonly backLabel = input('Back');
}
