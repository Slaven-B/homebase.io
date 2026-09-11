import { HouseholdRole } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEmail, IsIn, IsOptional, MaxLength } from 'class-validator';

export class CreateInvitationDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsOptional()
  @IsIn([HouseholdRole.ADMIN, HouseholdRole.MEMBER])
  role?: typeof HouseholdRole.ADMIN | typeof HouseholdRole.MEMBER;
}
