import { createHash, randomBytes, randomUUID } from 'node:crypto';

/** 256 bits of randomness, URL-safe. */
export function generateOpaqueToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Refresh tokens are high-entropy, so a plain SHA-256 is sufficient (no salt needed). */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function newFamilyId(): string {
  return randomUUID();
}
