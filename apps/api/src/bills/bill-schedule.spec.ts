import { BillFrequency } from '@prisma/client';
import { formatDateOnly, toDateOnly } from '../chores/recurrence';
import { advanceBillDue, billUrgency } from './bill-schedule';

const d = (iso: string) => toDateOnly(new Date(`${iso}T00:00:00Z`));
const fmt = formatDateOnly;

describe('advanceBillDue', () => {
  it('advances by exactly one period', () => {
    expect(fmt(advanceBillDue(d('2026-09-15'), BillFrequency.WEEKLY))).toBe('2026-09-22');
    expect(fmt(advanceBillDue(d('2026-09-15'), BillFrequency.MONTHLY))).toBe('2026-10-15');
    expect(fmt(advanceBillDue(d('2026-09-15'), BillFrequency.YEARLY))).toBe('2027-09-15');
  });

  it('does not skip missed periods', () => {
    // April rent paid in June: next due is May, still overdue.
    expect(fmt(advanceBillDue(d('2026-04-01'), BillFrequency.MONTHLY))).toBe('2026-05-01');
  });

  it('leaves ONE_TIME bills where they are', () => {
    expect(fmt(advanceBillDue(d('2026-09-15'), BillFrequency.ONE_TIME))).toBe('2026-09-15');
  });

  it('clamps month ends and restores the anchor day', () => {
    expect(fmt(advanceBillDue(d('2026-01-31'), BillFrequency.MONTHLY, 31))).toBe('2026-02-28');
    expect(fmt(advanceBillDue(d('2026-02-28'), BillFrequency.MONTHLY, 31))).toBe('2026-03-31');
    expect(fmt(advanceBillDue(d('2026-04-30'), BillFrequency.MONTHLY, 31))).toBe('2026-05-31');
  });

  it('handles leap days yearly', () => {
    expect(fmt(advanceBillDue(d('2028-02-29'), BillFrequency.YEARLY, 29))).toBe('2029-02-28');
    expect(fmt(advanceBillDue(d('2029-02-28'), BillFrequency.YEARLY, 29))).toBe('2030-02-28');
  });
});

describe('billUrgency', () => {
  it('classifies by days until due', () => {
    expect(billUrgency(true, -1)).toBe('OVERDUE');
    expect(billUrgency(true, 0)).toBe('DUE_SOON');
    expect(billUrgency(true, 7)).toBe('DUE_SOON');
    expect(billUrgency(true, 8)).toBe('UPCOMING');
    expect(billUrgency(false, -30)).toBe('INACTIVE');
  });
});
