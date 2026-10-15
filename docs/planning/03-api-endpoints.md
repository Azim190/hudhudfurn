# API Endpoint List (v1)

The base path is `/api/v1`. The response language is chosen by `Accept-Language: ar|en`, with Arabic as the default. Admin endpoints live under `/api/v1/admin/*` and require a staff JWT with 2FA completed, plus the listed permission. List endpoints support `?page=&limit=&sort=`. Mutating checkout and payment calls require an `Idempotency-Key` header.

Legend: **P** = public, **C** = authenticated customer, **G** = guest allowed (cart token), **S:perm** = staff with permission, **T** = technician, **W** = webhook (signature verified).

## Auth & account
| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | /auth/otp/request | P | Send an OTP to a Saudi mobile (rate limited per phone and per IP) |
| POST | /auth/otp/verify | P | Verify the OTP → access token + refresh cookie (creates the customer if new) |
| POST | /auth/staff/login | P | Email + password → `mfa_token` (short-lived) or a TOTP enrolment challenge |
| POST | /auth/staff/totp/enroll | P (mfa_token) | Returns the otpauth URI and QR for first-time setup |
| POST | /auth/staff/totp/verify | P (mfa_token) | TOTP code → staff tokens |
| POST | /auth/refresh | P (cookie/body) | Rotate the refresh token (reuse detection) |
| POST | /auth/logout | C | Revoke the current session |
| GET | /auth/sessions | C | List active sessions/devices |
| DELETE | /auth/sessions/:id | C | Revoke a session |
| GET / PATCH | /me | C | Profile + preferences (locale, digits, calendar) |
| GET / POST / PATCH / DELETE | /me/addresses[/:id] | C | Saved addresses |
| GET / PUT | /me/consents | C | PDPL consents |
| POST | /me/data-requests | C | Data export or deletion request |
| GET | /me/orders, /me/orders/:number | C | Order history and detail with tracking |
| GET | /me/orders/:number/invoice.pdf | C | Tax invoice PDF |
| GET / POST / DELETE | /me/measurement-profiles[/:id] | C | Saved abaya measurements |
| GET / DELETE | /me/configurations[/:id] | C | Saved made-to-measure configurations |
| GET | /me/bookings | C | Bookings |
| GET / POST / DELETE | /me/wishlist[/:productId] | C | Wishlist |
| POST / GET | /me/returns | C | Return requests |
| GET | /me/loyalty | C | Points balance and ledger (feature flag) |
| POST | /me/push-devices | C | Register an FCM/APNs token |

## Catalog & content (public)
| Method | Path | Purpose |
|---|---|---|
| GET | /categories | Tree with localized names and slugs |
| GET | /categories/:slug | Category + facet definitions |
| GET | /products | Faceted listing (`category, attrs[key]=v, price_min/max, sort`) |
| GET | /products/:slug | Product detail, variants, media, size guide, policy, related |
| GET | /products/:id/reviews | Approved reviews |
| POST | /products/:id/reviews | C — verified-purchase review with photos |
| GET | /products/:id/delivery-estimate?city= | Delivery ETA by city |
| POST | /products/:id/back-in-stock | Back-in-stock subscription |
| GET | /search?q= | Arabic-aware search |
| GET | /search/suggest?q= | Instant suggestions |
| GET | /collections/:slug | Collection with products |
| GET | /content/home | Banners + home blocks (scheduled) |
| GET | /content/legal/:key | Legal pages |
| GET | /locations/pickup | Pickup branches |
| GET | /geo/cities, /geo/cities/:id/districts | Cities and districts |
| GET | /store/info | Store name, CR and VAT numbers, contact, enabled modules |

## Catalog: as implemented in Phase 2

Public (cacheable: `Cache-Control: public, s-maxage=300`):

| Method | Path | Notes |
|---|---|---|
| GET | /categories | Active tree with product counts (descendants included) |
| GET | /categories/:slug | Arabic or English slug → breadcrumb, children, facet definitions |
| GET | /products | `category, collection, q, sort=relevance|newest|price_asc|price_desc|rating|discount, priceMin, priceMax (halalas), inStock, page, limit, f.<attr>=a,b` → cards, total, disjunctive `facetCounts`, `priceRange`, `degraded` |
| GET | /products/:slug | Detail: axes, variants (availability, not counts), media renditions, attributes, size guide, breadcrumb, complete-the-look / cross-sell / similar |
| GET | /collections/:slug | Live collections only (respects the start/end window) |
| GET | /search, /search/suggest | Same as /products with `q`; suggestions |

