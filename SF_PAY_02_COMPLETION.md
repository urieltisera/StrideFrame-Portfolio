# SF-PAY-02 — Stripe Connect & Payment Foundation

## Status

SF-PAY-02 IMPLEMENTATION ACCEPTED

The Stripe Connect foundation is implemented and validated without real Stripe
API calls or financial transactions. Real provider validation is a mandatory
pre-pilot gate and remains blocked by platform account setup.

`REAL_STRIPE_CONNECT_E2E: BLOCKED_BY_PLATFORM_ACCOUNT_SETUP`

- Stripe credentials were unavailable.
- Preflight stopped before any provider call.
- No Stripe API writes or financial transactions occurred.
- No fake credentials or account state were introduced.
- Mocked/provider-contract tests passed.
- This does not authorize production Stripe usage.

## Architecture implemented

- Stripe Connect Express connected accounts are represented by a new unique
  `StripeConnectAccount` relation owned by `Photographer`.
- Account readiness is represented by `ONBOARDING`, `READY`, `RESTRICTED`, and
  `DISABLED`; no account row represents `NOT_STARTED`.
- The existing hosted Stripe Checkout adapter now creates destination charges
  with `payment_intent_data.transfer_data.destination` and an explicit
  `application_fee_amount`.
- The customer cannot submit or choose the destination account, gross amount,
  or platform fee.
- The existing one-photographer-per-order rule remains enforced by
  `createPendingOrder`; cross-photographer carts are rejected.
- Zelle remains a non-automated frontend boundary. No Zelle schema, API,
  verification, QR, or automatic entitlement behavior was added.

## Schema and migration

Migration created:

`prisma/migrations/20261014120000_stripe_connect_foundation/migration.sql`

Additive changes:

- `StripeConnectStatus` enum and `StripeConnectAccount` model.
- `Payment.platformFeeCents`.
- `Payment.photographerProceedsCents`.
- `Payment.connectedAccountId`.
- `Payment.providerChargeId` and `Payment.providerApplicationFeeId` for later
  reconciliation.
- `PaymentWebhookEvent.attempts`, `processedAt`, `lastError`, and `updatedAt`.
- Unique `DownloadGrant.orderId` to preserve one active order-level entitlement
  and make grant preparation idempotent.

No destructive migration was used. The migration was applied only to the
disposable local QA database described below.

## Connect onboarding flow

Added authenticated endpoints:

- `POST`/`GET` `/api/photographer/payments/stripe/connect/onboarding-link`
- `GET` `/api/photographer/payments/stripe/connect/status`
- `GET` `/api/photographer/payments/stripe/connect/return`

The service creates or reuses one Express account per photographer using a
Stripe idempotency key, generates Stripe-hosted Account Links, and synchronizes
capability/readiness state. No banking credentials are collected or stored by
StrideFrame. Endpoints derive the photographer from the authenticated session.

## Checkout and commission

- `STRIDEFRAME_PLATFORM_FEE_BPS` is the server-side MVP configuration boundary.
- It is validated as an integer from 0 through 10,000 basis points.
- Fee calculation uses integer minor units and nearest-cent half-up rounding.
- Photographer proceeds are `gross - platformFee`.
- Fee/proceeds/connected-account snapshots are stored on `Payment`.
- Checkout refuses to proceed unless the photographer account has both
  `chargesEnabled` and `payoutsEnabled` and is `READY`.
- Existing Stripe metadata and idempotency behavior are preserved.

No permanent business percentage was hardcoded. The README documents `1000`
basis points only as an explicit test/configuration example.

## Webhook hardening

- Stripe signature verification remains mandatory.
- Supported Checkout event types are explicitly classified:
  `checkout.session.completed`, `checkout.session.async_payment_failed`, and
  `checkout.session.expired`.
- Completed sessions are successful only when Stripe reports
  `payment_status = paid`.
- Unknown events are safely recorded as processed without changing payment
  state.
- Webhook records are upserted with attempts and processing state; failures
  retain `processedAt = null` and can be retried.
- Paid/refunded payment states are not downgraded by later failure/cancel
  events.
- Order transitions are conditional and idempotent.
- Download grants remain gated by a paid Order and now reuse/rotate the single
  order-level grant instead of creating duplicate grants.

Refund provider invocation, dispute handling, and automatic grant revocation
remain deferred to SF-PAY-06.

## Tests added and evidence

Focused tests cover:

