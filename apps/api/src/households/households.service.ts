import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { HouseholdRole } from '@prisma/client';
import { ActivityService } from '../activity/activity.service';
import { ActivityAction, ActivityEntity } from '../activity/activity.types';
import { PrismaService } from '../prisma/prisma.service';
import { CreateHouseholdDto } from './dto/create-household.dto';
import { UpdateHouseholdDto } from './dto/update-household.dto';
import { AssignableRole } from './dto/update-member-role.dto';
import { HouseholdAccessService } from './household-access.service';
import { HouseholdDetail, HouseholdMemberView, HouseholdSummary } from './household.types';

const memberInclude = {
  user: { select: { id: true, displayName: true, email: true, avatarUrl: true } },
} as const;

type MemberWithUser = {
  id: string;
  userId: string;
  role: HouseholdRole;
  joinedAt: Date;
  user: { id: string; displayName: string; email: string; avatarUrl: string | null };
};

function toMemberView(m: MemberWithUser): HouseholdMemberView {
  return {
    id: m.id,
    userId: m.userId,
    displayName: m.user.displayName,
    email: m.user.email,
    avatarUrl: m.user.avatarUrl,
    role: m.role,
    joinedAt: m.joinedAt,
  };
}

@Injectable()
export class HouseholdsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: HouseholdAccessService,
    private readonly activity: ActivityService,
  ) {}

  async listForUser(userId: string): Promise<HouseholdSummary[]> {
    const memberships = await this.prisma.householdMember.findMany({
      where: { userId },
      include: {
        household: { include: { _count: { select: { members: true } } } },
      },
      orderBy: { joinedAt: 'asc' },
    });

    return memberships.map((m) => ({
      id: m.household.id,
      name: m.household.name,
      currency: m.household.currency,
      role: m.role,
      memberCount: m.household._count.members,
      createdAt: m.household.createdAt,
    }));
  }

  /** Creates the household and makes the creator its OWNER in one transaction. */
  async create(userId: string, dto: CreateHouseholdDto): Promise<HouseholdDetail> {
    const household = await this.prisma.$transaction(async (tx) => {
      const created = await tx.household.create({ data: { name: dto.name } });
      await tx.householdMember.create({
        data: { householdId: created.id, userId, role: HouseholdRole.OWNER },
      });
      await this.activity.log(
        {
          householdId: created.id,
          userId,
          action: ActivityAction.HouseholdCreated,
          entityType: ActivityEntity.Household,
          entityId: created.id,
          metadata: { name: created.name },
        },
        tx,
      );
      return created;
    });
    return this.getDetail(userId, household.id);
  }

  async getDetail(userId: string, householdId: string): Promise<HouseholdDetail> {
    const membership = await this.access.requireMember(userId, householdId);
    const household = await this.prisma.household.findUnique({
      where: { id: householdId },
      include: { members: { include: memberInclude, orderBy: { joinedAt: 'asc' } } },
    });
    if (!household) {
      throw new NotFoundException('Household not found');
    }

    return {
      id: household.id,
      name: household.name,
      currency: household.currency,
      myRole: membership.role,
      members: household.members.map(toMemberView),
      createdAt: household.createdAt,
      updatedAt: household.updatedAt,
    };
  }

  async update(
    userId: string,
    householdId: string,
    dto: UpdateHouseholdDto,
  ): Promise<HouseholdDetail> {
    await this.access.requireAdmin(userId, householdId);
    const before = await this.prisma.household.findUnique({
      where: { id: householdId },
      select: { name: true },
    });
    await this.prisma.household.update({
      where: { id: householdId },
      data: { name: dto.name, currency: dto.currency },
    });
    if (before && dto.name !== undefined && before.name !== dto.name) {
      await this.activity.log({
        householdId,
        userId,
        action: ActivityAction.HouseholdRenamed,
        entityType: ActivityEntity.Household,
        entityId: householdId,
        metadata: { from: before.name, to: dto.name },
      });
    }
    return this.getDetail(userId, householdId);
  }

  /** Owner only. Cascades to members, invitations and (later) all household data. */
  async remove(userId: string, householdId: string): Promise<void> {
    await this.access.requireOwner(userId, householdId);
    await this.prisma.household.delete({ where: { id: householdId } });
  }

  async listMembers(userId: string, householdId: string): Promise<HouseholdMemberView[]> {
    await this.access.requireMember(userId, householdId);
    const members = await this.prisma.householdMember.findMany({
      where: { householdId },
      include: memberInclude,
      orderBy: { joinedAt: 'asc' },
    });
    return members.map(toMemberView);
  }

  /** Owner only. The owner's own role cannot be changed here. */
  async updateMemberRole(
    userId: string,
    householdId: string,
    memberId: string,
    role: AssignableRole,
  ): Promise<HouseholdMemberView> {
    await this.access.requireOwner(userId, householdId);
    const target = await this.findMemberInHousehold(householdId, memberId);

    if (target.role === HouseholdRole.OWNER) {
      throw new BadRequestException('The owner role cannot be changed');
    }

    const updated = await this.prisma.householdMember.update({
      where: { id: target.id },
      data: { role },
      include: memberInclude,
    });
    await this.activity.log({
      householdId,
      userId,
      action: ActivityAction.MemberRoleChanged,
      entityType: ActivityEntity.Member,
      entityId: updated.id,
      metadata: { memberName: updated.user.displayName, from: target.role, to: role },
    });
    return toMemberView(updated);
  }

  /**
   * Owner can remove anyone but themselves; admins can remove regular members.
   * Use `leave` to remove yourself.
   */
  async removeMember(userId: string, householdId: string, memberId: string): Promise<void> {
    const actor = await this.access.requireAdmin(userId, householdId);
    const target = await this.findMemberInHousehold(householdId, memberId);

    if (target.userId === userId) {
      throw new BadRequestException('Use "leave" to remove yourself from a household');
    }
    if (target.role === HouseholdRole.OWNER) {
      throw new ForbiddenException('The owner cannot be removed');
    }
    if (actor.role === HouseholdRole.ADMIN && target.role !== HouseholdRole.MEMBER) {
      throw new ForbiddenException('Admins can only remove regular members');
    }

    const removed = await this.prisma.householdMember.delete({
      where: { id: target.id },
      include: memberInclude,
    });
    await this.activity.log({
      householdId,
      userId,
      action: ActivityAction.MemberRemoved,
      entityType: ActivityEntity.Member,
      entityId: removed.id,
      metadata: { memberName: removed.user.displayName },
    });
  }

  /** Any member except the owner. Owners must delete the household instead. */
  async leave(userId: string, householdId: string): Promise<void> {
    const membership = await this.access.requireMember(userId, householdId);
    if (membership.role === HouseholdRole.OWNER) {
      throw new BadRequestException('Owners cannot leave their household. Delete it instead.');
    }
    const left = await this.prisma.householdMember.delete({
      where: { id: membership.id },
      include: memberInclude,
    });
    await this.activity.log({
      householdId,
      userId,
      action: ActivityAction.MemberLeft,
      entityType: ActivityEntity.Member,
      entityId: left.id,
      metadata: { memberName: left.user.displayName },
    });
  }

  private async findMemberInHousehold(householdId: string, memberId: string) {
    const member = await this.prisma.householdMember.findFirst({
      where: { id: memberId, householdId },
    });
    if (!member) {
      throw new NotFoundException('Member not found');
    }
    return member;
  }
}
