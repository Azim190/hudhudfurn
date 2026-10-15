# Assumptions & Documented Defaults

Each item below is a sensible default chosen so work is not blocked. All of them can be changed through configuration (settings, env or seed data) unless marked **(code)**.

## Business
1. **Working name "HUDHUD" (هدهد)** — taken from the repository folder. The store name, logo and colours are settings (§15).
2. **Single store and single legal entity** with one VAT registration, and several branches/warehouses. Multi-tenancy is out of scope **(code)**.
3. **Prices are VAT-inclusive** by default (normal B2C practice in KSA). The VAT rate is 15%, stored as `1500` basis points so a future change needs no code.
4. **Currency is SAR only**, stored as integer halalas. Display: `١٢٣٫٠٠ ر.س` (ar) / `SAR 123.00` (en). Digit style is a user preference.
5. **Rounding**: VAT is computed per line and rounded half-up to the halala, and document totals are the sum of the lines (as ZATCA validation expects).
6. **Fabric rounding** default: the number of fabric widths (drops) is rounded *up* to a whole width, and the cut length is rounded up to the nearest 10 cm. Both are admin-configurable.
7. **Default fullness ratios**: wave 2.2, pinch pleat 2.5, eyelet 1.9, rod pocket 2.0. Side hem 5 cm per side, bottom hem 15 cm, heading allowance 10 cm, centre overlap 10 cm for pairs.
8. **Return windows**: standard 7 days (abayas: unworn with tags; bedding: sealed only; made-to-measure: defects only, 3 days to report). This follows the KSA e-commerce law baseline. Final values come from the client.
9. **COD** is enabled with a 15 SAR fee, limited to cities flagged `cod_allowed`, and blocked for made-to-measure orders (production cost risk).
10. **Measurement visit fee**: 50 SAR, credited against an order placed within 30 days; free above 1,500 SAR.
11. **Order numbers** look like `HD-2026-000123`, and invoice numbers like `INV-2026-000123` (sequential per ZATCA ICV).

## Technical
12. **Stack versions pinned** to stable lines: TypeScript 5.9, Node 22+ (24 in dev), Next.js 15.5, React 19, NestJS 11, Prisma 6.19, Tailwind 4, next-intl 4, Turborepo 2. See ADR-0001.
13. **Tailwind v4 needs no RTL plugin**: it has built-in logical utilities (`ms-*`, `pe-*`, `start-*`, `text-start`) and `rtl:`/`ltr:` variants. A lint rule bans physical utilities (`ml-`, `pr-`, `left-`, `text-left`).
14. **Search**: Meilisearch, with a custom Arabic normalizer applied at index time and at query time (strip tashkeel and tatweel; أ/إ/آ→ا; ة→ه; ى→ي; ؤ→و; ئ→ي). Meilisearch's typo tolerance handles misspellings.
15. **Payments**: Moyasar is the first concrete adapter (it supports Mada, Visa/MC, Apple Pay and STC Pay with hosted tokenization). Tabby and Tamara are separate BNPL adapters. All adapters sit behind the `PaymentGateway` port, and sandbox credentials come from env.
16. **SMS**: Unifonic is the first adapter. **WhatsApp**: Meta Cloud API. **Email**: SMTP (Mailpit locally). **Push**: FCM (covers APNs).
17. **Shipping**: Aramex is the first carrier adapter, with SMSA and SPL behind the same port. The own fleet is a "manual carrier".
18. **ZATCA**: the module builds UBL 2.1 XML, computes the hash and chain, signs with ECDSA secp256k1, and produces the Phase 2 TLV QR (tags 1–9). Onboarding (CSR → compliance CSID → production CSID) is a CLI command. It runs against the ZATCA **sandbox** until the client supplies real credentials.
19. **Maps**: Google Maps JS on web and `google_maps_flutter` on mobile. The National Address short code is captured and validated by format; the SPL National Address API lookup is an optional adapter.
20. **Hijri dates**: computed with `Intl.DateTimeFormat` using `islamic-umalqura` (no extra dependency).
21. **Hosting target**: a GCC region (e.g. AWS me-central-1 UAE, Oracle Jeddah, or STC Cloud / Google Dammam for in-Kingdom residency), packaged as Docker images. This repository ships Docker images, docker-compose and CI, plus an IaC skeleton (Terraform). The provider is not locked in.
22. **Mobile**: Flutter is not installed on this development machine. The Flutter app is written in Phase 9, and its build and tests run in CI (or once the SDK is installed locally).
23. **Media**: S3-compatible (MinIO locally). Renditions are produced by a `sharp` worker. A malware scanning hook is defined as a port, with a ClamAV adapter as an optional container.
24. **Seed data**: product images use generated placeholder SVGs stored in MinIO. Arabic and English copy is realistic but invented.

## Open decisions (defaults applied; the client should confirm)
- Payment aggregator: **Moyasar** (default) vs HyperPay / PayTabs / Tap.
- Carriers at launch: **Aramex + own fleet** (default).
- Hosting region and provider.
- Brand identity (name, logo, colours). The default theme is a neutral warm palette with IBM Plex Sans Arabic + IBM Plex Sans.

## Added during Phase 1
25. **Digits default to Western (123) in both languages**, matching common practice on large Saudi storefronts. Arabic-Indic (١٢٣) is one tap away in the header and is saved to the customer's profile.
26. **Local ports**: API 4100, storefront 3100, admin 3101, Postgres 55432, Redis 56379. These avoid other services already running on the development machine, and every one is configurable through env.
27. **Object storage**: SeaweedFS (S3-compatible) replaces MinIO locally, because MinIO no longer publishes public container images. Production uses a managed S3-compatible service.
28. **First visits always open in Arabic**, whatever the browser's language, because many Saudi customers use English-language devices. Once a visitor picks a language with the switcher, that choice is stored in the `NEXT_LOCALE` cookie and wins on later visits. Signed-in users also have it saved to their profile.

## Added during Phase 2
29. **Product URLs** are `/ar/p/<arabic-slug>` and `/en/p/<english-slug>`, and category URLs are `/ar/c/<slug>` and `/en/c/<slug>`. Arabic slugs keep Arabic letters, and the API resolves either language's slug.
30. **Stock is counted per location** (warehouse, branch, workshop). The storefront only shows whether an item is available or running low, never exact counts. Made-to-measure products are always available, because they are produced per order.
31. **Facet filters** use the query form `f.<attribute>=code1,code2`: values of one attribute are ORed and different attributes are ANDed.
32. **Windows Smart App Control** can block Rollup's unsigned native binary, so a pnpm override swaps in `@rollup/wasm-node` (functionally identical).
