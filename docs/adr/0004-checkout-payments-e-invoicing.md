# ADR-0004: Checkout, payments and ZATCA e-invoicing

- Status: Accepted
- Date: 2026-10-15

## Context
Phase 4 turns a cart into a paid order and a legally valid Saudi tax invoice. It must handle card and BNPL payments on hosted pages, cash on delivery, store pickup, promotions, VAT at 15%, stock that can't be oversold, retries and duplicate requests, and ZATCA Phase 2 (integration) for simplified (B2C) invoices.

## Decisions

**One pricing path.** The domain package prices everything: the cart, promotions (`applyPromotions`), shipping options (`shippingOptions`), COD eligibility and checkout totals (`computeCheckoutTotals`). The API's quote and order placement call the same functions, so what the customer saw is what is charged. Prices are VAT-inclusive halalas. VAT is computed per line and rounded half-up. Shipping and the COD fee are taxable service lines. Discounts are allocated to lines, without losing a halala, before VAT is computed.

**Promotions.** Rules are data: `conditions` and `benefit` JSON validated by the domain.
- Evaluation order: the coupon first (the customer's explicit intent), then automatic promotions by priority.
- Stacking: a non-stackable promotion applies only when nothing has applied yet, and then blocks the rest. Free shipping always combines.
- Usage limits are enforced inside the order transaction with conditional `UPDATE … WHERE usage_count < usage_limit`, so concurrent orders cannot exceed a limit.
- Uses are given back when an unpaid order expires or is cancelled.

**Order placement is idempotent and race-free.**
- `POST /checkout/orders` requires an `Idempotency-Key`, scoped to the customer or the guest cart. A replay returns the stored response, a different body with the same key gets 422, and a concurrent duplicate gets 409. A failed attempt releases the key.
- Within one transaction:
  1. Allocate the gap-free order number (`HD-YYYY-NNNNNN`).
  2. Snapshot every price, name, option and address on the order.
  3. Reserve stock, with `SELECT … FOR UPDATE` on `stock_levels`, locked in variant order to avoid deadlocks.
  4. Redeem promotions.
  5. Convert the cart.
- Made-to-measure pieces and samples are not reserved (they are produced or cut to order).
- If no payment session can be opened, the order is cancelled and the cart restored.

**Payments go through a port.** `PaymentGateway` has `createSession / verify / capture / refund / cancel / parseWebhook`. Adapters:
- **Moyasar** (cards: mada, Visa, Mastercard, Apple Pay) uses the hosted Invoices API. Webhooks are authenticated by the shared `secret_token`.
- **Tabby** uses checkout session → authorise → capture. Webhooks are authenticated by a registered header.
- **Tamara** uses checkout → approve → authorise → capture. Notifications are an HS256 JWT signed with the notification key.
- **Simulator**: same lifecycle and a hosted page served by the API. It is for development and CI only; the API refuses to start with it in production.
- **Cash on delivery** needs no gateway.

The browser and webhook bodies are never trusted: every redirect, webhook, expiry run or admin sync calls `verify`, and `markPaid` runs under a row lock on the order, so whichever path arrives first wins and the others do nothing. BNPL payments are captured immediately after authorisation, which makes them a firm sale. A payment captured after its order expired is refunded automatically. An amount mismatch is flagged and the order is not marked paid.

**Order lifecycle.** The domain state machine adds `CONFIRMED` for COD.
- Prepaid orders: NEW → PAID (stock committed, invoice issued) → IN_PRODUCTION/READY → SHIPPED/INSTALLATION_SCHEDULED → DELIVERED → COMPLETED.
- COD orders: NEW → CONFIRMED at once (stock committed). Delivery collects the payment and issues the invoice.
- Unpaid prepaid orders hold stock for `checkout.payment.unpaidTtlMinutes` (30). A BullMQ scheduler then verifies once more and cancels them.
- Cancellation releases or restocks inventory, voids open sessions, refunds captured money through the same gateway, and issues a credit note.

**ZATCA Phase 2 simplified invoices.**
- Documents are UBL 2.1 `Invoice`: type 388 for invoices, 381 for credit notes (with `BillingReference` and the reason), subtype `0200000`.
- The serializer is deterministic and already in inclusive C14N form, so the hash is reproducible. Checked independently with libxml2 C14N after applying the three ZATCA XPath transforms.
- Lines carry the full-quantity net price with `BaseQuantity = quantity`, so `LineExtensionAmount` is exact even when a VAT-inclusive unit price has no exact net in halalas.
- Each document gets:
  - `ICV`, a strictly increasing counter;
  - `PIH`, the previous document's hash (the first uses ZATCA's initial hash);
  - an invoice hash (SHA-256 of the canonical XML minus UBLExtensions, `cac:Signature` and the QR reference);
  - an ECDSA secp256k1 signature over that hash;
  - the XAdES signature extension;
  - TLV QR tags 1–8, plus tag 9 when a CSID certificate is configured.
- Issuance locks a single chain-head row, so documents are serialized and gap-free.
- Issued rows are immutable: a database trigger refuses updates to signed fields, and deletes. `GET /admin/invoices/chain/verify` re-checks the whole chain.
- Reporting to ZATCA (`/invoices/reporting/single`) is a retried BullMQ job, enabled by `ZATCA_MODE` (`sandbox`, `simulation`, `production`) with the production CSID.

**Key management.** Production requires `ZATCA_PRIVATE_KEY` (secp256k1 PEM, base64) and, to report, the CSID `binarySecurityToken` and secret. In development a key is generated once and stored encrypted (AES-256-GCM) in `settings`. Without a certificate, the signed XML omits `KeyInfo`/`SignedProperties` and the QR omits tag 9.

## Consequences
- Going live with ZATCA needs an onboarding step outside the app:
  1. Generate the CSR with the EGS serial, VAT number and branch details (`openssl` config per the ZATCA developer guide).
  2. Obtain the compliance CSID with the OTP from the Fatoora portal.
  3. Pass the compliance checks.
  4. Exchange the compliance CSID for the production CSID.
  5. Configure `ZATCA_*` and run `ZATCA_MODE=simulation` first.
- HyperPay and Tap (named in the module plan) fit the same port but are not implemented: Moyasar covers cards and Apple Pay, and Tabby and Tamara cover BNPL. Adding a provider is one adapter plus env validation.
- Partial refunds and returns (credit notes for part of an order) arrive with the returns module in Phase 7. Phase 4 credit notes reverse the full invoice.
- Carrier labels and tracking (SMSA, Aramex, SPL) are Phase 8. Rates are configured per zone today.
