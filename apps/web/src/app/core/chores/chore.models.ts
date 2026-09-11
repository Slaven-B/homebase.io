import { Priority, UserRef } from '../tasks/task.models';

export type ChoreFrequency = 'DAILY' | 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'CUSTOM';

export interface Chore {
  id: string;
  householdId: string;
  title: string;
  description: string | null;
  frequency: ChoreFrequency;
  intervalDays: number | null;
  nextDueAt: string;
  dueInDays: number;
  estimatedMinutes: number | null;
  priority: Priority;
  isActive: boolean;
  assignee: UserRef | null;
  createdBy: UserRef | null;
  lastCompletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChoreCompletion {
  id: string;
  dueAt: string;
  skipped: boolean;
  note: string | null;
  completedBy: UserRef | null;
  completedAt: string;
}

export interface ChoreDetail extends Chore {
  history: ChoreCompletion[];
}

export interface ChoreInput {
  title: string;
  description?: string | null;
  assigneeId?: string | null;
  frequency: ChoreFrequency;
  intervalDays?: number | null;
  firstDueAt?: string;
  estimatedMinutes?: number | null;
  priority?: Priority;
}

export interface ChorePatch {
  title?: string;
  description?: string | null;
  assigneeId?: string | null;
  frequency?: ChoreFrequency;
  intervalDays?: number | null;
  nextDueAt?: string;
  estimatedMinutes?: number | null;
  priority?: Priority;
  isActive?: boolean;
}

export const FREQUENCY_LABELS: Record<ChoreFrequency, string> = {
  DAILY: 'Every day',
  WEEKLY: 'Every week',
  BIWEEKLY: 'Every 2 weeks',
  MONTHLY: 'Every month',
  CUSTOM: 'Custom',
};

export function describeFrequency(chore: Pick<Chore, 'frequency' | 'intervalDays'>): string {
  if (chore.frequency === 'CUSTOM') {
    const n = chore.intervalDays ?? 1;
    return n === 1 ? 'Every day' : `Every ${n} days`;
  }
  return FREQUENCY_LABELS[chore.frequency];
}

/** "Overdue by 3 days", "Due today", "Due tomorrow", "Due in 5 days". */
export function describeDue(dueInDays: number): string {
  if (dueInDays < -1) return `Overdue by ${-dueInDays} days`;
  if (dueInDays === -1) return 'Overdue by 1 day';
  if (dueInDays === 0) return 'Due today';
  if (dueInDays === 1) return 'Due tomorrow';
  return `Due in ${dueInDays} days`;
}
