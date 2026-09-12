import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { NotificationType, Prisma, TaskStatus } from '@prisma/client';
import { ActivityService } from '../activity/activity.service';
import { ActivityAction, ActivityEntity } from '../activity/activity.types';
import { formatDateOnly, toDateOnly } from '../chores/recurrence';
import { ADMIN_ROLES, HouseholdAccessService } from '../households/household-access.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTaskCommentDto, CreateTaskDto, ListTasksQuery, UpdateTaskDto } from './dto/task.dto';
import { TaskCommentView, TaskDetail, TaskView } from './task.types';

const userRef = { select: { id: true, displayName: true } } as const;

const taskInclude = {
  assignee: userRef,
  createdBy: userRef,
  _count: { select: { comments: true } },
} as const;
type TaskRow = Prisma.TaskGetPayload<{ include: typeof taskInclude }>;

const commentInclude = { author: userRef } as const;
type CommentRow = Prisma.TaskCommentGetPayload<{ include: typeof commentInclude }>;

function toView(row: TaskRow): TaskView {
  return {
    id: row.id,
    householdId: row.householdId,
    title: row.title,
    description: row.description,
    dueAt: row.dueAt ? formatDateOnly(row.dueAt) : null,
    priority: row.priority,
    status: row.status,
    assignee: row.assignee,
    createdBy: row.createdBy,
    commentCount: row._count.comments,
    completedAt: row.completedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toComment(row: CommentRow): TaskCommentView {
  return {
    id: row.id,
    content: row.content,
    author: row.author,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Open tasks first, overdue/soon first, then priority, then newest. */
const taskOrder: Prisma.TaskOrderByWithRelationInput[] = [
  { status: 'asc' },
  { dueAt: { sort: 'asc', nulls: 'last' } },
  { priority: 'desc' },
  { createdAt: 'desc' },
];

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: HouseholdAccessService,
    private readonly activity: ActivityService,
    private readonly notifications: NotificationsService,
  ) {}

  async list(userId: string, householdId: string, query: ListTasksQuery): Promise<TaskView[]> {
    await this.access.requireMember(userId, householdId);
    const where: Prisma.TaskWhereInput = { householdId };
    if (query.status) {
      where.status = query.status;
    } else if (!query.includeDone) {
      where.status = { not: TaskStatus.DONE };
    }
    if (query.assigneeId) where.assigneeId = query.assigneeId;

    const rows = await this.prisma.task.findMany({
      where,
      include: taskInclude,
      orderBy: taskOrder,
      take: 200,
    });
    return rows.map(toView);
  }

  async create(userId: string, householdId: string, dto: CreateTaskDto): Promise<TaskDetail> {
    await this.access.requireMember(userId, householdId);
    await this.assertAssignee(householdId, dto.assigneeId);

    const created = await this.prisma.task.create({
      data: {
        householdId,
        createdById: userId,
        assigneeId: dto.assigneeId ?? null,
        title: dto.title,
        description: dto.description ?? null,
        dueAt: dto.dueAt ? toDateOnly(dto.dueAt) : null,
        priority: dto.priority,
      },
    });
    await this.activity.log({
      householdId,
      userId,
      action: ActivityAction.TaskCreated,
      entityType: ActivityEntity.Task,
      entityId: created.id,
      metadata: { title: created.title },
    });
    await this.notifyAssigned(userId, householdId, created.id, created.title, created.assigneeId);
    return this.get(userId, householdId, created.id);
  }

  async get(userId: string, householdId: string, taskId: string): Promise<TaskDetail> {
    await this.access.requireMember(userId, householdId);
    const row = await this.prisma.task.findFirst({
      where: { id: taskId, householdId },
      include: {
        ...taskInclude,
        comments: { include: commentInclude, orderBy: { createdAt: 'asc' } },
      },
    });
    if (!row) {
      throw new NotFoundException('Task not found');
    }
    return { ...toView(row), comments: row.comments.map(toComment) };
  }

  async update(
    userId: string,
    householdId: string,
    taskId: string,
    dto: UpdateTaskDto,
  ): Promise<TaskDetail> {
    await this.access.requireMember(userId, householdId);
    const existing = await this.requireTask(householdId, taskId);
    if (dto.assigneeId !== undefined) await this.assertAssignee(householdId, dto.assigneeId);

    const data: Prisma.TaskUncheckedUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.assigneeId !== undefined) data.assigneeId = dto.assigneeId;
    if (dto.dueAt !== undefined) data.dueAt = dto.dueAt ? toDateOnly(dto.dueAt) : null;
    if (dto.priority !== undefined) data.priority = dto.priority;

    const becomingDone = dto.status === TaskStatus.DONE && existing.status !== TaskStatus.DONE;
    if (dto.status !== undefined) {
      data.status = dto.status;
      data.completedAt =
        dto.status === TaskStatus.DONE ? (existing.completedAt ?? new Date()) : null;
    }

    const updated = await this.prisma.task.update({ where: { id: taskId }, data });
    if (dto.assigneeId !== undefined && dto.assigneeId !== existing.assigneeId) {
      await this.notifyAssigned(userId, householdId, updated.id, updated.title, updated.assigneeId);
    }

    if (becomingDone) {
      await this.activity.log({
        householdId,
        userId,
        action: ActivityAction.TaskCompleted,
        entityType: ActivityEntity.Task,
        entityId: updated.id,
        metadata: { title: updated.title },
      });
    }
    return this.get(userId, householdId, taskId);
  }

  /** Admins or the creator. */
  async remove(userId: string, householdId: string, taskId: string): Promise<void> {
    const membership = await this.access.requireMember(userId, householdId);
    const task = await this.requireTask(householdId, taskId);
    if (!ADMIN_ROLES.includes(membership.role) && task.createdById !== userId) {
      throw new ForbiddenException('Only admins or the task creator can delete a task');
    }
    await this.prisma.task.delete({ where: { id: taskId } });
  }

  async addComment(
    userId: string,
    householdId: string,
    taskId: string,
    dto: CreateTaskCommentDto,
  ): Promise<TaskCommentView> {
    await this.access.requireMember(userId, householdId);
    await this.requireTask(householdId, taskId);
    const created = await this.prisma.taskComment.create({
      data: { taskId, authorId: userId, content: dto.content },
      include: commentInclude,
    });
    return toComment(created);
  }

  /** Author or admins. */
  async removeComment(
    userId: string,
    householdId: string,
    taskId: string,
    commentId: string,
  ): Promise<void> {
    const membership = await this.access.requireMember(userId, householdId);
    await this.requireTask(householdId, taskId);
    const comment = await this.prisma.taskComment.findFirst({ where: { id: commentId, taskId } });
    if (!comment) {
      throw new NotFoundException('Comment not found');
    }
    if (!ADMIN_ROLES.includes(membership.role) && comment.authorId !== userId) {
      throw new ForbiddenException('Only the author or an admin can delete a comment');
    }
    await this.prisma.taskComment.delete({ where: { id: commentId } });
  }

  // --- dashboard support ---------------------------------------------------

  /** Open tasks due today or overdue. Caller checks membership. */
  async dueUnchecked(householdId: string, today: Date, limit = 8): Promise<TaskView[]> {
    const rows = await this.prisma.task.findMany({
      where: { householdId, status: { not: TaskStatus.DONE }, dueAt: { lte: today } },
      include: taskInclude,
      orderBy: taskOrder,
      take: limit,
    });
    return rows.map(toView);
  }

  // --- helpers -------------------------------------------------------------

  private async notifyAssigned(
    actorId: string,
    householdId: string,
    taskId: string,
    title: string,
    assigneeId: string | null,
  ): Promise<void> {
    if (!assigneeId) return;
    const actor = await this.prisma.user.findUnique({
      where: { id: actorId },
      select: { displayName: true },
    });
    await this.notifications.notify({
      userId: assigneeId,
      actorId,
      householdId,
      type: NotificationType.TASK_ASSIGNED,
      title: 'You have been assigned a task',
      body: `${actor?.displayName ?? 'Someone'} assigned you "${title}"`,
      link: `/tasks/${taskId}`,
      metadata: { taskId },
    });
  }

  private async requireTask(householdId: string, taskId: string) {
    const task = await this.prisma.task.findFirst({ where: { id: taskId, householdId } });
    if (!task) {
      throw new NotFoundException('Task not found');
    }
    return task;
  }

  /** An assignee must be a member of the household (null/undefined = unassigned). */
  private async assertAssignee(householdId: string, assigneeId?: string | null): Promise<void> {
    if (!assigneeId) return;
    const membership = await this.access.findMembership(assigneeId, householdId);
    if (!membership) {
      throw new BadRequestException('Assignee must be a member of this household');
    }
  }
}
