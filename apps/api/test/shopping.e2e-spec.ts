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

describe('Shopping lists (e2e)', () => {
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
  let otherHouseholdId: string;
  let base: string;

  async function signUp(name: string): Promise<Session> {
    const res = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: email(name), password, displayName: name })
      .expect(201);
    return { token: res.body.accessToken, email: email(name), userId: res.body.user.id };
  }

  async function createHousehold(by: Session, name: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/api/households')
      .set(auth(by))
      .send({ name })
      .expect(201);
    return res.body.id as string;
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
      signUp('shop-owner'),
      signUp('shop-member'),
      signUp('shop-outsider'),
    ]);
    householdId = await createHousehold(owner, 'Shopping House');
    otherHouseholdId = await createHousehold(outsider, 'Other House');
    base = `/api/households/${householdId}/shopping-lists`;

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

  describe('lists', () => {
    let listId: string;

    it('any member can create a list; it starts empty', async () => {
      const res = await request(app.getHttpServer())
        .post(base)
        .set(auth(member))
        .send({ name: '  Groceries ' })
        .expect(201);

      listId = res.body.id;
      expect(res.body).toMatchObject({ name: 'Groceries', isArchived: false, items: [] });
      expect(res.body.createdBy.id).toBe(member.userId);
    });

    it('lists show open/total counts', async () => {
      const res = await request(app.getHttpServer()).get(base).set(auth(owner)).expect(200);
      expect(res.body).toEqual([
        expect.objectContaining({ id: listId, name: 'Groceries', openItems: 0, totalItems: 0 }),
      ]);
    });

    it('validates the name and rejects unknown fields', async () => {
      await request(app.getHttpServer()).post(base).set(auth(owner)).send({ name: '' }).expect(400);
      await request(app.getHttpServer())
        .post(base)
        .set(auth(owner))
        .send({ name: 'x', householdId: otherHouseholdId })
        .expect(400);
    });

    it('outsiders cannot see or create lists in a household they are not part of', async () => {
      await request(app.getHttpServer()).get(base).set(auth(outsider)).expect(404);
      await request(app.getHttpServer())
        .post(base)
        .set(auth(outsider))
        .send({ name: 'Hijack' })
        .expect(404);
      await request(app.getHttpServer()).get(`${base}/${listId}`).set(auth(outsider)).expect(404);
    });

    it('a list cannot be reached through another household id', async () => {
      // outsider IS a member of otherHousehold, but the list belongs to householdId.
      await request(app.getHttpServer())
        .get(`/api/households/${otherHouseholdId}/shopping-lists/${listId}`)
        .set(auth(outsider))
        .expect(404);
      await request(app.getHttpServer())
        .post(`/api/households/${otherHouseholdId}/shopping-lists/${listId}/items`)
        .set(auth(outsider))
        .send({ name: 'Sneaky' })
        .expect(404);
    });

    it('rename and archive', async () => {
      const renamed = await request(app.getHttpServer())
        .patch(`${base}/${listId}`)
        .set(auth(owner))
        .send({ name: 'Weekly groceries' })
        .expect(200);
      expect(renamed.body.name).toBe('Weekly groceries');

      await request(app.getHttpServer())
        .patch(`${base}/${listId}`)
        .set(auth(owner))
        .send({ isArchived: true })
        .expect(200);
      const active = await request(app.getHttpServer()).get(base).set(auth(owner)).expect(200);
      expect(active.body).toEqual([]);
      const all = await request(app.getHttpServer())
        .get(`${base}?includeArchived=true`)
        .set(auth(owner))
        .expect(200);
      expect(all.body).toHaveLength(1);

      await request(app.getHttpServer())
        .patch(`${base}/${listId}`)
        .set(auth(owner))
        .send({ isArchived: false })
        .expect(200);
    });

    it('only admins or the creator can delete a list', async () => {
      const ownerList = await request(app.getHttpServer())
        .post(base)
        .set(auth(owner))
        .send({ name: 'Hardware store' })
        .expect(201);

      // member did not create it and is not an admin
      await request(app.getHttpServer())
        .delete(`${base}/${ownerList.body.id}`)
        .set(auth(member))
        .expect(403);
      // member created "Groceries" -> may delete it... but we still need it, so delete owner's
      await request(app.getHttpServer())
        .delete(`${base}/${ownerList.body.id}`)
        .set(auth(owner))
        .expect(204);
      await request(app.getHttpServer())
        .get(`${base}/${ownerList.body.id}`)
        .set(auth(owner))
        .expect(404);
    });
  });

  describe('items', () => {
    let listId: string;
    let milkId: string;
    let eggsId: string;

    beforeAll(async () => {
      const res = await request(app.getHttpServer())
        .post(base)
        .set(auth(owner))
        .send({ name: 'Items list' })
        .expect(201);
      listId = res.body.id;
    });

    it('adds items with optional fields normalized', async () => {
      const milk = await request(app.getHttpServer())
        .post(`${base}/${listId}/items`)
        .set(auth(member))
        .send({ name: ' Milk ', quantity: '2', category: ' Dairy ', notes: '' })
        .expect(201);
      milkId = milk.body.id;
      expect(milk.body).toMatchObject({
        name: 'Milk',
        quantity: '2',
        category: 'Dairy',
        notes: null,
        completed: false,
        completedBy: null,
      });
      expect(milk.body.addedBy.id).toBe(member.userId);

      const eggs = await request(app.getHttpServer())
        .post(`${base}/${listId}/items`)
        .set(auth(owner))
        .send({ name: 'Eggs' })
        .expect(201);
      eggsId = eggs.body.id;

      await request(app.getHttpServer())
        .post(`${base}/${listId}/items`)
        .set(auth(owner))
        .send({ name: '' })
        .expect(400);
    });

    it('completing records who and when; reopening clears it', async () => {
      const done = await request(app.getHttpServer())
        .patch(`${base}/${listId}/items/${milkId}`)
        .set(auth(owner))
        .send({ completed: true })
        .expect(200);
      expect(done.body.completed).toBe(true);
      expect(done.body.completedBy.id).toBe(owner.userId);
      expect(done.body.completedAt).toBeTruthy();

      const list = await request(app.getHttpServer())
        .get(`${base}/${listId}`)
        .set(auth(member))
        .expect(200);
      // open first, then completed
      expect(list.body.items.map((i: { name: string }) => i.name)).toEqual(['Eggs', 'Milk']);

      const reopened = await request(app.getHttpServer())
        .patch(`${base}/${listId}/items/${milkId}`)
        .set(auth(member))
        .send({ completed: false })
        .expect(200);
      expect(reopened.body).toMatchObject({
        completed: false,
        completedAt: null,
        completedBy: null,
      });
    });

    it('edits fields and can clear optional ones with empty strings', async () => {
      const res = await request(app.getHttpServer())
        .patch(`${base}/${listId}/items/${milkId}`)
        .set(auth(member))
        .send({ name: 'Oat milk', quantity: '', notes: 'the blue one' })
        .expect(200);
      expect(res.body).toMatchObject({ name: 'Oat milk', quantity: null, notes: 'the blue one' });
    });

    it('summaries and the dashboard reflect open items', async () => {
      const lists = await request(app.getHttpServer()).get(base).set(auth(owner)).expect(200);
      const summary = lists.body.find((l: { id: string }) => l.id === listId);
      expect(summary).toMatchObject({ openItems: 2, totalItems: 2 });

      const dash = await request(app.getHttpServer())
        .get(`/api/households/${householdId}/dashboard`)
        .set(auth(owner))
        .expect(200);
      expect(dash.body.today.shopping.openItems).toBe(2);
      expect(dash.body.today.shopping.lists).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: listId, openItems: 2 })]),
      );
    });

    it('logs list creation, item added and item completed to the activity feed', async () => {
      await request(app.getHttpServer())
        .patch(`${base}/${listId}/items/${eggsId}`)
        .set(auth(owner))
        .send({ completed: true })
        .expect(200);

      const feed = await request(app.getHttpServer())
        .get(`/api/households/${householdId}/activity?limit=10`)
        .set(auth(owner))
        .expect(200);
      const actions = feed.body.items.map((a: { action: string }) => a.action);
      expect(actions).toContain('shopping.list_created');
      expect(actions).toContain('shopping.item_added');
      expect(actions[0]).toBe('shopping.item_completed');
      expect(feed.body.items[0].metadata).toMatchObject({
        itemName: 'Eggs',
        listName: 'Items list',
      });
    });

    it('clear-completed removes only completed items', async () => {
      const res = await request(app.getHttpServer())
        .post(`${base}/${listId}/items/clear-completed`)
        .set(auth(member))
        .expect(200);
      expect(res.body).toEqual({ removed: 1 });

      const list = await request(app.getHttpServer())
        .get(`${base}/${listId}`)
        .set(auth(member))
        .expect(200);
      expect(list.body.items.map((i: { name: string }) => i.name)).toEqual(['Oat milk']);
    });

    it('deletes items and 404s for items from other lists', async () => {
      const other = await request(app.getHttpServer())
        .post(base)
        .set(auth(owner))
        .send({ name: 'Another list' })
        .expect(201);
      await request(app.getHttpServer())
        .delete(`${base}/${other.body.id}/items/${milkId}`)
        .set(auth(owner))
        .expect(404);

      await request(app.getHttpServer())
        .delete(`${base}/${listId}/items/${milkId}`)
        .set(auth(owner))
        .expect(204);
      const list = await request(app.getHttpServer())
        .get(`${base}/${listId}`)
        .set(auth(member))
        .expect(200);
      expect(list.body.items).toEqual([]);
    });
  });
});
