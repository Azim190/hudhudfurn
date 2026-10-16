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

## Added during Phase 3
33. **Guest carts** are identified by an opaque token kept in an httpOnly cookie for 30 days, and only its hash is stored. At sign-in the guest cart merges into the customer's cart, with quantities capped by available stock. A customer has at most one active cart, enforced by a partial unique index.
34. **Cart limits** (settings `cart.limits`): 50 lines, 20 units per line and 3 fabric samples per line. Stock is checked when items are added and again on every cart view. It is reserved only at checkout (Phase 4).
35. **Gift wrapping** is SAR 15 per wrapped unit (settings `cart.giftWrap`, switched on by `modules.enabled.giftWrapping`). It is taxed together with its line.
36. **Measured products**: blinds take width × height between 20 and 600 cm, and fabric takes a length between 50 and 2000 cm. Made-to-measure products priced by the configurator (CALCULATED) can't be added to the cart until the configurator exists (Phase 5); the product page offers WhatsApp contact instead.
37. **Interim delivery estimate** (settings `shipping.eta`): Riyadh 1–2 business days, other major cities 2–3, everywhere else 3–5, plus 7–12 days of tailoring for made-to-measure. Shipping zones and carrier ETAs replace this in Phase 4.
38. **Reviews** are listed now. Customers submit them after a delivered order, so submission and moderation arrive with orders.
39. **Wishlist** is saved on the device for guests and moves into the account at sign-in. Compare holds up to 4 products and recently viewed holds 12, both device-local.
40. **Caching**: the home and product pages are ISR (5 minutes), and category and search pages render per request from cached API data. Catalog and content writes trigger on-demand revalidation, so edits appear within seconds.

## Added during Phase 4
41. **Shipping zones** (seeded, editable in the admin API):
    - Riyadh: own fleet, SAR 25 (free from SAR 300, 1–2 days), or same day SAR 45.
    - Major cities (Jeddah, Makkah, Madinah, Dammam, Khobar, Dhahran): SMSA SAR 35 (free from SAR 400, 2–3 days), or Aramex express SAR 55.
    - Rest of the kingdom: SPL SAR 45 (free from SAR 500, 3–5 days).
    - Items without a weight count as 1 kg; fabric samples as 50 g. Made-to-measure orders add the tailoring time from `shipping.eta`.
42. **Cash on delivery** (settings `checkout.cod`): SAR 15 fee and orders up to SAR 5,000. Only in cities with `codAllowed`. Not for made-to-measure items (they are produced per order) and not for store pickup.
43. **Tabby/Tamara** are offered for orders between SAR 100 and SAR 5,000 (settings `payments.bnpl`) and require an email address. They are captured right after the customer approves, so the order is a firm sale.
44. **Unpaid card/BNPL orders** keep their stock and coupon for 30 minutes (settings `checkout.payment`). The customer can retry payment from the return or order page during that window. After it, the order is cancelled automatically.
45. **Store pickup** is offered from branches flagged as pickup points. They are ready in 1–3 business days (settings `checkout.pickup`), plus tailoring time.
46. **Guest orders** are accessed with an order token kept in an httpOnly cookie on the device (last 10 orders). Guests are recognised by phone number for first-order coupons and per-customer limits.
47. **Customers may cancel** an order themselves while it is awaiting payment, paid or confirmed, i.e. before tailoring or dispatch. Paid amounts are refunded in full to the original method and a credit note is issued.
48. **Sample seller data**: legal name "مؤسسة هدهد للمفروشات", CR 1010123456, VAT 300000000000003, King Fahd Road, Al Olaya, Riyadh. Replace these in settings `store.legal` before going live. Invoices are refused if the VAT number is not a valid Saudi format.
49. **Invoice numbering**: `INV-YYYY-NNNNNN` and `CN-YYYY-NNNNNN` reset yearly (Riyadh time); the ZATCA ICV never resets. Simplified invoices carry no buyer details (B2C). Standard B2B tax invoices (clearance) are out of scope until requested.
50. **VAT on inclusive prices** is extracted per line, half-up, so the customer pays exactly the displayed price. ZATCA's rate checks may report ±0.01 SAR rounding warnings on some lines; warnings do not block reporting.

