import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { RefreshToken, User } from '@prisma/client';
import * as argon2 from 'argon2';
import { AppConfigService } from '../config/app-config.service';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import { hashToken } from './token.util';

const user: User = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'anna@example.com',
  passwordHash: '',
  displayName: 'Anna',
  avatarUrl: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};

interface PrismaMock {
  user: { create: jest.Mock };
  refreshToken: {
    create: jest.Mock;
    findUnique: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
  };
  $transaction: jest.Mock;
}

describe('AuthService', () => {
  let service: AuthService;
  let jwt: JwtService;
  let users: { findByEmail: jest.Mock };
  let prisma: PrismaMock;
  const config = {
    jwtAccessSecret: 'unit-test-secret-unit-test-secret-0123456789',
    jwtAccessTtlSeconds: 900,
    refreshTokenTtlDays: 30,
  };

  beforeAll(async () => {
    user.passwordHash = await argon2.hash('correct horse battery', { type: argon2.argon2id });
  });

  beforeEach(async () => {
    users = { findByEmail: jest.fn() };
    prisma = {
      user: { create: jest.fn() },
      refreshToken: {
        create: jest.fn().mockResolvedValue(undefined),
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue(undefined),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      $transaction: jest.fn(),
    };
    // Run the transaction callback against the same mocks.
    prisma.$transaction.mockImplementation((fn: (tx: PrismaMock) => unknown) => fn(prisma));

    const moduleRef = await Test.createTestingModule({
      imports: [JwtModule.register({})],
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: UsersService, useValue: users },
        { provide: AppConfigService, useValue: config },
      ],
    }).compile();

    service = moduleRef.get(AuthService);
    jwt = moduleRef.get(JwtService);
  });

  describe('register', () => {
    it('hashes the password, stores the user and issues tokens', async () => {
      users.findByEmail.mockResolvedValue(null);
      prisma.user.create.mockImplementation(
        ({ data }: { data: { email: string; passwordHash: string; displayName: string } }) =>
          Promise.resolve({ ...user, ...data }),
      );

      const result = await service.register({
        email: 'anna@example.com',
        password: 'correct horse battery',
        displayName: 'Anna',
      });

      const created = (prisma.user.create.mock.calls[0] as [{ data: { passwordHash: string } }])[0]
        .data;
      expect(created.passwordHash).not.toBe('correct horse battery');
      expect(created.passwordHash.startsWith('$argon2id$')).toBe(true);

      expect(result.user).not.toHaveProperty('passwordHash');
      expect(result.user.email).toBe('anna@example.com');
      expect(result.refreshToken).toHaveLength(43); // 32 bytes base64url
      expect(prisma.refreshToken.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ tokenHash: hashToken(result.refreshToken) }),
        }),
      );

      const payload = await jwt.verifyAsync<{ sub: string; email: string }>(result.accessToken, {
        secret: config.jwtAccessSecret,
      });
      expect(payload.sub).toBe(user.id);
      expect(payload.email).toBe('anna@example.com');
    });

    it('rejects duplicate emails', async () => {
      users.findByEmail.mockResolvedValue(user);

      await expect(
        service.register({ email: user.email, password: 'whatever-long', displayName: 'x' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.user.create).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    it('returns a session for valid credentials', async () => {
      users.findByEmail.mockResolvedValue(user);

      const result = await service.login({ email: user.email, password: 'correct horse battery' });

      expect(result.user.id).toBe(user.id);
      expect(result.accessToken).toBeTruthy();
    });

    it('rejects a wrong password', async () => {
      users.findByEmail.mockResolvedValue(user);

      await expect(
        service.login({ email: user.email, password: 'nope-nope-nope' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects an unknown email with the same error', async () => {
      users.findByEmail.mockResolvedValue(null);

      await expect(
        service.login({ email: 'ghost@example.com', password: 'whatever-long' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('refresh', () => {
    const stored = (overrides: Partial<RefreshToken> = {}): RefreshToken & { user: User } => ({
      id: 'token-id',
      userId: user.id,
      familyId: 'family-1',
      tokenHash: hashToken('raw-token'),
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
      createdAt: new Date(),
      user,
      ...overrides,
    });

    it('revokes the presented token and issues a new one in the same family', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(stored());

      const result = await service.refresh('raw-token');

      expect(prisma.refreshToken.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'token-id' } }),
      );
      expect(prisma.refreshToken.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ familyId: 'family-1' }) }),
      );
      expect(result.refreshToken).not.toBe('raw-token');
    });

    it('rejects unknown tokens', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(null);

      await expect(service.refresh('unknown')).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects expired tokens', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(
        stored({ expiresAt: new Date(Date.now() - 1000) }),
      );

      await expect(service.refresh('raw-token')).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.refreshToken.create).not.toHaveBeenCalled();
    });

    it('treats a revoked token as reuse and revokes the whole family', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(stored({ revokedAt: new Date() }));

      await expect(service.refresh('raw-token')).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { familyId: 'family-1', revokedAt: null } }),
      );
    });
  });

  describe('logout', () => {
    it('revokes the family of a known token', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({ familyId: 'family-1' });

      await service.logout('raw-token');

      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { familyId: 'family-1', revokedAt: null } }),
      );
    });

    it('is a no-op without a token', async () => {
      await service.logout(undefined);
      expect(prisma.refreshToken.findUnique).not.toHaveBeenCalled();
    });
  });
});
