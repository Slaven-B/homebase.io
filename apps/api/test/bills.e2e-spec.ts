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
const daysFromToday = (n: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const addMonthsIso = (iso: string, months: number) => {
  const [y, m, d] = iso.split('-').map(Number);
  const last = new Date(Date.UTC(y, m - 1 + months + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m - 1 + months, Math.min(d, last))).toISOString().slice(0, 10);
};

describe('Bills (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const runId = Date.now().toString(36);
  const email = (name: string) => `${name}-${runId}@e2e.local`;
  const password = 'a-long-enough-password';
  const auth = (s: Session) => ({ Authorization: `Bearer ${s.token}` });

  let owner: Session;
  let member: Session;
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

    [owner, member, outsider] = await Promise.all([
      signUp('bill-owner'),
      signUp('bill-member'),
      signUp('bill-outsider'),
    ]);
    const created = await request(app.getHttpServer())
      .post('/api/households')
      .set(auth(owner))
      .send({ name: 'Bills House' })
      .expect(201);
    householdId = created.body.id;
    base = `/api/households/${householdId}/bills`;

    const inv = await request(app.getHttpServer())
      .post(`/api/households/${householdId}/invitations`)
      .set(auth(owner))
      .send({ email: member.email })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/invitations/${inv.body.token}/accept`)
      .set(auth(member))
      .expect(200);
  });

  afterAll(async () => {
    await prisma.household.deleteMany({
      where: { members: { some: { user: { email: { endsWith: `-${runId}@e2e.local` } } } } },
    });
    await prisma.user.deleteMany({ where: { email: { endsWith: `-${runId}@e2e.local` } } });
    await app.close();
  });

  let internetId: string;

  it('creates a monthly bill with a responsible member', async () => {
    const res = await request(app.getHttpServer())
      .post(base)
      .set(auth(owner))
      .send({
        name: 'Internet',
        amount: 35,
        dueDate: daysFromToday(3),
        frequency: 'MONTHLY',
        responsibleId: member.userId,
        category: 'Utilities',
      })
      .expect(201);
    internetId = res.body.id;
    expect(res.body).toMatchObject({
      name: 'Internet',
      amountCents: 3500,
      currency: 'EUR',
      dueDate: daysFromToday(3),
      dueInDays: 3,
      urgency: 'DUE_SOON',
      frequency: 'MONTHLY',
      isActive: true,
      responsible: { id: member.userId },
      payments: [],
    });
  });

  it('validates input: non-member responsible, bad amount, unknown fields', async () => {
    const valid = { name: 'x', amount: 10, dueDate: today, frequency: 'WEEKLY' };
    await request(app.getHttpServer())
      .post(base)
      .set(auth(owner))
      .send({ ...valid, responsibleId: outsider.userId })
      .expect(400);
    await request(app.getHttpServer())
      .post(base)
      .set(auth(owner))
      .send({ ...valid, amount: 10.001 })
      .expect(400);
    await request(app.getHttpServer())
      .post(base)
      .set(auth(owner))
      .send({ ...valid, dueDate: 'soon' })
      .expect(400);
    await request(app.getHttpServer())
      .post(base)
      .set(auth(owner))
      .send({ ...valid, isActive: false })
      .expect(400);
  });

  it('classifies urgency and lists active bills by due date', async () => {
    await request(app.getHttpServer())
      .post(base)
      .set(auth(member))
      .send({ name: 'Rent', amount: 850, dueDate: daysFromToday(20), frequency: 'MONTHLY' })
      .expect(201);
    await request(app.getHttpServer())
      .post(base)
      .set(auth(member))
      .send({ name: 'Old gas', amount: 60, dueDate: daysFromToday(-5), frequency: 'ONE_TIME' })
      .expect(201);

    const res = await request(app.getHttpServer()).get(base).set(auth(owner)).expect(200);
    expect(res.body.map((b: { name: string; urgency: string }) => [b.name, b.urgency])).toEqual([
      ['Old gas', 'OVERDUE'],
      ['Internet', 'DUE_SOON'],
      ['Rent', 'UPCOMING'],
    ]);
  });

  it('paying a monthly bill records history and advances exactly one month', async () => {
    const res = await request(app.getHttpServer())
      .post(`${base}/${internetId}/pay`)
      .set(auth(member))
      .send({ note: 'paid online' })
      .expect(200);

    expect(res.body.dueDate).toBe(addMonthsIso(daysFromToday(3), 1));
    expect(res.body.isActive).toBe(true);
    expect(res.body.lastPaidAt).toBeTruthy();
    expect(res.body.payments).toHaveLength(1);
    expect(res.body.payments[0]).toMatchObject({
      dueDate: daysFromToday(3),
      paidAt: today,
      amountCents: 3500,
      note: 'paid online',
      paidBy: { id: member.userId },
      expenseId: null,
    });

    const feed = await request(app.getHttpServer())
      .get(`/api/households/${householdId}/activity?limit=1`)
      .set(auth(owner))
      .expect(200);
    expect(feed.body.items[0]).toMatchObject({
      action: 'bill.paid',
      metadata: { name: 'Internet', amountCents: 3500, recordedAsExpense: false },
    });
  });

  it('paying with recordAsExpense creates an equal-split expense that hits balances', async () => {
    const list = await request(app.getHttpServer()).get(base).set(auth(owner)).expect(200);
    const gas = list.body.find((b: { name: string }) => b.name === 'Old gas');

    const res = await request(app.getHttpServer())
      .post(`${base}/${gas.id}/pay`)
      .set(auth(owner))
      .send({ amount: 61.5, recordAsExpense: true })
      .expect(200);

    // ONE_TIME -> inactive after payment.
    expect(res.body.isActive).toBe(false);
    expect(res.body.urgency).toBe('INACTIVE');
    expect(res.body.payments[0].amountCents).toBe(6150);
    expect(res.body.payments[0].expenseId).toBeTruthy();

    const expense = await request(app.getHttpServer())
      .get(`/api/households/${householdId}/expenses/${res.body.payments[0].expenseId}`)
      .set(auth(owner))
      .expect(200);
    expect(expense.body).toMatchObject({
      description: 'Old gas',
      amountCents: 6150,
      splitMethod: 'EQUAL',
      paidBy: { id: owner.userId },
    });
    expect(expense.body.splits.map((s: { amountCents: number }) => s.amountCents)).toEqual([
      3075, 3075,
    ]);

    const balances = await request(app.getHttpServer())
      .get(`/api/households/${householdId}/balances`)
      .set(auth(member))
      .expect(200);
    expect(balances.body[0].myNetCents).toBe(-3075);

    // Cannot pay an inactive bill again.
    await request(app.getHttpServer())
      .post(`${base}/${gas.id}/pay`)
      .set(auth(owner))
      .send({})
      .expect(400);
  });

  it('dashboard shows upcoming bills and the month total', async () => {
    const dash = await request(app.getHttpServer())
      .get(`/api/households/${householdId}/dashboard`)
      .set(auth(owner))
      .expect(200);

    const names = dash.body.today.upcomingBills.map((b: { name: string }) => b.name);
    expect(names).not.toContain('Old gas'); // inactive
    // Internet moved a month ahead; Rent is 20 days out -> outside the 14-day window.
    expect(names).toEqual([]);

    // Bills this month: payments for occurrences due this month + unpaid due this month.
    let expected = 0;
    if (daysFromToday(3).startsWith(thisMonth)) expected += 3500;
    if (daysFromToday(-5).startsWith(thisMonth)) expected += 6150;
    if (daysFromToday(20).startsWith(thisMonth)) expected += 85000;
    if (addMonthsIso(daysFromToday(3), 1).startsWith(thisMonth)) expected += 3500;
    expect(dash.body.finances.billsCents).toBe(expected);
  });

  it('updates, deactivates, and enforces permissions', async () => {
    const updated = await request(app.getHttpServer())
      .patch(`${base}/${internetId}`)
      .set(auth(member))
      .send({ amount: 39.9, responsibleId: null, frequency: 'YEARLY' })
      .expect(200);
    expect(updated.body).toMatchObject({
      amountCents: 3990,
      responsible: null,
      frequency: 'YEARLY',
    });

    await request(app.getHttpServer()).get(base).set(auth(outsider)).expect(404);
    await request(app.getHttpServer())
      .post(`${base}/${internetId}/pay`)
      .set(auth(outsider))
      .send({})
      .expect(404);

    // Internet was created by owner; member cannot delete it.
    await request(app.getHttpServer())
      .delete(`${base}/${internetId}`)
      .set(auth(member))
      .expect(403);
    await request(app.getHttpServer()).delete(`${base}/${internetId}`).set(auth(owner)).expect(204);

    const remaining = await request(app.getHttpServer())
      .get(`${base}?includeInactive=true`)
      .set(auth(owner))
      .expect(200);
    expect(remaining.body.map((b: { name: string }) => b.name).sort()).toEqual(['Old gas', 'Rent']);
  });
});
