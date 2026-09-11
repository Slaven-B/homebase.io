import { SplitMethod } from '@prisma/client';
import { computeNetBalances, computeSplits, simplifyDebts, toCents } from './money';

const sum = (splits: { amountCents: number }[]) => splits.reduce((a, s) => a + s.amountCents, 0);

describe('toCents', () => {
  it('converts decimals exactly', () => {
    expect(toCents(84.5)).toBe(8450);
    expect(toCents(0.1 + 0.2)).toBe(30); // float noise tolerated
    expect(toCents(1234.56)).toBe(123456);
  });

  it('rejects more than two decimals and non-numbers', () => {
    expect(() => toCents(1.005)).toThrow(/2 decimal/);
    expect(() => toCents(Number.NaN)).toThrow();
  });
});

describe('computeSplits', () => {
  const p = (ids: string[]) => ids.map((userId) => ({ userId }));

  describe('EQUAL', () => {
    it('splits evenly', () => {
      expect(computeSplits(8450, SplitMethod.EQUAL, p(['a', 'b']))).toEqual([
        { userId: 'a', amountCents: 4225, percent: null },
        { userId: 'b', amountCents: 4225, percent: null },
      ]);
    });

    it('gives leftover cents to the first participants, total stays exact', () => {
      const splits = computeSplits(10000, SplitMethod.EQUAL, p(['a', 'b', 'c']));
      expect(splits.map((s) => s.amountCents)).toEqual([3334, 3333, 3333]);
      expect(sum(splits)).toBe(10000);

      const seven = computeSplits(100, SplitMethod.EQUAL, p(['a', 'b', 'c', 'd', 'e', 'f', 'g']));
      expect(seven.map((s) => s.amountCents)).toEqual([15, 15, 14, 14, 14, 14, 14]);
      expect(sum(seven)).toBe(100);
    });

    it('handles a single participant', () => {
      expect(computeSplits(999, SplitMethod.EQUAL, p(['a']))).toEqual([
        { userId: 'a', amountCents: 999, percent: null },
      ]);
    });
  });

  describe('PERCENTAGE', () => {
    it('applies percentages exactly', () => {
      const splits = computeSplits(10000, SplitMethod.PERCENTAGE, [
        { userId: 'john', percent: 50 },
        { userId: 'sarah', percent: 30 },
        { userId: 'mike', percent: 20 },
      ]);
      expect(splits.map((s) => s.amountCents)).toEqual([5000, 3000, 2000]);
      expect(splits[0].percent).toBe(50);
    });

    it('uses largest-remainder rounding so cents always add up', () => {
      const splits = computeSplits(1000, SplitMethod.PERCENTAGE, [
        { userId: 'a', percent: 33.33 },
        { userId: 'b', percent: 33.33 },
        { userId: 'c', percent: 33.34 },
      ]);
      expect(sum(splits)).toBe(1000);
      expect(splits.map((s) => s.amountCents)).toEqual([333, 333, 334]);

      const odd = computeSplits(101, SplitMethod.PERCENTAGE, [
        { userId: 'a', percent: 50 },
        { userId: 'b', percent: 50 },
      ]);
      expect(odd.map((s) => s.amountCents)).toEqual([51, 50]);
    });

    it('rejects percentages that do not total 100', () => {
      expect(() =>
        computeSplits(1000, SplitMethod.PERCENTAGE, [
          { userId: 'a', percent: 60 },
          { userId: 'b', percent: 30 },
        ]),
      ).toThrow(/90.00%/);
    });

    it('allows a zero-percent participant', () => {
      const splits = computeSplits(1000, SplitMethod.PERCENTAGE, [
        { userId: 'a', percent: 100 },
        { userId: 'b', percent: 0 },
      ]);
      expect(splits.map((s) => s.amountCents)).toEqual([1000, 0]);
    });
  });

  describe('CUSTOM', () => {
    it('accepts shares that add up exactly', () => {
      const splits = computeSplits(8450, SplitMethod.CUSTOM, [
        { userId: 'a', amountCents: 6000 },
        { userId: 'b', amountCents: 2450 },
      ]);
      expect(sum(splits)).toBe(8450);
    });

    it('rejects shares that do not add up', () => {
      expect(() =>
        computeSplits(8450, SplitMethod.CUSTOM, [
          { userId: 'a', amountCents: 6000 },
          { userId: 'b', amountCents: 2000 },
        ]),
      ).toThrow(/add up to 80.00/);
    });

    it('rejects negative or missing shares', () => {
      expect(() =>
        computeSplits(100, SplitMethod.CUSTOM, [{ userId: 'a', amountCents: -1 }, { userId: 'b' }]),
      ).toThrow(/non-negative/);
    });
  });

  it('rejects duplicates, empty participants and non-positive totals', () => {
    expect(() => computeSplits(100, SplitMethod.EQUAL, p(['a', 'a']))).toThrow(/only once/);
    expect(() => computeSplits(100, SplitMethod.EQUAL, [])).toThrow(/At least one/);
    expect(() => computeSplits(0, SplitMethod.EQUAL, p(['a']))).toThrow(/positive/);
    expect(() => computeSplits(10.5, SplitMethod.EQUAL, p(['a']))).toThrow(/positive/);
  });
});