Admin (permission in brackets):

| Method | Path |
|---|---|
| GET, POST | /admin/categories [catalog.category.read/write]; GET/PATCH/DELETE /admin/categories/:id; PUT /admin/categories/:id/attributes; GET /admin/categories/:id/effective-attributes |
| GET, POST | /admin/attributes; PATCH/DELETE /admin/attributes/:id; POST /admin/attributes/:id/values; PATCH/DELETE /admin/attribute-values/:id [catalog.attribute.*] |
| GET, POST, PATCH | /admin/brands, /admin/size-guides, /admin/collections (+ PUT /admin/collections/:id/products) |
| GET, POST | /admin/products [catalog.product.read/write]; GET/PATCH/DELETE /admin/products/:id |
| POST | /admin/products/:id/publish, /unpublish, /archive [catalog.product.publish] |
| POST | /admin/products/:id/variants/generate; PATCH /admin/variants/:id |
| PUT | /admin/products/:id/media [catalog.media.write]; PUT /admin/products/:id/relations |
| POST, GET, PATCH, DELETE | /admin/media (multipart upload), /admin/media/:id |
| GET, POST, PATCH | /admin/locations [inventory.*]; PUT /admin/variants/:id/stock; GET /admin/variants/:id/movements |
| POST, GET | /admin/products/import (multipart xlsx/csv → job), /admin/jobs/:id, GET /admin/products/export?format=xlsx|csv [catalog.product.import] |
| POST | /admin/search/reindex [settings.write] |

## Storefront: as implemented in Phase 3

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | /cart, /cart/count | Guest (`X-Cart-Token`) or customer | Priced cart: VAT, gift wrap, per-line `issue` (out of stock, unavailable, needs measurements), `canCheckout` |
| POST | /cart/items | Guest or customer | `variantId, quantity, isSample?, widthMm/heightMm` (per m²), `lengthCm` (per metre), `giftWrap?, giftMessage?`. Returns `cartToken` once, when a guest cart is created |
| PATCH, DELETE | /cart/items/:id | Same cart only | Quantity (capped by stock), gift wrap and message |
| POST | /cart/merge | Customer | Folds the guest cart into the customer's cart after sign-in |
| GET, PUT | /me/wishlist, /me/wishlist/ids | Customer | PUT adds one or many product ids (also merges a device wishlist) |
| DELETE | /me/wishlist/:productId | Customer | |
| POST | /variants/:id/notify-me | Customer | Back-in-stock alert, only for unavailable variants |
| GET | /products-cards?ids= | Public | Up to 24 cards in the requested order (compare, recently viewed) |
| GET | /delivery-estimate?city=&productId= | Public | Business-day window (Fri/Sat weekend) plus tailoring time for made-to-measure |
| GET | /products/:id/reviews | Public | Approved reviews and a rating histogram |
| GET | /content/home | Public | Live hero/strip banners, category tiles, live collections with products |
| GET, POST, PATCH, DELETE | /admin/banners | marketing.read / marketing.write | Scheduled, bilingual banners; links must be internal paths |

The storefront BFF adds `POST /bff/revalidate` (Bearer `REVALIDATE_SECRET`, tags `catalog`, `content`, `store-info`), which the API calls after catalog and content writes.