## Added during Phase 5
51. **Curtain pricing** (template `CUSTOM_CURTAINS`):
    - Fabric is sold per metre at the variant price and cut to whole widths of the fabric's usable width (1.4 m standard, 2.8 m wide-width).
    - Making cost is per metre of rail: wave SAR 35, pinch pleat SAR 45, eyelet SAR 25, rod pocket SAR 20.
    - Lining is priced per metre of fabric; tracks and rods per metre of rail (window width plus 10 cm overhang each side); motors are a flat price; installation is a flat SAR 150.
52. **Dimension limits**: curtains 30–1200 cm wide and 30–500 cm high, up to 8 panels; blinds 30–300 × 30–350 cm, billed for at least 1 m² of area.
53. **Abaya tailoring** (template `CUSTOM_ABAYA`): optional on selected abayas. The price is the garment plus a SAR 50 tailoring fee. Measurements are length 120–165 cm, chest 70–160, shoulder 30–60 and sleeve 45–75. Custom abayas are made to order (no stock check, no COD).
54. **Sofa and majlis covers**: priced per piece (one-seater SAR 250 … three-seater SAR 450; majlis cushion SAR 180, backrest SAR 90, armrest SAR 45), with at least 1 photo, at most 8 photos and 20 pieces (40 for majlis). The advertised starting price is the minimum charge.
55. **Customer photos** are private, kept with the configuration for production and support, and purged within an hour of their 24-hour window if never attached. Retention after delivery follows the PDPL data-retention policy (Phase 10).
56. **"Book a measurement visit"** opened WhatsApp until Phase 6; it now opens the booking page with the product attached, and WhatsApp stays as a secondary link. **Units**: customers enter cm or inches; everything is stored in mm.

## Added during Phase 6
57. **Visit fees** are set per service area. The seed uses SAR 50 for a measurement visit and SAR 150 for installation, with installation free for orders of SAR 1,500 or more. Fees are paid online when booking, through the same payment providers and invoices as orders (one service line, VAT inclusive).
58. **Measurement credit**: a paid measurement fee is deducted from a quotation accepted within 30 days of payment (settings `services.booking.visitCreditDays`), but never below zero.
59. **Slots**: the seed creates four windows a day (09–12, 12–15, 16–19, 19–22) for three weeks, with no visits on Fridays, and 3 teams per window. Customers can book from 12 hours ahead and up to 21 days out (`leadHours`, `horizonDays`). An unpaid visit holds its slot for the 30-minute payment window and is then released.
60. **Changes and cancellations** by the customer are allowed up to 24 hours before the visit (`changeCutoffHours`), and a paid fee is refunded in full. Inside that window the customer contacts the store, which can still cancel or reassign from the admin. Rescheduling an assigned visit returns it to the office for reassignment.
61. **Quotations** are valid for 14 days (`quotationValidityDays`). Their prices are fixed when sent, even if catalog prices change. Issuing a new quotation cancels the previous open one. Accepting creates a prepaid order (card or Tabby/Tamara within their limits, no cash on delivery) delivered and installed by our own team. If that payment fails or expires, the quotation reopens while it is still valid.
62. **Measured mounting** maps onto the product template: wall and ceiling mean outside the recess for blinds, and recess means inside.
63. **Customer phone numbers** are shown to the technician in full only on the visit day (and while the visit is active); otherwise they are masked. A call-masking bridge (virtual numbers) is optional and not included.
64. **Signatures** are stored privately as PNG images linked to the visit, with photos under the same PDPL retention as other customer uploads.
65. **Notifications** go by SMS through the configured provider, in the language the customer booked in. WhatsApp templates and push notifications are added with the notification module in Phase 8, and the technician uses the responsive admin web app until the Flutter app ships in Phase 9.
66. **Service areas** are matched by city, optionally narrowed to districts. A city with no area shows a "not covered yet" message.
