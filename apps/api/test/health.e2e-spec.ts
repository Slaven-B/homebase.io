import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Boots the real AppModule with PrismaService replaced so the test is
 * deterministic regardless of whether a database is running.
 */
async function createApp(prismaMock: Partial<PrismaService>): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PrismaService)
    .useValue(prismaMock)
    .compile();

  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
  await app.init();
  return app;
}

describe('GET /api/health (e2e)', () => {
  let app: INestApplication;

  afterEach(async () => {
    await app?.close();
  });

  it('returns 200 and a healthy report when the database is reachable', async () => {
    app = await createApp({ ping: jest.fn().mockResolvedValue(undefined) });

    const res = await request(app.getHttpServer()).get('/api/health').expect(200);

    expect(res.body).toMatchObject({
      status: 'ok',
      checks: { database: { status: 'up' } },
    });
    expect(typeof res.body.timestamp).toBe('string');
    expect(typeof res.body.uptimeSeconds).toBe('number');
  });

  it('returns 503 and a degraded report when the database is unreachable', async () => {
    app = await createApp({ ping: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')) });

    const res = await request(app.getHttpServer()).get('/api/health').expect(503);

    expect(res.body).toMatchObject({
      status: 'degraded',
      checks: { database: { status: 'down' } },
    });
  });

  it('returns 404 for unknown routes', async () => {
    app = await createApp({ ping: jest.fn().mockResolvedValue(undefined) });

    await request(app.getHttpServer()).get('/api/does-not-exist').expect(404);
  });
});
