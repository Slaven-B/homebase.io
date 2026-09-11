import { ConflictException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { User } from '@prisma/client';
import * as argon2 from 'argon2';
import { AccessTokenPayload } from '../common/types/authenticated-user';
import { AppConfigService } from '../config/app-config.service';
import { PrismaService } from '../prisma/prisma.service';
import { toPublicUser } from '../users/user.mapper';
import { UsersService } from '../users/users.service';
import { AuthResult } from './auth.types';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { generateOpaqueToken, hashToken, newFamilyId } from './token.util';

const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19 * 1024, // 19 MiB (OWASP minimum recommendation)
  timeCost: 2,
  parallelism: 1,
};

/** Constant-cost hash used when the email is unknown so timing does not reveal existence. */
const DUMMY_HASH_PROMISE = argon2.hash('dummy-password-for-timing', ARGON2_OPTIONS);

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly config: AppConfigService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResult> {
    const existing = await this.users.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const passwordHash = await argon2.hash(dto.password, ARGON2_OPTIONS);
    const user = await this.prisma.user.create({
      data: { email: dto.email, passwordHash, displayName: dto.displayName },
    });

    return this.issueSession(user, newFamilyId());
  }

  async login(dto: LoginDto): Promise<AuthResult> {
    const user = await this.users.findByEmail(dto.email);
    const hash = user?.passwordHash ?? (await DUMMY_HASH_PROMISE);
    const valid = await argon2.verify(hash, dto.password);

    if (!user || !valid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    return this.issueSession(user, newFamilyId());
  }

  /**
   * Rotates a refresh token. The presented token is revoked and a new one is issued
   * in the same family. Presenting an already-revoked token means it leaked (or was
   * replayed), so the whole family is revoked.
   */
  async refresh(rawToken: string): Promise<AuthResult> {
    const tokenHash = hashToken(rawToken);
    const now = new Date();

    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!stored) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (stored.revokedAt) {
      this.logger.warn(`Refresh token reuse detected for user ${stored.userId}; revoking family`);
      await this.revokeFamily(stored.familyId);
      throw new UnauthorizedException('Refresh token has been revoked');
    }

    if (stored.expiresAt <= now) {
      throw new UnauthorizedException('Refresh token has expired');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: now } });
      return this.issueSession(stored.user, stored.familyId, tx);
    });
  }

  /** Revokes the presented token's family. Unknown tokens are ignored (logout is idempotent). */
  async logout(rawToken: string | undefined): Promise<void> {
    if (!rawToken) return;
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(rawToken) },
      select: { familyId: true },
    });
    if (stored) {
      await this.revokeFamily(stored.familyId);
    }
  }

  private async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async issueSession(
    user: User,
    familyId: string,
    tx: Pick<PrismaService, 'refreshToken'> = this.prisma,
  ): Promise<AuthResult> {
    const refreshToken = generateOpaqueToken();
    const refreshTokenExpiresAt = new Date(
      Date.now() + this.config.refreshTokenTtlDays * 24 * 60 * 60 * 1000,
    );

    await tx.refreshToken.create({
      data: {
        userId: user.id,
        familyId,
        tokenHash: hashToken(refreshToken),
        expiresAt: refreshTokenExpiresAt,
      },
    });

    const payload: AccessTokenPayload = { sub: user.id, email: user.email };
    const expiresIn = this.config.jwtAccessTtlSeconds;
    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.jwtAccessSecret,
      expiresIn,
    });

    return {
      user: toPublicUser(user),
      accessToken,
      expiresIn,
      refreshToken,
      refreshTokenExpiresAt,
    };
  }
}
