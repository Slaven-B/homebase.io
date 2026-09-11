import { Module } from '@nestjs/common';
import { HouseholdAccessService } from './household-access.service';
import { HouseholdsController } from './households.controller';
import { HouseholdsService } from './households.service';

@Module({
  controllers: [HouseholdsController],
  providers: [HouseholdsService, HouseholdAccessService],
  exports: [HouseholdAccessService, HouseholdsService],
})
export class HouseholdsModule {}
