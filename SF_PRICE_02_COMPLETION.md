# SF-PRICE-02 Completion

## Status

PARTIAL — implementation and validation complete locally; the pricing slice remains uncommitted for review.

## Pricing model

```text
Individual upload → internal "Individual photos" album → Photo.priceOverrideCents
Album/batch upload → Album.priceCents → Photo.priceOverrideCents = null
Effective price   → Photo.priceOverrideCents ?? Album.priceCents
```

The two photographer workflows converge on `resolveEffectivePhotoPrice`. No event-level price or package model was added.

The internal single-photo album is created transparently per event with the reserved slug `individual-photos`; it is an implementation detail and does not require a photographer to manage an album first.

## Schema and migration

Migration: `20261020100000_flexible_photo_album_pricing`

- Added `Album.priceCents` with a USD MVP default of 1500 cents.
- Replaced `Photo.priceCents` with nullable `Photo.priceOverrideCents`.
- Existing legacy values are preserved deterministically: each album receives the minimum legacy photo price as its default, while every photo that differed retains its exact legacy price as an override. No historical `OrderItem` values are modified.
- The migration is additive until the final legacy column removal and is non-destructive to sale history.

## Constants and authority

```text
PRICING_MODEL=INDIVIDUAL_OR_ALBUM_INHERITANCE
ALBUM_BATCH_PRICING=true
INDIVIDUAL_PHOTO_PRICING=true
PHOTO_PRICE_OVERRIDE=true
STRIDEFRAME_MVP_CURRENCY=USD
MINIMUM_PAID_PHOTO_PRICE_CENTS=100
MAXIMUM_PAID_PHOTO_PRICE_CENTS=10000000
CURRENT_RETAIL_PRICE=SERVER_RESOLVED_EFFECTIVE_PRICE
HISTORICAL_SALE_PRICE=ORDER_ITEM_SNAPSHOT
STRIDEFRAME_MVP_FEE_PER_PHOTO_USD=0.25
```

Prices are integer cents. USD is enforced by the resolver and checkout path; customer input cannot set currency, retail price, subtotal, platform fee, or proceeds. The $0.25/photo platform fee remains independent of retail price and is calculated by the existing commercial/payment services from trusted sold-photo items.

## Photographer UX

- Album creation/editing exposes “Price per photo (USD)”.
- Batch upload displays the album price and writes no per-photo price values for inherited photos.
- Photo management supports setting a custom override and resetting it to `null` with “Use album price”.
- The dashboard provides a direct individual-photo upload with event, USD price, and file fields. It uses the internal system-managed album and the same resolver as album photos.

## Customer and commerce behavior

- Public album cards, cart, checkout, and Face Search result payloads use the effective server-resolved price.
- Cart display is refreshed from current trusted photo/album state. Checkout recreates the authoritative price from the database.
- One order cannot mix photographers; the existing same-photographer behavior is preserved for permitted event combinations.
- `OrderItem.unitPriceCents` remains the immutable historical retail snapshot. Later album/photo price changes do not alter completed orders.
- Stripe Connect destination-charge architecture remains unchanged. `application_fee_amount` continues to use the fixed billable-photo fee; no Stripe API calls were made.
- Zelle continues to show the authoritative retail total and creates the existing photographer-manual flow; its obligation remains billable-photo-count × $0.25, not a percentage of retail price.
- Refunds continue to use historical `OrderItem.unitPriceCents`, including mixed-price orders, and do not recalculate from current album/photo prices.

## Future packages

Packages were not implemented. The model remains compatible with future package line items because the $0.25 platform fee can continue to use actual licensed photo count while package pricing remains an order/item commercial concern.

## Validation evidence

- `npx prisma generate` — PASS
- `npx prisma validate` — PASS
- `npm run typecheck` — PASS
- `npm test` — PASS, 49 passed, 16 skipped
- `npm run test:integration` — PASS, 17 passed; local QA PostgreSQL `sportpix_test_migrated`, no pending migrations
- Fresh migration QA — PASS: all 16 migrations applied to disposable local `sportpix_price_qa_20261015`, then database dropped
- `npm run lint` — PASS, 0 errors, 9 existing warnings
- `npm run build` — PASS
- `git diff --check` — PASS

The integration coverage verifies inherited/override pricing, album price changes, immutable order snapshots, ownership/payment regressions, and the existing fixed-fee/payment flows. No external Stripe or Zelle calls were made.

## Remaining decisions / blockers

- Existing product policy still treats a photo with an invalid/missing effective price as unavailable through the resolver; an explicit future NOT_FOR_SALE state was not introduced in this slice.
- The maximum USD price is a server policy boundary of $100,000.00 and should be product-reviewed before commercial launch.
- Packages, taxes, discounts, and multi-currency remain future scope.
- `SF-PAY-PROD-GATE` remains mandatory for real Stripe validation.
