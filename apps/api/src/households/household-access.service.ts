import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { HouseholdMember, HouseholdRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** Roles that may administer a household (settings, invitations, removing members). */
export const ADMIN_ROLES: readonly HouseholdRole[] = [HouseholdRole.OWNER, HouseholdRole.ADMIN];

/**
 * Central authorization helper for household-owned resources. Every feature
 * module must go through this before touching household data.
 *
 * Non-members receive 404 (the household "does not exist" for them) so ids
 * cannot be enumerated; members lacking a role receive 403.
 */
@Injectable()
export class HouseholdAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async findMembership(userId: string, householdId: string): Promise<HouseholdMember | null> {
    return this.prisma.householdMember.findUnique({
      where: { householdId_userId: { householdId, userId } },
    });
  }

  async requireMember(userId: string, householdId: string): Promise<HouseholdMember> {
    const membership = await this.findMembership(userId, householdId);
    if (!membership) {
      throw new NotFoundException('Household not found');
    }
    return membership;
  }

  async requireRole(
    userId: string,
    householdId: string,
    roles: readonly HouseholdRole[],
  ): Promise<HouseholdMember> {
    const membership = await this.requireMember(userId, householdId);
    if (!roles.includes(membership.role)) {
      throw new ForbiddenException('You do not have permission to do that in this household');
    }
    return membership;
  }

  requireAdmin(userId: string, householdId: string): Promise<HouseholdMember> {
    return this.requireRole(userId, householdId, ADMIN_ROLES);
  }

  requireOwner(userId: string, householdId: string): Promise<HouseholdMember> {
    return this.requireRole(userId, householdId, [HouseholdRole.OWNER]);
  }
}
