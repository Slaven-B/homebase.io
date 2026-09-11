import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { IsOptional, IsUUID, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { CurrentUser } from '../common';
import type { AuthenticatedUser } from '../common';
import { ActivityService } from './activity.service';
import { ActivityPage } from './activity.types';

export class ListActivityQuery {
  @IsOptional()
  @Type(() => Number)
  @Min(1)
  @Max(50)
  limit?: number;

  @IsOptional()
  @IsUUID()
  cursor?: string;
}

@Controller('households/:householdId/activity')
export class ActivityController {
  constructor(private readonly activity: ActivityService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('householdId', ParseUUIDPipe) householdId: string,
    @Query() query: ListActivityQuery,
  ): Promise<ActivityPage> {
    return this.activity.list(user.id, householdId, query);
  }
}
