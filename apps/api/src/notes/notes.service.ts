import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ActivityService } from '../activity/activity.service';
import { ActivityAction, ActivityEntity } from '../activity/activity.types';
import { ADMIN_ROLES, HouseholdAccessService } from '../households/household-access.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateNoteDto, UpdateNoteDto } from './dto/note.dto';
import { NoteSummary, NoteView } from './note.types';

const userRef = { select: { id: true, displayName: true } } as const;
const noteInclude = { author: userRef, lastEditedBy: userRef } as const;
type NoteRow = Prisma.NoteGetPayload<{ include: typeof noteInclude }>;

const PREVIEW_LENGTH = 160;

function toView(row: NoteRow): NoteView {
  return {
    id: row.id,
    householdId: row.householdId,
    title: row.title,
    content: row.content,
    isPinned: row.isPinned,
    author: row.author,
    lastEditedBy: row.lastEditedBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toSummary(row: NoteRow): NoteSummary {
  const { content, ...rest } = toView(row);
  const firstLines = content.replace(/\s+/g, ' ').trim();
  return {
    ...rest,
    preview:
      firstLines.length > PREVIEW_LENGTH ? `${firstLines.slice(0, PREVIEW_LENGTH)}…` : firstLines,
  };
}

@Injectable()
export class NotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: HouseholdAccessService,
    private readonly activity: ActivityService,
  ) {}

  async list(userId: string, householdId: string): Promise<NoteSummary[]> {
    await this.access.requireMember(userId, householdId);
    const rows = await this.prisma.note.findMany({
      where: { householdId },
      include: noteInclude,
      orderBy: [{ isPinned: 'desc' }, { updatedAt: 'desc' }],
      take: 200,
    });
    return rows.map(toSummary);
  }

  async create(userId: string, householdId: string, dto: CreateNoteDto): Promise<NoteView> {
    await this.access.requireMember(userId, householdId);
    const created = await this.prisma.note.create({
      data: {
        householdId,
        authorId: userId,
        lastEditedById: userId,
        title: dto.title,
        content: dto.content ?? '',
        isPinned: dto.isPinned ?? false,
      },
      include: noteInclude,
    });
    await this.activity.log({
      householdId,
      userId,
      action: ActivityAction.NoteCreated,
      entityType: ActivityEntity.Note,
      entityId: created.id,
      metadata: { title: created.title },
    });
    return toView(created);
  }

  async get(userId: string, householdId: string, noteId: string): Promise<NoteView> {
    await this.access.requireMember(userId, householdId);
    const row = await this.prisma.note.findFirst({
      where: { id: noteId, householdId },
      include: noteInclude,
    });
    if (!row) throw new NotFoundException('Note not found');
    return toView(row);
  }

  /** Any member may edit; the last editor is recorded. */
  async update(
    userId: string,
    householdId: string,
    noteId: string,
    dto: UpdateNoteDto,
  ): Promise<NoteView> {
    await this.access.requireMember(userId, householdId);
    await this.requireNote(householdId, noteId);
    const data: Prisma.NoteUncheckedUpdateInput = { lastEditedById: userId };
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.content !== undefined) data.content = dto.content;
    if (dto.isPinned !== undefined) data.isPinned = dto.isPinned;
    const updated = await this.prisma.note.update({
      where: { id: noteId },
      data,
      include: noteInclude,
    });
    return toView(updated);
  }

  /** Author or admins. */
  async remove(userId: string, householdId: string, noteId: string): Promise<void> {
    const membership = await this.access.requireMember(userId, householdId);
    const note = await this.requireNote(householdId, noteId);
    if (!ADMIN_ROLES.includes(membership.role) && note.authorId !== userId) {
      throw new ForbiddenException('Only the author or an admin can delete a note');
    }
    await this.prisma.note.delete({ where: { id: noteId } });
  }

  private async requireNote(householdId: string, noteId: string) {
    const note = await this.prisma.note.findFirst({ where: { id: noteId, householdId } });
    if (!note) throw new NotFoundException('Note not found');
    return note;
  }
}
