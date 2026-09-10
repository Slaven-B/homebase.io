// Provide a minimal, valid environment for e2e runs that do not use a real database.
process.env.NODE_ENV ??= 'test';
process.env.DATABASE_URL ??=
  'postgresql://homebase:homebase@localhost:5432/homebase_test?schema=public';
process.env.CORS_ORIGIN ??= 'http://localhost:4200';
