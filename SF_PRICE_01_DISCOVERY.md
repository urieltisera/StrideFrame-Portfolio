# SF-PRICE-01 — Pricing Model Discovery

## 1. Executive summary

The current retail-price source of truth is Photo.priceCents. There is no event or album price, no cart-item price, and no photographer price-edit/bulk-price workflow after upload.

The current upload UI asks once for a USD price and applies that same value to every photo in the batch. The default is $15.00, but the photographer can enter another non-negative USD amount. Public gallery, cart, and checkout all read the live Photo.priceCents until an order is created.

Checkout is server-authoritative: the browser submits photo IDs and contact/payment-method fields, while the server loads published photos and calculates totals from database prices. The finalized OrderItem.unitPriceCents is an immutable historical retail-price snapshot. Refunds use that snapshot, not the current photo price.

The smallest useful target recommendation is B — Album price + optional Photo override. An event-level default is not needed for the first pricing slice because the current product already has a strong Event → Album → Photo hierarchy and album pricing solves batch upload without adding another fallback level.

Important findings:

- Photo.priceCents is mutable at the database level, but no current application action edits it after creation.
- Cart stores only photo IDs. A price change before checkout changes the displayed cart price and the order price.
- Historical order economics are preserved in Order, OrderItem, and Payment snapshots.
- The fixed StrideFrame fee is independent of retail price and is calculated as billable order-item count × 25 cents.
- A photo may currently be priced at zero; there is no explicit NOT_FOR_SALE state.
- Currency is effectively USD in the UI and order creation, but the schema permits per-photo currency and createPendingOrder does not explicitly reject a non-USD photo currency. This is a consistency risk.

## 2. Current pricing architecture

    Photographer
      └─ Event
          └─ Album
              └─ Photo.priceCents  ← current retail price
                  └─ customer gallery/cart display
                      └─ createPendingOrder() reads Photo.priceCents
                          ├─ Order.subtotalCents / totalCents
                          └─ OrderItem.unitPriceCents snapshot
                              └─ Payment.amount + fixed platform fee snapshot
                                  ├─ Stripe Checkout application_fee_amount
                                  └─ ZelleFeeObligation after manual confirmation

There is no current price inheritance. Event and Album provide ownership/publication context only.

## 3. Prisma/data model

### Retail and order fields

| Field | Type/unit | Role | Source |
| --- | --- | --- | --- |
| Photo.priceCents | Int, USD cents by product convention | Current mutable retail price; defaults to 1500 | Photographer upload form, then stored on Photo |
| Photo.currency | String, currency code | Current photo currency; defaults to USD | Schema default; no photographer UI control |
| Order.subtotalCents | Int, cents | Immutable order subtotal snapshot | Sum of trusted selected Photo.priceCents values at order creation |
| Order.totalCents | Int, cents | Immutable current MVP total; no tax/discount/surcharge | Same server-calculated subtotal |
| Order.currency | String, code | Order currency snapshot | Hardcoded USD in createPendingOrder |
| OrderItem.unitPriceCents | Int, cents | Historical per-photo retail snapshot | Photo.priceCents at order creation |
| OrderItem.currency | String, code | Historical item currency field | Photo.currency at order creation; not currently cross-validated against Order.currency |
| OrderItem.photoId | String reference | Purchased photo identity; unique per order | Trusted server lookup from submitted photo IDs |
| Payment.amount | Int, cents | Payment amount snapshot | Order.totalCents at payment initiation |
| Payment.currency | String, code | Payment currency snapshot | Order.currency |
| Payment.billablePhotoCount | Int, count | Fixed-fee quantity snapshot | Order.items.length |
| Payment.platformFeePerPhotoCents | Int, cents/photo | Fixed-fee rate snapshot | Current approved value 25 |
| Payment.platformFeeCents | Int, cents | Total StrideFrame fee snapshot | billablePhotoCount × platformFeePerPhotoCents |
| Payment.photographerProceedsCents | Int, cents | Gross less platform fee snapshot | Order.totalCents - platformFeeCents |
| ZelleFeeObligation.billablePhotoCount | Int, count | Zelle fee quantity snapshot | Confirmed Payment snapshot |
| ZelleFeeObligation.feePerPhotoCents | Int, cents/photo | Zelle obligation rate snapshot | Confirmed Payment snapshot |
| ZelleFeeObligation.amountCents | Int, cents | Photographer obligation | Confirmed Payment.platformFeeCents |
| ZelleFeeObligation.currency | String, code | Obligation currency snapshot | Payment currency |
| Refund.amountCents | Int, cents | Historical refund total | Sum of selected OrderItem prices |
| Refund.platformFeeReversalCents | Int, cents | Fee reversal | Refunded item count × Payment fee snapshot |
| RefundItem.amountCents | Int, cents | Historical per-photo refund amount | OrderItem.unitPriceCents |
| RefundItem.platformFeeReversalCents | Int, cents | Historical per-photo fee reversal | Payment fee snapshot, currently 25 |

