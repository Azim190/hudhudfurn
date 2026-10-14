# ADR-0001: Technology stack and version pinning

- Status: Accepted
- Date: 2026-10-14

## Context
The brief recommends Next.js, NestJS, PostgreSQL + Prisma/TypeORM, Redis, Meilisearch/OpenSearch, BullMQ and Flutter inside a monorepo. Several of these projects released new major versions in the months before this decision (TypeScript 7 native compiler, Next.js 16, NestJS 12, Prisma 8 RC). Their ecosystems (ts-jest, Nest CLI, ESLint plugins) are still catching up.

## Decision
- **Monorepo**: pnpm workspaces + Turborepo 2.
- **Language**: TypeScript 5.9 (strict). We will revisit TS 7 once Nest and Jest tooling fully support it.
- **API**: NestJS 11, REST with `@nestjs/swagger` (OpenAPI 3), class-validator DTOs, pino logging.
- **ORM**: Prisma 6.19 (stable line). We chose Prisma over TypeORM for its type-safe client, migration workflow and seeding ergonomics.
- **Web**: Next.js 15.5 App Router + React 19, next-intl 4, Tailwind CSS 4 (native logical utilities, so no RTL plugin).
- **Search**: Meilisearch, which is simpler to operate than OpenSearch. Arabic normalization lives in our own code (`@hudhud/domain/search`), so switching engines later stays cheap.
- **Queues**: BullMQ on Redis 7.
- **Tests**: Vitest for `packages/*` and web apps, Jest for NestJS (with first-class Nest testing utilities), Playwright for E2E.
- **Mobile**: Flutter stable with `flutter_localizations` + ARB, `go_router`, `dio`, `flutter_secure_storage`.

## Consequences
- We plan major-version upgrades in a later phase, once the ecosystem settles.
- Domain logic lives in a dependency-free package that both the API and the web apps can use, so it can be tested in isolation to the required ≥90% coverage.
