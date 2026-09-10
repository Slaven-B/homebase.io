import { Test } from '@nestjs/testing';
import { AppConfigService } from '../config/app-config.service';
import { Environment } from '../config/env.validation';
import { PrismaService } from '../prisma/prisma.service';
import { HealthService } from './health.service';

describe('HealthService', () => {
  let service: HealthService;
  let prisma: { ping: jest.Mock };
  let config: { nodeEnv: Environment; isProduction: boolean };

  beforeEach(async () => {
    prisma = { ping: jest.fn() };
    config = { nodeEnv: Environment.Test, isProduction: false };

    const moduleRef = await Test.createTestingModule({
      providers: [
        HealthService,
        { provide: PrismaService, useValue: prisma },
        { provide: AppConfigService, useValue: config },
      ],
    }).compile();

    service = moduleRef.get(HealthService);
  });

  it('reports ok when the database responds', async () => {
    prisma.ping.mockResolvedValue(undefined);

    const report = await service.check();

    expect(report.status).toBe('ok');
    expect(report.checks.database.status).toBe('up');
    expect(report.checks.database.latencyMs).toBeGreaterThanOrEqual(0);
    expect(report.checks.database.error).toBeUndefined();
    expect(report.environment).toBe('test');
    expect(typeof report.uptimeSeconds).toBe('number');
    expect(new Date(report.timestamp).toString()).not.toBe('Invalid Date');
  });

  it('reports degraded with the error when the database is unreachable', async () => {
    prisma.ping.mockRejectedValue(new Error("Can't reach database server at `localhost:5432`"));

    const report = await service.check();

    expect(report.status).toBe('degraded');
    expect(report.checks.database.status).toBe('down');
    expect(report.checks.database.error).toContain("Can't reach database server");
  });

  it('hides error details in production', async () => {
    config.isProduction = true;
    prisma.ping.mockRejectedValue(new Error('connection refused: secret-host:5432'));

    const report = await service.check();

    expect(report.checks.database.error).toBe('unavailable');
  });
});
