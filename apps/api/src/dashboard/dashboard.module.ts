import { Module } from '@nestjs/common';
import { HouseholdsModule } from '../households/households.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [HouseholdsModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
