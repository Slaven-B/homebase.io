import { Module } from '@nestjs/common';
import { HouseholdsModule } from '../households/households.module';
import { UsersModule } from '../users/users.module';
import { HouseholdInvitationsController, InvitationsController } from './invitations.controller';
import { InvitationsService } from './invitations.service';

@Module({
  imports: [HouseholdsModule, UsersModule],
  controllers: [HouseholdInvitationsController, InvitationsController],
  providers: [InvitationsService],
})
export class InvitationsModule {}
