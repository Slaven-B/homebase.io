import { PublicUser } from '../users/user.mapper';

/** Returned to the client. The refresh token travels separately in an httpOnly cookie. */
export interface AuthResponse {
  user: PublicUser;
  accessToken: string;
  /** Seconds until the access token expires. */
  expiresIn: number;
}

/** Internal result of an authentication step, before the controller splits it into body + cookie. */
export interface AuthResult extends AuthResponse {
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}
