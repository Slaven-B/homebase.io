import { BillFrequency } from '@prisma/client';
import { addDays, addMonths, toDateOnly } from '../chores/recurrence';

/**
 * Bills advance by exactly one period when paid. Missed periods are NOT
 * skipped: paying April's rent in June leaves May outstanding.
 */
export function advanceBillDue(dueDate: Date, frequency: BillFrequency, anchorDay?: number): Date {
  const current = toDateOnly(dueDate);
  switch (frequency) {
    case BillFrequency.ONE_TIME:
      return current;
    case BillFrequency.WEEKLY:
      return addDays(current, 7);
    case BillFrequency.MONTHLY:
      return clampToAnchor(addMonths(current, 1), anchorDay);
    case BillFrequency.YEARLY:
      return clampToAnchor(addMonths(current, 12), anchorDay);
  }
}

/** Re-apply the original day-of-month after a month-end clamp (31st stays 31st when possible). */
function clampToAnchor(date: Date, anchorDay?: number): Date {
  if (!anchorDay || anchorDay <= date.getUTCDate()) return date;
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), Math.min(anchorDay, lastDay)),
  );
}

export type BillUrgency = 'OVERDUE' | 'DUE_SOON' | 'UPCOMING' | 'INACTIVE';

export const DUE_SOON_DAYS = 7;

export function billUrgency(isActive: boolean, dueInDays: number): BillUrgency {
  if (!isActive) return 'INACTIVE';
  if (dueInDays < 0) return 'OVERDUE';
  if (dueInDays <= DUE_SOON_DAYS) return 'DUE_SOON';
  return 'UPCOMING';
}
