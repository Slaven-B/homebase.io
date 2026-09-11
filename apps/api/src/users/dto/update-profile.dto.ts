import { IsOptional, IsString, IsUrl, Length, ValidateIf } from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @Length(1, 60)
  displayName?: string;

  /** Pass `null` to remove the avatar. */
  @IsOptional()
  @ValidateIf((_o, value) => value !== null)
  @IsUrl({ require_protocol: true, protocols: ['https'] })
  @Length(1, 2048)
  avatarUrl?: string | null;
}
