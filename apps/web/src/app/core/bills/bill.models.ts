import { UserRef } from '../tasks/task.models';

export type BillFrequency = 'ONE_TIME' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
export type BillUrgency = 'OVERDUE' | 'DUE_SOON' | 'UPCOMING' | 'INACTIVE';

export interface Bill {
  id: string;
  householdId: string;
  name: string;
  amountCents: number;
  currency: string;
  dueDate: string;
  dueInDays: number;
  urgency: BillUrgency;
  frequency: BillFrequency;
  category: string | null;
  notes: string | null;
  isActive: boolean;
  responsible: UserRef | null;
  createdBy: UserRef | null;
  lastPaidAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BillPayment {
  id: string;
  dueDate: string;
  paidAt: string;
  amountCents: number;
  note: string | null;
  paidBy: UserRef | null;
  expenseId: string | null;
  createdAt: string;
}

export interface BillDetail extends Bill {
  payments: BillPayment[];
}

export interface BillInput {
  name: string;
  amount: number;
  currency?: string;
  dueDate: string;
  frequency: BillFrequency;
  responsibleId?: string | null;
  category?: string | null;
  notes?: string | null;
}

export interface BillPatch {
  name?: string;
  amount?: number;
  currency?: string;
  dueDate?: string;
  frequency?: BillFrequency;
  responsibleId?: string | null;
  category?: string | null;
  notes?: string | null;
  isActive?: boolean;
}

export interface PayBillInput {
  amount?: number;
  paidAt?: string;
  note?: string | null;
  recordAsExpense?: boolean;
}

export const BILL_FREQUENCY_LABELS: Record<BillFrequency, string> = {
  ONE_TIME: 'One time',
  WEEKLY: 'Weekly',
  MONTHLY: 'Monthly',
  YEARLY: 'Yearly',
};

export const BILL_URGENCY_LABELS: Record<BillUrgency, string> = {
  OVERDUE: 'Overdue',
  DUE_SOON: 'Due soon',
  UPCOMING: 'Upcoming',
  INACTIVE: 'Inactive',
};

export function describeBillDue(bill: Pick<Bill, 'dueInDays' | 'isActive'>): string {
  if (!bill.isActive) return 'Paid / inactive';
  const n = bill.dueInDays;
  if (n < -1) return `Overdue by ${-n} days`;
  if (n === -1) return 'Overdue by 1 day';
  if (n === 0) return 'Due today';
  if (n === 1) return 'Due tomorrow';
  return `Due in ${n} days`;
}
