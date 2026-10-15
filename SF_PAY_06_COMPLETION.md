# SF-PAY-06 — Refunds, Disputes & Reconciliation Foundation

## Status

SF-PAY-06: IMPLEMENTED — SAFE FOUNDATION

## Refund model

- `Refund` preserves order, payment, provider, amount, currency, reason,
  source, actor reference, provider refund ID, status, timestamps, and an
  idempotency key.
- `RefundItem` identifies the trusted purchased `OrderItem` being refunded.
  Its unique order-item constraint prevents a photo license from being
  refunded twice.
- Refund amounts are calculated from server-owned order-item prices. The
  browser cannot supply a trusted amount or foreign item.
- Full refunds transition Payment/Order to `REFUNDED` and revoke the active
  order grant. Partial refunds transition them to `PARTIALLY_REFUNDED`.
- Partial entitlement remains safe because `OrderItem.refundedAt` is checked
  by server-side download authorization. Non-refunded photos remain
  downloadable; refunded photos do not.
- A customer's previously downloaded file cannot be remotely erased.

## Zelle manual refunds

`ZELLE_VERIFICATION_MODE=PHOTOGRAPHER_MANUAL` remains authoritative.

1. An authenticated owner creates a `MANUAL_PENDING` refund request.
2. The photographer independently sends the money back through Zelle.
3. The same owner records completion.
4. Only completion applies the state, entitlement, and fee reversal.

Customer input cannot complete a refund. Cross-photographer operations are
rejected. Repeated completion is idempotent.

`SALE_CONFIRMED != PLATFORM_FEE_SETTLED` remains true. A confirmed Zelle
sale creates an obligation; a completed refund creates a durable
`ZelleFeeObligationReversal`. The original obligation is never deleted. A
partial reversal reduces the displayed remaining balance; a full reversal
marks the obligation `VOID`.

## Stripe boundary

The provider contract now returns a provider refund ID and accepts an
idempotency key. `StripePaymentProvider.refund` uses Stripe's refund API
boundary, but this task made no Stripe API calls. Real refund and dispute
validation remains gated by:

`SF-PAY-PROD-GATE`

`REAL_STRIPE_REFUND_DISPUTE_VALIDATION=PENDING_PROD_GATE`

Application-fee reversal/reconciliation remains provider-authoritative. No
provider charge, application-fee, or refund IDs are fabricated.

## Disputes

`PaymentDispute` and `PaymentDisputeEvent` provide idempotent handling for:

- `OPEN`: Payment becomes `DISPUTED`, Order becomes `PAYMENT_DISPUTED`, and
  active downloads are revoked.
- `WON`: the payment/order return to the paid state; the customer may prepare
  a new grant after provider resolution.
- `LOST`: Payment/Order become `REFUNDED` and downloads remain denied.

This is a minimal entitlement-risk policy, not a dispute-management system.

## Reconciliation

`findReconciliationIssues` identifies:

- paid Stripe payments missing `providerChargeId`;
- fee snapshot mismatches;
- open Zelle obligations;
- pending manual/provider refunds; and
- inconsistent Payment/Order states.

The service does not invent provider identifiers or settle money.

## Authorization and security

- Manual refund preparation/completion requires the authenticated photographer
  who owns the order.
- Customer routes do not expose refund completion.
- Refund and dispute history is additive and retained.
- Secure download authorization checks grant status, order state, expiry, and
  non-refunded order-item state on every request.
- No bank credentials, Zelle passwords/PINs, or provider secrets are stored.

## QA evidence

On an isolated disposable local PostgreSQL database:

- 14 committed migrations applied, including
  `20261018100000_refunds_disputes_reconciliation`.
- 5-photo Zelle sale: 2 selected photos refunded, $0.50 fee reversal,
  remaining 3 licenses downloadable.
- Full 2-photo Zelle refund: fee obligation `VOID`, grant revoked, download
  denied.
- Cross-photographer refund rejected; open obligation detected by
  reconciliation.
- Mocked Stripe dispute `OPEN → LOST`: download revoked and duplicate event
  idempotent.
- QA database and auxiliary test database cleaned after execution.

## Validation

- Prisma generate/validate: PASS
- Unit tests: 34 passed, 14 skipped
- Integration tests: 14 passed
- Typecheck: PASS
- Lint/build: run in final validation
- No Stripe API calls or financial transactions performed

## Remaining limitations

- Real Stripe refund/dispute payload validation is pending `SF-PAY-PROD-GATE`.
- Stripe `providerChargeId` and `providerApplicationFeeId` remain unset until
  trustworthy provider payloads are available.
- Monthly Zelle settlement, refund accounting operations, and provider fee
  reversal policy remain operational/commercial work.
- Previously downloaded files cannot be removed from a customer's device.
