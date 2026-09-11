import { ActivityEntry } from '../activity/activity.models';
import { Chore } from '../chores/chore.models';
import { Task } from '../tasks/task.models';
import { HouseholdRole } from '../households/household.models';

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
    upcomingBills: DashboardBill[];
    shopping: { openItems: number; lists: DashboardShoppingList[] };
  };
  finances: {
    month: string;
    currency: string;
    sharedExpenses: number;
    bills: number;
    outstanding: number;
  };
  recentActivity: ActivityEntry[];
}
