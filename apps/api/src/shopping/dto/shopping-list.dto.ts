import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, Length } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateShoppingListDto {
  @Transform(trim)
  @IsString()
  @Length(1, 80)
  name!: string;
}

export class UpdateShoppingListDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 80)
  name?: string;

  @IsOptional()
  @IsBoolean()
  isArchived?: boolean;
}
