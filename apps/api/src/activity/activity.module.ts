import { Global, Module } from '@nestjs/common';
import { HouseholdsModule } from '../households/households.module';
import { ActivityController } from './activity.controller';
import { ActivityService } from './activity.service';

/** Global so every feature module can inject ActivityService without importing. */
@Global()
@Module({
  imports: [HouseholdsModule],
  controllers: [ActivityController],
  providers: [ActivityService],
  exports: [ActivityService],
})
export class ActivityModule {}
