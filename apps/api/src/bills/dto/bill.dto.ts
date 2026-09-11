import { BillFrequency } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
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
  ValidateIf,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const trimToNull = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || null : value;
const upper = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

export class CreateBillDto {
  @Transform(trim)
  @IsString()
  @Length(1, 140)
  name!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(1_000_000)
  amount!: number;

  @IsOptional()
  @Transform(upper)
  @Matches(/^[A-Z]{3}$/)
  currency?: string;

  /** YYYY-MM-DD: the next (or only) due date. */
  @IsISO8601({ strict: true })
  dueDate!: string;

  @IsEnum(BillFrequency)
  frequency!: BillFrequency;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsUUID()
  responsibleId?: string | null;

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
}

export class UpdateBillDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 140)
  name?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(1_000_000)
  amount?: number;

  @IsOptional()
  @Transform(upper)
  @Matches(/^[A-Z]{3}$/)
  currency?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  dueDate?: string;

  @IsOptional()
  @IsEnum(BillFrequency)
  frequency?: BillFrequency;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsUUID()
  responsibleId?: string | null;

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

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class PayBillDto {
  /** Actual amount paid; defaults to the bill amount. */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(1_000_000)
  amount?: number;

  /** YYYY-MM-DD; defaults to today. */
  @IsOptional()
  @IsISO8601({ strict: true })
  paidAt?: string;

  @IsOptional()
  @Transform(trimToNull)
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @MaxLength(500)
  note?: string | null;

  /** Also create a shared expense split equally among current members. */
  @IsOptional()
  @IsBoolean()
  recordAsExpense?: boolean;
}
