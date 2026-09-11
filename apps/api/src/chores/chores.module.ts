import { Module } from '@nestjs/common';
import { HouseholdsModule } from '../households/households.module';
import { ChoresController } from './chores.controller';
import { ChoresService } from './chores.service';

@Module({
  imports: [HouseholdsModule],
  controllers: [ChoresController],
  providers: [ChoresService],
  exports: [ChoresService],
})
export class ChoresModule {}
