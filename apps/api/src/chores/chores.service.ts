import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ChoreFrequency, Prisma } from '@prisma/client';
import { ActivityService } from '../activity/activity.service';
import { ActivityAction, ActivityEntity } from '../activity/activity.types';
import { ADMIN_ROLES, HouseholdAccessService } from '../households/household-access.service';
import { PrismaService } from '../prisma/prisma.service';
import { ChoreCompletionView, ChoreDetail, ChoreView } from './chore.types';
import { CompleteChoreDto, CreateChoreDto, UpdateChoreDto } from './dto/chore.dto';
import { computeNextDue, formatDateOnly, toDateOnly, todayUtc } from './recurrence';

const userRef = { select: { id: true, displayName: true } } as const;
const choreInclude = { assignee: userRef, createdBy: userRef } as const;
type ChoreRow = Prisma.ChoreGetPayload<{ include: typeof choreInclude }>;

const completionInclude = { completedBy: userRef } as const;
type CompletionRow = Prisma.ChoreCompletionGetPayload<{ include: typeof completionInclude }>;

const DAY_MS = 24 * 60 * 60 * 1000;

function toView(row: ChoreRow, today: Date): ChoreView {
  return {
    id: row.id,
    householdId: row.householdId,
    title: row.title,
    description: row.description,
    frequency: row.frequency,
    intervalDays: row.intervalDays,
    nextDueAt: formatDateOnly(row.nextDueAt),
    dueInDays: Math.round((toDateOnly(row.nextDueAt).getTime() - today.getTime()) / DAY_MS),
    estimatedMinutes: row.estimatedMinutes,
    priority: row.priority,
    isActive: row.isActive,
    assignee: row.assignee,
    createdBy: row.createdBy,
    lastCompletedAt: row.lastCompletedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toCompletion(row: CompletionRow): ChoreCompletionView {
  return {
    id: row.id,
    dueAt: formatDateOnly(row.dueAt),
    skipped: row.skipped,
    note: row.note,
    completedBy: row.completedBy,
    completedAt: row.completedAt,
  };
}

@Injectable()
export class ChoresService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: HouseholdAccessService,
    private readonly activity: ActivityService,
  ) {}

  async list(userId: string, householdId: string, includeInactive = false): Promise<ChoreView[]> {
    await this.access.requireMember(userId, householdId);
    const today = todayUtc();
    const rows = await this.prisma.chore.findMany({
      where: { householdId, ...(includeInactive ? {} : { isActive: true }) },
      include: choreInclude,
      orderBy: [{ isActive: 'desc' }, { nextDueAt: 'asc' }, { priority: 'desc' }, { title: 'asc' }],
    });
    return rows.map((r) => toView(r, today));
  }

  async create(userId: string, householdId: string, dto: CreateChoreDto): Promise<ChoreDetail> {
    await this.access.requireMember(userId, householdId);
    await this.assertAssignee(householdId, dto.assigneeId);
    this.assertInterval(dto.frequency, dto.intervalDays);

    const created = await this.prisma.chore.create({
      data: {
        householdId,
        createdById: userId,
        assigneeId: dto.assigneeId ?? null,
        title: dto.title,
        description: dto.description ?? null,
        frequency: dto.frequency,
        intervalDays: dto.frequency === ChoreFrequency.CUSTOM ? dto.intervalDays : null,
        nextDueAt: dto.firstDueAt ? toDateOnly(dto.firstDueAt) : todayUtc(),
        estimatedMinutes: dto.estimatedMinutes ?? null,
        priority: dto.priority,
      },
    });
    await this.activity.log({
      householdId,
      userId,
      action: ActivityAction.ChoreCreated,
      entityType: ActivityEntity.Chore,
      entityId: created.id,
      metadata: { title: created.title, frequency: created.frequency },
    });
    return this.get(userId, householdId, created.id);
  }

  async get(userId: string, householdId: string, choreId: string): Promise<ChoreDetail> {
    await this.access.requireMember(userId, householdId);
    const row = await this.prisma.chore.findFirst({
      where: { id: choreId, householdId },
      include: {
        ...choreInclude,
        completions: { include: completionInclude, orderBy: { completedAt: 'desc' }, take: 20 },
      },
    });
    if (!row) {
      throw new NotFoundException('Chore not found');
    }
    return { ...toView(row, todayUtc()), history: row.completions.map(toCompletion) };
  }

  async update(
    userId: string,
    householdId: string,
    choreId: string,
    dto: UpdateChoreDto,
  ): Promise<ChoreDetail> {
    await this.access.requireMember(userId, householdId);
    const existing = await this.requireChore(householdId, choreId);
    if (dto.assigneeId !== undefined) await this.assertAssignee(householdId, dto.assigneeId);

    const frequency = dto.frequency ?? existing.frequency;
    const intervalDays = dto.intervalDays !== undefined ? dto.intervalDays : existing.intervalDays;
    this.assertInterval(frequency, intervalDays);

    const data: Prisma.ChoreUncheckedUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.assigneeId !== undefined) data.assigneeId = dto.assigneeId;
    if (dto.frequency !== undefined) data.frequency = dto.frequency;
    if (dto.frequency !== undefined || dto.intervalDays !== undefined) {
      data.intervalDays = frequency === ChoreFrequency.CUSTOM ? intervalDays : null;
    }
    if (dto.nextDueAt !== undefined) data.nextDueAt = toDateOnly(dto.nextDueAt);
    if (dto.estimatedMinutes !== undefined) data.estimatedMinutes = dto.estimatedMinutes;
    if (dto.priority !== undefined) data.priority = dto.priority;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;

    await this.prisma.chore.update({ where: { id: choreId }, data });
    return this.get(userId, householdId, choreId);
  }

  /** Admins or the creator. History goes with it. */
  async remove(userId: string, householdId: string, choreId: string): Promise<void> {
    const membership = await this.access.requireMember(userId, householdId);
    const chore = await this.requireChore(householdId, choreId);
    if (!ADMIN_ROLES.includes(membership.role) && chore.createdById !== userId) {
      throw new ForbiddenException('Only admins or the chore creator can delete a chore');
    }
    await this.prisma.chore.delete({ where: { id: choreId } });
  }

  /** Records a completion and advances the schedule, in one transaction. */
  complete(
    userId: string,
    householdId: string,
    choreId: string,
    dto: CompleteChoreDto,
  ): Promise<ChoreDetail> {
    return this.closeOccurrence(userId, householdId, choreId, false, dto.note ?? null);
  }

  /** Skips the current occurrence (recorded as such) and advances the schedule. */
  skip(userId: string, householdId: string, choreId: string): Promise<ChoreDetail> {
    return this.closeOccurrence(userId, householdId, choreId, true, null);
  }

  // --- dashboard support ---------------------------------------------------

  /** Active chores due today or overdue. Caller checks membership. */
  async dueUnchecked(householdId: string, today: Date, limit = 8): Promise<ChoreView[]> {
    const rows = await this.prisma.chore.findMany({
      where: { householdId, isActive: true, nextDueAt: { lte: today } },
      include: choreInclude,
      orderBy: [{ nextDueAt: 'asc' }, { priority: 'desc' }],
      take: limit,
    });
    return rows.map((r) => toView(r, today));
  }

  // --- helpers -------------------------------------------------------------

  private async closeOccurrence(
    userId: string,
    householdId: string,
    choreId: string,
    skipped: boolean,
    note: string | null,
  ): Promise<ChoreDetail> {
    await this.access.requireMember(userId, householdId);
    const chore = await this.requireChore(householdId, choreId);
    if (!chore.isActive) {
      throw new BadRequestException('This chore is archived');
    }

    const now = new Date();
    const nextDueAt = computeNextDue(chore.nextDueAt, chore.frequency, chore.intervalDays, now);

    await this.prisma.$transaction(async (tx) => {
      await tx.choreCompletion.create({
        data: { choreId, completedById: userId, dueAt: chore.nextDueAt, skipped, note },
      });
      await tx.chore.update({
        where: { id: choreId },
        data: { nextDueAt, ...(skipped ? {} : { lastCompletedAt: now }) },
      });
      await this.activity.log(
        {
          householdId,
          userId,
          action: skipped ? ActivityAction.ChoreSkipped : ActivityAction.ChoreCompleted,
          entityType: ActivityEntity.Chore,
          entityId: choreId,
          metadata: { title: chore.title, nextDueAt: formatDateOnly(nextDueAt) },
        },
        tx,
      );
    });

    return this.get(userId, householdId, choreId);
  }

  private async requireChore(householdId: string, choreId: string) {
    const chore = await this.prisma.chore.findFirst({ where: { id: choreId, householdId } });
    if (!chore) {
      throw new NotFoundException('Chore not found');
    }
    return chore;
  }

  private async assertAssignee(householdId: string, assigneeId?: string | null): Promise<void> {
    if (!assigneeId) return;
    const membership = await this.access.findMembership(assigneeId, householdId);
    if (!membership) {
      throw new BadRequestException('Assignee must be a member of this household');
    }
  }

  private assertInterval(frequency: ChoreFrequency, intervalDays?: number | null): void {
    if (frequency === ChoreFrequency.CUSTOM && (!intervalDays || intervalDays < 1)) {
      throw new BadRequestException('intervalDays is required for a custom frequency');
    }
  }
}
