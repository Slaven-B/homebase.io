import { SplitMethod } from '@prisma/client';

export interface UserRef {
  id: string;
  displayName: string;
}

export interface ExpenseSplitView {
  user: UserRef;
  amountCents: number;
  percent: number | null;
}

export interface ExpenseView {
  id: string;
  householdId: string;
  description: string;
  amountCents: number;
  currency: string;
  /** YYYY-MM-DD */
  date: string;
  category: string | null;
  notes: string | null;
  splitMethod: SplitMethod;
  paidBy: UserRef | null;
  createdBy: UserRef | null;
  splits: ExpenseSplitView[];
  /** The requesting user's share (0 when not a participant). */
  myShareCents: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ExpensePage {
  items: ExpenseView[];
  nextCursor: string | null;
  /** Total of the listed period/filter, per currency. */
  totals: { currency: string; amountCents: number }[];
}

export interface SettlementView {
  id: string;
  householdId: string;
  from: UserRef;
  to: UserRef;
  amountCents: number;
  currency: string;
  date: string;
  note: string | null;
  createdBy: UserRef | null;
  createdAt: Date;
}

export interface BalanceView {
  currency: string;
  /** Positive = is owed, negative = owes. */
  members: { user: UserRef; netCents: number }[];
  transfers: { from: UserRef; to: UserRef; amountCents: number }[];
  /** Sum of all outstanding transfers. */
  outstandingCents: number;
  /** The requesting user's net position. */
  myNetCents: number;
}
