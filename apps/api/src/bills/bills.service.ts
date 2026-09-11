import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BillFrequency, Prisma, SplitMethod } from '@prisma/client';
import { ActivityService } from '../activity/activity.service';
import { ActivityAction, ActivityEntity } from '../activity/activity.types';
import { formatDateOnly, toDateOnly, todayUtc } from '../chores/recurrence';
import { SplitError, computeSplits, toCents } from '../expenses/money';
import { ADMIN_ROLES, HouseholdAccessService } from '../households/household-access.service';
import { PrismaService } from '../prisma/prisma.service';
import { advanceBillDue, billUrgency } from './bill-schedule';
import { BillDetail, BillPaymentView, BillView } from './bill.types';
import { CreateBillDto, PayBillDto, UpdateBillDto } from './dto/bill.dto';

const userRef = { select: { id: true, displayName: true } } as const;
const billInclude = { responsible: userRef, createdBy: userRef } as const;
type BillRow = Prisma.BillGetPayload<{ include: typeof billInclude }>;

const paymentInclude = { paidBy: userRef } as const;
type PaymentRow = Prisma.BillPaymentGetPayload<{ include: typeof paymentInclude }>;

const DAY_MS = 24 * 60 * 60 * 1000;
const UPCOMING_WINDOW_DAYS = 14;

