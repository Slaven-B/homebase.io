import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../common';
import type { AuthenticatedUser } from '../common';
import {
  CreateExpenseDto,
  CreateSettlementDto,
  ListExpensesQuery,
  UpdateExpenseDto,
} from './dto/expense.dto';
import { BalanceView, ExpensePage, ExpenseView, SettlementView } from './expense.types';
import { ExpensesService } from './expenses.service';

@Controller('households/:householdId')
export class ExpensesController {
  constructor(private readonly expenses: ExpensesService) {}

  @Get('expenses')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('householdId', ParseUUIDPipe) householdId: string,
    @Query() query: ListExpensesQuery,
  ): Promise<ExpensePage> {
    return this.expenses.list(user.id, householdId, query);
  }

  @Post('expenses')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('householdId', ParseUUIDPipe) householdId: string,
    @Body() dto: CreateExpenseDto,
  ): Promise<ExpenseView> {
    return this.expenses.create(user.id, householdId, dto);
  }

  @Get('expenses/:expenseId')
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('householdId', ParseUUIDPipe) householdId: string,
    @Param('expenseId', ParseUUIDPipe) expenseId: string,
  ): Promise<ExpenseView> {
    return this.expenses.get(user.id, householdId, expenseId);
  }

  /** Full replacement (PUT): the split must be recomputed as a whole. */
  @Put('expenses/:expenseId')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('householdId', ParseUUIDPipe) householdId: string,
    @Param('expenseId', ParseUUIDPipe) expenseId: string,
    @Body() dto: UpdateExpenseDto,
  ): Promise<ExpenseView> {
    return this.expenses.update(user.id, householdId, expenseId, dto);
  }

  @Delete('expenses/:expenseId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('householdId', ParseUUIDPipe) householdId: string,
    @Param('expenseId', ParseUUIDPipe) expenseId: string,
  ): Promise<void> {
    return this.expenses.remove(user.id, householdId, expenseId);
  }

  @Get('balances')
  balances(
    @CurrentUser() user: AuthenticatedUser,
    @Param('householdId', ParseUUIDPipe) householdId: string,
  ): Promise<BalanceView[]> {
    return this.expenses.balances(user.id, householdId);
  }

  @Get('settlements')
  settlements(
    @CurrentUser() user: AuthenticatedUser,
    @Param('householdId', ParseUUIDPipe) householdId: string,
  ): Promise<SettlementView[]> {
    return this.expenses.listSettlements(user.id, householdId);
  }

  @Post('settlements')
  settle(
    @CurrentUser() user: AuthenticatedUser,
    @Param('householdId', ParseUUIDPipe) householdId: string,
    @Body() dto: CreateSettlementDto,
  ): Promise<SettlementView> {
    return this.expenses.recordSettlement(user.id, householdId, dto);
  }

  @Delete('settlements/:settlementId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeSettlement(
    @CurrentUser() user: AuthenticatedUser,
    @Param('householdId', ParseUUIDPipe) householdId: string,
    @Param('settlementId', ParseUUIDPipe) settlementId: string,
  ): Promise<void> {
    return this.expenses.removeSettlement(user.id, householdId, settlementId);
  }
}
