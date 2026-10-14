# ADR-0002: Web authentication through a backend-for-frontend (BFF)

- Status: Accepted
- Date: 2026-10-14

## Context
The API issues a short-lived JWT access token and an opaque, rotating refresh token. Browsers must not be able to read either token from JavaScript, because XSS would then steal sessions. Mobile apps need the tokens directly, and keep them in the platform's secure storage.

## Decision
- The API returns tokens in the **response body** only. It never sets cookies and accepts `Authorization: Bearer` only, so it has no CSRF surface.
- Each Next.js app (storefront, admin) has **route handlers under `/bff/*`**. These call the API from the server and store the tokens in `httpOnly`, `Secure` (in production), `SameSite=Lax` cookies scoped to that app's own origin:
  - `hd_at`: the access token, with `maxAge` set slightly below the token TTL.
  - `hd_rt`: the refresh token, with `maxAge` matching the refresh expiry.
- Server components and route handlers attach `hd_at` when they call the API.
- **Middleware** refreshes the session transparently. When `hd_at` is missing but `hd_rt` is present, it rotates the token through `/auth/refresh` and writes the new cookies before rendering.
- Mutating BFF routes also verify that the `Origin` header matches the app's own origin. This adds defence in depth on top of SameSite.
- The storefront and admin use **different cookie names** (`hd_*` and `hda_*`), so a customer session and a staff session never mix, even on the same parent domain.

## Consequences
- A refresh-token reuse (theft) detected by the API revokes the whole session family. The BFF then clears its cookies and the user signs in again.
- Mobile clients call the API directly and send `Authorization: Bearer`.
