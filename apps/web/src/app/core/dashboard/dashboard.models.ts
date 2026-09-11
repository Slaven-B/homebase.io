import { ActivityEntry } from '../activity/activity.models';
import { Bill } from '../bills/bill.models';
import { Chore } from '../chores/chore.models';
import { Task } from '../tasks/task.models';
import { HouseholdRole } from '../households/household.models';

export interface DashboardShoppingList {
  id: string;
  name: string;
  openItems: number;
}

export interface DashboardView {
  household: {
    id: string;
    name: string;
    myRole: HouseholdRole;
    memberCount: number;
    pendingInvitations: number | null;
  };
  today: {
    date: string;
    choresDue: Chore[];
    tasksDue: Task[];
    upcomingBills: Bill[];
    shopping: { openItems: number; lists: DashboardShoppingList[] };
  };
  finances: {
    month: string;
    currency: string;
    sharedExpensesCents: number;
    billsCents: number;
    outstandingCents: number;
    myNetCents: number;
  };
  recentActivity: ActivityEntry[];
}
