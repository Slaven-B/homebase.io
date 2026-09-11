import { SplitMethod } from '@prisma/client';

/**
 * Pure money arithmetic on integer cents. No floats leave this module except
 * the informational `percent` values.
 */

export interface ParticipantInput {
  userId: string;
  /** CUSTOM: the participant's share in cents. */
  amountCents?: number | null;
  /** PERCENTAGE: the participant's share in percent (0-100, up to 2 decimals). */
  percent?: number | null;
}

export interface ComputedSplit {
  userId: string;
  amountCents: number;
  percent: number | null;
}

export class SplitError extends Error {}

/** Decimal amount (e.g. 84.5) -> cents, rejecting more than 2 decimals. */
export function toCents(amount: number): number {
  if (!Number.isFinite(amount)) throw new SplitError('Amount must be a number');
  const cents = Math.round(amount * 100);
  if (Math.abs(amount * 100 - cents) > 1e-6) {
    throw new SplitError('Amount can have at most 2 decimal places');
  }
  return cents;
}

export function fromCents(cents: number): number {
  return cents / 100;
}

/**
 * Splits `totalCents` between participants according to `method`.
 * Result always sums exactly to `totalCents` and preserves participant order.
 */
export function computeSplits(
  totalCents: number,
  method: SplitMethod,
  participants: ParticipantInput[],
): ComputedSplit[] {
  if (!Number.isInteger(totalCents) || totalCents <= 0) {
    throw new SplitError('Amount must be a positive number');
  }
  if (participants.length === 0) {
    throw new SplitError('At least one participant is required');
  }
  const ids = new Set(participants.map((p) => p.userId));
  if (ids.size !== participants.length) {
    throw new SplitError('Each participant may appear only once');
  }

  switch (method) {
    case SplitMethod.EQUAL:
      return splitEqual(totalCents, participants);
    case SplitMethod.CUSTOM:
      return splitCustom(totalCents, participants);
    case SplitMethod.PERCENTAGE:
      return splitPercentage(totalCents, participants);
  }
}

function splitEqual(totalCents: number, participants: ParticipantInput[]): ComputedSplit[] {
  const n = participants.length;
  const base = Math.floor(totalCents / n);
  let remainder = totalCents - base * n;
  return participants.map((p) => {
    const extra = remainder > 0 ? 1 : 0;
    remainder -= extra;
    return { userId: p.userId, amountCents: base + extra, percent: null };
  });
}

function splitCustom(totalCents: number, participants: ParticipantInput[]): ComputedSplit[] {
  const splits = participants.map((p) => {
    const cents = p.amountCents;
    if (cents === undefined || cents === null || !Number.isInteger(cents) || cents < 0) {
      throw new SplitError('Each participant needs a non-negative amount');
    }
    return { userId: p.userId, amountCents: cents, percent: null };
  });
  const sum = splits.reduce((acc, s) => acc + s.amountCents, 0);
  if (sum !== totalCents) {
    throw new SplitError(
      `Shares add up to ${fromCents(sum).toFixed(2)} but the expense is ${fromCents(totalCents).toFixed(2)}`,
    );
  }
  return splits;
}

/** Largest-remainder rounding: exact total, at most 1 cent off per participant. */
function splitPercentage(totalCents: number, participants: ParticipantInput[]): ComputedSplit[] {
  const percents = participants.map((p) => {
    const pct = p.percent;
    if (pct === undefined || pct === null || !Number.isFinite(pct) || pct < 0) {
      throw new SplitError('Each participant needs a percentage');
    }
    return pct;
  });
  const totalPct = percents.reduce((a, b) => a + b, 0);
  if (Math.abs(totalPct - 100) > 0.01) {
    throw new SplitError(`Percentages add up to ${totalPct.toFixed(2)}%, not 100%`);
  }

  const exact = percents.map((pct) => (totalCents * pct) / 100);
  const floors = exact.map((v) => Math.floor(v + 1e-9));
  let remainder = totalCents - floors.reduce((a, b) => a + b, 0);

  const order = exact
    .map((v, i) => ({ i, frac: v - Math.floor(v + 1e-9) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (remainder <= 0) break;
    floors[i] += 1;
    remainder -= 1;
  }

  return participants.map((p, i) => ({
    userId: p.userId,
    amountCents: floors[i],
    percent: percents[i],
  }));
}

// ---------------------------------------------------------------------------
// Balances
// ---------------------------------------------------------------------------

export interface LedgerEntry {
  currency: string;
  paidById: string;
  splits: { userId: string; amountCents: number }[];
}

export interface SettlementEntry {
  currency: string;
  fromUserId: string;
  toUserId: string;
  amountCents: number;
}

export interface Transfer {
  fromUserId: string;
  toUserId: string;
  amountCents: number;
}

/**
 * Net position per user per currency. Positive = is owed money, negative = owes.
 * Paying an expense credits the payer; being a participant debits the share.
 * A settlement from A to B credits A and debits B.
 */
export function computeNetBalances(
  expenses: LedgerEntry[],
  settlements: SettlementEntry[],
): Map<string, Map<string, number>> {
  const byCurrency = new Map<string, Map<string, number>>();
  const add = (currency: string, userId: string, cents: number) => {
    let m = byCurrency.get(currency);
    if (!m) {
      m = new Map();
      byCurrency.set(currency, m);
    }
    m.set(userId, (m.get(userId) ?? 0) + cents);
  };

  for (const e of expenses) {
    const total = e.splits.reduce((a, s) => a + s.amountCents, 0);
    add(e.currency, e.paidById, total);
    for (const s of e.splits) add(e.currency, s.userId, -s.amountCents);
  }
  for (const s of settlements) {
    add(s.currency, s.fromUserId, s.amountCents);
    add(s.currency, s.toUserId, -s.amountCents);
  }
  return byCurrency;
}

/**
 * Greedy debt simplification: repeatedly match the largest debtor with the
 * largest creditor. Produces at most (n - 1) transfers.
 */
export function simplifyDebts(net: Map<string, number>): Transfer[] {
  const debtors = [...net.entries()]
    .filter(([, v]) => v < 0)
    .map(([userId, v]) => ({ userId, cents: -v }))
    .sort((a, b) => b.cents - a.cents || a.userId.localeCompare(b.userId));
  const creditors = [...net.entries()]
    .filter(([, v]) => v > 0)
    .map(([userId, v]) => ({ userId, cents: v }))
    .sort((a, b) => b.cents - a.cents || a.userId.localeCompare(b.userId));

  const transfers: Transfer[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amount = Math.min(debtors[i].cents, creditors[j].cents);
    if (amount > 0) {
      transfers.push({
        fromUserId: debtors[i].userId,
        toUserId: creditors[j].userId,
        amountCents: amount,
      });
    }
    debtors[i].cents -= amount;
    creditors[j].cents -= amount;
    if (debtors[i].cents === 0) i++;
    if (creditors[j].cents === 0) j++;
  }
  return transfers;
}
