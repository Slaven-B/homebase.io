import { HouseholdRole } from '@prisma/client';
import { ActivityEntry } from '../activity/activity.types';

/**
 * Everything the home screen needs in one round trip. Sections for modules that
 * are not built yet are present with empty data so the shape stays stable.
 */
export interface DashboardView {
  household: {
    id: string;
    name: string;
    myRole: HouseholdRole;
    memberCount: number;
    /** Only populated for OWNER/ADMIN. */
    pendingInvitations: number | null;
  };
  today: {
    date: string; // YYYY-MM-DD in server time
    choresDue: DashboardChore[];
    tasksDue: DashboardTask[];
    upcomingBills: DashboardBill[];
    shopping: { openItems: number; lists: DashboardShoppingList[] };
  };
  finances: {
    month: string; // YYYY-MM
    currency: string;
    sharedExpenses: number;
    bills: number;
    outstanding: number;
  };
  recentActivity: ActivityEntry[];
}

// Placeholders typed now, filled by later phases.
export interface DashboardChore {
  id: string;
  title: string;
  assignee: string | null;
  dueAt: string;
}
export interface DashboardTask {
  id: string;
  title: string;
  assignee: string | null;
  dueAt: string | null;
  priority: string;
}
export interface DashboardBill {
  id: string;
  name: string;
  amount: number;
  currency: string;
  dueDate: string;
}
export interface DashboardShoppingList {
  id: string;
  name: string;
  openItems: number;
}
