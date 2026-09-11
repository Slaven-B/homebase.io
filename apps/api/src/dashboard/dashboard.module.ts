import { Module } from '@nestjs/common';
import { HouseholdsModule } from '../households/households.module';
import { ShoppingModule } from '../shopping/shopping.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [HouseholdsModule, ShoppingModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