Cart/CartItem are not Prisma models. The cart is an HTTP-only cookie containing deduplicated photo IDs (src/lib/cart.ts).

## 4. Photographer pricing UX

The relevant UI is src/app/photographer/albums/[id]/upload-form.tsx. It exposes one Price in USD input, defaulting to 15.00, for a multi-file upload. src/app/photographer/actions.ts parses priceDollars, defaults missing input to 15.00, converts to cents, and passes the same priceCents to createPhoto for every uploaded file.

Answers to the current questions:

- A. Individual pricing required? No for a batch: one upload price applies to all files. But each Photo ultimately stores its own price and there is no album-level price.
- B. Album price? No.
- C. Event default price? No.
- D. Bulk price editing? No. Upload batching is the only bulk pricing operation.
- E. Upload inheritance? No hierarchy. Upload uses the submitted price or $15.00 fallback.
- F. Existing photo price changes? No application UI/action found. Direct database mutation could change it.
- G. Currency configurable? No. The UI accepts USD only and upload-created Photo rows use the schema default USD.
- H. Validation? dollarsToCents accepts non-negative decimal USD strings with at most two decimal places. validatePriceCents allows integer cents from 0 through 10,000,000 ($0 through $100,000). There is no positive minimum and no explicit not-for-sale status.

## 5. Upload pricing flow

    UploadForm priceDollars + N files
      → photographer owner session
      → dollarsToCents()
      → createPhoto({ photographerId, albumId, priceCents }) for each file
      → ownership check: Album.photographerId
      → Photo.create({ priceCents, currency: USD, ... })
      → FaceIndexJob.create()

The event/album IDs in the form do not establish pricing authority. The server derives the album and photographer relationship from the authenticated owner and album ID. The batch price is repeated into each Photo row.

## 6. Gallery and effective price

The public album page (src/app/e/[eventSlug]/[albumSlug]/page.tsx) filters published Event → Album → Photo records and displays photo.priceCents / 100 with USD. It does not calculate an album/event effective price.

Face Search results select and return Photo.priceCents; the result card displays that value. Cart and checkout also query Photo rows and display Photo.priceCents.

Therefore current customer surfaces agree when the database is consistent. There is no separate pricing calculation that can diverge, but there is a live-price window: a direct/admin price change after gallery display or cart addition is reflected on the next read.

## 7. Cart pricing

The cart cookie contains only photo IDs. It stores no unit price, quantity, currency, or snapshot. addToCart only validates the value as a string ID and deduplicates it in the cookie; it does not load a Photo at that point.

If a Photo price changes after add-to-cart and before checkout:

1. Cart page reads and displays the new Photo.priceCents.
2. Checkout page reads and displays the new Photo.priceCents.
3. createPendingOrder loads current published Photo rows and snapshots the new price into Order/OrderItem.

This is internally consistent but provides no price-changed-in-cart notification or cart-time snapshot semantics.

## 8. Checkout authority

src/lib/orders.ts:createPendingOrder is authoritative for retail pricing. It:

1. Deduplicates submitted photo IDs server-side.
2. Requires at least one ID.
3. Loads published photos from Prisma, including published Album/Event.
4. Requires every requested ID to exist and be available.
5. Requires all photos to belong to one photographer.
6. Sums trusted photo.priceCents values.
7. Creates Order.subtotalCents, Order.totalCents, and OrderItem.unitPriceCents in one transaction.

The client does not submit price, subtotal, total, fee, proceeds, or currency. customer-actions.ts accepts only contact data and a provider selection. validatePaymentSelection verifies provider availability server-side. Stripe/Zelle payment services derive amounts from the created Order and its OrderItems.

No client-controlled retail-price vulnerability was found in the current checkout path. A future pricing mutation must retain owner authorization and server-side validation.

## 9. Order snapshots and historical integrity

Historical retail economics are preserved adequately for the current one-photo-per-line-item model:

- OrderItem.unitPriceCents preserves each sold photo’s retail price.
- OrderItem.currency preserves the item currency field, although creation does not enforce it equals Order.currency.
- Order.subtotalCents, Order.totalCents, and Order.currency preserve order-level totals.
- Payment.amount, currency, billable count, fee rate, platform fee, and proceeds preserve payment economics.
- Refunds use OrderItem.unitPriceCents, never today’s Photo price.
- Photo deletion is restricted by OrderItem.photo relation, so historical order rows cannot simply lose their source reference through normal deletion.

Changing a Photo after order creation does not change the Order or OrderItem snapshot.

## 10. Fixed $0.25 StrideFrame fee

