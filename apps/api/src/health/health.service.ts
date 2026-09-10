import { Injectable } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';
import { PrismaService } from '../prisma/prisma.service';
import { DatabaseCheck, HealthReport } from './health.types';

const DB_TIMEOUT_MS = 2000;

@Injectable()
export class HealthService {
  private readonly version = process.env.npm_package_version ?? '0.0.0';

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  async check(): Promise<HealthReport> {
    const database = await this.checkDatabase();

    return {
      status: database.status === 'up' ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
      version: this.version,
      environment: this.config.nodeEnv,
      checks: { database },
    };
  }

  private async checkDatabase(): Promise<DatabaseCheck> {
    const started = Date.now();
    try {
      await withTimeout(this.prisma.ping(), DB_TIMEOUT_MS);
      return { status: 'up', latencyMs: Date.now() - started };
    } catch (error) {
      return {
        status: 'down',
        latencyMs: Date.now() - started,
        error: this.config.isProduction ? 'unavailable' : summarize(error),
      };
    }
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

function summarize(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  // Prisma error messages can be multi-line; keep the first meaningful line.
  return message.split('\n').find((line) => line.trim().length > 0) ?? 'unknown error';
}
