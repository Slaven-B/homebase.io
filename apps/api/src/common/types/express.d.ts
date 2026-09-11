import { AuthenticatedUser } from './authenticated-user';

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthenticatedUser;
  }
}