function toView(row: BillRow, today: Date): BillView {
  const dueInDays = Math.round((toDateOnly(row.dueDate).getTime() - today.getTime()) / DAY_MS);
  return {
    id: row.id,
    householdId: row.householdId,
    name: row.name,
    amountCents: row.amountCents,
    currency: row.currency,
    dueDate: formatDateOnly(row.dueDate),
    dueInDays,
    urgency: billUrgency(row.isActive, dueInDays),
    frequency: row.frequency,
    category: row.category,
    notes: row.notes,
    isActive: row.isActive,
    responsible: row.responsible,
    createdBy: row.createdBy,
    lastPaidAt: row.lastPaidAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toPayment(row: PaymentRow): BillPaymentView {
  return {
    id: row.id,
    dueDate: formatDateOnly(row.dueDate),
    paidAt: formatDateOnly(row.paidAt),
    amountCents: row.amountCents,
    note: row.note,
    paidBy: row.paidBy,
    expenseId: row.expenseId,
    createdAt: row.createdAt,
  };
}

function monthRange(month: string): { gte: Date; lt: Date } {
  const [y, m] = month.split('-').map(Number);
  return { gte: new Date(Date.UTC(y, m - 1, 1)), lt: new Date(Date.UTC(y, m, 1)) };
}

@Injectable()
export class BillsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: HouseholdAccessService,
    private readonly activity: ActivityService,
  ) {}

  async list(userId: string, householdId: string, includeInactive = false): Promise<BillView[]> {
    await this.access.requireMember(userId, householdId);
    const today = todayUtc();
    const rows = await this.prisma.bill.findMany({
      where: { householdId, ...(includeInactive ? {} : { isActive: true }) },
      include: billInclude,
      orderBy: [{ isActive: 'desc' }, { dueDate: 'asc' }, { name: 'asc' }],
    });
    return rows.map((r) => toView(r, today));
  }

  async create(userId: string, householdId: string, dto: CreateBillDto): Promise<BillDetail> {
    await this.access.requireMember(userId, householdId);
    await this.assertMember(householdId, dto.responsibleId);

    const created = await this.prisma.bill.create({
      data: {
        householdId,
        createdById: userId,
        responsibleId: dto.responsibleId ?? null,
        name: dto.name,
        amountCents: this.cents(dto.amount),
        currency: dto.currency ?? (await this.householdCurrency(householdId)),
        dueDate: toDateOnly(dto.dueDate),
        frequency: dto.frequency,
        category: dto.category ?? null,
        notes: dto.notes ?? null,
      },
    });
    await this.activity.log({
      householdId,
      userId,
      action: ActivityAction.BillCreated,
      entityType: ActivityEntity.Bill,
      entityId: created.id,
      metadata: {
        name: created.name,
        amountCents: created.amountCents,
        currency: created.currency,
        frequency: created.frequency,
      },
    });
    return this.get(userId, householdId, created.id);
  }

  async get(userId: string, householdId: string, billId: string): Promise<BillDetail> {
    await this.access.requireMember(userId, householdId);
    const row = await this.prisma.bill.findFirst({
      where: { id: billId, householdId },
      include: {
        ...billInclude,
        payments: { include: paymentInclude, orderBy: { paidAt: 'desc' }, take: 24 },
      },
    });
    if (!row) throw new NotFoundException('Bill not found');
    return { ...toView(row, todayUtc()), payments: row.payments.map(toPayment) };
  }

  async update(
    userId: string,
    householdId: string,
    billId: string,
    dto: UpdateBillDto,
  ): Promise<BillDetail> {
    await this.access.requireMember(userId, householdId);
    await this.requireBill(householdId, billId);
    if (dto.responsibleId !== undefined) await this.assertMember(householdId, dto.responsibleId);

    const data: Prisma.BillUncheckedUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.amount !== undefined) data.amountCents = this.cents(dto.amount);
    if (dto.currency !== undefined) data.currency = dto.currency;
    if (dto.dueDate !== undefined) data.dueDate = toDateOnly(dto.dueDate);
    if (dto.frequency !== undefined) data.frequency = dto.frequency;
    if (dto.responsibleId !== undefined) data.responsibleId = dto.responsibleId;
    if (dto.category !== undefined) data.category = dto.category;
    if (dto.notes !== undefined) data.notes = dto.notes;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;

    await this.prisma.bill.update({ where: { id: billId }, data });
    return this.get(userId, householdId, billId);
  }

  /** Admins or the creator. Payment history goes with it (linked expenses stay). */
  async remove(userId: string, householdId: string, billId: string): Promise<void> {
    const membership = await this.access.requireMember(userId, householdId);
    const bill = await this.requireBill(householdId, billId);
    if (!ADMIN_ROLES.includes(membership.role) && bill.createdById !== userId) {
      throw new ForbiddenException('Only admins or the bill creator can delete a bill');
    }
    await this.prisma.bill.delete({ where: { id: billId } });
  }

  /**
   * Records a payment for the current occurrence and advances the schedule
   * (ONE_TIME bills become inactive). Optionally creates a shared expense split
   * equally between all current members, paid by the current user.
   */
  async pay(
    userId: string,
    householdId: string,
    billId: string,
    dto: PayBillDto,
  ): Promise<BillDetail> {
    await this.access.requireMember(userId, householdId);
    const bill = await this.requireBill(householdId, billId);
    if (!bill.isActive) throw new BadRequestException('This bill is no longer active');

    const amountCents = dto.amount !== undefined ? this.cents(dto.amount) : bill.amountCents;
    const paidAt = dto.paidAt ? toDateOnly(dto.paidAt) : todayUtc();
    const anchorDay = bill.dueDate.getUTCDate();
    const nextDue = advanceBillDue(bill.dueDate, bill.frequency, anchorDay);
    const oneTime = bill.frequency === BillFrequency.ONE_TIME;

    await this.prisma.$transaction(async (tx) => {
      let expenseId: string | null = null;
      if (dto.recordAsExpense) {
        const members = await tx.householdMember.findMany({
          where: { householdId },
          select: { userId: true },
          orderBy: { joinedAt: 'asc' },
        });
        const splits = this.split(
          amountCents,
          members.map((m) => m.userId),
        );
        const expense = await tx.expense.create({
          data: {
            householdId,
            createdById: userId,
            paidById: userId,
            description: bill.name,
            amountCents,
            currency: bill.currency,
            date: paidAt,
            category: bill.category ?? 'Bills',
            notes: dto.note ?? null,
            splitMethod: SplitMethod.EQUAL,
            splits: { create: splits },
          },
        });
        expenseId = expense.id;
      }

      await tx.billPayment.create({
        data: {
          billId,
          paidById: userId,
          expenseId,
          dueDate: bill.dueDate,
          amountCents,
          paidAt,
          note: dto.note ?? null,
        },
      });
      await tx.bill.update({
        where: { id: billId },
        data: {
          lastPaidAt: new Date(),
          ...(oneTime ? { isActive: false } : { dueDate: nextDue }),
        },
      });
      await this.activity.log(
        {
          householdId,
          userId,
          action: ActivityAction.BillPaid,
          entityType: ActivityEntity.Bill,
          entityId: billId,
          metadata: {
            name: bill.name,
            amountCents,
            currency: bill.currency,
            recordedAsExpense: !!expenseId,
          },
        },
        tx,
      );
    });

    return this.get(userId, householdId, billId);
  }

  // --- dashboard support ---------------------------------------------------

  /** Active bills overdue or due within the next two weeks. Caller checks membership. */
  async upcomingUnchecked(householdId: string, today: Date, limit = 8): Promise<BillView[]> {
    const horizon = new Date(today.getTime() + UPCOMING_WINDOW_DAYS * DAY_MS);
    const rows = await this.prisma.bill.findMany({
      where: { householdId, isActive: true, dueDate: { lte: horizon } },
      include: billInclude,
      orderBy: [{ dueDate: 'asc' }, { amountCents: 'desc' }],
      take: limit,
    });
    return rows.map((r) => toView(r, today));
  }

  /**
   * This month's bills in the household currency: payments made for occurrences
   * due this month plus still-unpaid active bills due this month.
   */
  async monthTotalUnchecked(householdId: string, month: string, currency: string): Promise<number> {
    const range = monthRange(month);
    const [paid, unpaid] = await Promise.all([
      this.prisma.billPayment.aggregate({
        where: { bill: { householdId, currency }, dueDate: range },
        _sum: { amountCents: true },
      }),
      this.prisma.bill.aggregate({
        where: { householdId, currency, isActive: true, dueDate: range },
        _sum: { amountCents: true },
      }),
    ]);
    return (paid._sum.amountCents ?? 0) + (unpaid._sum.amountCents ?? 0);
  }

  // --- helpers -------------------------------------------------------------

  private async householdCurrency(householdId: string): Promise<string> {
    const h = await this.prisma.household.findUnique({
      where: { id: householdId },
      select: { currency: true },
    });
    return h?.currency ?? 'EUR';
  }

  private async requireBill(householdId: string, billId: string) {
    const bill = await this.prisma.bill.findFirst({ where: { id: billId, householdId } });
    if (!bill) throw new NotFoundException('Bill not found');
    return bill;
  }

  private async assertMember(householdId: string, memberUserId?: string | null): Promise<void> {
    if (!memberUserId) return;
    const membership = await this.access.findMembership(memberUserId, householdId);
    if (!membership) {
      throw new BadRequestException('Responsible person must be a member of this household');
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

  private split(amountCents: number, userIds: string[]) {
    return computeSplits(
      amountCents,
      SplitMethod.EQUAL,
      userIds.map((userId) => ({ userId })),
    ).map((s) => ({ userId: s.userId, amountCents: s.amountCents, percent: s.percent }));
  }
}
