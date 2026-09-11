import { ChoreFrequency, Priority } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const trimToNull = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || null : value;

export class CreateChoreDto {
  @Transform(trim)
  @IsString()
  @Length(1, 140)
  title!: string;

  @IsOptional()
  @Transform(trimToNull)
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsUUID()
  assigneeId?: string | null;

  @IsEnum(ChoreFrequency)
  frequency!: ChoreFrequency;

  /** Required when frequency is CUSTOM. */
  @ValidateIf((o: CreateChoreDto) => o.frequency === ChoreFrequency.CUSTOM)
  @IsInt()
  @Min(1)
  @Max(365)
  intervalDays?: number | null;

  /** First due date, YYYY-MM-DD. Defaults to today. */
  @IsOptional()
  @IsISO8601({ strict: true })
  firstDueAt?: string;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsInt()
  @Min(1)
  @Max(600)
  estimatedMinutes?: number | null;

  @IsOptional()
  @IsEnum(Priority)
  priority?: Priority;
}

export class UpdateChoreDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 140)
  title?: string;

  @IsOptional()
  @Transform(trimToNull)
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsUUID()
  assigneeId?: string | null;

  @IsOptional()
  @IsEnum(ChoreFrequency)
  frequency?: ChoreFrequency;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsInt()
  @Min(1)
  @Max(365)
  intervalDays?: number | null;

  /** Reschedule: YYYY-MM-DD. */
  @IsOptional()
  @IsISO8601({ strict: true })
  nextDueAt?: string;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsInt()
  @Min(1)
  @Max(600)
  estimatedMinutes?: number | null;

  @IsOptional()
  @IsEnum(Priority)
  priority?: Priority;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CompleteChoreDto {
  @IsOptional()
  @Transform(trimToNull)
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @MaxLength(500)
  note?: string | null;
}
