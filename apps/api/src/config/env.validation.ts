import { Type, plainToInstance } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

export enum Environment {
  Development = 'development',
  Test = 'test',
  Production = 'production',
}

/**
 * Typed, validated view of the process environment.
 * The application refuses to start when required values are missing or malformed.
 */
export class EnvironmentVariables {
  @IsEnum(Environment)
  NODE_ENV: Environment = Environment.Development;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT = 3000;

  @IsString()
  DATABASE_URL!: string;

  /** Comma-separated list of allowed browser origins. */
  @IsOptional()
  @IsString()
  CORS_ORIGIN = 'http://localhost:4200';

  /** Secret used to sign access tokens (HS256). At least 32 characters. */
  @IsString()
  @MinLength(32)
  JWT_ACCESS_SECRET!: string;

  /** Access token lifetime in seconds. */
  @Type(() => Number)
  @IsInt()
  @Min(60)
  @Max(3600)
  JWT_ACCESS_TTL_SECONDS = 900;

  /** Refresh token lifetime in days. */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  REFRESH_TOKEN_TTL_DAYS = 30;

  /** Send the refresh cookie with the Secure flag (requires HTTPS). */
  @Type(() => Boolean)
  @IsBoolean()
  COOKIE_SECURE = false;
}

export function validateEnv(config: Record<string, unknown>): EnvironmentVariables {
  const normalized = { ...config };
  // class-transformer's Boolean() would turn the string "false" into true.
  if (typeof normalized.COOKIE_SECURE === 'string') {
    normalized.COOKIE_SECURE = normalized.COOKIE_SECURE.trim().toLowerCase() === 'true';
  }

  const validated = plainToInstance(EnvironmentVariables, normalized, {
    enableImplicitConversion: true,
    exposeDefaultValues: true,
  });

  const errors = validateSync(validated, { skipMissingProperties: false });

  if (errors.length > 0) {
    const details = errors
      .map((e) => `${e.property}: ${Object.values(e.constraints ?? {}).join(', ')}`)
      .join('\n  ');
    throw new Error(`Invalid environment configuration:\n  ${details}`);
  }

  return validated;
}
