import { ChoreFrequency, Priority } from '@prisma/client';

export interface UserRef {
  id: string;
  displayName: string;
}

export interface ChoreView {
  id: string;
  householdId: string;
  title: string;
  description: string | null;
  frequency: ChoreFrequency;
  intervalDays: number | null;
  /** YYYY-MM-DD */
  nextDueAt: string;
  /** Negative = overdue by N days, 0 = today, positive = in N days. */
  dueInDays: number;
  estimatedMinutes: number | null;
  priority: Priority;
  isActive: boolean;
  assignee: UserRef | null;
  createdBy: UserRef | null;
  lastCompletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ChoreCompletionView {
  id: string;
  /** YYYY-MM-DD the completion/skip was for. */
  dueAt: string;
  skipped: boolean;
  note: string | null;
  completedBy: UserRef | null;
  completedAt: Date;
}

export interface ChoreDetail extends ChoreView {
  history: ChoreCompletionView[];
}
