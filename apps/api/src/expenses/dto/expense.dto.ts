import { SplitMethod } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const trimToNull = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || null : value;
const upper = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

export class ParticipantDto {
  @IsUUID()
  userId!: string;

  /** CUSTOM: share as a decimal amount (e.g. 12.5). */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount?: number;

  /** PERCENTAGE: share in percent. */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  percent?: number;
}

export class CreateExpenseDto {
  @Transform(trim)
  @IsString()
  @Length(1, 140)
  description!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(1_000_000)
  amount!: number;

  /** ISO 4217. Defaults to the household currency. */
  @IsOptional()
  @Transform(upper)
  @Matches(/^[A-Z]{3}$/)
  currency?: string;

  /** YYYY-MM-DD. Defaults to today. */
  @IsOptional()
  @IsISO8601({ strict: true })
  date?: string;

  @IsOptional()
  @Transform(trimToNull)
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @MaxLength(40)
  category?: string | null;

  @IsOptional()
  @Transform(trimToNull)
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @MaxLength(1000)
  notes?: string | null;

  @IsUUID()
  paidById!: string;

  @IsEnum(SplitMethod)
  splitMethod!: SplitMethod;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ParticipantDto)
  participants!: ParticipantDto[];
}

/** Editing replaces the whole expense (including splits) to keep the math consistent. */
export class UpdateExpenseDto extends CreateExpenseDto {}

export class ListExpensesQuery {
  /** YYYY-MM */
  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/)
  month?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(40)
  category?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsUUID()
  cursor?: string;
}

export class CreateSettlementDto {
  /** Defaults to the current user. Only admins may record settlements for others. */
  @IsOptional()
  @IsUUID()
  fromUserId?: string;

  @IsUUID()
  toUserId!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(1_000_000)
  amount!: number;

  @IsOptional()
  @Transform(upper)
  @Matches(/^[A-Z]{3}$/)
  currency?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  date?: string;

  @IsOptional()
  @Transform(trimToNull)
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @MaxLength(500)
  note?: string | null;
}
