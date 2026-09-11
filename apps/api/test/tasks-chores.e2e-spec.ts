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
const daysFromToday = (n: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

describe('Tasks & chores (e2e)', () => {
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
  let tasksUrl: string;
  let choresUrl: string;

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
      signUp('tc-owner'),
      signUp('tc-member'),
      signUp('tc-outsider'),
    ]);
    const created = await request(app.getHttpServer())
      .post('/api/households')
      .set(auth(owner))
      .send({ name: 'Tasks House' })
      .expect(201);
    householdId = created.body.id;
    tasksUrl = `/api/households/${householdId}/tasks`;
    choresUrl = `/api/households/${householdId}/chores`;

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

  describe('tasks', () => {
    let taskId: string;

    it('creates a task with assignee, due date and priority', async () => {
      const res = await request(app.getHttpServer())
        .post(tasksUrl)
        .set(auth(owner))
        .send({
          title: '  Call landlord about heating ',
          description: 'Radiator in the living room',
          assigneeId: member.userId,
          dueAt: today,
          priority: 'HIGH',
        })
        .expect(201);

      taskId = res.body.id;
      expect(res.body).toMatchObject({
        title: 'Call landlord about heating',
        status: 'TODO',
        priority: 'HIGH',
        dueAt: today,
        assignee: { id: member.userId },
        createdBy: { id: owner.userId },
        comments: [],
        commentCount: 0,
      });
    });

    it('rejects an assignee who is not a member and bad input', async () => {
      await request(app.getHttpServer())
        .post(tasksUrl)
        .set(auth(owner))
        .send({ title: 'x', assigneeId: outsider.userId })
        .expect(400);
      await request(app.getHttpServer())
        .post(tasksUrl)
        .set(auth(owner))
        .send({ title: '', dueAt: 'not-a-date' })
        .expect(400);
      await request(app.getHttpServer())
        .post(tasksUrl)
        .set(auth(owner))
        .send({ title: 'x', status: 'DONE' }) // status not allowed on create
        .expect(400);
    });

    it('lists open tasks by default, done tasks on request, and filters by assignee', async () => {
      await request(app.getHttpServer())
        .post(tasksUrl)
        .set(auth(member))
        .send({ title: 'Buy light bulbs' })
        .expect(201);

      const open = await request(app.getHttpServer()).get(tasksUrl).set(auth(member)).expect(200);
      expect(open.body.map((t: { title: string }) => t.title)).toEqual([
        'Call landlord about heating',
        'Buy light bulbs',
      ]);

      const mine = await request(app.getHttpServer())
        .get(`${tasksUrl}?assigneeId=${member.userId}`)
        .set(auth(member))
        .expect(200);
      expect(mine.body).toHaveLength(1);
    });

    it('moves through statuses, records completion and logs activity', async () => {
      const inProgress = await request(app.getHttpServer())
        .patch(`${tasksUrl}/${taskId}`)
        .set(auth(member))
        .send({ status: 'IN_PROGRESS' })
        .expect(200);
      expect(inProgress.body.completedAt).toBeNull();

      const done = await request(app.getHttpServer())
        .patch(`${tasksUrl}/${taskId}`)
        .set(auth(member))
        .send({ status: 'DONE' })
        .expect(200);
      expect(done.body.status).toBe('DONE');
      expect(done.body.completedAt).toBeTruthy();

      const open = await request(app.getHttpServer()).get(tasksUrl).set(auth(owner)).expect(200);
      expect(open.body.map((t: { id: string }) => t.id)).not.toContain(taskId);
      const all = await request(app.getHttpServer())
        .get(`${tasksUrl}?includeDone=true`)
        .set(auth(owner))
        .expect(200);
      expect(all.body.map((t: { id: string }) => t.id)).toContain(taskId);

      const feed = await request(app.getHttpServer())
        .get(`/api/households/${householdId}/activity?limit=5`)
        .set(auth(owner))
        .expect(200);
      expect(feed.body.items[0]).toMatchObject({
        action: 'task.completed',
        metadata: { title: 'Call landlord about heating' },
      });

      // Reopen clears completedAt.
      const reopened = await request(app.getHttpServer())
        .patch(`${tasksUrl}/${taskId}`)
        .set(auth(owner))
        .send({ status: 'TODO' })
        .expect(200);
      expect(reopened.body.completedAt).toBeNull();
    });

    it('supports comments with author/admin deletion rules', async () => {
      const c1 = await request(app.getHttpServer())
        .post(`${tasksUrl}/${taskId}/comments`)
        .set(auth(member))
        .send({ content: 'Left a voicemail' })
        .expect(201);
      expect(c1.body.author.id).toBe(member.userId);

      const detail = await request(app.getHttpServer())
        .get(`${tasksUrl}/${taskId}`)
        .set(auth(owner))
        .expect(200);
      expect(detail.body.comments).toHaveLength(1);
      expect(detail.body.commentCount).toBe(1);

      // Another regular member (not author, not admin) cannot delete.
      const inv = await request(app.getHttpServer())
        .post(`/api/households/${householdId}/invitations`)
        .set(auth(owner))
        .send({ email: email('tc-third') })
        .expect(201);
      const third = await signUp('tc-third');
      await request(app.getHttpServer())
        .post(`/api/invitations/${inv.body.token}/accept`)
        .set(auth(third))
        .expect(200);
      await request(app.getHttpServer())
        .delete(`${tasksUrl}/${taskId}/comments/${c1.body.id}`)
        .set(auth(third))
        .expect(403);
      // Owner (admin) can.
      await request(app.getHttpServer())
        .delete(`${tasksUrl}/${taskId}/comments/${c1.body.id}`)
        .set(auth(owner))
        .expect(204);
    });

    it('outsiders get 404 and members cannot delete tasks they did not create', async () => {
      await request(app.getHttpServer()).get(tasksUrl).set(auth(outsider)).expect(404);
      await request(app.getHttpServer())
        .get(`${tasksUrl}/${taskId}`)
        .set(auth(outsider))
        .expect(404);
      await request(app.getHttpServer())
        .delete(`${tasksUrl}/${taskId}`)
        .set(auth(member))
        .expect(403); // created by owner
      await request(app.getHttpServer())
        .delete(`${tasksUrl}/${taskId}`)
        .set(auth(owner))
        .expect(204);
    });
  });

  describe('chores', () => {
    let choreId: string;

    it('creates a weekly chore due today, assigned to a member', async () => {
      const res = await request(app.getHttpServer())
        .post(choresUrl)
        .set(auth(owner))
        .send({
          title: 'Take out trash',
          frequency: 'WEEKLY',
          assigneeId: member.userId,
          estimatedMinutes: 5,
          priority: 'LOW',
        })
        .expect(201);
      choreId = res.body.id;
      expect(res.body).toMatchObject({
        title: 'Take out trash',
        frequency: 'WEEKLY',
        intervalDays: null,
        nextDueAt: today,
        dueInDays: 0,
        isActive: true,
        history: [],
        assignee: { id: member.userId },
      });
    });

    it('requires intervalDays for CUSTOM and rejects non-member assignees', async () => {
      await request(app.getHttpServer())
        .post(choresUrl)
        .set(auth(owner))
        .send({ title: 'Water plants', frequency: 'CUSTOM' })
        .expect(400);
      await request(app.getHttpServer())
        .post(choresUrl)
        .set(auth(owner))
        .send({ title: 'x', frequency: 'DAILY', assigneeId: outsider.userId })
        .expect(400);
    });

    it('completing records history and advances to next week (same weekday)', async () => {
      const res = await request(app.getHttpServer())
        .post(`${choresUrl}/${choreId}/complete`)
        .set(auth(member))
        .send({ note: 'Also cleaned the bin' })
        .expect(200);

      expect(res.body.nextDueAt).toBe(daysFromToday(7));
      expect(res.body.dueInDays).toBe(7);
      expect(res.body.lastCompletedAt).toBeTruthy();
      expect(res.body.history).toHaveLength(1);
      expect(res.body.history[0]).toMatchObject({
        dueAt: today,
        skipped: false,
        note: 'Also cleaned the bin',
        completedBy: { id: member.userId },
      });

      const feed = await request(app.getHttpServer())
        .get(`/api/households/${householdId}/activity?limit=1`)
        .set(auth(owner))
        .expect(200);
      expect(feed.body.items[0]).toMatchObject({
        action: 'chore.completed',
        metadata: { title: 'Take out trash', nextDueAt: daysFromToday(7) },
      });
    });

    it('skipping advances without touching lastCompletedAt', async () => {
      const before = await request(app.getHttpServer())
        .get(`${choresUrl}/${choreId}`)
        .set(auth(owner))
        .expect(200);
      const res = await request(app.getHttpServer())
        .post(`${choresUrl}/${choreId}/skip`)
        .set(auth(owner))
        .expect(200);

      expect(res.body.nextDueAt).toBe(daysFromToday(14));
      expect(res.body.lastCompletedAt).toBe(before.body.lastCompletedAt);
      expect(res.body.history[0]).toMatchObject({ skipped: true, dueAt: daysFromToday(7) });
    });

    it('overdue chores skip missed periods when completed', async () => {
      const daily = await request(app.getHttpServer())
        .post(choresUrl)
        .set(auth(owner))
        .send({ title: 'Feed the cat', frequency: 'DAILY', firstDueAt: daysFromToday(-10) })
        .expect(201);
      expect(daily.body.dueInDays).toBe(-10);

      const done = await request(app.getHttpServer())
        .post(`${choresUrl}/${daily.body.id}/complete`)
        .set(auth(owner))
        .send({})
        .expect(200);
      expect(done.body.nextDueAt).toBe(daysFromToday(1));
    });

    it('custom interval and rescheduling via PATCH', async () => {
      const custom = await request(app.getHttpServer())
        .post(choresUrl)
        .set(auth(member))
        .send({ title: 'Water plants', frequency: 'CUSTOM', intervalDays: 3 })
        .expect(201);
      const done = await request(app.getHttpServer())
        .post(`${choresUrl}/${custom.body.id}/complete`)
        .set(auth(member))
        .send({})
        .expect(200);
      expect(done.body.nextDueAt).toBe(daysFromToday(3));

      const moved = await request(app.getHttpServer())
        .patch(`${choresUrl}/${custom.body.id}`)
        .set(auth(member))
        .send({ nextDueAt: daysFromToday(1), frequency: 'WEEKLY', assigneeId: null })
        .expect(200);
      expect(moved.body).toMatchObject({
        nextDueAt: daysFromToday(1),
        frequency: 'WEEKLY',
        intervalDays: null,
        assignee: null,
      });
    });

    it('archived chores are hidden by default and cannot be completed', async () => {
      const archived = await request(app.getHttpServer())
        .patch(`${choresUrl}/${choreId}`)
        .set(auth(owner))
        .send({ isActive: false })
        .expect(200);
      expect(archived.body.isActive).toBe(false);

      const active = await request(app.getHttpServer()).get(choresUrl).set(auth(owner)).expect(200);
      expect(active.body.map((c: { id: string }) => c.id)).not.toContain(choreId);
      const all = await request(app.getHttpServer())
        .get(`${choresUrl}?includeInactive=true`)
        .set(auth(owner))
        .expect(200);
      expect(all.body.map((c: { id: string }) => c.id)).toContain(choreId);

      await request(app.getHttpServer())
        .post(`${choresUrl}/${choreId}/complete`)
        .set(auth(owner))
        .send({})
        .expect(400);
    });

    it('outsiders get 404; deletion is limited to admins and creators', async () => {
      await request(app.getHttpServer()).get(choresUrl).set(auth(outsider)).expect(404);
      await request(app.getHttpServer())
        .post(`${choresUrl}/${choreId}/complete`)
        .set(auth(outsider))
        .send({})
        .expect(404);
      await request(app.getHttpServer())
        .delete(`${choresUrl}/${choreId}`)
        .set(auth(member))
        .expect(403);
      await request(app.getHttpServer())
        .delete(`${choresUrl}/${choreId}`)
        .set(auth(owner))
        .expect(204);
    });
  });

  describe('dashboard integration', () => {
    it('shows chores and tasks due today or overdue', async () => {
      await request(app.getHttpServer())
        .post(tasksUrl)
        .set(auth(owner))
        .send({ title: 'Overdue task', dueAt: daysFromToday(-2) })
        .expect(201);
      await request(app.getHttpServer())
        .post(tasksUrl)
        .set(auth(owner))
        .send({ title: 'Future task', dueAt: daysFromToday(5) })
        .expect(201);
      await request(app.getHttpServer())
        .post(choresUrl)
        .set(auth(owner))
        .send({ title: 'Vacuum', frequency: 'WEEKLY' })
        .expect(201);

      const dash = await request(app.getHttpServer())
        .get(`/api/households/${householdId}/dashboard`)
        .set(auth(owner))
        .expect(200);

      expect(dash.body.today.tasksDue.map((t: { title: string }) => t.title)).toEqual([
        'Overdue task',
      ]);
      expect(dash.body.today.choresDue.map((c: { title: string }) => c.title)).toEqual(['Vacuum']);
    });
  });
});
