import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { HouseholdRole, InvitationStatus, NotificationType } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { ActivityService } from '../activity/activity.service';
import { ActivityAction, ActivityEntity } from '../activity/activity.types';
import { HouseholdAccessService } from '../households/household-access.service';
import { HouseholdDetail } from '../households/household.types';
import { HouseholdsService } from '../households/households.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { CreateInvitationDto } from './dto/create-invitation.dto';
import { CreatedInvitation, InvitationView, PendingInvitationView } from './invitation.types';

export const INVITATION_TTL_DAYS = 7;

const viewInclude = {
  invitedBy: { select: { id: true, displayName: true } },
} as const;

const pendingInclude = {
  invitedBy: { select: { displayName: true } },
  household: { select: { id: true, name: true, _count: { select: { members: true } } } },
} as const;

type InvitationRecord = {
  id: string;
  householdId: string;
  email: string;
  role: HouseholdRole;
  status: InvitationStatus;
  expiresAt: Date;
  createdAt: Date;
  invitedBy: { id: string; displayName: string };
};

type PendingRecord = {
  id: string;
  token: string;
  role: HouseholdRole;
  expiresAt: Date;
  createdAt: Date;
  invitedBy: { displayName: string };
  household: { id: string; name: string; _count: { members: number } };
};

function toView(i: InvitationRecord): InvitationView {
  return {
    id: i.id,
    householdId: i.householdId,
    email: i.email,
    role: i.role,
    status: i.status,
    invitedBy: i.invitedBy,
    expiresAt: i.expiresAt,
    createdAt: i.createdAt,
  };
}

function toPendingView(i: PendingRecord): PendingInvitationView {
  return {
    id: i.id,
    token: i.token,
    household: {
      id: i.household.id,
      name: i.household.name,
      memberCount: i.household._count.members,
    },
    role: i.role,
    invitedBy: i.invitedBy,
    expiresAt: i.expiresAt,
    createdAt: i.createdAt,
  };
}

@Injectable()
export class InvitationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: HouseholdAccessService,
    private readonly households: HouseholdsService,
    private readonly users: UsersService,
    private readonly activity: ActivityService,
    private readonly notifications: NotificationsService,
  ) {}

  async listForHousehold(userId: string, householdId: string): Promise<InvitationView[]> {
    await this.access.requireAdmin(userId, householdId);
    const rows = await this.prisma.householdInvitation.findMany({
      where: { householdId, status: InvitationStatus.PENDING, expiresAt: { gt: new Date() } },
      include: viewInclude,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toView);
  }

  async create(
    userId: string,
    householdId: string,
    dto: CreateInvitationDto,
  ): Promise<CreatedInvitation> {
    await this.access.requireAdmin(userId, householdId);

    const existingUser = await this.users.findByEmail(dto.email);
    if (existingUser) {
      const alreadyMember = await this.access.findMembership(existingUser.id, householdId);
      if (alreadyMember) {
        throw new ConflictException('This person is already a member of the household');
      }
    }

    const pending = await this.prisma.householdInvitation.findFirst({
      where: {
        householdId,
        email: dto.email,
        status: InvitationStatus.PENDING,
        expiresAt: { gt: new Date() },
      },
    });
    if (pending) {
      throw new ConflictException('There is already a pending invitation for this email');
    }

    const created = await this.prisma.householdInvitation.create({
      data: {
        householdId,
        invitedById: userId,
        email: dto.email,
        role: dto.role ?? HouseholdRole.MEMBER,
        token: randomBytes(32).toString('base64url'),
        expiresAt: new Date(Date.now() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000),
      },
      include: viewInclude,
    });

    await this.activity.log({
      householdId,
      userId,
      action: ActivityAction.InvitationSent,
      entityType: ActivityEntity.Invitation,
      entityId: created.id,
      metadata: { email: created.email, role: created.role },
    });

    if (existingUser) {
      const household = await this.prisma.household.findUnique({
        where: { id: householdId },
        select: { name: true },
      });
      await this.notifications.notify({
        userId: existingUser.id,
        actorId: userId,
        householdId,
        type: NotificationType.INVITATION,
        title: `You are invited to ${household?.name ?? 'a household'}`,
        body: `${created.invitedBy.displayName} invited you as ${created.role.toLowerCase()}`,
        link: `/invite/${created.token}`,
        metadata: { invitationId: created.id },
        dedupeKey: `invitation:${created.id}`,
      });
    }

    return { ...toView(created), token: created.token };
  }

  async revoke(userId: string, householdId: string, invitationId: string): Promise<void> {
    await this.access.requireAdmin(userId, householdId);
    const invitation = await this.prisma.householdInvitation.findFirst({
      where: { id: invitationId, householdId, status: InvitationStatus.PENDING },
    });
    if (!invitation) {
      throw new NotFoundException('Invitation not found');
    }
    await this.prisma.householdInvitation.update({
      where: { id: invitation.id },
      data: { status: InvitationStatus.REVOKED },
    });
  }

  async listForInvitee(userId: string): Promise<PendingInvitationView[]> {
    const user = await this.requireUser(userId);
    const rows = await this.prisma.householdInvitation.findMany({
      where: { email: user.email, status: InvitationStatus.PENDING, expiresAt: { gt: new Date() } },
      include: pendingInclude,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toPendingView);
  }

  async preview(userId: string, token: string): Promise<PendingInvitationView> {
    const invitation = await this.requireUsableInvitation(userId, token);
    return toPendingView(invitation);
  }

  /**
   * Adds the current user to the household and marks the invitation accepted,
   * in one transaction. Only the account whose email matches may accept.
   */
  async accept(userId: string, token: string): Promise<HouseholdDetail> {
    const invitation = await this.requireUsableInvitation(userId, token);
    const user = await this.requireUser(userId);

    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.householdMember.findUnique({
        where: { householdId_userId: { householdId: invitation.household.id, userId } },
      });
      if (!existing) {
        await tx.householdMember.create({
          data: { householdId: invitation.household.id, userId, role: invitation.role },
        });
      }
      await tx.householdInvitation.update({
        where: { id: invitation.id },
        data: { status: InvitationStatus.ACCEPTED },
      });
      await this.activity.log(
        {
          householdId: invitation.household.id,
          userId,
          action: ActivityAction.MemberJoined,
          entityType: ActivityEntity.Member,
          entityId: null,
          metadata: { memberName: user.displayName, role: invitation.role },
        },
        tx,
      );
    });

    return this.households.getDetail(userId, invitation.household.id);
  }

  async decline(userId: string, token: string): Promise<void> {
    const invitation = await this.requireUsableInvitation(userId, token);
    await this.prisma.householdInvitation.update({
      where: { id: invitation.id },
      data: { status: InvitationStatus.DECLINED },
    });
  }

  private async requireUser(userId: string) {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  /** Looks up a pending, unexpired invitation addressed to the current user. */
  private async requireUsableInvitation(userId: string, token: string): Promise<PendingRecord> {
    const user = await this.requireUser(userId);
    const invitation = await this.prisma.householdInvitation.findUnique({
      where: { token },
      include: pendingInclude,
    });

    if (!invitation || invitation.status !== InvitationStatus.PENDING) {
      throw new NotFoundException('Invitation not found or no longer valid');
    }
    if (invitation.expiresAt <= new Date()) {
      await this.prisma.householdInvitation.update({
        where: { id: invitation.id },
        data: { status: InvitationStatus.EXPIRED },
      });
      throw new NotFoundException('Invitation has expired');
    }
    if (invitation.email !== user.email) {
      throw new ForbiddenException('This invitation was sent to a different email address');
    }
    return invitation;
  }
}
