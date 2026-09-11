import { ChoreFrequency } from '@prisma/client';

/**
 * Date-only helpers. Chore due dates are calendar dates (Prisma `@db.Date`),
 * represented as JS Dates at 00:00:00 UTC. All arithmetic happens in UTC so
 * results never shift with the server's time zone or DST.
 */

export function toDateOnly(input: Date | string): Date {
  const d = typeof input === 'string' ? new Date(input) : input;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function todayUtc(now: Date = new Date()): Date {
  return toDateOnly(now);
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

/** Adds calendar months, clamping to the last day of the target month (Jan 31 → Feb 28/29). */
export function addMonths(date: Date, months: number): Date {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + months;
  const day = date.getUTCDate();
  const lastDayOfTarget = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(day, lastDayOfTarget)));
}

export function intervalInDays(frequency: ChoreFrequency, intervalDays?: number | null): number {
  switch (frequency) {
    case ChoreFrequency.DAILY:
      return 1;
    case ChoreFrequency.WEEKLY:
      return 7;
    case ChoreFrequency.BIWEEKLY:
      return 14;
    case ChoreFrequency.CUSTOM:
      if (!intervalDays || intervalDays < 1) {
        throw new Error('CUSTOM frequency requires intervalDays >= 1');
      }
      return intervalDays;
    case ChoreFrequency.MONTHLY:
      throw new Error('MONTHLY is calendar based, use advance()');
  }
}

/** One step forward from `date` according to the frequency. */
export function advance(
  date: Date,
  frequency: ChoreFrequency,
  intervalDays?: number | null,
  /** Day-of-month to anchor monthly recurrence on (keeps the 31st from drifting to the 28th). */
  anchorDay?: number,
): Date {
  if (frequency === ChoreFrequency.MONTHLY) {
    const next = addMonths(date, 1);
    if (anchorDay && anchorDay > next.getUTCDate()) {
      const lastDay = new Date(
        Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0),
      ).getUTCDate();
      return new Date(
        Date.UTC(next.getUTCFullYear(), next.getUTCMonth(), Math.min(anchorDay, lastDay)),
      );
    }
    return next;
  }
  return addDays(date, intervalInDays(frequency, intervalDays));
}

/**
 * Next due date after completing/skipping a chore that was scheduled for `currentDue`.
 *
 * The schedule is anchored on the scheduled date, not on when someone got around to it,
 * so a weekly chore stays on the same weekday. If the chore was overdue by more than one
 * period, missed periods are skipped so the result is always after `today`.
 */
export function computeNextDue(
  currentDue: Date,
  frequency: ChoreFrequency,
  intervalDays?: number | null,
  today: Date = todayUtc(),
): Date {
  const anchorDay = frequency === ChoreFrequency.MONTHLY ? currentDue.getUTCDate() : undefined;
  let next = advance(toDateOnly(currentDue), frequency, intervalDays, anchorDay);
  const limit = toDateOnly(today);
  // Guard against runaway loops with an upper bound far beyond any realistic backlog.
  for (let i = 0; i < 10_000 && next.getTime() <= limit.getTime(); i++) {
    next = advance(next, frequency, intervalDays, anchorDay);
  }
  return next;
}

/** YYYY-MM-DD for API responses. */
export function formatDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}
