# SF-COM-02 — Fixed Per-Photo Platform Fee Foundation

## Status

SF-COM-02: IMPLEMENTED — MVP COMMERCIAL FOUNDATION

## Approved commercial model

`STRIDEFRAME_MVP_FEE_PER_PHOTO_USD=0.25`

- `NO_MONTHLY_SUBSCRIPTION_MVP`
- Photographer sets the sale price.
- StrideFrame charges a fixed 25 cents per sold/licensed photo, independent
  of that sale price or gross order value.
- No customer surcharge was added.
- Stripe processing fees remain separate from StrideFrame platform revenue.

Trusted server-side order items determine billable quantity. Duplicate photo
IDs are removed when an order is created and OrderItem uniqueness prevents
duplicate licensing within an order. A four-photo $40 order therefore has a
$1.00 platform fee; a ten-photo bundle has a $2.50 fee.

## Stripe

The existing Stripe Connect Express destination-charge architecture remains
unchanged. Hosted Checkout still receives the server-controlled
`application_fee_amount`, now calculated as:

```text
billablePhotoCount * 25 cents
```

No Stripe API calls were made. `SF-PAY-PROD-GATE` remains mandatory.

## Snapshots

Payments now snapshot:

- billable photo count
- fee per photo in cents
- total platform fee
- gross amount/currency
- photographer proceeds amount

Historical payments do not recalculate when future commercial terms change.

## Zelle obligations

Confirmed manual Zelle sales create exactly one durable
`ZelleFeeObligation` with photographer, order/payment, billable count, fee
snapshot, amount, currency, earned timestamp, and settlement status.

`SALE_CONFIRMED != PLATFORM_FEE_SETTLED`

The customer pays the photographer directly. No fake transfer, payout,
application fee, or automatic collection is recorded. Repeated confirmation
is idempotent and cannot create a duplicate obligation. Rejected Zelle orders
create no obligation.

`ZELLE_VERIFICATION_MODE=PHOTOGRAPHER_MANUAL`

## Settlement policy foundation

- `ZELLE_SETTLEMENT=MONTHLY`
- `ZELLE_MINIMUM_SETTLEMENT_USD=5.00`
- `ZELLE_OVERDUE_POLICY`: future new-Zelle-sale suspension only; no deletion
  or revocation of existing customer purchases.
- Grace-period duration: `NOT YET DEFINED`.
- Settlement states: `OPEN`, `ROLLED_FORWARD`, `INVOICED`, `PAID`, `VOID`.
- Monthly settlement, refunds/reversals, and overdue enforcement are data
  foundations only; operational workflows remain deferred.

## Evidence

- Additive migration:
  `20261017100000_fixed_per_photo_platform_fee`.
- Fixed-fee unit cases pass for 1, 2, 10, and 37 photos.
- QA integration covers a four-photo Zelle order: $40 gross, $1.00 obligation,
  one obligation after confirmation, and no duplicate on repeat confirmation.
- Prisma generate/validate, typecheck, tests, integration, lint, build, and
  diff validation pass.
- QA database/storage were disposable local resources and were cleaned up.

## Deferred decisions

- Exact grace-period duration and enforcement trigger.
- Monthly invoicing/settlement operations.
- Partial/full refund reversal workflow in the payment/refund slice.
- No automatic Zelle collection is implemented.
