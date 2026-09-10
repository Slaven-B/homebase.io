import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { AppComponent } from './app.component';
import { HealthReport } from './core/models/health.model';

const healthy: HealthReport = {
  status: 'ok',
  timestamp: '2026-01-01T00:00:00.000Z',
  uptimeSeconds: 42,
  version: '0.1.0',
  environment: 'test',
  checks: { database: { status: 'up', latencyMs: 3 } },
};

describe('AppComponent', () => {
  let fixture: ComponentFixture<AppComponent>;
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideNoopAnimations()],
    }).compileComponents();

    fixture = TestBed.createComponent(AppComponent);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('renders the app title', () => {
    fixture.detectChanges();
    http.expectOne('/api/health').flush(healthy);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('HomeBase');
  });

  it('shows a connected state when the API is healthy', () => {
    fixture.detectChanges();
    http.expectOne('/api/health').flush(healthy);
    fixture.detectChanges();

    expect(fixture.componentInstance.state()).toBe('connected');
    expect(fixture.nativeElement.textContent).toContain('Everything is connected');
  });

  it('shows a degraded state when the API reports the database down', () => {
    fixture.detectChanges();
    http
      .expectOne('/api/health')
      .flush(
        { ...healthy, status: 'degraded', checks: { database: { status: 'down', error: 'boom' } } },
        { status: 503, statusText: 'Service Unavailable' },
      );
    fixture.detectChanges();

    expect(fixture.componentInstance.state()).toBe('degraded');
    expect(fixture.nativeElement.textContent).toContain('database is unreachable');
  });

  it('shows an unreachable state when the request fails', () => {
    fixture.detectChanges();
    http.expectOne('/api/health').error(new ProgressEvent('error'), { status: 0 });
    fixture.detectChanges();

    expect(fixture.componentInstance.state()).toBe('unreachable');
    expect(fixture.nativeElement.textContent).toContain('Cannot reach the API');
  });
});
