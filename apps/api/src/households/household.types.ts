import { HouseholdRole } from '@prisma/client';

export interface HouseholdSummary {
  id: string;
  name: string;
  /** The requesting user's role in this household. */
  role: HouseholdRole;
  memberCount: number;
  createdAt: Date;
}

export interface HouseholdMemberView {
  id: string;
  userId: string;
  displayName: string;
  email: string;
  avatarUrl: string | null;
  role: HouseholdRole;
  joinedAt: Date;
}

export interface HouseholdDetail {
  id: string;
  name: string;
  myRole: HouseholdRole;
  members: HouseholdMemberView[];
  createdAt: Date;
  updatedAt: Date;
}
