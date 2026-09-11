/** Identity attached to the request after access-token verification. */
export interface AuthenticatedUser {
  id: string;
  email: string;
}

export interface AccessTokenPayload {
  /** User id. */
  sub: string;
  email: string;
  iat?: number;
  exp?: number;
}
