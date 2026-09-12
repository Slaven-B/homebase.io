# Deployment

HomeBase ships as two containers plus PostgreSQL. The `docker-compose.yml` `app` profile is a
faithful single-host deployment: nginx serves the Angular build and proxies `/api` to the NestJS
container, which applies pending migrations on start.

```text
Browser ──HTTPS──▶ reverse proxy / TLS ──▶ web (nginx :80) ──/api──▶ api (:3000) ──▶ postgres
```

## 1. Prerequisites

- A Linux host with Docker Engine and the Compose plugin
- A domain pointed at the host and a TLS terminator in front (Caddy, Traefik or nginx with
  Let's Encrypt). HomeBase itself listens on plain HTTP inside the Docker network.

## 2. Configuration

Copy `.env.example` to `.env` on the host and set **at least**:

| Variable                 | Notes                                                               |
| ------------------------ | ------------------------------------------------------------------- |
| `POSTGRES_PASSWORD`      | Strong random value; also used in `DATABASE_URL`                    |
| `JWT_ACCESS_SECRET`      | ≥ 32 random characters (`openssl rand -base64 48`)                  |
| `JWT_ACCESS_TTL_SECONDS` | Access token lifetime (default 900)                                 |
| `CORS_ORIGIN`            | Your public origin, e.g. `https://home.example.com`                 |
| `COOKIE_SECURE`          | `true` behind HTTPS (refresh cookie gets the `Secure` flag)         |
| `WEB_PORT`               | Host port nginx is exposed on (default 4200); point your proxy here |

Everything else has sane defaults. Never commit `.env`.

## 3. Start

```bash
docker compose --profile app up -d --build
docker compose --profile app ps
curl -fsS http://localhost:${WEB_PORT:-4200}/api/health
```

The API container runs `prisma migrate deploy` before starting, so upgrades are:

```bash
git pull
docker compose --profile app up -d --build
```

Migrations are forward-only and additive so far; back up before upgrading anyway (below).

## 4. Reverse proxy example (Caddy)

```caddyfile
home.example.com {
  reverse_proxy 127.0.0.1:4200
}
```

Caddy provisions TLS automatically. Forwarded headers are passed through nginx to the API.

## 5. Backups

The database lives in the `postgres_data` volume.

```bash
# dump
docker exec homebase-postgres pg_dump -U homebase -d homebase | gzip > homebase-$(date +%F).sql.gz
# restore into an empty database
gunzip -c homebase-2026-09-12.sql.gz | docker exec -i homebase-postgres psql -U homebase -d homebase
```

Schedule the dump with cron and ship it off-host.

## 6. Operations

- **Logs**: `docker compose --profile app logs -f api` (Nest logs) / `web` (nginx access log).
- **Health**: `GET /api/health` returns 200 with `database.status = "up"`, 503 otherwise. Point
  your uptime monitor at it.
- **Reminders**: the API runs the daily reminder job at 08:00 server time (container is UTC; set
  `TZ` in `.env`, e.g. `TZ=Europe/Zagreb`, for local mornings).
- **Scaling**: a single API instance is plenty for a household. If you ever run several, the
  reminder cron must run on one instance only (add a leader flag) — noted in the code.

## 7. Security checklist

- HTTPS everywhere; `COOKIE_SECURE=true`.
- Rotate `JWT_ACCESS_SECRET` if leaked: existing access tokens stop verifying immediately;
  refresh tokens are opaque, hashed at rest, and can be revoked per user by logging out.
- Keep the PostgreSQL port unpublished in production (remove the `ports:` mapping on `postgres`
  or bind it to `127.0.0.1`).
- Auth endpoints are rate limited; the reverse proxy should add general request limits too.

## 8. Not included yet

- Email/push delivery of notifications (in-app only).
- Object storage for receipts (`Expense.receiptUrl` is reserved).
- Multi-instance coordination for the cron job.
