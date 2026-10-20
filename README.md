# HUDHUD — Bilingual e-commerce for curtains, home textiles & abayas

An Arabic-first (RTL) and English e-commerce platform for the Saudi market. It includes a customer storefront (web/PWA plus Flutter apps), an admin dashboard, and a technician app.

## Repository layout

| Path | What it is |
|---|---|
| `apps/api` | NestJS 11 REST API with OpenAPI at `/docs`, Prisma (PostgreSQL) and Redis |
| `apps/storefront-web` | Next.js 15 storefront at `/ar` and `/en` (SSR/ISR, PWA) |
| `apps/admin-web` | Next.js 15 admin dashboard (staff 2FA, RBAC-gated) |
| `apps/mobile` | Flutter customer and technician app *(Phase 9)* |
| `packages/domain` | Pure business logic: money, VAT, pricing/configurator, ZATCA, RBAC catalog |
| `packages/i18n` | AR/EN message catalogs and SAR/number/date formatters |
| `packages/ui` | Shared RTL-ready React components and design tokens |
| `packages/web-core` | Server-side BFF helpers: API client, session cookies, token refresh |
| `e2e` | Playwright E2E and RTL/LTR visual tests |
| `infra` | docker-compose for local services |
| `docs` | ERD, module plan, API endpoint list, assumptions, ADRs |

Start with [docs/planning](docs/planning/) and [docs/adr](docs/adr/).

## Local development

Requirements: Node 22+ (24 recommended), pnpm 11, Docker.

```bash
pnpm install
pnpm infra:up                     # Postgres :55432, Redis :56379, Meilisearch :7700, S3 :8333, Mailpit :8025
cp .env.example apps/api/.env     # then fill in the secrets (generation commands are in the file)
pnpm db:migrate && pnpm db:seed   # schema, roles/permissions, cities, first owner account
pnpm build --filter "./packages/*"
pnpm --filter @hudhud/api build && pnpm --filter @hudhud/api seed:catalog   # 48 bilingual sample products with images (add -- --reset to rebuild)
pnpm dev
```

| Service | URL |
|---|---|
| API and Swagger | http://localhost:4100/api/v1 · http://localhost:4100/docs |
| Storefront | http://localhost:3100/ar |
| Admin | http://localhost:3100/admin (proxied by the storefront; also http://localhost:3101/admin directly) — sign in at `/admin/ar/login` (owner = `SEED_OWNER_EMAIL` / `SEED_OWNER_PASSWORD`; 2FA set-up is forced at first sign-in unless `STAFF_MFA_REQUIRED=false` in `apps/api/.env`, which is allowed only outside production) |
| Technician | Same admin app, `/ar/technician`, phone-sized (optional `SEED_TECHNICIAN_EMAIL` / `SEED_TECHNICIAN_PASSWORD` account) |
| Mailpit | http://localhost:8025 |

In development, OTP codes and booking messages appear in the API log as `[dev SMS] …` (`SMS_PROVIDER=console`). The last 10 per number are also kept for 15 minutes at `GET /api/v1/dev/sms?to=05…`, which the Playwright suite uses to sign customers in. That endpoint answers only with the console provider outside production, and the API refuses to start in production with that provider.

**Home visits:** the seed creates service areas for Riyadh, Jeddah and Dammam & Khobar with three weeks of slots. Book at http://localhost:3100/ar/services/book, assign the visit under *Visits* in the admin, then run it as the technician. See [ADR-0006](docs/adr/0006-home-services-quotations.md).

**Checkout without gateway credentials:** set `PAYMENTS_SIMULATOR=true`. Card, Tabby and Tamara payments then open a local hosted page (Pay / Decline / Cancel) with the same redirect, verification, capture and refund flow as the real gateways. Real providers are used whenever their keys are set (`MOYASAR_*`, `TABBY_*`, `TAMARA_*`). Sample coupons: `WELCOME10` (first order), `SAVE50` (orders over SAR 300) and `FREESHIP`.

Tax invoices are hashed, chained, signed and given a ZATCA QR code locally, using a generated development key. Reporting to ZATCA is enabled with `ZATCA_MODE` and the CSID credentials; see [ADR-0004](docs/adr/0004-checkout-payments-e-invoicing.md) for onboarding.

Each web app reads `API_INTERNAL_URL` (default `http://localhost:4100/api/v1`) from `.env.local`.

## Tests

```bash
pnpm test:cov                          # unit tests; domain & i18n enforce >= 90% coverage
pnpm --filter @hudhud/api test:e2e     # API integration tests on hudhud_test + Redis db 1
pnpm --filter @hudhud/e2e test:e2e     # Playwright, AR + EN, desktop + mobile (apps must be running)
node scripts/check-logical-css.mjs apps/storefront-web/src   # bans physical left/right CSS
```

## Build phases

| # | Phase | Status |
|---|---|---|
| 0 | ERD, module plan, API list, assumptions | ✅ |
| 1 | Foundation: monorepo, OTP auth, staff 2FA, RBAC, audit, i18n/RTL, design system | ✅ |
| 2 | Catalog: categories, products, variants, attributes, media, search, inventory, import/export | ✅ |
| 3 | Storefront browsing, product pages, cart, wishlist, compare, banners | ✅ |
| 4 | Checkout, payments, VAT, shipping, ZATCA invoices | ✅ |
| 5 | Made-to-measure configurators | ✅ |
| 6 | Measurement/installation services, technician flow, quotations | ✅ |
| 7 | Admin: orders, inventory, workshop, reports, marketing, settings | ⏳ next |
| 8 | Notifications and carrier integrations | |
| 9 | Flutter apps | |
| 10 | Hardening: security, performance, accessibility, docs | |
