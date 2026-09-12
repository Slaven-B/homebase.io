import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { NotificationType } from '@prisma/client';
import { addDays, formatDateOnly, todayUtc } from '../chores/recurrence';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from './notifications.service';

export interface ReminderRunResult {
  billsDue: number;
  choresDue: number;
}

/**
 * Daily reminders. Idempotent: every notification carries a dedupe key of the
 * form "<kind>:<entityId>:<dueDate>", so running twice on the same day (or
 * restarting the API) never creates duplicates.
 */
@Injectable()
export class RemindersService {
  private readonly logger = new Logger(RemindersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_8AM)
  async runScheduled(): Promise<void> {
    if (process.env.NODE_ENV === 'test') return;
    const result = await this.run();
    this.logger.log(`Reminders: ${result.billsDue} bill(s), ${result.choresDue} chore(s)`);
  }

  /** Creates reminders for bills due today/tomorrow and chores due today. */
  async run(now: Date = new Date()): Promise<ReminderRunResult> {
    const today = todayUtc(now);
    const tomorrow = addDays(today, 1);
    const [billsDue, choresDue] = await Promise.all([
      this.remindBills(today, tomorrow),
      this.remindChores(today),
    ]);
    return { billsDue, choresDue };
  }

  private async remindBills(today: Date, tomorrow: Date): Promise<number> {
    const bills = await this.prisma.bill.findMany({
      where: { isActive: true, dueDate: { gte: today, lte: tomorrow } },
      include: {
        household: { include: { members: { select: { userId: true } } } },
      },
    });

    let created = 0;
    for (const bill of bills) {
      const due = formatDateOnly(bill.dueDate);
      const isToday = due === formatDateOnly(today);
      const recipients = bill.responsibleId
        ? [bill.responsibleId]
        : bill.household.members.map((m) => m.userId);
      const amount = `${(bill.amountCents / 100).toFixed(2)} ${bill.currency}`;
      for (const userId of recipients) {
        await this.notifications.notify({
          userId,
          householdId: bill.householdId,
          type: NotificationType.BILL_DUE,
          title: `${bill.name} is due ${isToday ? 'today' : 'tomorrow'}`,
          body: `${amount}${bill.responsibleId ? '' : ' · nobody is assigned yet'}`,
          link: '/bills',
          metadata: { billId: bill.id, dueDate: due, amountCents: bill.amountCents },
          dedupeKey: `bill:${bill.id}:${due}`,
        });
        created++;
      }
    }
    return created;
  }

  private async remindChores(today: Date): Promise<number> {
    const chores = await this.prisma.chore.findMany({
      where: { isActive: true, assigneeId: { not: null }, nextDueAt: { lte: today } },
      select: { id: true, householdId: true, title: true, assigneeId: true, nextDueAt: true },
    });

    let created = 0;
    for (const chore of chores) {
      const due = formatDateOnly(chore.nextDueAt);
      const overdue = chore.nextDueAt.getTime() < today.getTime();
      await this.notifications.notify({
        userId: chore.assigneeId!,
        householdId: chore.householdId,
        type: NotificationType.CHORE_DUE,
        title: overdue ? `"${chore.title}" is overdue` : `"${chore.title}" is due today`,
        link: '/chores',
        metadata: { choreId: chore.id, dueDate: due },
        // One reminder per chore per day it is (still) due.
        dedupeKey: `chore:${chore.id}:${formatDateOnly(today)}`,
      });
      created++;
    }
    return created;
  }
}
