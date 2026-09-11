import { BillFrequency } from '@prisma/client';
import { BillUrgency } from './bill-schedule';

export interface UserRef {
  id: string;
  displayName: string;
}

export interface BillView {
  id: string;
  householdId: string;
  name: string;
  amountCents: number;
  currency: string;
  /** YYYY-MM-DD */
  dueDate: string;
  dueInDays: number;
  urgency: BillUrgency;
  frequency: BillFrequency;
  category: string | null;
  notes: string | null;
  isActive: boolean;
  responsible: UserRef | null;
  createdBy: UserRef | null;
  lastPaidAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface BillPaymentView {
  id: string;
  dueDate: string;
  paidAt: string;
  amountCents: number;
  note: string | null;
  paidBy: UserRef | null;
  expenseId: string | null;
  createdAt: Date;
}

export interface BillDetail extends BillView {
  payments: BillPaymentView[];
}
