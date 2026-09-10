import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import type { Response } from 'express';
import { HealthService } from './health.service';
import { HealthReport } from './health.types';

@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  /**
   * GET /api/health
   * Returns 200 when every dependency is reachable, 503 otherwise.
   * The body is always the full report so callers can see what failed.
   */
  @Get()
  async check(@Res({ passthrough: true }) res: Response): Promise<HealthReport> {
    const report = await this.health.check();
    res.status(report.status === 'ok' ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);
    return report;
  }
}
