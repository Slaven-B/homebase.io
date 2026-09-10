import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { HealthReport } from '../models/health.model';
import { ApiHealthService } from './api-health.service';

describe('ApiHealthService', () => {
  let service: ApiHealthService;
  let http: HttpTestingController;

  const degraded: HealthReport = {
    status: 'degraded',
    timestamp: '2026-01-01T00:00:00.000Z',
    uptimeSeconds: 1,
    version: '0.1.0',
    environment: 'test',
    checks: { database: { status: 'down', error: 'ECONNREFUSED' } },
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ApiHealthService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('calls GET /api/health', () => {
    service.getHealth().subscribe();
    const req = http.expectOne('/api/health');
    expect(req.request.method).toBe('GET');
    req.flush({ ...degraded, status: 'ok' });
  });

  it('treats a 503 with a report body as a value, not an error', (done) => {
    service.getHealth().subscribe((report) => {
      expect(report.status).toBe('degraded');
      expect(report.checks.database.status).toBe('down');
      done();
    });
    http
      .expectOne('/api/health')
      .flush(degraded, { status: 503, statusText: 'Service Unavailable' });
  });

  it('propagates other errors', (done) => {
    service.getHealth().subscribe({
      next: () => fail('should not emit'),
      error: (error: unknown) => {
        expect(error).toBeInstanceOf(HttpErrorResponse);
        expect((error as HttpErrorResponse).status).toBe(500);
        done();
      },
    });
    http.expectOne('/api/health').flush('nope', { status: 500, statusText: 'Server Error' });
  });
});
