import { UserRef } from '../tasks/task.models';

export type SplitMethod = 'EQUAL' | 'CUSTOM' | 'PERCENTAGE';

export interface ExpenseSplit {
  user: UserRef;
  amountCents: number;
  percent: number | null;
}

export interface Expense {
  id: string;
  householdId: string;
  description: string;
  amountCents: number;
  currency: string;
  date: string;
  category: string | null;
  notes: string | null;
  splitMethod: SplitMethod;
  paidBy: UserRef | null;
  createdBy: UserRef | null;
  splits: ExpenseSplit[];
  myShareCents: number;
  createdAt: string;
  updatedAt: string;
}

export interface ExpensePage {
  items: Expense[];
  nextCursor: string | null;
  totals: { currency: string; amountCents: number }[];
}

export interface ParticipantInput {
  userId: string;
  amount?: number;
  percent?: number;
}

export interface ExpenseInput {
  description: string;
  amount: number;
  currency?: string;
  date?: string;
  category?: string | null;
  notes?: string | null;
  paidById: string;
  splitMethod: SplitMethod;
  participants: ParticipantInput[];
}

export interface Settlement {
  id: string;
  householdId: string;
  from: UserRef;
  to: UserRef;
  amountCents: number;
  currency: string;
  date: string;
  note: string | null;
  createdBy: UserRef | null;
  createdAt: string;
}

export interface SettlementInput {
  fromUserId?: string;
  toUserId: string;
  amount: number;
  currency?: string;
  date?: string;
  note?: string | null;
}

export interface Balance {
  currency: string;
  members: { user: UserRef; netCents: number }[];
  transfers: { from: UserRef; to: UserRef; amountCents: number }[];
  outstandingCents: number;
  myNetCents: number;
}

export const EXPENSE_CATEGORIES = [
  'Groceries',
  'Household',
  'Rent',
  'Utilities',
  'Dining',
  'Transport',
  'Entertainment',
  'Health',
  'Other',
] as const;

export const SPLIT_LABELS: Record<SplitMethod, string> = {
  EQUAL: 'Split equally',
  PERCENTAGE: 'By percentage',
  CUSTOM: 'Exact amounts',
};

export function fromCents(cents: number): number {
  return cents / 100;
}

/** Current month as YYYY-MM in local time. */
export function currentMonth(date: Date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return currentMonth(d);
}

export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}
