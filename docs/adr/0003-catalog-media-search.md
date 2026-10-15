# ADR-0003: Catalog data, media pipeline and search

- Status: Accepted
- Date: 2026-10-15

## Context
Phase 2 adds a bilingual catalog with per-category facets, variant matrices, responsive images and Arabic-aware search. It must scale to thousands of products and keep the storefront fast (ISR pages, CDN images).

## Decisions

**Bilingual columns.** Localized text is stored as `*_ar` / `*_en` column pairs rather than JSON. Every catalog field is a short string that gets edited, validated, searched and exported column by column. Typed columns keep Prisma types, validation and CSV import/export simple. Arabic is required and English is optional; the completeness score shows what is missing.

**Attributes are configured per category and inherited.** A `CategoryAttribute` row says whether an attribute is a storefront facet, a variant axis (colour, size, bed size, abaya length) or required. Children inherit their ancestors' configuration, and the closest definition wins. Attribute keys and value codes are immutable, because they appear in URLs (`f.color=navy`), SKUs and search facets.

**Variants are never deleted.** Regenerating the matrix creates new combinations and deactivates removed ones, because order lines will reference variants. Each variant has a stable `optionKey` (`color=navy|size=m`). Exactly one default variant per product is enforced by a partial unique index.

**Prices are integer halalas.** A variant's `price = null` means "use the product base price". The meaning of `basePrice` follows the pricing mode: per item, per metre, per m², or the "from" price shown for made-to-measure (CALCULATED) products, which the configurator prices in Phase 5.

**Media pipeline.**
1. Uploads are validated by decoding them with sharp. The client's MIME type is ignored, and SVG is rejected because it can carry scripts.
2. The original is re-encoded, which strips EXIF/GPS data.
3. A malware-scan port is called; a ClamAV adapter can be plugged in later.
4. The normalized original is stored in S3-compatible storage.
5. A BullMQ job generates WebP and AVIF at 320/640/960/1440/1920 px, never upscaling.
6. Keys are content-addressed per asset and served with `Cache-Control: immutable`.

Locally this uses SeaweedFS (MinIO no longer publishes images). In production it's any S3 service behind a CDN (`MEDIA_PUBLIC_BASE_URL`).

**Search: Meilisearch with our own Arabic normalization.**
- Normalization: hamza forms → ا, ة → ه, ى → ي, diacritics and tatweel removed, Arabic-Indic digits converted. It's applied identically to indexed text and to queries. Meilisearch adds typo tolerance, but not for SKUs or numbers.
- Queries first require every word to match, and fall back to the most-relevant-words strategy only when that returns nothing.
- Facets are disjunctive: counts for an attribute ignore that attribute's own selection, computed with a multi-search.
- Each document carries a pre-rendered product card, so listings need no database round-trip.
- Indexing runs in a BullMQ queue, de-duplicated per product, after every catalog write.
- If Meilisearch is down, listings fall back to the database without facet counts (`degraded: true`).

**Meilisearch access goes through a small REST client.** The official JS client is ESM-only and can't load in the CommonJS NestJS/Jest toolchain. We use a ~100-line typed REST client (`meili-client.ts`) instead.

**Queues: BullMQ on the existing Redis.** Workers (media, search, import) run inside the API process when `WORKERS_ENABLED=true`, and can be split into a dedicated worker deployment later without code changes.

**Imports: one row per variant, validated before any write.** A product with any invalid row is skipped entirely and reported with its row number. A product imported as ACTIVE that fails the publish rules stays a draft, with a warning. Exports use the same columns, so files round-trip, and CSV starts with a UTF-8 BOM so Excel shows Arabic correctly.

## Consequences
- Search can be rebuilt from the database at any time (`POST /admin/search/reindex`).
- A future engine switch (e.g. OpenSearch) only touches `SearchService`; the normalizer lives in `@hudhud/domain`.
