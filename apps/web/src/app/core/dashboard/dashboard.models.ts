import { ActivityEntry } from '../activity/activity.models';
import { HouseholdRole } from '../households/household.models';

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
    choresDue: DashboardChore[];
    tasksDue: DashboardTask[];
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
