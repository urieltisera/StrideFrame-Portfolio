# SF-PAY-03 — Payment Settings + Zelle Foundation

## Status

SF-PAY-03: IMPLEMENTED — SAFE MVP FOUNDATION

## What changed

- Added additive `PhotographerPaymentSettings` storage with photographer-owned
  Stripe/Zelle availability and Zelle display, recipient, instruction, and QR
  metadata.
- Preserved `StripeConnectAccount` as the authoritative Stripe readiness source.
- Added authenticated settings APIs and the photographer Payment Settings UI.
- Added controlled asset storage for photographer-provided Zelle QR images.
  Uploads accept JPEG, PNG, or WebP up to 2 MB; local filesystem paths and
  arbitrary base64 blobs are never exposed.
- Added provider-aware checkout validation. Customers only see currently
  eligible methods for the photographer.
- Added `AWAITING_PAYMENT_CONFIRMATION` for safe manual Zelle payment state.
  Zelle orders retain server-calculated amount/currency/commission snapshots,
  but never transition to PAID or create a DownloadGrant from customer input.

## Security boundaries

- Ownership is derived from the authenticated photographer session; no browser
  `photographerId` is trusted.
- Customer input cannot change recipient, amount, photographer, or order
  reference.
- Zelle QR images are photographer-provided display material, not payment
  proof.
- No customer payment-confirmation endpoint was added. Operator/photographer
  confirmation and its audit trail are intentionally deferred to SF-PAY-04.
- Stripe Connect architecture and `SF-PAY-PROD-GATE` remain unchanged. No
  Stripe API calls were made.
- Zelle commission settlement remains a business/accounting concern; no fake
  transfer or application fee was created.

## Evidence

- Prisma migration: `20261015100000_payment_settings_zelle_foundation`.
- QA target was a disposable local PostgreSQL database at `127.0.0.1:5432`,
  database `strideframe_sf_pay_03_qa`; all 11 committed migrations applied.
- Sequential isolated integration validation: 2 files, 8 tests passed.
- Unit/full test suite: 12 files, 28 tests passed, 6 skipped.
- Typecheck: PASS.
- Lint: PASS with 9 warnings and 0 errors.
- Production build: PASS.

## Remaining work

- SF-PAY-04 should define authenticated, auditable, idempotent manual
  confirmation/rejection and notification behavior.
- Zelle commercial settlement, refunds, disputes, and reconciliation require
  product/accounting decisions before activation.
- Real Stripe validation remains blocked by `SF-PAY-PROD-GATE`.
