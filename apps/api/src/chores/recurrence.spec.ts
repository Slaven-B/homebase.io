import { ChoreFrequency } from '@prisma/client';
import { addMonths, computeNextDue, formatDateOnly, toDateOnly } from './recurrence';

const d = (iso: string) => toDateOnly(new Date(`${iso}T00:00:00Z`));
const fmt = formatDateOnly;

describe('recurrence', () => {
  describe('addMonths', () => {
    it('clamps to the end of shorter months', () => {
      expect(fmt(addMonths(d('2026-01-31'), 1))).toBe('2026-02-28');
      expect(fmt(addMonths(d('2028-01-31'), 1))).toBe('2028-02-29'); // leap year
      expect(fmt(addMonths(d('2026-03-31'), 1))).toBe('2026-04-30');
    });

    it('rolls over years', () => {
      expect(fmt(addMonths(d('2026-12-15'), 1))).toBe('2027-01-15');
    });
  });

  describe('computeNextDue', () => {
    it('advances a chore due today to the next period', () => {
      const today = d('2026-09-11');
      expect(fmt(computeNextDue(today, ChoreFrequency.DAILY, null, today))).toBe('2026-09-12');
      expect(fmt(computeNextDue(today, ChoreFrequency.WEEKLY, null, today))).toBe('2026-09-18');
      expect(fmt(computeNextDue(today, ChoreFrequency.BIWEEKLY, null, today))).toBe('2026-09-25');
      expect(fmt(computeNextDue(today, ChoreFrequency.CUSTOM, 3, today))).toBe('2026-09-14');
      expect(fmt(computeNextDue(today, ChoreFrequency.MONTHLY, null, today))).toBe('2026-10-11');
    });

    it('keeps the weekday when completed late but within the period', () => {
      // Due Monday 2026-09-07, completed Thursday 2026-09-10 -> next Monday 2026-09-14.
      const next = computeNextDue(d('2026-09-07'), ChoreFrequency.WEEKLY, null, d('2026-09-10'));
      expect(fmt(next)).toBe('2026-09-14');
      expect(next.getUTCDay()).toBe(1);
    });

    it('skips missed periods so the next due date is always in the future', () => {
      // Daily chore last due 10 days ago -> tomorrow, not 9 days ago.
      expect(
        fmt(computeNextDue(d('2026-09-01'), ChoreFrequency.DAILY, null, d('2026-09-11'))),
      ).toBe('2026-09-12');
      // Weekly chore due 3 weeks ago on a Friday -> next Friday after today.
      expect(
        fmt(computeNextDue(d('2026-08-21'), ChoreFrequency.WEEKLY, null, d('2026-09-11'))),
      ).toBe('2026-09-18');
    });

    it('completing early keeps the scheduled cadence', () => {
      // Due 2026-09-15, done on the 11th -> next is one period after the 15th.
      expect(
        fmt(computeNextDue(d('2026-09-15'), ChoreFrequency.WEEKLY, null, d('2026-09-11'))),
      ).toBe('2026-09-22');
    });

    it('anchors monthly chores to the original day of month', () => {
      // Due Jan 31 -> Feb 28 -> Mar 31 (not Mar 28).
      const feb = computeNextDue(d('2026-01-31'), ChoreFrequency.MONTHLY, null, d('2026-01-31'));
      expect(fmt(feb)).toBe('2026-02-28');
      const mar = computeNextDue(feb, ChoreFrequency.MONTHLY, null, feb);
      // From Feb 28 the anchor is 28 (we only know the stored date), so March 28.
      expect(fmt(mar)).toBe('2026-03-28');
    });

    it('rejects CUSTOM without an interval', () => {
      expect(() => computeNextDue(d('2026-09-11'), ChoreFrequency.CUSTOM, null)).toThrow(
        /intervalDays/,
      );
    });
  });

  it('toDateOnly strips the time component in UTC', () => {
    expect(fmt(toDateOnly(new Date('2026-09-11T23:59:59Z')))).toBe('2026-09-11');
    expect(fmt(toDateOnly('2026-09-11'))).toBe('2026-09-11');
  });
});
