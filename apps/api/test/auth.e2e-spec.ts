import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Runs against the real `homebase_test` database (migrated by `pretest:e2e`).
 * Each run uses unique emails so tests are independent and repeatable.
 */
describe('Auth flows (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const runId = Date.now().toString(36);
  const email = (name: string) => `${name}-${runId}@e2e.local`;
  const password = 'a-long-enough-password';

  const readCookie = (res: request.Response): string | undefined => {
    const raw = res.headers['set-cookie'] as string | string[] | undefined;
    const cookies: string[] = Array.isArray(raw) ? raw : raw ? [raw] : [];
    return cookies.find((c) => c.startsWith('hb_refresh='));
  };
  const cookieValue = (setCookie: string): string => setCookie.split(';')[0];

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
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { endsWith: `-${runId}@e2e.local` } } });
    await app.close();
  });

  describe('register', () => {
    it('creates an account, returns an access token and sets the refresh cookie', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ email: email('anna'), password, displayName: 'Anna' })
        .expect(201);

      expect(res.body.user).toMatchObject({ email: email('anna'), displayName: 'Anna' });
      expect(res.body.user).not.toHaveProperty('passwordHash');
      expect(typeof res.body.accessToken).toBe('string');
      expect(res.body).not.toHaveProperty('refreshToken');

      const cookie = readCookie(res);
      expect(cookie).toBeDefined();
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('Path=/api/auth');
      expect(cookie).toContain('SameSite=Lax');
    });

    it('normalizes the email and rejects duplicates', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ email: email('dup'), password, displayName: 'Dup' })
        .expect(201);

      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ email: `  ${email('DUP').toUpperCase()} `, password, displayName: 'Dup 2' })
        .expect(409);
    });

    it('validates input and rejects unknown fields', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ email: 'not-an-email', password: 'short', displayName: '' })
        .expect(400);

      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ email: email('mass'), password, displayName: 'M', isAdmin: true })
        .expect(400);
    });
  });

  describe('login / me', () => {
    beforeAll(async () => {
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ email: email('ben'), password, displayName: 'Ben' })
        .expect(201);
    });

    it('rejects wrong credentials without revealing which part is wrong', async () => {
      const wrongPassword = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: email('ben'), password: 'wrong-password-xx' })
        .expect(401);
      const unknownUser = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: email('nobody'), password })
        .expect(401);

      expect(wrongPassword.body.message).toBe(unknownUser.body.message);
    });

    it('logs in and can read and update the profile with the access token', async () => {
      const login = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: email('ben'), password })
        .expect(200);
      const token = login.body.accessToken as string;

      const me = await request(app.getHttpServer())
        .get('/api/users/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(me.body.email).toBe(email('ben'));

      const updated = await request(app.getHttpServer())
        .patch('/api/users/me')
        .set('Authorization', `Bearer ${token}`)
        .send({ displayName: 'Benjamin' })
        .expect(200);
      expect(updated.body.displayName).toBe('Benjamin');

      await request(app.getHttpServer())
        .patch('/api/users/me')
        .set('Authorization', `Bearer ${token}`)
        .send({ email: 'hacker@example.com' })
        .expect(400);
    });

    it('protects routes by default', async () => {
      await request(app.getHttpServer()).get('/api/users/me').expect(401);
      await request(app.getHttpServer())
        .get('/api/users/me')
        .set('Authorization', 'Bearer not-a-real-token')
        .expect(401);
    });
  });

  describe('refresh / logout', () => {
    it('rotates the refresh token and detects reuse', async () => {
      const agent = request(app.getHttpServer());
      const login = await agent
        .post('/api/auth/register')
        .send({ email: email('cara'), password, displayName: 'Cara' })
        .expect(201);
      const first = cookieValue(readCookie(login)!);

      // First refresh: works, returns a new cookie.
      const refreshed = await agent.post('/api/auth/refresh').set('Cookie', first).expect(200);
      expect(typeof refreshed.body.accessToken).toBe('string');
      const second = cookieValue(readCookie(refreshed)!);
      expect(second).not.toBe(first);

      // Replaying the old token: rejected, and the whole family is revoked...
      await agent.post('/api/auth/refresh').set('Cookie', first).expect(401);
      // ...so the newer token no longer works either.
      await agent.post('/api/auth/refresh').set('Cookie', second).expect(401);
    });

    it('rejects a refresh without a cookie', async () => {
      await request(app.getHttpServer()).post('/api/auth/refresh').expect(401);
    });

    it('logout revokes the session and clears the cookie', async () => {
      const agent = request(app.getHttpServer());
      const login = await agent
        .post('/api/auth/register')
        .send({ email: email('dan'), password, displayName: 'Dan' })
        .expect(201);
      const cookie = cookieValue(readCookie(login)!);

      const logout = await agent.post('/api/auth/logout').set('Cookie', cookie).expect(204);
      expect(readCookie(logout)).toContain('Expires=Thu, 01 Jan 1970');

      await agent.post('/api/auth/refresh').set('Cookie', cookie).expect(401);
    });
  });
});
