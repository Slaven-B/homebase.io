import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { NotificationType, Prisma, SplitMethod } from '@prisma/client';
import { ActivityService } from '../activity/activity.service';
import { ActivityAction, ActivityEntity } from '../activity/activity.types';
import { formatDateOnly, toDateOnly, todayUtc } from '../chores/recurrence';
import { ADMIN_ROLES, HouseholdAccessService } from '../households/household-access.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateExpenseDto,
  CreateSettlementDto,
  ListExpensesQuery,
  ParticipantDto,
  UpdateExpenseDto,
} from './dto/expense.dto';
import { BalanceView, ExpensePage, ExpenseView, SettlementView, UserRef } from './expense.types';
import {
  ComputedSplit,
  SplitError,
  computeNetBalances,
  computeSplits,
  simplifyDebts,
  toCents,
} from './money';

const userRef = { select: { id: true, displayName: true } } as const;
const expenseInclude = {
  paidBy: userRef,
  createdBy: userRef,
  splits: { include: { user: userRef }, orderBy: { amountCents: 'desc' as const } },
} as const;
type ExpenseRow = Prisma.ExpenseGetPayload<{ include: typeof expenseInclude }>;

const settlementInclude = { fromUser: userRef, toUser: userRef, createdBy: userRef } as const;
type SettlementRow = Prisma.SettlementGetPayload<{ include: typeof settlementInclude }>;

const DEFAULT_LIMIT = 30;

function fmt(cents: number, currency: string): string {
  return `${(cents / 100).toFixed(2)} ${currency}`;
}