src/lib/commission.ts defines:

    STRIDEFRAME_MVP_FEE_PER_PHOTO_USD = 0.25
    MVP_PLATFORM_FEE_PER_PHOTO_CENTS = 25
    platformFeeCents = billablePhotoCount × 25

initiatePayment and startZellePayment derive billablePhotoCount from order.items.length, not from a browser-supplied quantity or gross price. Current OrderItem has no quantity field and the unique (orderId, photoId) constraint prevents duplicate photo lines.

Conceptual results:

| Sold photos | StrideFrame fee |
| ---: | ---: |
| 1 | $0.25 |
| 4 | $1.00 |
| 10 | $2.50 |
| 100 | $25.00 |

The fee is independent of the photographer’s retail price. Bundles do not exist yet; future package logic must preserve actual licensed-photo count separately from package price.

## 11. Stripe economics

initiatePayment loads the Order, synchronizes the photographer’s Connect account, counts OrderItems, calculates the fixed fee, and creates/updates a Payment snapshot. StripePaymentProvider.createCheckout sends:

- Checkout total: Payment.amount / Order.totalCents.
- Currency: Payment.currency.
- Connect destination: Payment.connectedAccountId.
- application_fee_amount: Payment.platformFeeCents.
- Photographer economic proceeds: internal Payment.photographerProceedsCents.

The implementation uses Stripe Connect Express destination-charge behavior. Stripe processing fees are not represented as StrideFrame platform revenue in the domain model. No Stripe API calls were made for this audit. SF-PAY-PROD-GATE remains mandatory.

## 12. Zelle economics

startZellePayment uses Order.totalCents as the amount shown to the customer and stores a Payment snapshot. The customer pays the photographer’s retail total directly. After trusted manual confirmation, manual-payments.ts creates/upserts one ZelleFeeObligation using the Payment’s billable count, 25-cent rate, total platform fee, and currency.

    customer Zelle payment = Order.totalCents
    StrideFrame obligation = Payment.billablePhotoCount × Payment.platformFeePerPhotoCents

The obligation is an immutable-fee snapshot and is not marked settled by sale confirmation. SALE_CONFIRMED != PLATFORM_FEE_SETTLED remains true.

## 13. Refund economics

prepareRefund selects historical OrderItems, rejects foreign/non-order items and duplicate RefundItems, and sums OrderItem.unitPriceCents. For a five-photo order at $5 each:

    gross = $25.00
    refund of 2 historical OrderItems = $10.00
    fee reversal = 2 × $0.25 = $0.50
    remaining fee economics = $0.75

Different-priced photos are handled correctly for retail refund amount because each selected OrderItem retains its own unit price. Fee reversal remains count-based, so it is still 25 cents per refunded licensed photo. Current full refund revokes the order-level DownloadGrant; partial refund relies on per-item refundedAt enforcement in the existing secure-download flow.

Zelle refunds are manual pending/completed and reverse the corresponding fee obligation. Stripe refunds use the provider boundary and historical refund amount. No refund calculation uses today’s Photo price.

## 14. Pricing security findings

### HIGH

Currency consistency is not enforced end-to-end. Photo.currency is a free string, Order.currency is hardcoded USD, and OrderItem.currency copies the Photo value without requiring it to equal the Order currency. Current UI creates USD photos, but an inconsistent database row could produce a USD order containing an item labeled with another currency. A pricing implementation slice should enforce one supported currency (currently USD) or introduce an explicit server-side currency policy before enabling configurable currencies.

### MEDIUM

Zero-dollar photos are allowed without an explicit semantic. validatePriceCents permits zero. The product has no NOT_FOR_SALE or free-photo state, so free items can enter orders and still count toward the fixed platform fee. Product/business policy should decide whether zero means free, hidden/not-for-sale, or invalid.

Cart has no price-change notification. This is not a server-authority bypass, but the customer can see one price when adding and another at checkout if a photographer/admin changes the database value.

Mixed-event carts are allowed for one photographer. Checkout requires one photographer, not one event. The Order stores the first photo’s event ID. This may be acceptable, but the customer/order presentation and future bundles need an explicit mixed-event policy.

### LOW

There is no application-level bulk price edit or explicit price-locked state. Direct database mutation is outside the normal photographer UX but is not covered by a dedicated pricing service yet.

## 15. Edge-case behavior

