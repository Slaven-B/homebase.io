import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { CurrentUser } from '../common';
import type { AuthenticatedUser } from '../common';
import { DashboardService } from './dashboard.service';
import { DashboardView } from './dashboard.types';

@Controller('households/:householdId/dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('householdId', ParseUUIDPipe) householdId: string,
  ): Promise<DashboardView> {
    return this.dashboard.get(user.id, householdId);
  }
}
