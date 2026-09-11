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
import { ChoreDetail, ChoreView } from './chore.types';
import { ChoresService } from './chores.service';
import { CompleteChoreDto, CreateChoreDto, UpdateChoreDto } from './dto/chore.dto';

@Controller('households/:householdId/chores')
export class ChoresController {
  constructor(private readonly chores: ChoresService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('householdId', ParseUUIDPipe) householdId: string,
    @Query('includeInactive', new ParseBoolPipe({ optional: true })) includeInactive?: boolean,
  ): Promise<ChoreView[]> {
    return this.chores.list(user.id, householdId, includeInactive ?? false);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('householdId', ParseUUIDPipe) householdId: string,
    @Body() dto: CreateChoreDto,
  ): Promise<ChoreDetail> {
    return this.chores.create(user.id, householdId, dto);
  }

  @Get(':choreId')
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('householdId', ParseUUIDPipe) householdId: string,
    @Param('choreId', ParseUUIDPipe) choreId: string,
  ): Promise<ChoreDetail> {
    return this.chores.get(user.id, householdId, choreId);
  }

  @Patch(':choreId')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('householdId', ParseUUIDPipe) householdId: string,
    @Param('choreId', ParseUUIDPipe) choreId: string,
    @Body() dto: UpdateChoreDto,
  ): Promise<ChoreDetail> {
    return this.chores.update(user.id, householdId, choreId, dto);
  }

  @Delete(':choreId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('householdId', ParseUUIDPipe) householdId: string,
    @Param('choreId', ParseUUIDPipe) choreId: string,
  ): Promise<void> {
    return this.chores.remove(user.id, householdId, choreId);
  }

  @Post(':choreId/complete')
  @HttpCode(HttpStatus.OK)
  complete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('householdId', ParseUUIDPipe) householdId: string,
    @Param('choreId', ParseUUIDPipe) choreId: string,
    @Body() dto: CompleteChoreDto,
  ): Promise<ChoreDetail> {
    return this.chores.complete(user.id, householdId, choreId, dto);
  }

  @Post(':choreId/skip')
  @HttpCode(HttpStatus.OK)
  skip(
    @CurrentUser() user: AuthenticatedUser,
    @Param('householdId', ParseUUIDPipe) householdId: string,
    @Param('choreId', ParseUUIDPipe) choreId: string,
  ): Promise<ChoreDetail> {
    return this.chores.skip(user.id, householdId, choreId);
  }
}
