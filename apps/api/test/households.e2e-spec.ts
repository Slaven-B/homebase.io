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

/**
 * Household + invitation flows and, above all, authorization boundaries,
 * against the real `homebase_test` database.
 */
describe('Households & invitations (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const runId = Date.now().toString(36);
  const email = (name: string) => `${name}-${runId}@e2e.local`;
  const password = 'a-long-enough-password';

  let owner: Session;
  let admin: Session;
  let member: Session;
  let outsider: Session;
  let householdId: string;

  const auth = (s: Session) => ({ Authorization: `Bearer ${s.token}` });

  async function signUp(name: string): Promise<Session> {
    const res = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: email(name), password, displayName: name })
      .expect(201);
    return { token: res.body.accessToken, email: email(name), userId: res.body.user.id };
  }

  /** Invites `invitee` to the household as `role` (by `by`) and accepts it as `invitee`. */
  async function inviteAndAccept(by: Session, invitee: Session, role: 'ADMIN' | 'MEMBER') {
    const inv = await request(app.getHttpServer())
      .post(`/api/households/${householdId}/invitations`)
      .set(auth(by))
      .send({ email: invitee.email, role })
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

    [owner, admin, member, outsider] = await Promise.all([
      signUp('owner'),
      signUp('admin'),
      signUp('member'),
      signUp('outsider'),
    ]);
  });

  afterAll(async () => {
    // Households cascade-delete members and invitations; users cascade the rest.
    await prisma.household.deleteMany({
      where: { members: { some: { user: { email: { endsWith: `-${runId}@e2e.local` } } } } },
    });
    await prisma.user.deleteMany({ where: { email: { endsWith: `-${runId}@e2e.local` } } });
    await app.close();
  });

  describe('creating a household', () => {
    it('makes the creator the OWNER', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/households')
        .set(auth(owner))
        .send({ name: '  The Test House  ' })
        .expect(201);

      householdId = res.body.id;
      expect(res.body.name).toBe('The Test House');
      expect(res.body.myRole).toBe('OWNER');
      expect(res.body.members).toHaveLength(1);
      expect(res.body.members[0]).toMatchObject({ userId: owner.userId, role: 'OWNER' });
    });

    it('lists the household for its member with role and member count', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/households')
        .set(auth(owner))
        .expect(200);

      expect(res.body).toEqual([
        expect.objectContaining({ id: householdId, role: 'OWNER', memberCount: 1 }),
      ]);
    });

    it('validates the name', async () => {
      await request(app.getHttpServer())
        .post('/api/households')
        .set(auth(owner))
        .send({ name: '' })
        .expect(400);
    });
  });

  describe('authorization: outsiders', () => {
    it('cannot see, edit, delete or invite into a household they are not part of', async () => {
      const base = `/api/households/${householdId}`;
      await request(app.getHttpServer()).get(base).set(auth(outsider)).expect(404);
      await request(app.getHttpServer()).get(`${base}/members`).set(auth(outsider)).expect(404);
      await request(app.getHttpServer())
        .patch(base)
        .set(auth(outsider))
        .send({ name: 'Hijacked' })
        .expect(404);
      await request(app.getHttpServer()).delete(base).set(auth(outsider)).expect(404);
      await request(app.getHttpServer())
        .post(`${base}/invitations`)
        .set(auth(outsider))
        .send({ email: email('friend') })
        .expect(404);
      await request(app.getHttpServer()).get(`${base}/invitations`).set(auth(outsider)).expect(404);
    });

    it('does not list the household for them', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/households')
        .set(auth(outsider))
        .expect(200);
      expect(res.body).toEqual([]);
    });
  });

  describe('invitations', () => {
    let token: string;

    it('owner invites by email; the invitation shows up for the invitee only', async () => {
      const created = await request(app.getHttpServer())
        .post(`/api/households/${householdId}/invitations`)
        .set(auth(owner))
        .send({ email: admin.email.toUpperCase(), role: 'ADMIN' })
        .expect(201);
      token = created.body.token;
      expect(created.body).toMatchObject({ email: admin.email, role: 'ADMIN', status: 'PENDING' });

      const mine = await request(app.getHttpServer())
        .get('/api/invitations')
        .set(auth(admin))
        .expect(200);
      expect(mine.body).toEqual([
        expect.objectContaining({ token, household: expect.objectContaining({ id: householdId }) }),
      ]);

      const notMine = await request(app.getHttpServer())
        .get('/api/invitations')
        .set(auth(outsider))
        .expect(200);
      expect(notMine.body).toEqual([]);
    });

    it('rejects a duplicate pending invitation', async () => {
      await request(app.getHttpServer())
        .post(`/api/households/${householdId}/invitations`)
        .set(auth(owner))
        .send({ email: admin.email })
        .expect(409);
    });

    it('cannot be accepted by a different account', async () => {
      await request(app.getHttpServer())
        .post(`/api/invitations/${token}/accept`)
        .set(auth(outsider))
        .expect(403);
      await request(app.getHttpServer())
        .get(`/api/invitations/${token}`)
        .set(auth(outsider))
        .expect(403);
    });

    it('is accepted by the invitee, who joins with the invited role', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/invitations/${token}/accept`)
        .set(auth(admin))
        .expect(200);

      expect(res.body.myRole).toBe('ADMIN');
      expect(res.body.members).toHaveLength(2);

      // Single use.
      await request(app.getHttpServer())
        .post(`/api/invitations/${token}/accept`)
        .set(auth(admin))
        .expect(404);
    });

    it('unknown tokens are 404', async () => {
      await request(app.getHttpServer())
        .post('/api/invitations/not-a-token/accept')
        .set(auth(admin))
        .expect(404);
    });

    it('cannot invite someone who is already a member', async () => {
      await request(app.getHttpServer())
        .post(`/api/households/${householdId}/invitations`)
        .set(auth(owner))
        .send({ email: admin.email })
        .expect(409);
    });

    it('admin can invite and revoke; revoked invitations cannot be accepted', async () => {
      const created = await request(app.getHttpServer())
        .post(`/api/households/${householdId}/invitations`)
        .set(auth(admin))
        .send({ email: outsider.email })
        .expect(201);

      const list = await request(app.getHttpServer())
        .get(`/api/households/${householdId}/invitations`)
        .set(auth(admin))
        .expect(200);
      expect(list.body.map((i: { id: string }) => i.id)).toContain(created.body.id);

      await request(app.getHttpServer())
        .delete(`/api/households/${householdId}/invitations/${created.body.id}`)
        .set(auth(admin))
        .expect(204);

      await request(app.getHttpServer())
        .post(`/api/invitations/${created.body.token}/accept`)
        .set(auth(outsider))
        .expect(404);
    });

    it('invitee can decline', async () => {
      const created = await request(app.getHttpServer())
        .post(`/api/households/${householdId}/invitations`)
        .set(auth(owner))
        .send({ email: outsider.email })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/api/invitations/${created.body.token}/decline`)
        .set(auth(outsider))
        .expect(204);

      const res = await request(app.getHttpServer())
        .get('/api/households')
        .set(auth(outsider))
        .expect(200);
      expect(res.body).toEqual([]);
    });
  });

  describe('authorization: roles inside the household', () => {
    let memberRecordId: string;

    beforeAll(async () => {
      await inviteAndAccept(owner, member, 'MEMBER');
      const detail = await request(app.getHttpServer())
        .get(`/api/households/${householdId}`)
        .set(auth(owner))
        .expect(200);
      memberRecordId = detail.body.members.find(
        (m: { userId: string }) => m.userId === member.userId,
      ).id;
    });

    it('members can read but not administer', async () => {
      const base = `/api/households/${householdId}`;
      await request(app.getHttpServer()).get(base).set(auth(member)).expect(200);
      await request(app.getHttpServer()).get(`${base}/members`).set(auth(member)).expect(200);

      await request(app.getHttpServer())
        .patch(base)
        .set(auth(member))
        .send({ name: 'Renamed by member' })
        .expect(403);
      await request(app.getHttpServer())
        .post(`${base}/invitations`)
        .set(auth(member))
        .send({ email: email('someone') })
        .expect(403);
      await request(app.getHttpServer()).get(`${base}/invitations`).set(auth(member)).expect(403);
      await request(app.getHttpServer()).delete(base).set(auth(member)).expect(403);
    });

    it('admins can rename but not delete the household or change roles', async () => {
      const base = `/api/households/${householdId}`;
      const renamed = await request(app.getHttpServer())
        .patch(base)
        .set(auth(admin))
        .send({ name: 'Renamed by admin' })
        .expect(200);
      expect(renamed.body.name).toBe('Renamed by admin');

      await request(app.getHttpServer()).delete(base).set(auth(admin)).expect(403);
      await request(app.getHttpServer())
        .patch(`${base}/members/${memberRecordId}`)
        .set(auth(admin))
        .send({ role: 'ADMIN' })
        .expect(403);
    });

    it('owner changes roles; the owner role itself is protected', async () => {
      const promoted = await request(app.getHttpServer())
        .patch(`/api/households/${householdId}/members/${memberRecordId}`)
        .set(auth(owner))
        .send({ role: 'ADMIN' })
        .expect(200);
      expect(promoted.body.role).toBe('ADMIN');

      await request(app.getHttpServer())
        .patch(`/api/households/${householdId}/members/${memberRecordId}`)
        .set(auth(owner))
        .send({ role: 'OWNER' })
        .expect(400);

      await request(app.getHttpServer())
        .patch(`/api/households/${householdId}/members/${memberRecordId}`)
        .set(auth(owner))
        .send({ role: 'MEMBER' })
        .expect(200);
    });

    it('admins cannot remove other admins or the owner; owner can remove members', async () => {
      const detail = await request(app.getHttpServer())
        .get(`/api/households/${householdId}`)
        .set(auth(owner))
        .expect(200);
      const ownerRecordId = detail.body.members.find(
        (m: { role: string }) => m.role === 'OWNER',
      ).id;
      const adminRecordId = detail.body.members.find(
        (m: { userId: string }) => m.userId === admin.userId,
      ).id;

      await request(app.getHttpServer())
        .delete(`/api/households/${householdId}/members/${ownerRecordId}`)
        .set(auth(admin))
        .expect(403);
      await request(app.getHttpServer())
        .delete(`/api/households/${householdId}/members/${adminRecordId}`)
        .set(auth(admin))
        .expect(400); // removing yourself -> use leave
      await request(app.getHttpServer())
        .delete(`/api/households/${householdId}/members/${ownerRecordId}`)
        .set(auth(owner))
        .expect(400); // owner removing themselves -> use leave/delete

      await request(app.getHttpServer())
        .delete(`/api/households/${householdId}/members/${memberRecordId}`)
        .set(auth(owner))
        .expect(204);
      await request(app.getHttpServer())
        .get(`/api/households/${householdId}`)
        .set(auth(member))
        .expect(404);
    });

    it('owner cannot leave; admin can leave', async () => {
      await request(app.getHttpServer())
        .post(`/api/households/${householdId}/leave`)
        .set(auth(owner))
        .expect(400);

      await request(app.getHttpServer())
        .post(`/api/households/${householdId}/leave`)
        .set(auth(admin))
        .expect(204);
      await request(app.getHttpServer())
        .get(`/api/households/${householdId}`)
        .set(auth(admin))
        .expect(404);
    });

    it('owner deletes the household and it disappears for everyone', async () => {
      await request(app.getHttpServer())
        .delete(`/api/households/${householdId}`)
        .set(auth(owner))
        .expect(204);
      await request(app.getHttpServer())
        .get(`/api/households/${householdId}`)
        .set(auth(owner))
        .expect(404);
    });
  });
});
