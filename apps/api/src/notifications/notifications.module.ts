import { Global, Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { RemindersService } from './reminders.service';

/** Global so any feature module can inject NotificationsService. */
@Global()
@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, RemindersService],
  exports: [NotificationsService, RemindersService],
})
export class NotificationsModule {}
