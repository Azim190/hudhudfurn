# Module & Folder Plan

## Monorepo layout (pnpm workspaces + Turborepo)

```
/apps
  /api                 NestJS 11 — REST + OpenAPI, BullMQ workers (same image, different entrypoint)
  /storefront-web      Next.js 15 App Router — /ar and /en, SSR/ISR, PWA
  /admin-web           Next.js 15 — RBAC-gated dashboard, Arabic-first
  /mobile              Flutter — customer app + technician role
/packages
  /domain              Pure TypeScript, no I/O: money, VAT, pricing, configurator engine,
                       promotions engine, return-policy engine, ZATCA TLV/QR/hash, phone validation
  /i18n                AR/EN message catalogs (JSON), locale config, number/date/currency formatters
  /ui                  Shared RTL-ready React components (Tailwind v4 + logical properties)
  /api-client          Typed client generated from the OpenAPI spec (openapi-typescript)
  /config              Shared tsconfig, eslint and prettier presets
/infra
  docker-compose.yml   postgres, redis, meilisearch, minio, mailpit
  /docker              Dockerfiles per app
  /ci                  GitHub Actions workflows
/docs
  /adr  /planning  /api  /guides (admin AR/EN, deployment)
```

**Dependency rule.** Dependencies point inwards only: `apps/* → packages/api-client, ui, i18n → packages/domain`. The `domain` package depends on nothing. This keeps the money logic (pricing, VAT, ZATCA) reusable across the API, the storefront (live price preview) and mobile (through the API), and keeps it easy to unit-test to 90% coverage or more.

## API (NestJS) — Clean Architecture per module

Each feature module follows this structure:

```
src/modules/<module>/
  domain/          entities, value objects, domain services (may import @hudhud/domain)
  application/     use-cases (commands/queries), ports (interfaces) e.g. PaymentGateway
  infrastructure/  Prisma repositories, provider adapters (Moyasar, Aramex...), queue processors
  interface/       controllers, DTOs (class-validator), guards, OpenAPI decorators
  <module>.module.ts
```

| Module | Responsibility | Phase |
|---|---|---|
| `core` | config (validated env), Prisma, Redis, logger (pino), health, i18n of API errors, crypto | 1 |
| `auth` | customer OTP login, staff password + mandatory TOTP, JWT + rotating refresh, sessions | 1 |
| `rbac` | roles, permissions, `@RequirePermission()` guard | 1 |
| `audit` | interceptor that records admin mutations | 1 |
| `users` | profile, preferences (locale/digits/calendar), addresses, PDPL consents & requests | 1 |
| `catalog` | categories, attributes, products, variants, variant generator, media, size guides, collections, reviews | 2 |
| `search` | Meilisearch indexer and query, with Arabic normalization | 2 |
| `media` | signed uploads, validation, scan hook, renditions job | 2 |
| `inventory` | locations, stock levels, movements, fabric rolls, reservations, stocktakes | 2/7 |
| `cart` | guest and user carts, merge on login, pricing via domain engine | 3 |
| `wishlist` | wishlist, recently viewed, compare | 3 |
| `promotions` | coupons, automatic discounts, BXGY, bundles, free shipping | 4 |
| `checkout` | quote → order creation, stock reservation, idempotency keys | 4 |
| `payments` | `PaymentGateway` port, Moyasar/HyperPay/Tap/Tabby/Tamara/COD adapters, webhooks | 4 |
| `shipping` | `ShippingCarrier` port, Aramex/SMSA/SPL/own-fleet adapters, rates, labels, tracking | 4/8 |
| `invoicing` | VAT invoices, ZATCA Phase 2 XML/UBL, signing, hash chain, QR, credit notes | 4 |
| `orders` | lifecycle state machine, notes, split shipments, packing slips, job cards (PDF) | 4/7 |
| `returns` | policy engine, return requests, refunds, credit notes | 7 |
| `configurator` | templates, heading styles, options, quote endpoint, saved configurations, measurement profiles | 5 |
| `services` | service areas, slots, bookings, technicians, measurement records, quotations | 6 |
| `workshop` | production queue, tailors, job status | 7 |
| `content` | banners, home blocks, legal pages | 3/7 |
| `marketing` | campaigns, abandoned-cart jobs, segments, push broadcasts | 7 |
| `reports` | sales, VAT, payment, returns reports; Excel/PDF export | 7 |
| `notifications` | templates, `SmsProvider`/`WhatsAppProvider`/`EmailProvider`/`PushProvider` ports, BullMQ dispatch | 8 |
| `settings` | typed key/value settings, feature flags (loyalty, samples, motorization, gift wrap) | 1/7 |
| `loyalty` | points ledger (feature-flagged) | 7 |

## `packages/domain` modules

```
src/
  money/          Money (integer halalas), allocation without rounding loss, formatting-free
  tax/            VAT computation (inclusive and exclusive), line and document rounding
  pricing/        price modes: FIXED, PER_METER, PER_SQM, CALCULATED
  configurator/   curtain/blind engine, abaya and sofa-cover engines, formula evaluator (safe AST)
  promotions/     rule evaluation → discount allocation per line
  returns/        policy evaluation (made-to-measure, tags, sealed hygiene items)
  zatca/          TLV QR encoder, invoice hash, chain validator, UBL builder (pure)
  phone/          Saudi E.164 normalization and validation
  orders/         order state machine (allowed transitions)
  rbac/           permission catalog and default role matrix (shared by API and admin UI)
```

## Web apps

```
apps/storefront-web/src/
  app/[locale]/(shop)/...      home, category, product, search, cart, checkout
  app/[locale]/account/...     orders, addresses, measurements, configurations, bookings
  i18n/                        next-intl routing + request config
  components/                  storefront-only components
  lib/                         api client, analytics (consent-aware), formatters
apps/admin-web/src/
  app/[locale]/(auth)/login    password → TOTP
  app/[locale]/(dash)/...      dashboard, catalog, inventory, orders, workshop, bookings, customers,
                               marketing, reports, settings, users & roles, audit log
```

## Mobile (Flutter)

```
apps/mobile/lib/
  core/        di, router (go_router), theme, l10n (ARB), secure storage, api client (dio)
  features/
    auth/ catalog/ product/ configurator/ cart/ checkout/ account/ bookings/
    technician/  jobs list, job detail, measurement capture, photos, signature
```
