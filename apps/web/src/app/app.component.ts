import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatToolbarModule } from '@angular/material/toolbar';
import { RouterOutlet } from '@angular/router';
import { HealthReport } from './core/models/health.model';
import { ApiHealthService } from './core/services/api-health.service';

type ConnectionState = 'loading' | 'connected' | 'degraded' | 'unreachable';

@Component({
  selector: 'app-root',
  imports: [
    RouterOutlet,
    MatToolbarModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent implements OnInit {
  private readonly apiHealth = inject(ApiHealthService);

  readonly state = signal<ConnectionState>('loading');
  readonly report = signal<HealthReport | null>(null);
  readonly errorMessage = signal<string | null>(null);

  ngOnInit(): void {
    this.refresh();
  }

  refresh(): void {
    this.state.set('loading');
    this.errorMessage.set(null);

    this.apiHealth.getHealth().subscribe({
      next: (report) => {
        this.report.set(report);
        this.state.set(report.status === 'ok' ? 'connected' : 'degraded');
      },
      error: (error: unknown) => {
        this.report.set(null);
        this.state.set('unreachable');
        this.errorMessage.set(describeError(error));
      },
    });
  }
}

function describeError(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'status' in error) {
    const status = (error as { status: number }).status;
    return status === 0 ? 'The API did not respond.' : `The API returned HTTP ${status}.`;
  }
  return 'Unexpected error while contacting the API.';
}