describe('computeNetBalances', () => {
  it('credits the payer and debits participants, per currency', () => {
    const net = computeNetBalances(
      [
        {
          currency: 'EUR',
          paidById: 'john',
          splits: [
            { userId: 'john', amountCents: 4225 },
            { userId: 'sarah', amountCents: 4225 },
          ],
        },
        {
          currency: 'EUR',
          paidById: 'sarah',
          splits: [
            { userId: 'john', amountCents: 720 },
            { userId: 'sarah', amountCents: 720 },
          ],
        },
        { currency: 'USD', paidById: 'mike', splits: [{ userId: 'john', amountCents: 500 }] },
      ],
      [],
    );
    expect(net.get('EUR')?.get('john')).toBe(4225 - 720);
    expect(net.get('EUR')?.get('sarah')).toBe(720 - 4225);
    expect(net.get('USD')?.get('mike')).toBe(500);
    expect(net.get('USD')?.get('john')).toBe(-500);
  });

  it('settlements reduce the debt', () => {
    const net = computeNetBalances(
      [
        {
          currency: 'EUR',
          paidById: 'john',
          splits: [
            { userId: 'john', amountCents: 5000 },
            { userId: 'sarah', amountCents: 5000 },
          ],
        },
      ],
      [{ currency: 'EUR', fromUserId: 'sarah', toUserId: 'john', amountCents: 2000 }],
    );
    expect(net.get('EUR')?.get('sarah')).toBe(-3000);
    expect(net.get('EUR')?.get('john')).toBe(3000);
  });

  it('nets to zero across a household', () => {
    const net = computeNetBalances(
      [
        {
          currency: 'EUR',
          paidById: 'a',
          splits: [
            { userId: 'a', amountCents: 3334 },
            { userId: 'b', amountCents: 3333 },
            { userId: 'c', amountCents: 3333 },
          ],
        },
      ],
      [],
    );
    const total = [...net.get('EUR')!.values()].reduce((x, y) => x + y, 0);
    expect(total).toBe(0);
  });
});

describe('simplifyDebts', () => {
  it('collapses a chain into the minimum transfers', () => {
    // a is owed 50, b is owed 20, c owes 70
    const transfers = simplifyDebts(
      new Map([
        ['a', 5000],
        ['b', 2000],
        ['c', -7000],
      ]),
    );
    expect(transfers).toEqual([
      { fromUserId: 'c', toUserId: 'a', amountCents: 5000 },
      { fromUserId: 'c', toUserId: 'b', amountCents: 2000 },
    ]);
  });

  it('matches largest debtor with largest creditor first', () => {
    const transfers = simplifyDebts(
      new Map([
        ['john', 6050],
        ['sarah', -4250],
        ['mike', -1800],
      ]),
    );
    expect(transfers).toEqual([
      { fromUserId: 'sarah', toUserId: 'john', amountCents: 4250 },
      { fromUserId: 'mike', toUserId: 'john', amountCents: 1800 },
    ]);
  });

  it('returns nothing when everyone is settled', () => {
    expect(simplifyDebts(new Map([['a', 0]]))).toEqual([]);
    expect(simplifyDebts(new Map())).toEqual([]);
  });

  it('never produces more than n-1 transfers', () => {
    const net = new Map<string, number>([
      ['a', 1000],
      ['b', 900],
      ['c', -500],
      ['d', -700],
      ['e', -700],
    ]);
    const transfers = simplifyDebts(net);
    expect(transfers.length).toBeLessThanOrEqual(4);
    const check = new Map<string, number>();
    for (const t of transfers) {
      check.set(t.fromUserId, (check.get(t.fromUserId) ?? 0) - t.amountCents);
      check.set(t.toUserId, (check.get(t.toUserId) ?? 0) + t.amountCents);
    }
    for (const [user, cents] of net) expect(check.get(user) ?? 0).toBe(cents);
  });
});
