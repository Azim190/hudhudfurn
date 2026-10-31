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
docker build -f infra/docker/Dockerfile --build-arg SERVICE=api -t hudhud-api .
docker build -f infra/docker/Dockerfile --build-arg SERVICE=storefront --build-arg ADMIN_URL=http://admin:3101 -t hudhud-storefront .
docker build -f infra/docker/Dockerfile --build-arg SERVICE=admin -t hudhud-admin .
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

## Test site on Render

[render.yaml](../../render.yaml) deploys a **test site only** on Render's free plans. It is not a production setup:

- The API runs with `NODE_ENV=development` so that it can use the console SMS provider and the payment simulator.
- Anyone can read sign-in codes at `/api/v1/dev/sms`, so never enter real customer data.
- There is no Meilisearch, so listings and search use the slower Postgres fallback.
- Free services sleep after 15 minutes without traffic. The first visit afterwards takes a minute or more because the storefront and API both have to wake.
- The free database expires after 30 days, and Render deletes it after a further 14 days unless it is upgraded.

### 1. Create the storage

Render has no object storage, so use Cloudflare R2 or another S3-compatible service:

1. Create two buckets: `hudhudfurn-media` and `hudhudfurn-private`.
2. Turn on public access for `hudhudfurn-media` only. Its public URL is your `MEDIA_PUBLIC_BASE_URL`.
3. Create an API token with read and write access to both buckets. Note its access key, secret key and S3 endpoint.

### 2. Deploy the Blueprint

1. In the Render dashboard, choose **New > Blueprint** and connect this repository.
2. Enter `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` and `MEDIA_PUBLIC_BASE_URL` when asked.
3. Confirm the three web services kept their names. If Render added a suffix to any of them, update the URLs in `render.yaml` and push.

### 3. Load the data

The API starts with an empty catalog. Seed it once from a machine with Docker:

```bash
cp infra/render/seed.env.example .env.render.local   # then fill it in
bash scripts/seed-render.sh .env.render.local
```

This takes 20 minutes or more, and is safe to re-run if it stops. It creates the first owner account, sample products and showroom content.

### 4. Sign in

- **Storefront:** `https://hudhudfurn-web.onrender.com/ar`
- **Admin:** `https://hudhudfurn-web.onrender.com/admin/ar/login`. Set up 2FA with an authenticator app at first sign-in.
- **Customer sign-in code:** use any valid Saudi mobile number, then open `https://hudhudfurn-api.onrender.com/api/v1/dev/sms?to=05XXXXXXXX`.
- **Checkout:** card, Tabby and Tamara open the payment simulator. No real money moves.
