# SF-PAY-04 — Zelle Manual Payment Verification + Audit

## Status

SF-PAY-04: PASS — MANUAL VERIFICATION FOUNDATION

`ZELLE_VERIFICATION_MODE=PHOTOGRAPHER_MANUAL`

## Trust model and state machine

Only the authenticated photographer who owns the order can make a manual
decision. The photographer is instructed to confirm only after independently
seeing the funds in their own Zelle or bank activity. Customer declarations,
screenshots, receipts, QR scans, and typed references are never trusted as
proof.

The supported transitions are:

```text
AWAITING_PAYMENT_CONFIRMATION -> PAID       (CONFIRMED)
AWAITING_PAYMENT_CONFIRMATION -> CANCELLED  (REJECTED)
```

PAID is terminal for manual rejection. Rejected/cancelled orders cannot be
confirmed and cannot receive download access.

## Audit and authorization

- Added `ManualPaymentAudit` and `ManualPaymentAction` through an additive
  migration.
- Each decision records order, payment, photographer actor, provider, action,
  previous/resulting order and payment states, timestamp, and optional note.
- Audit decisions are unique per payment/action, making repeated confirmation
  or rejection idempotent without duplicate audit rows.
- Photographer APIs derive ownership from the authenticated session. Browser
  `photographerId` values are never accepted as authority.
- No customer confirmation endpoint exists.

## Confirmation behavior

`confirmManualPayment` validates Zelle provider, photographer ownership,
awaiting state, server-owned amount, and currency inside a Prisma transaction.
It atomically updates Payment and Order to paid, writes the audit record, and
creates or reuses exactly one active order DownloadGrant.

`rejectManualPayment` applies the same ownership/provider/state checks and
atomically moves Payment to cancelled and Order to cancelled without creating
an entitlement.

`createDownloadGrant(..., { rotate: true })` lets the customer prepare a
usable browser token after a pre-created confirmation grant while preserving
the one-grant-per-order invariant.

## UX and APIs

- `/photographer/settings/payments` includes awaiting Zelle payments.
- Confirmation requires an explicit browser confirmation dialog with the
  independent-verification warning.
- Customer awaiting orders state that confirmation is pending and downloads
  remain locked.
- Added authenticated endpoints:
  - `GET /api/photographer/payments/zelle/awaiting`
  - `GET /api/photographer/payments/zelle/:orderId`
  - `POST /api/photographer/payments/zelle/:orderId/confirm`
  - `POST /api/photographer/payments/zelle/:orderId/reject`

## Commission boundary

The existing server-calculated platform-fee/proceeds snapshot is preserved.

`SALE_CONFIRMED != PLATFORM_FEE_SETTLED`

Manual confirmation does not claim that StrideFrame received or settled a
platform fee. Commercial Zelle settlement remains a later accounting/product
decision.

## QA evidence

- Disposable local QA target: PostgreSQL `127.0.0.1:5432`, database
  `strideframe_sf_pay_04_qa`; no external database used.
- 12 committed migrations applied, including
  `20261016100000_zelle_manual_payment_audit`.
- Integration suite: 2 files, 9 tests passed sequentially.
- Covered photographer isolation, cross-photographer rejection, confirm and
  reject transitions, idempotency, audit rows, exact one grant, secure token
  authorization, and denied rejected-order downloads.
- QA database cleaned after validation.

## Security invariants

- No Stripe API calls or changes to Stripe Connect behavior.
- No customer-controlled payment state or entitlement creation.
- Originals remain behind the existing DownloadGrant authorization path.
- Amount, currency, provider, and photographer ownership remain server-owned.
- `SF-PAY-PROD-GATE` remains mandatory for Stripe production readiness.

## Limitations / next slice

- No external Zelle/bank verification exists; this is intentionally manual.
- No email/SMS notification platform was added. Future event hooks are the
  natural boundary for `manual_payment.confirmed` and
  `manual_payment.rejected` notifications.
- Refunds, disputes, reconciliation, and commercial Zelle settlement remain
  outside this slice.