function toView(row: ExpenseRow, viewerId: string): ExpenseView {
  return {
    id: row.id,
    householdId: row.householdId,
    description: row.description,
    amountCents: row.amountCents,
    currency: row.currency,
    date: formatDateOnly(row.date),
    category: row.category,
    notes: row.notes,
    splitMethod: row.splitMethod,
    paidBy: row.paidBy,
    createdBy: row.createdBy,
    splits: row.splits.map((s) => ({
      user: s.user,
      amountCents: s.amountCents,
      percent: s.percent,
    })),
    myShareCents: row.splits.find((s) => s.userId === viewerId)?.amountCents ?? 0,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toSettlementView(row: SettlementRow): SettlementView {
  return {
    id: row.id,
    householdId: row.householdId,
    from: row.fromUser,
    to: row.toUser,
    amountCents: row.amountCents,
    currency: row.currency,
    date: formatDateOnly(row.date),
    note: row.note,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
  };
}

/** [start, end) of a YYYY-MM month in UTC date-only terms. */
function monthRange(month: string): { gte: Date; lt: Date } {
  const [y, m] = month.split('-').map(Number);
  return { gte: new Date(Date.UTC(y, m - 1, 1)), lt: new Date(Date.UTC(y, m, 1)) };
}

@Injectable()
export class ExpensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: HouseholdAccessService,
    private readonly activity: ActivityService,
    private readonly notifications: NotificationsService,
  ) {}

  // --- expenses ------------------------------------------------------------

  async list(userId: string, householdId: string, query: ListExpensesQuery): Promise<ExpensePage> {
    await this.access.requireMember(userId, householdId);
    const where: Prisma.ExpenseWhereInput = { householdId };
    if (query.month) where.date = monthRange(query.month);
    if (query.category) where.category = query.category;

    const limit = query.limit ?? DEFAULT_LIMIT;
    const [rows, totals] = await Promise.all([
      this.prisma.expense.findMany({
        where,
        include: expenseInclude,
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
        ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      }),
      this.prisma.expense.groupBy({ by: ['currency'], where, _sum: { amountCents: true } }),
    ]);

    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit).map((r) => toView(r, userId));
    return {
      items,
      nextCursor: hasMore ? items[items.length - 1].id : null,
      totals: totals.map((t) => ({ currency: t.currency, amountCents: t._sum.amountCents ?? 0 })),
    };
  }

  async create(userId: string, householdId: string, dto: CreateExpenseDto): Promise<ExpenseView> {
    await this.access.requireMember(userId, householdId);
    const { amountCents, currency, splits } = await this.prepare(householdId, dto);

    const created = await this.prisma.$transaction(async (tx) => {
      const expense = await tx.expense.create({
        data: {
          householdId,
          createdById: userId,
          paidById: dto.paidById,
          description: dto.description,
          amountCents,
          currency,
          date: dto.date ? toDateOnly(dto.date) : todayUtc(),
          category: dto.category ?? null,
          notes: dto.notes ?? null,
          splitMethod: dto.splitMethod,
          splits: {
            create: splits.map((s) => ({
              userId: s.userId,
              amountCents: s.amountCents,
              percent: s.percent,
            })),
          },
        },
        include: expenseInclude,
      });
      await this.activity.log(
        {
          householdId,
          userId,
          action: ActivityAction.ExpenseCreated,
          entityType: ActivityEntity.Expense,
          entityId: expense.id,
          metadata: { description: expense.description, amountCents, currency },
        },
        tx,
      );
      return expense;
    });
    const payerName = created.paidBy?.displayName ?? 'Someone';
    for (const split of created.splits) {
      if (split.amountCents === 0) continue;
      await this.notifications.notify({
        userId: split.userId,
        actorId: userId,
        householdId,
        type: NotificationType.EXPENSE_SHARED,
        title: `New shared expense: ${created.description}`,
        body: `${payerName} paid ${fmt(created.amountCents, currency)} · your share ${fmt(split.amountCents, currency)}`,
        link: '/expenses',
        metadata: { expenseId: created.id, shareCents: split.amountCents, currency },
      });
    }
    return toView(created, userId);
  }

  async get(userId: string, householdId: string, expenseId: string): Promise<ExpenseView> {
    await this.access.requireMember(userId, householdId);
    const row = await this.prisma.expense.findFirst({
      where: { id: expenseId, householdId },
      include: expenseInclude,
    });
    if (!row) throw new NotFoundException('Expense not found');
    return toView(row, userId);
  }

  /** Full replacement, including splits, inside one transaction. */
  async update(
    userId: string,
    householdId: string,
    expenseId: string,
    dto: UpdateExpenseDto,
  ): Promise<ExpenseView> {
    const membership = await this.access.requireMember(userId, householdId);
    const existing = await this.requireExpense(householdId, expenseId);
    this.assertCanModify(membership.role, existing.createdById, existing.paidById, userId);
    const { amountCents, currency, splits } = await this.prepare(householdId, dto);

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.expenseSplit.deleteMany({ where: { expenseId } });
      return tx.expense.update({
        where: { id: expenseId },
        data: {
          paidById: dto.paidById,
          description: dto.description,
          amountCents,
          currency,
          date: dto.date ? toDateOnly(dto.date) : existing.date,
          category: dto.category ?? null,
          notes: dto.notes ?? null,
          splitMethod: dto.splitMethod,
          splits: {
            create: splits.map((s) => ({
              userId: s.userId,
              amountCents: s.amountCents,
              percent: s.percent,
            })),
          },
        },
        include: expenseInclude,
      });
    });
    return toView(updated, userId);
  }

  async remove(userId: string, householdId: string, expenseId: string): Promise<void> {
    const membership = await this.access.requireMember(userId, householdId);
    const existing = await this.requireExpense(householdId, expenseId);
    this.assertCanModify(membership.role, existing.createdById, existing.paidById, userId);
    await this.prisma.expense.delete({ where: { id: expenseId } });
    await this.activity.log({
      householdId,
      userId,
      action: ActivityAction.ExpenseDeleted,
      entityType: ActivityEntity.Expense,
      entityId: expenseId,
      metadata: {
        description: existing.description,
        amountCents: existing.amountCents,
        currency: existing.currency,
      },
    });
  }

  // --- balances & settlements --------------------------------------------

  async balances(userId: string, householdId: string): Promise<BalanceView[]> {
    await this.access.requireMember(userId, householdId);
    return this.balancesUnchecked(householdId, userId);
  }

  /** Caller has verified membership (dashboard). */
  async balancesUnchecked(householdId: string, viewerId: string): Promise<BalanceView[]> {
    const [expenses, settlements, members] = await Promise.all([
      this.prisma.expense.findMany({
        where: { householdId, paidById: { not: null } },
        select: {
          currency: true,
          paidById: true,
          splits: { select: { userId: true, amountCents: true } },
        },
      }),
      this.prisma.settlement.findMany({
        where: { householdId },
        select: { currency: true, fromUserId: true, toUserId: true, amountCents: true },
      }),
      this.prisma.householdMember.findMany({ where: { householdId }, include: { user: userRef } }),
    ]);

    const names = new Map<string, UserRef>(members.map((m) => [m.userId, m.user]));
    const refOf = (id: string): UserRef => names.get(id) ?? { id, displayName: 'Former member' };

    const net = computeNetBalances(
      expenses.map((e) => ({ currency: e.currency, paidById: e.paidById!, splits: e.splits })),
      settlements,
    );

    return [...net.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([currency, perUser]) => {
        const transfers = simplifyDebts(perUser);
        return {
          currency,
          members: [...perUser.entries()]
            .map(([id, netCents]) => ({ user: refOf(id), netCents }))
            .sort((a, b) => b.netCents - a.netCents),
          transfers: transfers.map((t) => ({
            from: refOf(t.fromUserId),
            to: refOf(t.toUserId),
            amountCents: t.amountCents,
          })),
          outstandingCents: transfers.reduce((sum, t) => sum + t.amountCents, 0),
          myNetCents: perUser.get(viewerId) ?? 0,
        };
      });
  }

  async listSettlements(userId: string, householdId: string): Promise<SettlementView[]> {
    await this.access.requireMember(userId, householdId);
    const rows = await this.prisma.settlement.findMany({
      where: { householdId },
      include: settlementInclude,
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      take: 100,
    });
    return rows.map(toSettlementView);
  }

  async recordSettlement(
    userId: string,
    householdId: string,
    dto: CreateSettlementDto,
  ): Promise<SettlementView> {
    const membership = await this.access.requireMember(userId, householdId);
    const fromUserId = dto.fromUserId ?? userId;
    if (fromUserId !== userId && !ADMIN_ROLES.includes(membership.role)) {
      throw new ForbiddenException('Only admins can record settlements on behalf of others');
    }
    if (fromUserId === dto.toUserId) {
      throw new BadRequestException('Payer and recipient must be different people');
    }
    await this.assertMembers(householdId, [fromUserId, dto.toUserId]);
    const currency = dto.currency ?? (await this.householdCurrency(householdId));

    const created = await this.prisma.settlement.create({
      data: {
        householdId,
        createdById: userId,
        fromUserId,
        toUserId: dto.toUserId,
        amountCents: this.cents(dto.amount),
        currency,
        date: dto.date ? toDateOnly(dto.date) : todayUtc(),
        note: dto.note ?? null,
      },
      include: settlementInclude,
    });
    await this.activity.log({
      householdId,
      userId,
      action: ActivityAction.SettlementRecorded,
      entityType: ActivityEntity.Settlement,
      entityId: created.id,
      metadata: {
        fromName: created.fromUser.displayName,
        toName: created.toUser.displayName,
        amountCents: created.amountCents,
        currency,
      },
    });
    await this.notifications.notify({
      userId: created.toUserId,
      actorId: userId,
      householdId,
      type: NotificationType.SETTLEMENT_RECEIVED,
      title: `${created.fromUser.displayName} paid you ${fmt(created.amountCents, currency)}`,
      body: created.note ?? null,
      link: '/expenses/balances',
      metadata: { settlementId: created.id },
    });
    return toSettlementView(created);
  }

  async removeSettlement(userId: string, householdId: string, settlementId: string): Promise<void> {
    const membership = await this.access.requireMember(userId, householdId);
    const existing = await this.prisma.settlement.findFirst({
      where: { id: settlementId, householdId },
    });
    if (!existing) throw new NotFoundException('Settlement not found');
    const involved = existing.createdById === userId || existing.fromUserId === userId;
    if (!involved && !ADMIN_ROLES.includes(membership.role)) {
      throw new ForbiddenException(
        'Only the payer, the creator or an admin can remove a settlement',
      );
    }
    await this.prisma.settlement.delete({ where: { id: settlementId } });
  }

  // --- dashboard support ---------------------------------------------------

  /** Sum of this month's expenses in the given currency. Caller checks membership. */
  async monthTotalUnchecked(householdId: string, month: string, currency: string): Promise<number> {
    const agg = await this.prisma.expense.aggregate({
      where: { householdId, currency, date: monthRange(month) },
      _sum: { amountCents: true },
    });
    return agg._sum.amountCents ?? 0;
  }

  async householdCurrency(householdId: string): Promise<string> {
    const h = await this.prisma.household.findUnique({
      where: { id: householdId },
      select: { currency: true },
    });
    return h?.currency ?? 'EUR';
  }

  // --- helpers -------------------------------------------------------------

  private async prepare(
    householdId: string,
    dto: CreateExpenseDto,
  ): Promise<{ amountCents: number; currency: string; splits: ComputedSplit[] }> {
    const amountCents = this.cents(dto.amount);
    const currency = dto.currency ?? (await this.householdCurrency(householdId));
    await this.assertMembers(householdId, [dto.paidById, ...dto.participants.map((p) => p.userId)]);
    return {
      amountCents,
      currency,
      splits: this.split(amountCents, dto.splitMethod, dto.participants),
    };
  }

  private split(
    amountCents: number,
    method: SplitMethod,
    participants: ParticipantDto[],
  ): ComputedSplit[] {
    try {
      return computeSplits(
        amountCents,
        method,
        participants.map((p) => ({
          userId: p.userId,
          amountCents: p.amount !== undefined ? this.cents(p.amount) : undefined,
          percent: p.percent,
        })),
      );
    } catch (error) {
      if (error instanceof SplitError) throw new BadRequestException(error.message);
      throw error;
    }
  }

  private cents(amount: number): number {
    try {
      return toCents(amount);
    } catch (error) {
      if (error instanceof SplitError) throw new BadRequestException(error.message);
      throw error;
    }
  }

  private async assertMembers(householdId: string, userIds: string[]): Promise<void> {
    const unique = [...new Set(userIds)];
    const count = await this.prisma.householdMember.count({
      where: { householdId, userId: { in: unique } },
    });
    if (count !== unique.length) {
      throw new BadRequestException('Payer and participants must all be members of this household');
    }
  }

  private async requireExpense(householdId: string, expenseId: string) {
    const expense = await this.prisma.expense.findFirst({ where: { id: expenseId, householdId } });
    if (!expense) throw new NotFoundException('Expense not found');
    return expense;
  }

  /** Admins, the creator or the payer may edit/delete an expense. */
  private assertCanModify(
    role: string,
    createdById: string | null,
    paidById: string | null,
    userId: string,
  ): void {
    if (ADMIN_ROLES.includes(role as (typeof ADMIN_ROLES)[number])) return;
    if (createdById === userId || paidById === userId) return;
    throw new ForbiddenException('Only the creator, the payer or an admin can change this expense');
  }
}
