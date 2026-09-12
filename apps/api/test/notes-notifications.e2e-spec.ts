import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { RemindersService } from '../src/notifications/reminders.service';
import { PrismaService } from '../src/prisma/prisma.service';

interface Session {
  token: string;
  email: string;
  userId: string;
}

const daysFromToday = (n: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

describe('Notes & notifications (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let reminders: RemindersService;
  const runId = Date.now().toString(36);
  const email = (name: string) => `${name}-${runId}@e2e.local`;
  const password = 'a-long-enough-password';
  const auth = (s: Session) => ({ Authorization: `Bearer ${s.token}` });

  let owner: Session;
  let member: Session;
  let outsider: Session;
  let householdId: string;

  async function signUp(name: string): Promise<Session> {
    const res = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: email(name), password, displayName: name })
      .expect(201);
    return { token: res.body.accessToken, email: email(name), userId: res.body.user.id };
  }

  async function unread(s: Session): Promise<{ type: string; title: string; link: string }[]> {
    const res = await request(app.getHttpServer())
      .get('/api/notifications?unreadOnly=true')
      .set(auth(s))
      .expect(200);
    return res.body.items as { type: string; title: string; link: string }[];
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
    reminders = app.get(RemindersService);

    [owner, member, outsider] = await Promise.all([
      signUp('nn-owner'),
      signUp('nn-member'),
      signUp('nn-outsider'),
    ]);
    const created = await request(app.getHttpServer())
      .post('/api/households')
      .set(auth(owner))
      .send({ name: 'Notes House' })
      .expect(201);
    householdId = created.body.id;
  });

  afterAll(async () => {
    await prisma.household.deleteMany({
      where: { members: { some: { user: { email: { endsWith: `-${runId}@e2e.local` } } } } },
    });
    await prisma.user.deleteMany({ where: { email: { endsWith: `-${runId}@e2e.local` } } });
    await app.close();
  });

  describe('notifications: invitation', () => {
    it('an existing user is notified when invited, and can follow the link', async () => {
      const inv = await request(app.getHttpServer())
        .post(`/api/households/${householdId}/invitations`)
        .set(auth(owner))
        .send({ email: member.email })
        .expect(201);

      const items = await unread(member);
      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({
        type: 'INVITATION',
        title: 'You are invited to Notes House',
        link: `/invite/${inv.body.token}`,
      });
      expect(await unread(owner)).toEqual([]);

      const count = await request(app.getHttpServer())
        .get('/api/notifications/unread-count')
        .set(auth(member))
        .expect(200);
      expect(count.body).toEqual({ count: 1 });

      await request(app.getHttpServer())
        .post(`/api/invitations/${inv.body.token}/accept`)
        .set(auth(member))
        .expect(200);
    });
  });

  describe('notes', () => {
    let noteId: string;

    it('members create, list (pinned first), read and edit notes', async () => {
      const wifi = await request(app.getHttpServer())
        .post(`/api/households/${householdId}/notes`)
        .set(auth(owner))
        .send({ title: ' WiFi password ', content: 'Network: Home\nPassword: hunter2' })
        .expect(201);
      noteId = wifi.body.id;
      expect(wifi.body).toMatchObject({
        title: 'WiFi password',
        isPinned: false,
        author: { id: owner.userId },
        lastEditedBy: { id: owner.userId },
      });

      await request(app.getHttpServer())
        .post(`/api/households/${householdId}/notes`)
        .set(auth(member))
        .send({ title: 'Emergency contacts', content: 'Landlord: 555-0100', isPinned: true })
        .expect(201);

      const list = await request(app.getHttpServer())
        .get(`/api/households/${householdId}/notes`)
        .set(auth(member))
        .expect(200);
      expect(list.body.map((n: { title: string }) => n.title)).toEqual([
        'Emergency contacts',
        'WiFi password',
      ]);
      expect(list.body[1].preview).toBe('Network: Home Password: hunter2');
      expect(list.body[1].content).toBeUndefined();

      const edited = await request(app.getHttpServer())
        .patch(`/api/households/${householdId}/notes/${noteId}`)
        .set(auth(member))
        .send({ content: 'Password: hunter3', isPinned: true })
        .expect(200);
      expect(edited.body).toMatchObject({
        content: 'Password: hunter3',
        isPinned: true,
        author: { id: owner.userId },
        lastEditedBy: { id: member.userId },
      });
    });

    it('validates and isolates', async () => {
      await request(app.getHttpServer())
        .post(`/api/households/${householdId}/notes`)
        .set(auth(owner))
        .send({ title: '' })
        .expect(400);
      await request(app.getHttpServer())
        .get(`/api/households/${householdId}/notes`)
        .set(auth(outsider))
        .expect(404);
      await request(app.getHttpServer())
        .get(`/api/households/${householdId}/notes/${noteId}`)
        .set(auth(outsider))
        .expect(404);
    });

    it('only the author or an admin can delete', async () => {
      // noteId authored by owner; member is a regular member.
      await request(app.getHttpServer())
        .delete(`/api/households/${householdId}/notes/${noteId}`)
        .set(auth(member))
        .expect(403);
      await request(app.getHttpServer())
        .delete(`/api/households/${householdId}/notes/${noteId}`)
        .set(auth(owner))
        .expect(204);

      const feed = await request(app.getHttpServer())
        .get(`/api/households/${householdId}/activity?limit=5`)
        .set(auth(owner))
        .expect(200);
      expect(feed.body.items.map((a: { action: string }) => a.action)).toContain('note.created');
    });
  });

  describe('notifications: assignments, expenses, settlements', () => {
    it('assigning a task notifies the assignee but not the actor', async () => {
      const task = await request(app.getHttpServer())
        .post(`/api/households/${householdId}/tasks`)
        .set(auth(owner))
        .send({ title: 'Fix the tap', assigneeId: member.userId })
        .expect(201);

      const items = await unread(member);
      expect(items.map((i) => i.type)).toContain('TASK_ASSIGNED');
      expect(items.find((i) => i.type === 'TASK_ASSIGNED')?.link).toBe(`/tasks/${task.body.id}`);

      // Self-assignment produces nothing.
      await request(app.getHttpServer())
        .post(`/api/households/${householdId}/tasks`)
        .set(auth(owner))
        .send({ title: 'My own task', assigneeId: owner.userId })
        .expect(201);
      expect((await unread(owner)).filter((i) => i.type === 'TASK_ASSIGNED')).toEqual([]);

      // Reassignment notifies the new assignee.
      await request(app.getHttpServer())
        .patch(`/api/households/${householdId}/tasks/${task.body.id}`)
        .set(auth(member))
        .send({ assigneeId: owner.userId })
        .expect(200);
      expect((await unread(owner)).filter((i) => i.type === 'TASK_ASSIGNED')).toHaveLength(1);
    });

    it('chore assignment, shared expenses and settlements notify the right people', async () => {
      await request(app.getHttpServer())
        .post(`/api/households/${householdId}/chores`)
        .set(auth(owner))
        .send({ title: 'Vacuum', frequency: 'WEEKLY', assigneeId: member.userId })
        .expect(201);
      expect((await unread(member)).map((i) => i.type)).toContain('CHORE_ASSIGNED');

      await request(app.getHttpServer())
        .post(`/api/households/${householdId}/expenses`)
        .set(auth(owner))
        .send({
          description: 'Pizza night',
          amount: 30,
          paidById: owner.userId,
          splitMethod: 'EQUAL',
          participants: [{ userId: owner.userId }, { userId: member.userId }],
        })
        .expect(201);
      const expenseNote = (await unread(member)).find((i) => i.type === 'EXPENSE_SHARED');
      expect(expenseNote?.title).toBe('New shared expense: Pizza night');
      expect((await unread(owner)).filter((i) => i.type === 'EXPENSE_SHARED')).toEqual([]);

      await request(app.getHttpServer())
        .post(`/api/households/${householdId}/settlements`)
        .set(auth(member))
        .send({ toUserId: owner.userId, amount: 15 })
        .expect(201);
      const settled = (await unread(owner)).find((i) => i.type === 'SETTLEMENT_RECEIVED');
      expect(settled?.title).toBe('nn-member paid you 15.00 EUR');
    });
  });

  describe('notifications: daily reminders', () => {
    it('reminds about bills due tomorrow and chores due today, without duplicates', async () => {
      await request(app.getHttpServer())
        .post(`/api/households/${householdId}/bills`)
        .set(auth(owner))
        .send({
          name: 'Electricity',
          amount: 92,
          dueDate: daysFromToday(1),
          frequency: 'MONTHLY',
          responsibleId: member.userId,
        })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/api/households/${householdId}/bills`)
        .set(auth(owner))
        .send({ name: 'Far away', amount: 10, dueDate: daysFromToday(10), frequency: 'MONTHLY' })
        .expect(201);
      // Chore "Vacuum" from the previous test is due today and assigned to member.

      const first = await reminders.run();
      expect(first.billsDue).toBeGreaterThanOrEqual(1);
      expect(first.choresDue).toBeGreaterThanOrEqual(1);

      const items = await unread(member);
      const bill = items.find((i) => i.type === 'BILL_DUE');
      expect(bill?.title).toBe('Electricity is due tomorrow');
      expect(items.filter((i) => i.type === 'BILL_DUE')).toHaveLength(1);
      expect(items.filter((i) => i.type === 'CHORE_DUE')).toHaveLength(1);
      expect((await unread(owner)).filter((i) => i.type === 'BILL_DUE')).toEqual([]);

      // Running again is a no-op thanks to dedupe keys.
      await reminders.run();
      const again = await unread(member);
      expect(again.filter((i) => i.type === 'BILL_DUE')).toHaveLength(1);
      expect(again.filter((i) => i.type === 'CHORE_DUE')).toHaveLength(1);
    });
  });

  describe('notifications: reading and isolation', () => {
    it('marks one and all as read; users cannot touch each other notifications', async () => {
      const mine = await unread(member);
      expect(mine.length).toBeGreaterThan(1);
      const firstId = (mine[0] as unknown as { id: string }).id;

      const read = await request(app.getHttpServer())
        .patch(`/api/notifications/${firstId}/read`)
        .set(auth(member))
        .expect(200);
      expect(read.body.readAt).toBeTruthy();

      await request(app.getHttpServer())
        .patch(`/api/notifications/${firstId}/read`)
        .set(auth(owner))
        .expect(404);
      await request(app.getHttpServer())
        .delete(`/api/notifications/${firstId}`)
        .set(auth(owner))
        .expect(404);

      const all = await request(app.getHttpServer())
        .post('/api/notifications/read-all')
        .set(auth(member))
        .expect(200);
      expect(all.body.updated).toBe(mine.length - 1);
      expect(await unread(member)).toEqual([]);

      const page = await request(app.getHttpServer())
        .get('/api/notifications?limit=2')
        .set(auth(member))
        .expect(200);
      expect(page.body.items).toHaveLength(2);
      expect(page.body.nextCursor).toBeTruthy();

      await request(app.getHttpServer())
        .get('/api/notifications?limit=500')
        .set(auth(member))
        .expect(400);
    });
  });
});
