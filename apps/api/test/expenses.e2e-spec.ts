import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

interface Session {
  token: string;
  email: string;
  userId: string;
}

const today = new Date().toISOString().slice(0, 10);
const thisMonth = today.slice(0, 7);

describe('Expenses, balances & settlements (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const runId = Date.now().toString(36);
  const email = (name: string) => `${name}-${runId}@e2e.local`;
  const password = 'a-long-enough-password';
  const auth = (s: Session) => ({ Authorization: `Bearer ${s.token}` });

  let john: Session;
  let sarah: Session;
  let mike: Session;
  let outsider: Session;
  let householdId: string;
  let base: string;

  async function signUp(name: string): Promise<Session> {
    const res = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: email(name), password, displayName: name })
      .expect(201);
    return { token: res.body.accessToken, email: email(name), userId: res.body.user.id };
  }

  async function join(inviter: Session, invitee: Session) {
    const inv = await request(app.getHttpServer())
      .post(`/api/households/${householdId}/invitations`)
      .set(auth(inviter))
      .send({ email: invitee.email })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/invitations/${inv.body.token}/accept`)
      .set(auth(invitee))
      .expect(200);
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
    prisma = app.get(PrismaService);

    [john, sarah, mike, outsider] = await Promise.all([
      signUp('john'),
      signUp('sarah'),
      signUp('mike'),
      signUp('ex-outsider'),
    ]);
    const created = await request(app.getHttpServer())
      .post('/api/households')
      .set(auth(john))
      .send({ name: 'Expense House' })
      .expect(201);
    householdId = created.body.id;
    base = `/api/households/${householdId}`;
    await join(john, sarah);
    await join(john, mike);
  });

  afterAll(async () => {
    await prisma.household.deleteMany({
      where: { members: { some: { user: { email: { endsWith: `-${runId}@e2e.local` } } } } },
    });
    await prisma.user.deleteMany({ where: { email: { endsWith: `-${runId}@e2e.local` } } });
    await app.close();
  });

  describe('creating expenses', () => {
    it('EQUAL split: groceries €84.50 paid by John, split with Sarah', async () => {
      const res = await request(app.getHttpServer())
        .post(`${base}/expenses`)
        .set(auth(john))
        .send({
          description: 'Groceries',
          amount: 84.5,
          paidById: john.userId,
          splitMethod: 'EQUAL',
          category: 'Groceries',
          participants: [{ userId: john.userId }, { userId: sarah.userId }],
        })
        .expect(201);

      expect(res.body).toMatchObject({
        description: 'Groceries',
        amountCents: 8450,
        currency: 'EUR',
        date: today,
        splitMethod: 'EQUAL',
        paidBy: { id: john.userId },
        myShareCents: 4225,
      });
      expect(res.body.splits.map((s: { amountCents: number }) => s.amountCents)).toEqual([
        4225, 4225,
      ]);
    });

    it('PERCENTAGE split: €100 50/30/20', async () => {
      const res = await request(app.getHttpServer())
        .post(`${base}/expenses`)
        .set(auth(sarah))
        .send({
          description: 'Dinner',
          amount: 100,
          paidById: john.userId,
          splitMethod: 'PERCENTAGE',
          participants: [
            { userId: john.userId, percent: 50 },
            { userId: sarah.userId, percent: 30 },
            { userId: mike.userId, percent: 20 },
          ],
        })
        .expect(201);
      const byUser = Object.fromEntries(
        res.body.splits.map((s: { user: { id: string }; amountCents: number }) => [
          s.user.id,
          s.amountCents,
        ]),
      );
      expect(byUser).toEqual({ [john.userId]: 5000, [sarah.userId]: 3000, [mike.userId]: 2000 });
    });

    it('CUSTOM split must add up; percentages must total 100', async () => {
      await request(app.getHttpServer())
        .post(`${base}/expenses`)
        .set(auth(john))
        .send({
          description: 'Bad custom',
          amount: 50,
          paidById: john.userId,
          splitMethod: 'CUSTOM',
          participants: [
            { userId: john.userId, amount: 20 },
            { userId: sarah.userId, amount: 20 },
          ],
        })
        .expect(400);
      await request(app.getHttpServer())
        .post(`${base}/expenses`)
        .set(auth(john))
        .send({
          description: 'Bad pct',
          amount: 50,
          paidById: john.userId,
          splitMethod: 'PERCENTAGE',
          participants: [
            { userId: john.userId, percent: 60 },
            { userId: sarah.userId, percent: 30 },
          ],
        })
        .expect(400);
    });

    it('rejects non-member payers/participants, bad amounts and unknown fields', async () => {
      const valid = {
        description: 'x',
        amount: 10,
        paidById: john.userId,
        splitMethod: 'EQUAL',
        participants: [{ userId: john.userId }],
      };
      await request(app.getHttpServer())
        .post(`${base}/expenses`)
        .set(auth(john))
        .send({ ...valid, paidById: outsider.userId })
        .expect(400);
      await request(app.getHttpServer())
        .post(`${base}/expenses`)
        .set(auth(john))
        .send({ ...valid, participants: [{ userId: outsider.userId }] })
        .expect(400);
      await request(app.getHttpServer())
        .post(`${base}/expenses`)
        .set(auth(john))
        .send({ ...valid, amount: 10.005 })
        .expect(400);
      await request(app.getHttpServer())
        .post(`${base}/expenses`)
        .set(auth(john))
        .send({ ...valid, amount: -5 })
        .expect(400);
      await request(app.getHttpServer())
        .post(`${base}/expenses`)
        .set(auth(john))
        .send({ ...valid, householdId: 'other' })
        .expect(400);
    });

    it('lists with month filter and totals; outsiders get 404', async () => {
      const res = await request(app.getHttpServer())
        .get(`${base}/expenses?month=${thisMonth}`)
        .set(auth(mike))
        .expect(200);
      expect(res.body.items).toHaveLength(2);
      expect(res.body.totals).toEqual([{ currency: 'EUR', amountCents: 18450 }]);
      expect(res.body.items[0].myShareCents).toBeDefined();

      const empty = await request(app.getHttpServer())
        .get(`${base}/expenses?month=2000-01`)
        .set(auth(mike))
        .expect(200);
      expect(empty.body.items).toEqual([]);
      expect(empty.body.totals).toEqual([]);

      await request(app.getHttpServer()).get(`${base}/expenses`).set(auth(outsider)).expect(404);
      await request(app.getHttpServer())
        .get(`${base}/expenses?month=2026-13`)
        .set(auth(mike))
        .expect(400);
    });
  });

  describe('balances', () => {
    it('computes net positions and the simplified who-owes-whom', async () => {
      // Groceries: John paid 84.50, John/Sarah 42.25 each -> Sarah owes John 42.25
      // Dinner: John paid 100, John 50 / Sarah 30 / Mike 20 -> Sarah owes 30, Mike owes 20
      const res = await request(app.getHttpServer())
        .get(`${base}/balances`)
        .set(auth(john))
        .expect(200);

      expect(res.body).toHaveLength(1);
      const eur = res.body[0];
      expect(eur.currency).toBe('EUR');
      const net = Object.fromEntries(
        eur.members.map((m: { user: { id: string }; netCents: number }) => [m.user.id, m.netCents]),
      );
      expect(net).toEqual({ [john.userId]: 9225, [sarah.userId]: -7225, [mike.userId]: -2000 });
      expect(eur.transfers).toEqual([
        {
          from: { id: sarah.userId, displayName: 'sarah' },
          to: { id: john.userId, displayName: 'john' },
          amountCents: 7225,
        },
        {
          from: { id: mike.userId, displayName: 'mike' },
          to: { id: john.userId, displayName: 'john' },
          amountCents: 2000,
        },
      ]);
      expect(eur.outstandingCents).toBe(9225);
      expect(eur.myNetCents).toBe(9225);

      const asSarah = await request(app.getHttpServer())
        .get(`${base}/balances`)
        .set(auth(sarah))
        .expect(200);
      expect(asSarah.body[0].myNetCents).toBe(-7225);
    });

    it('settlements reduce the debt and show in the feed', async () => {
      const settle = await request(app.getHttpServer())
        .post(`${base}/settlements`)
        .set(auth(mike))
        .send({ toUserId: john.userId, amount: 20, note: 'cash' })
        .expect(201);
      expect(settle.body).toMatchObject({
        from: { id: mike.userId },
        to: { id: john.userId },
        amountCents: 2000,
        currency: 'EUR',
      });

      const res = await request(app.getHttpServer())
        .get(`${base}/balances`)
        .set(auth(john))
        .expect(200);
      const net = Object.fromEntries(
        res.body[0].members.map((m: { user: { id: string }; netCents: number }) => [
          m.user.id,
          m.netCents,
        ]),
      );
      expect(net[mike.userId]).toBe(0);
      expect(net[john.userId]).toBe(7225);
      expect(res.body[0].transfers).toHaveLength(1);

      const feed = await request(app.getHttpServer())
        .get(`${base}/activity?limit=1`)
        .set(auth(john))
        .expect(200);
      expect(feed.body.items[0]).toMatchObject({
        action: 'settlement.recorded',
        metadata: { fromName: 'mike', toName: 'john', amountCents: 2000 },
      });
    });

    it('only admins can record settlements for others; self-settlement is rejected', async () => {
      await request(app.getHttpServer())
        .post(`${base}/settlements`)
        .set(auth(mike))
        .send({ fromUserId: sarah.userId, toUserId: john.userId, amount: 5 })
        .expect(403);
      await request(app.getHttpServer())
        .post(`${base}/settlements`)
        .set(auth(john))
        .send({ fromUserId: sarah.userId, toUserId: john.userId, amount: 5 })
        .expect(201);
      await request(app.getHttpServer())
        .post(`${base}/settlements`)
        .set(auth(john))
        .send({ toUserId: john.userId, amount: 5 })
        .expect(400);
      await request(app.getHttpServer())
        .post(`${base}/settlements`)
        .set(auth(john))
        .send({ toUserId: outsider.userId, amount: 5 })
        .expect(400);

      const list = await request(app.getHttpServer())
        .get(`${base}/settlements`)
        .set(auth(sarah))
        .expect(200);
      expect(list.body).toHaveLength(2);
    });

    it('dashboard finances reflect this month and the viewer position', async () => {
      const dash = await request(app.getHttpServer())
        .get(`${base}/dashboard`)
        .set(auth(sarah))
        .expect(200);
      expect(dash.body.finances).toMatchObject({
        month: thisMonth,
        currency: 'EUR',
        sharedExpensesCents: 18450,
        billsCents: 0,
        myNetCents: -6725,
      });
      expect(dash.body.finances.outstandingCents).toBe(6725);
    });
  });

  describe('editing and deleting', () => {
    let expenseId: string;

    beforeAll(async () => {
      const res = await request(app.getHttpServer())
        .post(`${base}/expenses`)
        .set(auth(sarah))
        .send({
          description: 'Cleaning supplies',
          amount: 30,
          paidById: sarah.userId,
          splitMethod: 'EQUAL',
          participants: [
            { userId: sarah.userId },
            { userId: mike.userId },
            { userId: john.userId },
          ],
        })
        .expect(201);
      expenseId = res.body.id;
      expect(res.body.splits.map((s: { amountCents: number }) => s.amountCents)).toEqual([
        1000, 1000, 1000,
      ]);
    });

    it('PUT replaces the expense and its splits atomically', async () => {
      const res = await request(app.getHttpServer())
        .put(`${base}/expenses/${expenseId}`)
        .set(auth(sarah))
        .send({
          description: 'Cleaning supplies (fixed)',
          amount: 31,
          paidById: sarah.userId,
          splitMethod: 'CUSTOM',
          participants: [
            { userId: sarah.userId, amount: 11 },
            { userId: mike.userId, amount: 20 },
          ],
        })
        .expect(200);
      expect(res.body.amountCents).toBe(3100);
      expect(res.body.splits).toHaveLength(2);

      const splitRows = await prisma.expenseSplit.count({ where: { expenseId } });
      expect(splitRows).toBe(2);
    });

    it('a member who is neither creator nor payer cannot edit or delete', async () => {
      // mike is a participant only; expense created and paid by sarah
      await request(app.getHttpServer())
        .delete(`${base}/expenses/${expenseId}`)
        .set(auth(mike))
        .expect(403);
      // john is OWNER (admin) -> allowed
      await request(app.getHttpServer())
        .delete(`${base}/expenses/${expenseId}`)
        .set(auth(john))
        .expect(204);
      await request(app.getHttpServer())
        .get(`${base}/expenses/${expenseId}`)
        .set(auth(john))
        .expect(404);
    });

    it('an expense cannot be reached through another household', async () => {
      const other = await request(app.getHttpServer())
        .post('/api/households')
        .set(auth(outsider))
        .send({ name: 'Other' })
        .expect(201);
      const mine = await request(app.getHttpServer())
        .get(`${base}/expenses`)
        .set(auth(john))
        .expect(200);
      await request(app.getHttpServer())
        .get(`/api/households/${other.body.id}/expenses/${mine.body.items[0].id}`)
        .set(auth(outsider))
        .expect(404);
    });
  });
});
