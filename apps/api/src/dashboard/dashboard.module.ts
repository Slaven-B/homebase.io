import { Module } from '@nestjs/common';
import { BillsModule } from '../bills/bills.module';
import { ChoresModule } from '../chores/chores.module';
import { ExpensesModule } from '../expenses/expenses.module';
import { HouseholdsModule } from '../households/households.module';
import { ShoppingModule } from '../shopping/shopping.module';
import { TasksModule } from '../tasks/tasks.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [
    HouseholdsModule,
    ShoppingModule,
    TasksModule,
    ChoresModule,
    ExpensesModule,
    BillsModule,
  ],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
