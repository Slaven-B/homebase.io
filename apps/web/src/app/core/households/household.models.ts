export type HouseholdRole = 'OWNER' | 'ADMIN' | 'MEMBER';
export type AssignableRole = Exclude<HouseholdRole, 'OWNER'>;

export interface HouseholdSummary {
  id: string;
  name: string;
  role: HouseholdRole;
  memberCount: number;
  createdAt: string;
}

export interface HouseholdMember {
  id: string;
  userId: string;
  displayName: string;
  email: string;
  avatarUrl: string | null;
  role: HouseholdRole;
  joinedAt: string;
}

export interface HouseholdDetail {
  id: string;
  name: string;
  myRole: HouseholdRole;
  members: HouseholdMember[];
  createdAt: string;
  updatedAt: string;
}

export interface Invitation {
  id: string;
  householdId: string;
  email: string;
  role: HouseholdRole;
  status: 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'REVOKED' | 'EXPIRED';
  invitedBy: { id: string; displayName: string };
  expiresAt: string;
  createdAt: string;
}

export interface CreatedInvitation extends Invitation {
  token: string;
}

export interface PendingInvitation {
  id: string;
  token: string;
  household: { id: string; name: string; memberCount: number };
  role: HouseholdRole;
  invitedBy: { displayName: string };
  expiresAt: string;
  createdAt: string;
}

export const ROLE_LABELS: Record<HouseholdRole, string> = {
  OWNER: 'Owner',
  ADMIN: 'Admin',
  MEMBER: 'Member',
};

export function canAdminister(role: HouseholdRole | null | undefined): boolean {
  return role === 'OWNER' || role === 'ADMIN';
}
