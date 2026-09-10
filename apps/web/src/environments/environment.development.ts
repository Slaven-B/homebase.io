/**
 * Development environment. `ng serve` proxies `/api` to the NestJS server
 * (see proxy.conf.json), which avoids CORS during local development.
 */
export const environment = {
  production: false,
  apiUrl: '/api',
};