- integer commission calculation, rounding, proceeds, and config validation;
- Connect readiness requiring both charge and payout capability;
- repeated Connect onboarding reusing the stored account without a duplicate
  account creation;
- destination account and explicit application fee in Checkout parameters;
- existing unsupported-provider and secret-configuration guards;
- existing price snapshot, owner isolation, and secure-download integration
  coverage.

QA target was verified before migration:

`host=127.0.0.1 port=5432 database=strideframe_sf_pay_02_qa service=db`

The target was a dedicated local Docker PostgreSQL database. No external,
production, or staging database was used. All 10 committed migrations,
including the new SF-PAY-02 migration, applied successfully; `prisma migrate
status` reported the schema up to date. The QA database and the accidental
local integration database created by the repository test helper were dropped
after validation.

No Stripe API writes, Stripe test-mode requests, live-mode requests, or real
financial transactions were performed.

## Validation

- `npx prisma generate`: PASS.
- `npx prisma validate`: PASS.
- `npm run typecheck`: PASS.
- `npm test`: PASS — 10 test files passed, 1 skipped; 25 tests passed, 6
  skipped. Fontconfig emitted non-fatal cache warnings.
- `npm run test:integration` against the isolated QA URL: PASS — 1 file, 6
  tests passed. The helper also created and then cleaned its local test DB.
- `npm run lint`: PASS — 0 errors, 7 existing/style warnings.
- `npm run build`: PASS — all application and Connect routes compiled.

## Files changed

- `.env.example`
- `README.md`
- `SF_PAY_01_DISCOVERY.md` (existing discovery deliverable remains uncommitted)
- `prisma/schema.prisma`
- `prisma/migrations/20261014120000_stripe_connect_foundation/migration.sql`
- `src/app/api/photographer/payments/stripe/connect/onboarding-link/route.ts`
- `src/app/api/photographer/payments/stripe/connect/status/route.ts`
- `src/app/api/photographer/payments/stripe/connect/return/route.ts`
- `src/lib/commission.ts`
- `src/lib/commission.test.ts`
- `src/lib/downloads.ts`
- `src/lib/payment-service.ts`
- `src/lib/payments.ts`
- `src/lib/payments.test.ts`
- `src/lib/stripe-connect.ts`
- `src/lib/stripe-connect.test.ts`

## Remaining limitations and deferred work

- No Stripe test-mode onboarding or Checkout session was invoked because a
  legitimate Stripe-supported platform/entity setup and test credentials are
  not available.
- `providerApplicationFeeId` and `providerChargeId` fields are prepared for
  reconciliation but are not populated by the current Checkout Session
  completion handler.
- Refunds, disputes, transfer failure recovery, payout reporting, and ledger
  reconciliation are deferred.
- Photographer-facing payment settings UI is deferred.
- Zelle configuration and manual verification are deferred to a later payment
  slice.
- The current dashboard sales metric remains gross paid order value, not net
  photographer proceeds or platform revenue.
- Existing lint warnings remain non-blocking.

## SF-PAY-PROD-GATE

Before any commercial pilot using Stripe, all of the following are mandatory:

1. Establish a legitimate Stripe-supported platform/entity setup.
2. Obtain Stripe TEST MODE platform credentials.
3. Complete real Connect Express onboarding validation.
4. Validate account readiness synchronization.
5. Create a real TEST MODE Checkout Session.
6. Verify the destination charge.
7. Verify the application fee.
8. Exercise signed webhook delivery.
9. Verify idempotent `Payment` → `Order PAID` transition.
10. Verify secure `DownloadGrant` creation.
11. Populate and verify `providerChargeId` and
    `providerApplicationFeeId` from trustworthy Stripe data.
12. Validate refund/dispute behavior required for the pilot.
13. Only after TEST MODE passes may production credentials be considered.

The current platform/account setup must not be bypassed with inaccurate
country/entity information, invented credentials, or fake READY state.

## Deferred reconciliation

`providerChargeId` and `providerApplicationFeeId` exist in the schema as
reconciliation fields, but the current completion handler does not populate
them. No values are fabricated. Their real-provider verification and safe
population belong to `SF-PAY-PROD-GATE` or an earlier Stripe-provider
validation slice once legitimate TEST MODE credentials are available.

## Git state

Final SF-PAY-01/SF-PAY-02 discovery, implementation, migration, tests, and
documentation are included in the requested commit and pushed to
`origin/milestone/strideframe-core-mvp`.

SF-PAY-02 STATUS: PASS — IMPLEMENTATION ACCEPTED
