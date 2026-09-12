import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { NotificationType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationPage, NotificationView } from './notification.types';

export interface NotifyInput {
  userId: string;
  householdId?: string | null;
  type: NotificationType;
  title: string;
  body?: string | null;
  link?: string | null;
  metadata?: Record<string, string | number | boolean | null>;
  /** When set, a second notification with the same key for the same user is skipped. */
  dedupeKey?: string | null;
  /** The user who caused the event; they never get notified about their own action. */
  actorId?: string | null;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

function toView(row: {
  id: string;
  householdId: string | null;
  type: NotificationType;
  title: string;
  body: string | null;
  link: string | null;
  metadata: Prisma.JsonValue;
  readAt: Date | null;
  createdAt: Date;
}): NotificationView {
  return {
    id: row.id,
    householdId: row.householdId,
    type: row.type,
    title: row.title,
    body: row.body,
    link: row.link,
    metadata: (row.metadata ?? {}) as Record<string, string | number | boolean | null>,
    readAt: row.readAt,
    createdAt: row.createdAt,
  };
}

/**
 * Single entry point for creating in-app notifications. Other channels
 * (email, push) will hang off `notify()` later. Never throws: a failed
 * notification must not fail the action that triggered it.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async notify(input: NotifyInput, tx: Prisma.TransactionClient | PrismaService = this.prisma) {
    if (input.actorId && input.actorId === input.userId) return;
    try {
      if (input.dedupeKey) {
        const existing = await tx.notification.findUnique({
          where: { userId_dedupeKey: { userId: input.userId, dedupeKey: input.dedupeKey } },
          select: { id: true },
        });
        if (existing) return;
      }
      await tx.notification.create({
        data: {
          userId: input.userId,
          householdId: input.householdId ?? null,
          type: input.type,
          title: input.title,
          body: input.body ?? null,
          link: input.link ?? null,
          metadata: input.metadata ?? {},
          dedupeKey: input.dedupeKey ?? null,
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to create notification ${input.type} for ${input.userId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  async notifyMany(
    userIds: string[],
    input: Omit<NotifyInput, 'userId'>,
    tx: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<void> {
    for (const userId of new Set(userIds)) {
      await this.notify({ ...input, userId }, tx);
    }
  }

  async list(
    userId: string,
    options: { unreadOnly?: boolean; limit?: number; cursor?: string } = {},
  ): Promise<NotificationPage> {
    const limit = Math.min(Math.max(options.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
    const rows = await this.prisma.notification.findMany({
      where: { userId, ...(options.unreadOnly ? { readAt: null } : {}) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit).map(toView);
    return { items, nextCursor: hasMore ? items[items.length - 1].id : null };
  }

  unreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({ where: { userId, readAt: null } });
  }

  async markRead(userId: string, notificationId: string): Promise<NotificationView> {
    const existing = await this.prisma.notification.findFirst({
      where: { id: notificationId, userId },
    });
    if (!existing) throw new NotFoundException('Notification not found');
    const updated = existing.readAt
      ? existing
      : await this.prisma.notification.update({
          where: { id: notificationId },
          data: { readAt: new Date() },
        });
    return toView(updated);
  }

  async markAllRead(userId: string): Promise<{ updated: number }> {
    const result = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: result.count };
  }

  async remove(userId: string, notificationId: string): Promise<void> {
    const result = await this.prisma.notification.deleteMany({
      where: { id: notificationId, userId },
    });
    if (result.count === 0) throw new NotFoundException('Notification not found');
  }
}
