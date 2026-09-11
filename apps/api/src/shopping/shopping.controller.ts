import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseBoolPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../common';
import type { AuthenticatedUser } from '../common';
import { CreateShoppingItemDto, UpdateShoppingItemDto } from './dto/shopping-item.dto';
import { CreateShoppingListDto, UpdateShoppingListDto } from './dto/shopping-list.dto';
import { ShoppingService } from './shopping.service';
import { ShoppingItemView, ShoppingListDetail, ShoppingListSummary } from './shopping.types';

@Controller('households/:householdId/shopping-lists')
export class ShoppingController {
  constructor(private readonly shopping: ShoppingService) {}

  @Get()
  listLists(
    @CurrentUser() user: AuthenticatedUser,
    @Param('householdId', ParseUUIDPipe) householdId: string,
    @Query('includeArchived', new ParseBoolPipe({ optional: true })) includeArchived?: boolean,
  ): Promise<ShoppingListSummary[]> {
    return this.shopping.listLists(user.id, householdId, includeArchived ?? false);
  }

  @Post()
  createList(
    @CurrentUser() user: AuthenticatedUser,
    @Param('householdId', ParseUUIDPipe) householdId: string,
    @Body() dto: CreateShoppingListDto,
  ): Promise<ShoppingListDetail> {
    return this.shopping.createList(user.id, householdId, dto);
  }

  @Get(':listId')
  getList(
    @CurrentUser() user: AuthenticatedUser,
    @Param('householdId', ParseUUIDPipe) householdId: string,
    @Param('listId', ParseUUIDPipe) listId: string,
  ): Promise<ShoppingListDetail> {
    return this.shopping.getList(user.id, householdId, listId);
  }

  @Patch(':listId')
  updateList(
    @CurrentUser() user: AuthenticatedUser,
    @Param('householdId', ParseUUIDPipe) householdId: string,
    @Param('listId', ParseUUIDPipe) listId: string,
    @Body() dto: UpdateShoppingListDto,
  ): Promise<ShoppingListDetail> {
    return this.shopping.updateList(user.id, householdId, listId, dto);
  }

  @Delete(':listId')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteList(
    @CurrentUser() user: AuthenticatedUser,
    @Param('householdId', ParseUUIDPipe) householdId: string,
    @Param('listId', ParseUUIDPipe) listId: string,
  ): Promise<void> {
    return this.shopping.deleteList(user.id, householdId, listId);
  }

  @Post(':listId/items')
  addItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param('householdId', ParseUUIDPipe) householdId: string,
    @Param('listId', ParseUUIDPipe) listId: string,
    @Body() dto: CreateShoppingItemDto,
  ): Promise<ShoppingItemView> {
    return this.shopping.addItem(user.id, householdId, listId, dto);
  }

  @Patch(':listId/items/:itemId')
  updateItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param('householdId', ParseUUIDPipe) householdId: string,
    @Param('listId', ParseUUIDPipe) listId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: UpdateShoppingItemDto,
  ): Promise<ShoppingItemView> {
    return this.shopping.updateItem(user.id, householdId, listId, itemId, dto);
  }

  @Delete(':listId/items/:itemId')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param('householdId', ParseUUIDPipe) householdId: string,
    @Param('listId', ParseUUIDPipe) listId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
  ): Promise<void> {
    return this.shopping.deleteItem(user.id, householdId, listId, itemId);
  }

  @Post(':listId/items/clear-completed')
  @HttpCode(HttpStatus.OK)
  clearCompleted(
    @CurrentUser() user: AuthenticatedUser,
    @Param('householdId', ParseUUIDPipe) householdId: string,
    @Param('listId', ParseUUIDPipe) listId: string,
  ): Promise<{ removed: number }> {
    return this.shopping.clearCompleted(user.id, householdId, listId);
  }
}
