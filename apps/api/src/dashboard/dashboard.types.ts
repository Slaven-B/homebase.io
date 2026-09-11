import { HouseholdRole } from '@prisma/client';
import { ActivityEntry } from '../activity/activity.types';
import { BillView } from '../bills/bill.types';
import { ChoreView } from '../chores/chore.types';
import { TaskView } from '../tasks/task.types';

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
    choresDue: ChoreView[];
    tasksDue: TaskView[];
    upcomingBills: BillView[];
    shopping: { openItems: number; lists: DashboardShoppingList[] };
  };
  finances: {
    month: string; // YYYY-MM
    currency: string;
    /** Integer cents. */
    sharedExpensesCents: number;
    billsCents: number;
    outstandingCents: number;
    /** The requesting user net position in the household currency. */
    myNetCents: number;
  };
  recentActivity: ActivityEntry[];
}

// Placeholders typed now, filled by later phases.
export interface DashboardShoppingList {
  id: string;
  name: string;
  openItems: number;
}
