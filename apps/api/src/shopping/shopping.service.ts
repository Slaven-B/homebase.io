import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ActivityService } from '../activity/activity.service';
import { ActivityAction, ActivityEntity } from '../activity/activity.types';
import { ADMIN_ROLES, HouseholdAccessService } from '../households/household-access.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateShoppingItemDto, UpdateShoppingItemDto } from './dto/shopping-item.dto';
import { CreateShoppingListDto, UpdateShoppingListDto } from './dto/shopping-list.dto';
import { ShoppingItemView, ShoppingListDetail, ShoppingListSummary } from './shopping.types';

const userRef = { select: { id: true, displayName: true } } as const;

const itemInclude = { addedBy: userRef, completedBy: userRef } as const;
type ItemRow = Prisma.ShoppingListItemGetPayload<{ include: typeof itemInclude }>;

const listSummaryInclude = {
  createdBy: userRef,
  _count: { select: { items: true } },
  items: { where: { completed: false }, select: { id: true } },
} as const;
type ListSummaryRow = Prisma.ShoppingListGetPayload<{ include: typeof listSummaryInclude }>;

function toItem(row: ItemRow): ShoppingItemView {
  return {
    id: row.id,
    listId: row.listId,
    name: row.name,
    quantity: row.quantity,
    category: row.category,
    notes: row.notes,
    completed: row.completed,
    completedAt: row.completedAt,
    addedBy: row.addedBy,
    completedBy: row.completedBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toSummary(row: ListSummaryRow): ShoppingListSummary {
  return {
    id: row.id,
    name: row.name,
    isArchived: row.isArchived,
    openItems: row.items.length,
    totalItems: row._count.items,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

@Injectable()
export class ShoppingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: HouseholdAccessService,
    private readonly activity: ActivityService,
  ) {}

  // --- lists ---------------------------------------------------------------

  async listLists(
    userId: string,
    householdId: string,
    includeArchived = false,
  ): Promise<ShoppingListSummary[]> {
    await this.access.requireMember(userId, householdId);
    const rows = await this.prisma.shoppingList.findMany({
      where: { householdId, ...(includeArchived ? {} : { isArchived: false }) },
      include: listSummaryInclude,
      orderBy: [{ isArchived: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map(toSummary);
  }

  async createList(
    userId: string,
    householdId: string,
    dto: CreateShoppingListDto,
  ): Promise<ShoppingListDetail> {
    await this.access.requireMember(userId, householdId);
    const created = await this.prisma.shoppingList.create({
      data: { householdId, createdById: userId, name: dto.name },
    });
    await this.activity.log({
      householdId,
      userId,
      action: ActivityAction.ShoppingListCreated,
      entityType: ActivityEntity.ShoppingList,
      entityId: created.id,
      metadata: { name: created.name },
    });
    return this.getList(userId, householdId, created.id);
  }

  async getList(userId: string, householdId: string, listId: string): Promise<ShoppingListDetail> {
    await this.access.requireMember(userId, householdId);
    const row = await this.prisma.shoppingList.findFirst({
      where: { id: listId, householdId },
      include: {
        createdBy: userRef,
        items: {
          include: itemInclude,
          // Open items first (newest on top), then completed (most recently completed on top).
          orderBy: [{ completed: 'asc' }, { completedAt: 'desc' }, { createdAt: 'desc' }],
        },
      },
    });
    if (!row) {
      throw new NotFoundException('Shopping list not found');
    }
    return {
      id: row.id,
      name: row.name,
      isArchived: row.isArchived,
      createdBy: row.createdBy,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      items: row.items.map(toItem),
    };
  }

  async updateList(
    userId: string,
    householdId: string,
    listId: string,
    dto: UpdateShoppingListDto,
  ): Promise<ShoppingListDetail> {
    await this.access.requireMember(userId, householdId);
    await this.requireList(householdId, listId);
    await this.prisma.shoppingList.update({
      where: { id: listId },
      data: { name: dto.name, isArchived: dto.isArchived },
    });
    return this.getList(userId, householdId, listId);
  }

  /** Admins or the person who created the list. */
  async deleteList(userId: string, householdId: string, listId: string): Promise<void> {
    const membership = await this.access.requireMember(userId, householdId);
    const list = await this.requireList(householdId, listId);
    if (!ADMIN_ROLES.includes(membership.role) && list.createdById !== userId) {
      throw new ForbiddenException('Only admins or the list creator can delete a list');
    }
    await this.prisma.shoppingList.delete({ where: { id: listId } });
  }

  // --- items ---------------------------------------------------------------

  async addItem(
    userId: string,
    householdId: string,
    listId: string,
    dto: CreateShoppingItemDto,
  ): Promise<ShoppingItemView> {
    await this.access.requireMember(userId, householdId);
    const list = await this.requireList(householdId, listId);

    const created = await this.prisma.shoppingListItem.create({
      data: {
        listId,
        addedById: userId,
        name: dto.name,
        quantity: dto.quantity ?? null,
        category: dto.category ?? null,
        notes: dto.notes ?? null,
      },
      include: itemInclude,
    });
    await this.activity.log({
      householdId,
      userId,
      action: ActivityAction.ShoppingItemAdded,
      entityType: ActivityEntity.ShoppingItem,
      entityId: created.id,
      metadata: { itemName: created.name, listName: list.name, listId },
    });
    return toItem(created);
  }

  async updateItem(
    userId: string,
    householdId: string,
    listId: string,
    itemId: string,
    dto: UpdateShoppingItemDto,
  ): Promise<ShoppingItemView> {
    await this.access.requireMember(userId, householdId);
    const list = await this.requireList(householdId, listId);
    const existing = await this.requireItem(listId, itemId);

    const data: Prisma.ShoppingListItemUncheckedUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.quantity !== undefined) data.quantity = dto.quantity;
    if (dto.category !== undefined) data.category = dto.category;
    if (dto.notes !== undefined) data.notes = dto.notes;

    const becomingCompleted = dto.completed === true && !existing.completed;
    const becomingOpen = dto.completed === false && existing.completed;
    if (becomingCompleted) {
      data.completed = true;
      data.completedAt = new Date();
      data.completedById = userId;
    } else if (becomingOpen) {
      data.completed = false;
      data.completedAt = null;
      data.completedById = null;
    }

    const updated = await this.prisma.shoppingListItem.update({
      where: { id: itemId },
      data,
      include: itemInclude,
    });

    if (becomingCompleted) {
      await this.activity.log({
        householdId,
        userId,
        action: ActivityAction.ShoppingItemCompleted,
        entityType: ActivityEntity.ShoppingItem,
        entityId: updated.id,
        metadata: { itemName: updated.name, listName: list.name, listId },
      });
    }
    return toItem(updated);
  }

  async deleteItem(
    userId: string,
    householdId: string,
    listId: string,
    itemId: string,
  ): Promise<void> {
    await this.access.requireMember(userId, householdId);
    await this.requireList(householdId, listId);
    await this.requireItem(listId, itemId);
    await this.prisma.shoppingListItem.delete({ where: { id: itemId } });
  }

  /** Removes every completed item from the list. Returns how many were removed. */
  async clearCompleted(
    userId: string,
    householdId: string,
    listId: string,
  ): Promise<{ removed: number }> {
    await this.access.requireMember(userId, householdId);
    await this.requireList(householdId, listId);
    const result = await this.prisma.shoppingListItem.deleteMany({
      where: { listId, completed: true },
    });
    return { removed: result.count };
  }

  // --- dashboard support ---------------------------------------------------

  /** Open-item counts per active list, for the dashboard. Caller checks membership. */
  async openSummaryUnchecked(
    householdId: string,
  ): Promise<{ openItems: number; lists: { id: string; name: string; openItems: number }[] }> {
    const rows = await this.prisma.shoppingList.findMany({
      where: { householdId, isArchived: false },
      select: {
        id: true,
        name: true,
        _count: { select: { items: { where: { completed: false } } } },
      },
      orderBy: { createdAt: 'asc' },
    });
    const lists = rows.map((r) => ({ id: r.id, name: r.name, openItems: r._count.items }));
    return { openItems: lists.reduce((sum, l) => sum + l.openItems, 0), lists };
  }

  // --- helpers -------------------------------------------------------------

  /** The list must belong to the given household; otherwise it "does not exist". */
  private async requireList(householdId: string, listId: string) {
    const list = await this.prisma.shoppingList.findFirst({ where: { id: listId, householdId } });
    if (!list) {
      throw new NotFoundException('Shopping list not found');
    }
    return list;
  }

  private async requireItem(listId: string, itemId: string) {
    const item = await this.prisma.shoppingListItem.findFirst({ where: { id: itemId, listId } });
    if (!item) {
      throw new NotFoundException('Item not found');
    }
    return item;
  }
}
