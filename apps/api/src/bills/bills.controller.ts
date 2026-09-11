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
import { BillDetail, BillView } from './bill.types';
import { BillsService } from './bills.service';
import { CreateBillDto, PayBillDto, UpdateBillDto } from './dto/bill.dto';

@Controller('households/:householdId/bills')
export class BillsController {
  constructor(private readonly bills: BillsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('householdId', ParseUUIDPipe) householdId: string,
    @Query('includeInactive', new ParseBoolPipe({ optional: true })) includeInactive?: boolean,
  ): Promise<BillView[]> {
    return this.bills.list(user.id, householdId, includeInactive ?? false);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('householdId', ParseUUIDPipe) householdId: string,
    @Body() dto: CreateBillDto,
  ): Promise<BillDetail> {
    return this.bills.create(user.id, householdId, dto);
  }

  @Get(':billId')
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('householdId', ParseUUIDPipe) householdId: string,
    @Param('billId', ParseUUIDPipe) billId: string,
  ): Promise<BillDetail> {
    return this.bills.get(user.id, householdId, billId);
  }

  @Patch(':billId')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('householdId', ParseUUIDPipe) householdId: string,
    @Param('billId', ParseUUIDPipe) billId: string,
    @Body() dto: UpdateBillDto,
  ): Promise<BillDetail> {
    return this.bills.update(user.id, householdId, billId, dto);
  }

  @Delete(':billId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('householdId', ParseUUIDPipe) householdId: string,
    @Param('billId', ParseUUIDPipe) billId: string,
  ): Promise<void> {
    return this.bills.remove(user.id, householdId, billId);
  }

  @Post(':billId/pay')
  @HttpCode(HttpStatus.OK)
  pay(
    @CurrentUser() user: AuthenticatedUser,
    @Param('householdId', ParseUUIDPipe) householdId: string,
    @Param('billId', ParseUUIDPipe) billId: string,
    @Body() dto: PayBillDto,
  ): Promise<BillDetail> {
    return this.bills.pay(user.id, householdId, billId, dto);
  }
}
