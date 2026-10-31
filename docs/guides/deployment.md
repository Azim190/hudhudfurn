# Deployment

HUDHUD runs as three containers built from [infra/docker/Dockerfile](../../infra/docker/Dockerfile), plus backing services. It is not tied to a hosting provider; see the hosting assumption in [04-assumptions.md](../planning/04-assumptions.md).

```
Internet ── TLS proxy ─┬─ storefront :3100 ── /admin/* ── admin :3101
                       └─ api :4100 (payment callbacks and webhooks)

storefront, admin ── API_INTERNAL_URL ── api ── Postgres 17, Redis 7, Meilisearch 1.15, S3
```

Only the storefront and the API need to be public. Keep the admin container private: the storefront proxies `/admin` to it.

## Build the images

Run from the repository root:

```bash
docker build -f infra/docker/Dockerfile --target api -t hudhud-api .
docker build -f infra/docker/Dockerfile --target storefront --build-arg ADMIN_URL=http://admin:3101 -t hudhud-storefront .
docker build -f infra/docker/Dockerfile --target admin -t hudhud-admin .
```

- `ADMIN_URL` is baked into the storefront image. Rebuild the storefront if the admin's internal address changes, and set the same value at runtime.
- The build downloads IBM Plex from Google Fonts. An occasional `next/font` error (`Cannot read properties of null`) comes from that download. Run the build again.
- No API is needed during the build. Pages built without one fall back to their empty state until they refresh: the home page within 5 minutes and the sitemap within an hour.

## What production requires

The API refuses to start with `NODE_ENV=production` unless all of these hold:

| Setting | Required value |
|---|---|
| `STAFF_MFA_REQUIRED` | `true` |
| `SWAGGER_ENABLED` | `false` |
| `PAYMENTS_SIMULATOR` | `false` |
| `SMS_PROVIDER` | `unifonic`, with `UNIFONIC_APP_SID` and `UNIFONIC_SENDER_ID` |
| `ZATCA_PRIVATE_KEY` | Set. See [ADR-0004](../adr/0004-checkout-payments-e-invoicing.md) |

Customers sign in by SMS code, so nobody can log in to the storefront without a working Unifonic account. Without payment keys (`MOYASAR_*`, `TABBY_*`, `TAMARA_*`), customers cannot pay.

## Environment

[.env.example](../../.env.example) documents every variable. Generate new secrets for each environment; never reuse development values.

**API:** all of the API section, with these public values:

| Variable | Value |
|---|---|
| `STOREFRONT_URL` | `https://<your-domain>` |
| `API_PUBLIC_URL` | Public HTTPS URL of the API, used by payment gateways |
| `CORS_ORIGINS` | `https://<your-domain>` |
| `MEDIA_PUBLIC_BASE_URL` | Public URL of the media bucket or CDN |
| `STOREFRONT_REVALIDATE_URL` | Internal storefront URL + `/bff/revalidate` |
| `TRUST_PROXY` | `true`. Rate limiting is per client IP, so the proxy must set `X-Forwarded-For` |

**Storefront:** `API_INTERNAL_URL`, `STOREFRONT_URL`, `ADMIN_URL`, `REVALIDATE_SECRET` (same value as the API).

**Admin:** `API_INTERNAL_URL`, `STOREFRONT_URL`.

**Storage:** `S3_BUCKET` must be publicly readable at `MEDIA_PUBLIC_BASE_URL`. `S3_PRIVATE_BUCKET` holds customer uploads and must never be public.

## First deployment

Run these from the API image with the API environment, after the backing services accept connections:

```bash
prisma migrate deploy
prisma db seed                # roles, permissions, cities and the owner account
node dist/cli/seed-catalog.js # optional: 48 sample products; re-running skips those already present
```

The seed creates the owner from `SEED_OWNER_EMAIL` and `SEED_OWNER_PASSWORD`. Remove both from the environment afterwards. The owner sets up 2FA at first sign-in at `/admin/ar/login`.

Then start the API, wait for `GET /api/v1/health/ready` to return 200, and start the storefront and admin.

## Each later deployment

1. Build and push new images.
2. Run `prisma migrate deploy` from the new API image.
3. Replace the API, then the storefront and admin.

## Check it worked

- `GET /api/v1/health/ready` returns `{"status":"ok","db":"up","redis":"up"}`.
- `/ar`, `/en` and `/admin/ar/login` return 200 on the public domain.
- `/docs` and `/api/v1/dev/sms` on the API return 404.
