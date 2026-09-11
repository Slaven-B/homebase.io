import { HouseholdRole } from '@prisma/client';
import { IsIn } from 'class-validator';

/** Ownership is not transferable through this endpoint. */
export const ASSIGNABLE_ROLES = [HouseholdRole.ADMIN, HouseholdRole.MEMBER] as const;
export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

export class UpdateMemberRoleDto {
  @IsIn(ASSIGNABLE_ROLES)
  role!: AssignableRole;
}