## Checkout, orders and invoicing: as implemented in Phase 4

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | /checkout/pickup-locations | Public | Branches flagged as pickup points, with ready time |
| POST | /checkout/quote | Guest (`X-Cart-Token`) or customer | `fulfillment` (DELIVERY/PICKUP), `addressId` or `address` (or just `cityCode` while typing), `pickupLocationId?`, `shippingRateId?`, `couponCode?`, `paymentMethod?`. Returns shipping options by zone, payment methods with availability reasons, applied promotions, coupon status, totals with VAT, `blockers` and `canPlace` |
| POST | /checkout/orders | Same, **`Idempotency-Key` required** | Quote fields plus `paymentMethod`, `contact` (guests), `customerNote?`, `locale?`, `expectedTotal?` (409 if the total changed). Reserves stock, redeems promotions, converts the cart. Returns `order`, guest `accessToken` and `payment.redirectUrl` (null for COD) |
| GET | /orders/:id | Owner, or guest `X-Order-Token` | Order view: items, totals, address, timeline, invoices, payment state, `canRetryPayment`, `canCancel` |
| POST | /orders/:id/verify | Same | Re-checks the payment with the gateway (return page) and returns the order |
| POST | /orders/:id/pay | Same | New hosted-payment session for an unpaid order before it expires |
| POST | /orders/:id/cancel | Same | Before production/dispatch only; releases or restocks, refunds, issues a credit note |
| GET | /orders/:id/invoices/:invoiceId | Same | Printable invoice / credit note data, including the ZATCA QR payload |
| GET | /me/orders | Customer | Paginated order history |
| POST | /payments/webhooks/{moyasar,tabby,tamara} | Gateway (authenticated per provider) | Deduplicated by event id; always re-verifies with the gateway |
| GET, POST | /payments/simulator/:ref | Development only | Hosted page of the local payment simulator |
| GET | /admin/orders, /admin/orders/:id | orders.read | Filters: `q` (number, phone, name), `status`, `paymentMethod`, `paymentState`, `from`, `to` |
| POST | /admin/orders/:id/status | orders.update | Lifecycle moves (domain state machine); DELIVERED on COD collects payment and issues the invoice |
| POST | /admin/orders/:id/cancel | orders.cancel + orders.refund | Cancel, restock, refund through the gateway, credit note |
| POST | /admin/orders/:id/payment/sync | orders.update | Re-check a payment (late webhook) |
| GET | /admin/invoices, /admin/invoices/:id, /admin/invoices/:id/xml | invoicing.read | Signed UBL XML download |
| GET | /admin/invoices/chain/verify | invoicing.read | Re-verifies counters, hash links, document hashes and signatures |
| CRUD | /admin/shipping/zones, /admin/shipping/zones/:id/rates, /admin/shipping/rates/:id | settings.read / settings.write | City codes per zone (`*` = rest of the kingdom), weight bands, free-above thresholds, ETAs |
| CRUD | /admin/promotions, /admin/promotions/:id/coupons, /admin/promotions/coupons/:id | marketing.read / marketing.write | PERCENT, FIXED, FREE_SHIPPING, BXGY, BUNDLE; dates, usage and per-customer limits |

The storefront BFF adds `POST /bff/checkout/quote`, `POST /bff/checkout/orders` (keeps the guest order token in the httpOnly `hd_orders` cookie and clears the guest cart), `POST /bff/orders/:id/{verify,pay,cancel}`, `GET /bff/geo/cities/:id/districts` and `GET /bff/me/addresses`. The admin file proxy adds `GET /bff/files/invoices/:id/xml`.

## Configurator
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | /configurator/templates/:productId | P | Steps, heading styles, options, constraints |
| POST | /configurator/quote | P | Inputs → full price breakdown (stateless) |
| POST | /configurator/configurations | G/C | Save a configuration (returns an id to attach to the cart) |
| POST | /uploads/sign | G/C | Signed upload URL (sofa photos, review photos) |

## Cart & checkout
| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | /cart | G | Create a cart → cart token |
| GET | /cart | G/C | Cart with priced lines, promotions and VAT |
| POST | /cart/items | G/C | Add a variant or configuration |
| PATCH / DELETE | /cart/items/:id | G/C | Change quantity, gift wrap or message; remove |
| POST / DELETE | /cart/coupons[/:code] | G/C | Apply or remove a coupon |
| POST | /cart/merge | C | Merge the guest cart after login |
| POST | /checkout/quote | G/C | Shipping options, COD eligibility and final totals for an address |
| POST | /checkout/orders | G/C | Place the order (idempotent) → payment session |
| POST | /payments/:orderNumber/session | G/C | (Re)create a payment session for a provider/method |
| GET | /payments/:orderNumber/status | G/C | Poll after redirect |
| POST | /samples/orders | G/C | Fabric swatch sample order |

## Services
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | /services/areas | P | Covered cities and districts |
| GET | /services/slots?district=&type=&from= | P | Available slots |
| POST | /services/bookings | C | Book a measurement or installation |
| PATCH | /services/bookings/:id | C | Reschedule or cancel |
| GET | /quotations/:number | C | View a technician quotation |
| POST | /quotations/:number/approve | C | Approve → order + payment session |

