import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { HouseholdAccessService } from '../households/household-access.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  ActivityActionType,
  ActivityEntityType,
  ActivityEntry,
  ActivityMetadata,
  ActivityPage,
} from './activity.types';

export interface LogActivityInput {
  householdId: string;
  userId: string | null;
  action: ActivityActionType;
  entityType: ActivityEntityType;
  entityId?: string | null;
  metadata?: ActivityMetadata;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

const actorSelect = {
  user: { select: { id: true, displayName: true, avatarUrl: true } },
} as const;

type ActivityRow = Prisma.ActivityGetPayload<{ include: typeof actorSelect }>;

function toEntry(row: ActivityRow): ActivityEntry {
  return {
    id: row.id,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    metadata: (row.metadata ?? {}) as ActivityMetadata,
    actor: row.user,
    createdAt: row.createdAt,
  };
}

@Injectable()
export class ActivityService {
  private readonly logger = new Logger(ActivityService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: HouseholdAccessService,
  ) {}

  /**
   * Records an activity entry. Accepts an optional transaction client so the
   * entry is committed together with the change it describes. Never throws:
   * a failed log line must not fail the user's action.
   */
  async log(input: LogActivityInput, tx: Prisma.TransactionClient | PrismaService = this.prisma) {
    try {
      await tx.activity.create({
        data: {
          householdId: input.householdId,
          userId: input.userId,
          action: input.action,
          entityType: input.entityType,
          entityId: input.entityId ?? null,
          metadata: input.metadata ?? {},
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to log activity ${input.action}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async list(
    userId: string,
    householdId: string,
    options: { limit?: number; cursor?: string } = {},
  ): Promise<ActivityPage> {
    await this.access.requireMember(userId, householdId);
    return this.listUnchecked(householdId, options);
  }

  /** For callers that already verified membership (e.g. the dashboard). */
  async listUnchecked(
    householdId: string,
    options: { limit?: number; cursor?: string } = {},
  ): Promise<ActivityPage> {
    const limit = Math.min(Math.max(options.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
    const rows = await this.prisma.activity.findMany({
      where: { householdId },
      include: actorSelect,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
    });

    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit).map(toEntry);
    return { items, nextCursor: hasMore ? items[items.length - 1].id : null };
  }
}
