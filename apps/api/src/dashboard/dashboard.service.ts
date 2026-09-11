import { Injectable, NotFoundException } from '@nestjs/common';
import { InvitationStatus } from '@prisma/client';
import { ActivityService } from '../activity/activity.service';
import { ChoresService } from '../chores/chores.service';
import { todayUtc } from '../chores/recurrence';
import { ADMIN_ROLES, HouseholdAccessService } from '../households/household-access.service';
import { PrismaService } from '../prisma/prisma.service';
import { ShoppingService } from '../shopping/shopping.service';
import { TasksService } from '../tasks/tasks.service';
import { DashboardView } from './dashboard.types';

const RECENT_ACTIVITY_LIMIT = 10;
const DEFAULT_CURRENCY = 'EUR';

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: HouseholdAccessService,
    private readonly activity: ActivityService,
    private readonly shopping: ShoppingService,
    private readonly tasks: TasksService,
    private readonly chores: ChoresService,
  ) {}

  async get(userId: string, householdId: string): Promise<DashboardView> {
    const membership = await this.access.requireMember(userId, householdId);
    const isAdmin = ADMIN_ROLES.includes(membership.role);
    const now = new Date();
    const today = todayUtc(now);

    const [household, pendingInvitations, recentActivity, shopping, choresDue, tasksDue] =
      await Promise.all([
        this.prisma.household.findUnique({
          where: { id: householdId },
          select: { id: true, name: true, _count: { select: { members: true } } },
        }),
        isAdmin
          ? this.prisma.householdInvitation.count({
              where: { householdId, status: InvitationStatus.PENDING, expiresAt: { gt: now } },
            })
          : Promise.resolve(null),
        this.activity.listUnchecked(householdId, { limit: RECENT_ACTIVITY_LIMIT }),
        this.shopping.openSummaryUnchecked(householdId),
        this.chores.dueUnchecked(householdId, today),
        this.tasks.dueUnchecked(householdId, today),
      ]);

    if (!household) {
      throw new NotFoundException('Household not found');
    }

    return {
      household: {
        id: household.id,
        name: household.name,
        myRole: membership.role,
        memberCount: household._count.members,
        pendingInvitations,
      },
      today: {
        date: now.toISOString().slice(0, 10),
        choresDue,
        tasksDue,
        upcomingBills: [],
        shopping,
      },
      finances: {
        month: now.toISOString().slice(0, 7),
        currency: DEFAULT_CURRENCY,
        sharedExpenses: 0,
        bills: 0,
        outstanding: 0,
      },
      recentActivity: recentActivity.items,
    };
  }
}