## Technician (T)
| Method | Path | Purpose |
|---|---|---|
| GET | /technician/jobs?date= | Daily job list |
| GET | /technician/jobs/:id | Job detail (masked phone, map link) |
| POST | /technician/jobs/:id/status | EN_ROUTE / IN_PROGRESS / COMPLETED / NO_SHOW |
| POST | /technician/jobs/:id/measurements | Record a window/room with photos |
| POST | /technician/jobs/:id/signature | Customer signature |
| POST | /technician/jobs/:id/quotation | Generate a quotation from measurements |
| POST | /technician/jobs/:id/call | Masked-call bridge (optional) |

## Webhooks (W)
| Method | Path |
|---|---|
| POST | /webhooks/payments/:provider |
| POST | /webhooks/shipping/:carrier |
| POST | /webhooks/whatsapp |
| POST | /webhooks/sms/:provider (delivery reports) |

## Admin (`/admin/*`, S:perm)
| Area | Endpoints | Permission prefix |
|---|---|---|
| Dashboard | `GET dashboard/summary`, `GET dashboard/low-stock`, `GET dashboard/abandoned-carts` | `dashboard.view` |
| Categories | CRUD `categories`, `POST categories/reorder` | `catalog.category.*` |
| Attributes | CRUD `attributes`, `attributes/:id/values` | `catalog.attribute.*` |
| Products | CRUD `products`, `POST products/:id/variants/generate`, CRUD `products/:id/variants`, `POST products/:id/publish`, `GET products/:id/completeness` | `catalog.product.*` |
| Import/export | `POST products/import` (xlsx/csv, async job), `GET products/export`, `GET jobs/:id` | `catalog.product.import` |
| Media | `POST media/sign`, `POST media/:id/complete`, `GET media`, `DELETE media/:id` | `catalog.media.*` |
| Collections, size guides, brands | CRUD | `catalog.*` |
| Reviews | `GET reviews`, `POST reviews/:id/moderate` | `catalog.review.moderate` |
| Inventory | `GET stock`, `POST stock/adjust`, `POST stock/transfer`, CRUD `locations`, CRUD `fabric-rolls`, `POST stocktakes`, `GET movements` | `inventory.*` |
| Orders | `GET orders`, `GET orders/:id`, `POST orders/:id/transition`, `POST orders/:id/notes`, `POST orders/:id/shipments`, `GET orders/:id/packing-slip.pdf`, `GET orders/:id/job-cards.pdf`, `POST orders/:id/refund` | `orders.*` |
| Returns | `GET returns`, `POST returns/:id/decide`, `POST returns/:id/receive` | `returns.*` |
| Invoices | `GET invoices`, `GET invoices/:id/xml`, `POST invoices/:id/report`, `POST invoices/:id/credit-note` | `invoicing.*` |
| Workshop | `GET workshop/jobs`, `PATCH workshop/jobs/:id`, CRUD `tailors` | `workshop.*` |
| Configurator | CRUD `configurator/templates`, `heading-styles`, `options`, `POST configurator/templates/:id/simulate` | `settings.configurator` |
| Services | CRUD `service-areas`, `slots` (bulk generate), `technicians`, `GET bookings` (calendar), `POST bookings/:id/assign` | `services.*` |
| Customers | `GET customers`, `GET customers/:id`, `POST customers/:id/block`, `POST customers/:id/notes`, segments CRUD | `customers.*` |
| Marketing | CRUD `promotions`, `coupons` (bulk generate), `banners`, `home-blocks`, `campaigns`, `POST push/broadcast` | `marketing.*` |
| Reports | `GET reports/{sales,vat,payments,returns}?from&to&groupBy&format=json|xlsx|pdf` | `reports.*` |
| Settings | `GET/PUT settings/:group` (store, tax, zatca, shipping, payments, notifications, modules), CRUD `shipping-zones`, `notification-templates`, `legal-pages` | `settings.*` |
| Staff & RBAC | CRUD `staff`, `roles`, `GET permissions`, `POST staff/:id/reset-2fa` | `rbac.*` |
| Audit | `GET audit-logs` | `audit.view` |
| PDPL | `GET data-requests`, `POST data-requests/:id/process` | `customers.privacy` |

## Operational
| Method | Path | Purpose |
|---|---|---|
| GET | /health/live, /health/ready | Liveness, and readiness (DB, Redis, search) |
| GET | /docs, /docs-json | Swagger UI and OpenAPI JSON (disabled or protected in production) |
