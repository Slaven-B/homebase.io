import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, Length, MaxLength, ValidateIf } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
/** Empty strings become null so "clear the field" works from forms. */
const trimToNull = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || null : value;

export class CreateShoppingItemDto {
  @Transform(trim)
  @IsString()
  @Length(1, 120)
  name!: string;

  @IsOptional()
  @Transform(trimToNull)
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @MaxLength(40)
  quantity?: string | null;

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
  @MaxLength(500)
  notes?: string | null;
}

export class UpdateShoppingItemDto extends CreateShoppingItemDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 120)
  declare name: string;

  @IsOptional()
  @IsBoolean()
  completed?: boolean;
}
