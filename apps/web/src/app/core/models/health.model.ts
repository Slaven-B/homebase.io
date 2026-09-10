export type HealthStatus = 'ok' | 'degraded';
export type CheckStatus = 'up' | 'down';

export interface DatabaseCheck {
  status: CheckStatus;
  latencyMs?: number;
  error?: string;
}

/** Mirrors the API's GET /api/health response. */
export interface HealthReport {
  status: HealthStatus;
  timestamp: string;
  uptimeSeconds: number;
  version: string;
  environment: string;
  checks: {
    database: DatabaseCheck;
  };
}