| Case | Current behavior |
| --- | --- |
| Zero price | Accepted; order total can be zero; still counts as one billable photo for the platform fee calculation. |
| Negative price | Rejected by dollarsToCents/validatePriceCents. |
| Very high price | validatePriceCents caps at 10,000,000 cents; the upload parser itself converts first, then validation applies. |
| Missing upload price | Defaults to $15.00. |
| Mixed-price cart | Supported; total is sum of current Photo prices and OrderItems preserve each price. |
| Different albums | Supported if same photographer and published. |
| Different photographers | Rejected by createPendingOrder. |
| Price changed in cart | New current price appears and is snapshotted at order creation. |
| Price changed after Order | Historical Order/OrderItem/Payment values remain unchanged. |
| Refund after price change | Uses historical OrderItem price. |
| Deleted photo with historical OrderItem | Normal FK restrict prevents deletion through Prisma. |
| Different currencies | Schema permits them, but current order/payment path assumes USD; consistency gap is HIGH priority. |

## 16. Target inheritance model analysis

Proposed model:

    Event.defaultPhotoPriceCents?
            ↓
    Album.photoPriceCents
            ↓
    Photo.priceOverrideCents?

    effectivePhotoPrice = Photo override ?? Album price ?? Event default ?? NOT_FOR_SALE

This is technically compatible with Event → Album → Photo, but three pricing levels add precedence, validation, UI, and historical migration complexity. Event-level defaults are not needed to solve the immediate photographer problem. Album is the natural bulk-pricing boundary because uploads already happen inside an album and public pricing is displayed at Photo surfaces.

Changing an album price dynamically for all non-overridden photos is preferable to copying values into hundreds of Photo rows, provided checkout always resolves and snapshots the effective price server-side. However, once a photo has been ordered, its OrderItem must remain immutable. A future implementation should either reject price changes that create invalid existing carts or explicitly accept that carts are live and show a price-change notice.

## 17. Recommended MVP pricing model

Recommendation: B — Album price + optional Photo override.

Recommended semantics:

    Album.photoPriceCents           required for photos offered for sale
    Photo.priceOverrideCents?       optional exception
    effectivePhotoPrice(photo)      override ?? album price
    OrderItem.unitPriceCents        immutable sale snapshot

Suggested photographer UX:

    Create/select Event
      → create Album
          → set “Price per photo” once
              → upload 300 photos
                  → all inherit album price
          → optionally override selected photo price

The current upload price input can become an album-price setting. Existing individual prices should be preserved during migration by backfilling Photo.priceOverrideCents = Photo.priceCents, then allowing new albums to use an album price. A later cleanup can remove the legacy field only after historical/current behavior is fully migrated.

## 18. Future packages compatibility

Packages should introduce a separate commercial concept rather than overload Photo.priceCents:

    Product/Offer
      ├─ included photo count or album scope
      ├─ customer package price
      └─ licensed OrderItems / billable photo count

For a 10-photo package at $35, the Order must preserve $35 customer economics while recording 10 licensed photo items or an equivalent trusted allocation. Platform fee remains 10 × $0.25 = $2.50. Refunds need package allocation rules before package items can be partially refunded.

## 19. Required implementation changes

Likely required for the recommended model:

1. Add nullable Album.photoPriceCents (and a supported currency policy, likely USD-only initially).
2. Add nullable Photo.priceOverrideCents, or migrate/rename the current Photo.priceCents carefully.
3. Add a single server-side effectivePhotoPrice resolver used by gallery, cart display, order creation, and payment preparation.
4. Add authenticated photographer album-price update and photo-override actions with ownership checks.
5. Add album-level pricing UI and optional selected-photo override UI.
6. Define zero-price/not-for-sale behavior and currency validation.
7. Add tests for inheritance, overrides, ownership, cart price changes, historical snapshots, mixed prices, refunds, and package-count fee semantics.

Likely schema change: YES.

Likely migration: YES, additive/non-destructive. Preserve existing prices by backfilling overrides or an equivalent compatibility representation; do not recalculate historical OrderItems.

## 20. Risks and blockers

- Currency policy must be resolved before exposing configurable currency.
- Zero-price semantics must be resolved before using album inheritance.
- Existing Order → Photo foreign-key restrictions protect historical references but constrain deletion workflows.
- Mixed-event cart policy is currently implicit and should be made explicit before package support.
- Cart price-change UX needs a product decision.
- Package refunds and billable-photo allocation require a later commercial design.
- Stripe and Zelle must continue receiving server-owned Order/Payment snapshots; pricing inheritance must never move authority to the browser.
- SF-PAY-PROD-GATE remains required for real Stripe activation.

## Current vs recommended source of truth

    CURRENT:
    current retail price  = Photo.priceCents
    historical sale price = OrderItem.unitPriceCents
    platform fee          = Payment.platformFeeCents snapshot

    RECOMMENDED:
    current retail price  = effectivePhotoPrice(Photo, Album)
    historical sale price = OrderItem.unitPriceCents
    platform fee          = trusted licensed-photo count × 25 cents

## Discovery status

SF-PRICE-01 is discovery-only. No application code, schema, migration, database, commit, or push was changed.
