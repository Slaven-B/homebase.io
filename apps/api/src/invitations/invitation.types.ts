import { HouseholdRole, InvitationStatus } from '@prisma/client';

/** Seen by household admins. */
export interface InvitationView {
  id: string;
  householdId: string;
  email: string;
  role: HouseholdRole;
  status: InvitationStatus;
  invitedBy: { id: string; displayName: string };
  expiresAt: Date;
  createdAt: Date;
}

/** Returned once on creation: includes the token so the inviter can share a link. */
export interface CreatedInvitation extends InvitationView {
  token: string;
}

/** Seen by the invitee. */
export interface PendingInvitationView {
  id: string;
  token: string;
  household: { id: string; name: string; memberCount: number };
  role: HouseholdRole;
  invitedBy: { displayName: string };
  expiresAt: Date;
  createdAt: Date;
}
