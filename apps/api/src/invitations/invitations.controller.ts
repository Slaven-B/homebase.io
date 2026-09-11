import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '../common';
import type { AuthenticatedUser } from '../common';
import { HouseholdDetail } from '../households/household.types';
import { CreateInvitationDto } from './dto/create-invitation.dto';
import { CreatedInvitation, InvitationView, PendingInvitationView } from './invitation.types';
import { InvitationsService } from './invitations.service';

/** Household-scoped management endpoints (admins). */
@Controller('households/:householdId/invitations')
export class HouseholdInvitationsController {
  constructor(private readonly invitations: InvitationsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('householdId', ParseUUIDPipe) householdId: string,
  ): Promise<InvitationView[]> {
    return this.invitations.listForHousehold(user.id, householdId);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('householdId', ParseUUIDPipe) householdId: string,
    @Body() dto: CreateInvitationDto,
  ): Promise<CreatedInvitation> {
    return this.invitations.create(user.id, householdId, dto);
  }

  @Delete(':invitationId')
  @HttpCode(HttpStatus.NO_CONTENT)
  revoke(
    @CurrentUser() user: AuthenticatedUser,
    @Param('householdId', ParseUUIDPipe) householdId: string,
    @Param('invitationId', ParseUUIDPipe) invitationId: string,
  ): Promise<void> {
    return this.invitations.revoke(user.id, householdId, invitationId);
  }
}

/** Invitee-facing endpoints. */
@Controller('invitations')
export class InvitationsController {
  constructor(private readonly invitations: InvitationsService) {}

  /** Pending invitations addressed to the current user's email. */
  @Get()
  mine(@CurrentUser() user: AuthenticatedUser): Promise<PendingInvitationView[]> {
    return this.invitations.listForInvitee(user.id);
  }

  /** Preview an invitation from a shared link. */
  @Get(':token')
  preview(
    @CurrentUser() user: AuthenticatedUser,
    @Param('token') token: string,
  ): Promise<PendingInvitationView> {
    return this.invitations.preview(user.id, token);
  }

  @Post(':token/accept')
  @HttpCode(HttpStatus.OK)
  accept(
    @CurrentUser() user: AuthenticatedUser,
    @Param('token') token: string,
  ): Promise<HouseholdDetail> {
    return this.invitations.accept(user.id, token);
  }

  @Post(':token/decline')
  @HttpCode(HttpStatus.NO_CONTENT)
  decline(@CurrentUser() user: AuthenticatedUser, @Param('token') token: string): Promise<void> {
    return this.invitations.decline(user.id, token);
  }
}
