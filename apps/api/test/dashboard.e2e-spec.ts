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

describe('Dashboard & activity (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const runId = Date.now().toString(36);
  const email = (name: string) => `${name}-${runId}@e2e.local`;
  const password = 'a-long-enough-password';
  const auth = (s: Session) => ({ Authorization: `Bearer ${s.token}` });

  let owner: Session;
  let friend: Session;
  let outsider: Session;
  let householdId: string;

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

    [owner, friend, outsider] = await Promise.all([
      signUp('dash-owner'),
      signUp('dash-friend'),
      signUp('dash-outsider'),
    ]);

    const created = await request(app.getHttpServer())
      .post('/api/households')
      .set(auth(owner))
      .send({ name: 'Dashboard House' })
      .expect(201);
    householdId = created.body.id;

    // Generate some history: rename, invite, accept.
    await request(app.getHttpServer())
      .patch(`/api/households/${householdId}`)
      .set(auth(owner))
      .send({ name: 'Dashboard Home' })
      .expect(200);
    const invite = await request(app.getHttpServer())
      .post(`/api/households/${householdId}/invitations`)
      .set(auth(owner))
      .send({ email: friend.email })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/invitations/${invite.body.token}/accept`)
      .set(auth(friend))
      .expect(200);
    // A second pending invitation so the admin counter has something to count.
    await request(app.getHttpServer())
      .post(`/api/households/${householdId}/invitations`)
      .set(auth(owner))
      .send({ email: email('someone-else') })
      .expect(201);
  });

  afterAll(async () => {
    await prisma.household.deleteMany({
      where: { members: { some: { user: { email: { endsWith: `-${runId}@e2e.local` } } } } },
    });
    await prisma.user.deleteMany({ where: { email: { endsWith: `-${runId}@e2e.local` } } });
    await app.close();
  });

  describe('GET /households/:id/dashboard', () => {
    it('returns the household header, empty future sections and recent activity', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/households/${householdId}/dashboard`)
        .set(auth(owner))
        .expect(200);

      expect(res.body.household).toEqual({
        id: householdId,
        name: 'Dashboard Home',
        myRole: 'OWNER',
        memberCount: 2,
        pendingInvitations: 1,
      });
      expect(res.body.today).toMatchObject({
        choresDue: [],
        tasksDue: [],
        upcomingBills: [],
        shopping: { openItems: 0, lists: [] },
      });
      expect(res.body.today.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(res.body.finances).toMatchObject({
        currency: 'EUR',
        sharedExpensesCents: 0,
        billsCents: 0,
        outstandingCents: 0,
        myNetCents: 0,
      });

      const actions = res.body.recentActivity.map((a: { action: string }) => a.action);
      expect(actions).toEqual([
        'invitation.sent',
        'member.joined',
        'invitation.sent',
        'household.renamed',
        'household.created',
      ]);
      const joined = res.body.recentActivity.find(
        (a: { action: string }) => a.action === 'member.joined',
      );
      expect(joined.actor.displayName).toBe('dash-friend');
      expect(joined.metadata).toEqual({ memberName: 'dash-friend', role: 'MEMBER' });
    });

    it('hides the pending invitation count from regular members', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/households/${householdId}/dashboard`)
        .set(auth(friend))
        .expect(200);

      expect(res.body.household.myRole).toBe('MEMBER');
      expect(res.body.household.pendingInvitations).toBeNull();
    });

    it('is not available to outsiders', async () => {
      await request(app.getHttpServer())
        .get(`/api/households/${householdId}/dashboard`)
        .set(auth(outsider))
        .expect(404);
      await request(app.getHttpServer())
        .get(`/api/households/${householdId}/dashboard`)
        .expect(401);
    });
  });

  describe('GET /households/:id/activity', () => {
    it('pages newest-first with a cursor', async () => {
      const first = await request(app.getHttpServer())
        .get(`/api/households/${householdId}/activity?limit=2`)
        .set(auth(friend))
        .expect(200);

      expect(first.body.items).toHaveLength(2);
      expect(first.body.nextCursor).toBe(first.body.items[1].id);

      const second = await request(app.getHttpServer())
        .get(`/api/households/${householdId}/activity?limit=2&cursor=${first.body.nextCursor}`)
        .set(auth(friend))
        .expect(200);

      expect(second.body.items).toHaveLength(2);
      expect(second.body.items.map((i: { id: string }) => i.id)).not.toContain(
        first.body.items[0].id,
      );

      const last = await request(app.getHttpServer())
        .get(`/api/households/${householdId}/activity?limit=2&cursor=${second.body.nextCursor}`)
        .set(auth(friend))
        .expect(200);
      expect(last.body.items.map((i: { action: string }) => i.action)).toEqual([
        'household.created',
      ]);
      expect(last.body.nextCursor).toBeNull();
    });

    it('validates the query and blocks outsiders', async () => {
      await request(app.getHttpServer())
        .get(`/api/households/${householdId}/activity?limit=500`)
        .set(auth(friend))
        .expect(400);
      await request(app.getHttpServer())
        .get(`/api/households/${householdId}/activity?cursor=not-a-uuid`)
        .set(auth(friend))
        .expect(400);
      await request(app.getHttpServer())
        .get(`/api/households/${householdId}/activity`)
        .set(auth(outsider))
        .expect(404);
    });

    it('records leaving and removal with the member name', async () => {
      await request(app.getHttpServer())
        .post(`/api/households/${householdId}/leave`)
        .set(auth(friend))
        .expect(204);

      const res = await request(app.getHttpServer())
        .get(`/api/households/${householdId}/activity?limit=1`)
        .set(auth(owner))
        .expect(200);

      expect(res.body.items[0]).toMatchObject({
        action: 'member.left',
        metadata: { memberName: 'dash-friend' },
        actor: expect.objectContaining({ displayName: 'dash-friend' }),
      });
    });
  });
});
