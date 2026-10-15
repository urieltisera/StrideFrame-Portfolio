# SF-PAY-01 — Payment & Payout Architecture Discovery

## Scope and evidence

Discovery only. No application code, Prisma schema, migration, payment API, or
financial transaction was changed or executed.

Repository: `urieltisera/strideframe`

Branch: `milestone/strideframe-core-mvp`

Baseline: `10711ed feat: complete StrideFrame MVP frontend`

The implementation facts below were inspected from the current repository,
especially `prisma/schema.prisma`, `src/lib/payments.ts`,
`src/lib/payment-service.ts`, `src/lib/orders.ts`, the Stripe webhook route,
secure-download code, checkout actions, README, and integration tests.

## 1. Current architecture

The current money flow is:

```text
Published Photo.priceCents
        ↓
createPendingOrder()
        ↓
Order + OrderItem price snapshots
        ↓
Payment record (provider = STRIPE)
        ↓
Stripe-hosted Checkout Session
        ↓
signed Stripe webhook
        ↓
Payment + Order transition to succeeded/paid
        ↓
DownloadGrant for the paid Order
        ↓
authorized original download
```

This is a single-photographer, platform-direct-payment MVP. It is not yet a
marketplace payout architecture.

### Existing Prisma payment/order models

- `Photographer` owns `Event`, `Album`, and `Order`; it has no Stripe account,
  onboarding, payout, or payment-settings fields/relations.
- `Photo` has `priceCents` and `currency`, currently populated as USD by the
  photo creation flow.
- `Order` stores `publicOrderCode`, `eventId`, `photographerId`, customer
  contact fields, `currency`, `subtotalCents`, `totalCents`, and `status`.
- `OrderItem` snapshots `photoId`, `unitPriceCents`, `currency`, and the
  original filename.
- `Payment` is one-to-one with an Order and stores provider name, provider
  payment/checkout IDs, amount, currency, status, idempotency key, raw response,
  and `paidAt`.
- `PaymentWebhookEvent` stores provider, provider event ID, and timestamp.
- `DownloadGrant` is a hashed, expiring, revocable order-level capability.

### Current statuses

`OrderStatus`:

- `PENDING_PAYMENT`
- `PAID`
- `PAYMENT_FAILED`
- `CANCELLED`
- `REFUNDED`

`PaymentStatus`:

- `PENDING`
- `SUCCEEDED`
- `FAILED`
- `CANCELLED`
- `REFUNDED`

There is no explicit processing, disputed, partially refunded, transfer,
payout, or verification-pending status.

## 2. Existing reusable components

### Payment provider abstraction

`src/lib/payments.ts` already defines a provider-neutral `PaymentProvider`
interface with checkout creation, status lookup, webhook verification and
handling, and refund methods. The current factory only permits `stripe` and
throws for unsupported providers.

### Stripe adapter

`StripePaymentProvider`:

- creates a Stripe Checkout Session in `payment` mode;
- creates one aggregate line item using the server-side order total;
- passes customer email and success/cancel URLs;
- includes StrideFrame order code and internal payment ID in metadata;
- uses the internal payment ID as the Stripe idempotency key;
- records the Checkout Session ID and PaymentIntent ID when available;
- verifies signatures through `stripe.webhooks.constructEvent`;
- exposes a refund call, but no application service currently invokes it.

The application does not create PaymentIntents directly. Stripe creates the
PaymentIntent as part of Checkout Session processing.

### Order and download components

- `createPendingOrder` loads published photos from the database and snapshots
  their prices into the OrderItems.
- `initiatePayment` rejects non-pending orders and creates/reuses the Payment
  row before starting Stripe Checkout.
- `markPaymentFromWebhook` checks the internal payment, provider ID, amount,
  and currency in a Prisma transaction.
- A successful webhook changes the Order to `PAID`.
- `createDownloadGrant` requires a `PAID` order and stores only a SHA-256 token
  hash.
- `authorizeDownload` validates the token, grant state/expiry, paid order, and
  that the requested photo is an OrderItem.
- Refunded orders and revoked/expired grants are rejected by the download
  authorization path.

### Frontend contract

The checkout frontend submits contact details to `createPendingOrder`; it does
not submit a trusted amount. The order page offers Stripe payment for pending
orders and only presents download preparation for paid orders. The frontend
does not mark an order paid based on a browser return URL.

The SF-FE-01 Zelle boundary is a disabled provider presentation. It states that
Zelle becomes available only when photographer payment settings exist. No QR,
recipient, Zelle API, or server-side Zelle behavior exists.

## 3. Missing capabilities

The current repository does not contain:

- Stripe Connect account creation, account links, onboarding, or account
  capability checks;
- a platform/connected-account relationship for a photographer;
- application-level commission, fee, tax, or net-proceeds fields;
- transfers, payouts, payout reconciliation, or payout failure handling;
- payment-method settings owned by a Photographer;
- a provider configuration boundary for photographer-enabled methods;
- Zelle recipient/configuration storage or a verification workflow;
- a trusted manual-payment review/approval workflow for Zelle;
- refund/dispute application services, webhook handling, or grant revocation
  orchestration;
- a payment ledger or immutable financial event/audit record;
- explicit processing/dispute/partially-refunded states;
- payment event persistence beyond the small webhook deduplication record;
- tests for Stripe webhook state transitions, Connect, refunds, disputes,
  payout failures, or Zelle verification.

## 4. Security and money-invariant audit

| Invariant | Current result | Evidence / concern |
|---|---|---|
| Price is calculated server-side | PASS | `createPendingOrder` reloads published photos and sums `Photo.priceCents`. |
| Customer cannot submit a trusted arbitrary price | PASS | Checkout accepts contact fields only; amount comes from DB photos. |
| Order items preserve price snapshots | PASS | `OrderItem.unitPriceCents` is persisted and covered by integration tests. |
| Downloads unlock only after trusted payment confirmation | PASS with scope limits | Grants require `Order.status = PAID`; only webhook success sets PAID in normal flow. A privileged/manual DB update could bypass application policy, as in the integration fixture. |
| Stripe webhook signatures are verified | PASS | Route requires `stripe-signature`; provider uses Stripe signature construction. |
| Repeated webhooks are idempotent | PARTIAL | `PaymentWebhookEvent.providerEventId` is unique and repeated IDs are ignored. The event is inserted before handler/state processing; if later processing fails, a retry is ignored and the payment may remain unpaid. Concurrent duplicate delivery can also surface a unique-constraint error. |
| Amount/currency is consistent | PARTIAL | Webhook processing compares Payment to Order. `createPendingOrder` hardcodes Order currency to USD and does not reject a mixed/non-USD Photo currency set; the current photo creation path emits USD. |
| An order cannot accidentally be paid twice | PARTIAL | Payment is one-to-one, Checkout creation is idempotent by Payment ID, and provider ID mismatches are rejected. There is no explicit monotonic state machine or event-level guard against conflicting later events. |
| Photographer cannot access another photographer's financial/order data | PARTIAL/PASS for inspected owner pages | Photographer pages filter by authenticated `photographerId`, and mutation actions use owner-scoped queries. There is no dedicated financial/payout API yet. Future payment APIs must preserve this invariant. |
| Customer cannot obtain originals without valid entitlement | PASS | Token hash, active/non-expired grant, paid order, and OrderItem membership are revalidated for every download. |
| Browser return URL cannot prove payment | PASS | Return URL only displays the order; paid state is database-driven. |
| Refunds revoke delivery | PARTIAL | `revokeOrderDownloads` exists and tests cover it, but no production refund service/webhook invokes it and there is no complete refund orchestration. |

### Important current webhook risks

1. `processStripeWebhook` records the event ID before `handleWebhook` and
   `markPaymentFromWebhook` complete. A transient database/provider failure can
   make a valid event permanently appear processed.
2. The handler treats `checkout.session.completed` as success without explicitly
   checking Checkout Session `payment_status` or the PaymentIntent status.
3. Unrecognized event types become `PENDING` rather than being explicitly
   ignored or mapped through a documented event matrix.
4. Payment status transitions are not monotonic. A later failure/refund event
   does not centrally transition Order state or revoke grants.
5. Raw provider responses are modeled but not populated by the current webhook
   path, limiting reconciliation evidence.

These are discovery findings only; no fixes are made in SF-PAY-01.

## 5. Stripe Connect option comparison

### A. Destination charges

The platform creates a charge on the platform Stripe account and sets a
connected-account destination plus `application_fee_amount` or
`application_fee_percent`.

**Complexity:** Lowest of the Connect options for a single photographer per
order. Checkout can remain platform-created with connected-account parameters.

**Commission:** Explicit at charge creation. The platform fee is separated
from the photographer's destination amount.

**Onboarding:** Requires Stripe Connect Express or Custom onboarding and a
connected account ID/capability readiness check before enabling automated
payouts.

**Refunds/disputes:** The platform charge is the primary customer-facing
charge. Refunds and dispute responsibility need explicit configuration and
ledger handling; application fees may need to be refunded according to policy.

**Accounting/reconciliation:** Easier than separate charges because one charge
and one application fee relate directly to the Order, but transfers, fees,
refunds, and disputes still need immutable records and reconciliation jobs.

**MVP suitability:** Strong fit for U.S.-first marketplace MVP when the
platform wants a simple order-level commission and photographers use Stripe
Connected Accounts.

**Migration impact:** Add connected-account/onboarding and fee fields, enrich
Checkout creation, make webhook processing authoritative for charge/payment
events, and add refund/dispute handling. Existing Order/Payment concepts can
be retained with a carefully staged extension.

### B. Separate charges and transfers

The platform creates the charge, then creates one or more transfers to a
connected account after the charge or after a platform-defined release point.

**Complexity:** Higher. Charge, transfer, transfer reversal, balance
availability, and release timing become separate state machines.

**Commission:** Flexible and well-suited to delayed release or splitting one
order across photographers, but requires explicit net-proceeds calculations.

**Onboarding:** Same Connect account/capability requirements as destination
charges, plus transfer readiness and balance timing.

**Refunds/disputes:** More operationally complex. Transfers may need reversal
or recovery before/after refunds and disputes; insufficient connected-account
balance becomes a business and collections concern.

**Accounting/reconciliation:** Best flexibility, but requires a real ledger for
charges, Stripe fees, application commission, transfers, reversals, refunds,
disputes, and payout states.

**MVP suitability:** Better for delayed photographer release, multi-party
orders, reserves, or sophisticated marketplace accounting; excessive for the
current single-photographer-per-order MVP unless those requirements are
already approved.

**Migration impact:** Largest. Existing Payment must be split into charge and
transfer concepts or supplemented with transfer records and a reconciliation
workflow.

### C. Platform receives funds and performs payouts through another model

The platform is the merchant/recipient of customer funds and later pays
photographers through a separate payout system or manual process.

**Complexity:** Stripe Checkout integration is initially simple, but the
platform assumes the greatest operational, regulatory, tax, refund, dispute,
and reconciliation burden.

**Commission:** Straightforward to calculate internally, but proceeds,
reserves, refunds, and payout liability become platform ledger obligations.

**Onboarding:** No immediate Connect onboarding, but photographer identity,
tax, payout, KYC/AML, and banking requirements do not disappear; they move to
the platform's payout process.

**Refunds/disputes:** Platform bears direct responsibility for customer
support, refunds, disputes, and recovering photographer proceeds.

**Accounting/reconciliation:** Highest complexity and custody exposure. A
ledger and payout reconciliation system are mandatory, not optional.

**MVP suitability:** Poor fit for the stated goal of minimizing unnecessary
custody of photographer funds and operating a photographer marketplace in the
U.S.

**Migration impact:** Would require the largest domain and operational change,
including payout balances and a liability ledger.

## 6. Zelle boundary

Zelle should be modeled as an external/manual payment method, not as a Stripe
provider adapter. The system must not imply API authorization, automatic
confirmation, merchant webhooks, or finality that Zelle does not provide to
this application.

Recommended boundary:

```text
Photographer enables Zelle and supplies recipient details + official QR
        ↓
Customer selects Zelle and receives exact amount + order reference
        ↓
Order remains PAYMENT_PENDING / ZELLE_AWAITING_VERIFICATION
        ↓
Customer submits permitted proof or photographer/platform reviews payment
        ↓
Trusted reviewer confirms or rejects the payment
        ↓
Only confirmation transaction changes order to PAID and creates grant
```

Requirements:

- Store photographer-owned configuration separately from an Order: recipient
  display data, official QR asset reference, enablement, and version/audit
  metadata. Never hardcode a photographer QR.
- Snapshot the selected payment method and the displayed recipient/amount on
  the order so later configuration edits do not change the payment instruction
  for an existing order.
- Never unlock downloads from a browser return, uploaded screenshot, customer
  assertion, or unverified webhook-like callback.
- Require a trusted manual review or another explicitly approved confirmation
  mechanism, with reviewer identity, timestamp, evidence reference, and an
  immutable decision record.
- Keep Zelle orders separate from Stripe Connect settlement and commission
  calculations, while using the same provider-neutral Order/Payment contract.
- Define fraud, duplicate-payment, refund, cancellation, and dispute policy
  before enabling it.

SF-FE-01's disabled Zelle UI is therefore correct for the current backend.

## 7. Recommended target architecture

### Recommendation

Use **Stripe Connect destination charges with Express connected accounts** for
the U.S.-first MVP, subject to legal/commercial confirmation of merchant,
commission, tax, refund, and dispute responsibilities.

Reasons:

- supports automated card payments and photographer proceeds without creating
  an unnecessary platform payout custody system;
- makes the platform commission explicit at charge creation;
- fits the current one-photographer-per-order invariant;
- preserves a platform-owned Checkout Session and backend-authoritative
  webhook flow;
- can be introduced by extending the existing Payment/Order model rather than
  replacing the customer funnel;
- leaves a path to separate charges/transfers later if delayed release,
  multi-photographer carts, reserves, or complex revenue splits become real
  requirements.

Do not enable automated payouts for a photographer until the connected account
is onboarded, capabilities are enabled, requirements are satisfied, and the
platform has a clear failure/reconciliation path.

### Architectural invariants for the target

- One Order remains tied to one photographer for MVP.
- Order totals and fee inputs are calculated server-side from immutable order
  snapshots.
- Stripe object IDs, Connect account ID, application fee, currency, and
  settlement state are persisted for reconciliation.
- Only verified Stripe events can transition payment/order entitlements.
- Refunds/disputes transition financial state and revoke or suspend downloads
  according to policy.
- Provider selection is a domain value, not a Stripe-only conditional spread
  throughout checkout.
- Zelle never shares Stripe's automatic-success path.

## 8. Proposed domain model changes

These are proposals for later implementation, not schema changes in this task.

### Photographer / connected account

Add a separate `PhotographerPaymentAccount` concept containing:

- photographer ID;
- provider (`STRIPE_CONNECT`, potentially future providers);
- connected account ID;
- account type and onboarding status;
- charges/payout capability status;
- requirements/status snapshot without storing secrets;
- country/currency configuration;
- timestamps and last provider synchronization;
- disabled/restricted reason.

### Payment method configuration

Add a provider-neutral `PhotographerPaymentMethod` or equivalent with:

- photographer ID;
- provider/method type (`STRIPE`, `ZELLE`);
- enabled flag;
- display configuration/version;
- ordering/default selection;
- audit timestamps.

Store Zelle recipient and QR references in a dedicated protected configuration
model, not in generic Stripe fields. QR files must use controlled storage and
must not expose storage credentials.

### Money and settlement records

Extend the order/payment boundary with immutable fields or related records for:

- payment method/provider;
- gross amount and currency;
- platform commission amount/rate and calculation version;
- Stripe processing fee when known;
- photographer net amount;
- Connect account ID snapshot;
- application fee ID;
- charge/payment intent/session IDs;
- transfer ID if the strategy later changes;
- refund amount and state;
- dispute state;
- settlement/reconciliation status.

Prefer append-only `FinancialEvent`/ledger records over relying only on mutable
status columns. Keep provider payloads minimized, redacted, and retention
controlled.

### State model

Introduce explicit, documented state transitions rather than allowing any
webhook event to overwrite a status. Candidate states include:

- order: `PENDING_PAYMENT`, `PAYMENT_PROCESSING`, `PAID`, `PAYMENT_FAILED`,
  `REFUND_PENDING`, `PARTIALLY_REFUNDED`, `REFUNDED`, `DISPUTED`, `CANCELLED`;
- manual Zelle: `AWAITING_VERIFICATION`, `VERIFIED`, `REJECTED`, `EXPIRED`;
- Connect onboarding: `NOT_STARTED`, `PENDING`, `READY`, `RESTRICTED`,
  `DISABLED`.

Final names should be selected with product/legal/accounting owners.

## 9. Proposed API changes

Future API/server-action boundaries should include:

- photographer payment-method settings read/update, owner-scoped;
- Stripe Connect onboarding-link creation and return/refresh handling;
- connected-account capability/status refresh via server-side Stripe calls;
- provider-neutral checkout-session creation from an existing pending Order;
- payment status endpoint/page backed by database state, never browser claims;
- signed Stripe webhook ingestion with durable event processing and retry-safe
  state transitions;
- refund request/service with authorization, amount validation, idempotency,
  and grant revocation;
- dispute event handling and customer/download policy;
- Zelle configuration management and protected QR delivery;
- Zelle verification/rejection workflow with reviewer authorization and audit.

No client endpoint should accept a trusted total, commission, connected account,
or photographer ID without deriving it from the server-side Order and owner
relationships.

## 10. Proposed webhook/event flow

### Stripe

1. Create a pending Order with immutable item/price/currency snapshots.
2. Validate photographer Connect readiness and enabled provider.
3. Create a Checkout Session with destination/application-fee parameters.
4. Persist Stripe IDs and a request idempotency key before redirecting.
5. Receive the raw webhook body and verify the signature.
6. Persist the provider event in a durable inbox with an unprocessed/processed
   state and unique provider event ID.
7. Acknowledge duplicate events safely without losing an in-flight event.
8. Validate event type, object IDs, amount, currency, metadata, connected
   account, and current state.
9. Apply one monotonic transaction to payment, order, ledger, and entitlement
   state.
10. Create/release the download grant only after the trusted success state.
11. Record refunds, disputes, transfer/application-fee effects, and grant
    revocation/suspension as separate events.

### Zelle

1. Create a pending order with a versioned snapshot of the enabled Zelle
   instructions.
2. Display exact amount, currency, order reference, recipient, and official QR.
3. Keep the order unavailable for download.
4. Accept only the explicitly approved proof/review workflow.
5. Record reviewer and evidence/audit data.
6. On trusted approval, transactionally mark the payment/order verified and
   create the grant; on rejection, keep it unpaid and record the reason.

## 11. Proposed photographer onboarding flow

1. Photographer opens Payment Settings.
2. Platform explains Stripe Connect, fees, identity requirements, payout
   timing, refunds, disputes, and applicable legal/tax responsibilities.
3. Server creates or reuses an Express connected account.
4. Server generates a Stripe-hosted onboarding link; no Stripe secrets reach
   the browser.
5. Photographer completes onboarding at Stripe.
6. Return and refresh URLs re-query account status server-side.
7. Platform enables Stripe checkout only when required capabilities are ready.
8. Photographer configures commission-relevant business settings only where
   product policy permits; platform fee calculation remains server-owned.
9. Photographer may separately configure Zelle recipient/QR details, subject
   to validation, ownership, and audit.
10. Changes to payment settings are versioned and do not mutate instructions
    already snapshotted onto pending orders.

## 12. Proposed customer checkout flow

1. Server loads cart photos and validates publication/availability.
2. Server enforces the current one-photographer-per-order rule.
3. Server creates an immutable pending Order and OrderItems.
4. Checkout shows only payment methods enabled and ready for that photographer.
5. Stripe selection redirects to a server-created Checkout Session.
6. Zelle selection shows the order's snapshotted instructions and retains an
   awaiting-verification state.
7. Customer return pages read database status and clearly show pending,
   processing, failed, paid, refunded, or verification-pending states.
8. Downloads become visible only after entitlement creation by trusted server
   processing.

## 13. Refund and dispute considerations

Before implementation, product/legal/accounting decisions are needed for:

- full and partial refunds;
- whether platform commission is returned on refund;
- photographer proceeds already transferred;
- refund funding and negative connected-account balances;
- dispute responsibility and evidence submission;
- whether disputes immediately suspend downloads;
- Zelle refunds and manual reconciliation;
- customer notification and photographer notification;
- retention and audit requirements.

Technically, refund/dispute handling must be idempotent, amount-bounded by the
captured amount, tied to the original Order/Payment, and must not rely on a
browser request to revoke access.

## 14. Migration strategy

No migration is created in SF-PAY-01. A safe future sequence is:

1. Approve merchant-of-record, commission, tax, refund, dispute, and payout
   policies.
2. Introduce additive provider/account/settings and financial-event models.
3. Backfill current photographers as `NOT_STARTED` and current Orders as
   legacy/platform-direct Stripe payments with a clearly identified strategy.
4. Add read-only reconciliation/reporting before enabling new writes.
5. Add feature flags for Connect onboarding and provider availability.
6. Enable Connect only for newly onboarded photographers after sandbox tests.
7. Keep legacy Stripe Orders readable and downloadable under existing rules.
8. Add webhook inbox processing and replay tooling before changing entitlement
   transitions.
9. Add refund/dispute synchronization and verify grant revocation.
10. Enable Zelle only after manual verification, audit, and policy are approved.
11. Migrate or reconcile legacy orders; never silently reinterpret historical
    gross/net amounts.

## 15. Test strategy

### Unit tests

- money, currency, commission, rounding, and fee calculations;
- provider selection and unsupported-provider rejection;
- monotonic payment/order state transitions;
- webhook event classification and signature failure;
- idempotency/replay/concurrent duplicate behavior;
- amount, currency, metadata, account, and provider-ID mismatch rejection;
- Connect readiness gating;
- Zelle verification/rejection rules;
- refund/dispute grant revocation rules.

### Integration tests

- create Order from published photos and immutable price snapshots;
- Stripe Checkout creation with mocked Stripe client and idempotency key;
- signed webhook success, failure, processing, refund, and dispute events;
- webhook retry after database failure;
- duplicate and out-of-order event delivery;
- commission and connected-account records;
- owner isolation across photographers;
- grant creation only after trusted success/verification;
- refund and dispute revocation;
- Zelle pending → verified/rejected with reviewer audit.

### End-to-end/sandbox tests

- Stripe test-mode Checkout and Connect onboarding using isolated accounts;
- webhook forwarding and replay from captured redacted fixtures;
- payout/transfer failure scenarios without real financial transactions;
- customer mobile checkout and paid-download flow;
- Zelle UX with manual test verification, never automatic unlock.

## 16. Risks and open decisions

### Product/commercial

- Who is merchant of record for card sales?
- Exact commission model, taxes, photographer net amount, and payout timing?
- Who funds refunds and disputes after a photographer transfer?
- Are multi-photographer carts required, or does the current one-photographer
  rule remain for MVP?
- Is Express onboarding acceptable for the photographer experience?
- What evidence and service-level policy govern Zelle verification?

### Legal/privacy

- Connect terms, KYC/KYB, tax reporting, privacy notices, and data retention
  require explicit review.
- Zelle proof may contain sensitive financial information and needs retention,
  access-control, and deletion rules.

### Technical

- Current webhook inbox semantics need hardening before payment volume grows.
- Current currency handling is effectively USD-only and should be made explicit.
- Current dashboard “sales” is gross paid Order total, not photographer net or
  platform revenue.
- Raw provider payload retention and redaction policy is undefined.
- No background reconciliation job or operational replay tooling exists.

## 17. Suggested implementation slices

### SF-PAY-02 — Payment policy and domain contract

Approve merchant/commission/refund/dispute decisions; define provider-neutral
states, money invariants, event taxonomy, and the one-photographer-per-order
MVP boundary.

### SF-PAY-03 — Stripe webhook reliability hardening

Add durable inbox processing/retry semantics, explicit event mapping,
monotonic transitions, metadata/account validation, and redacted event audit.
Preserve current checkout behavior while testing replay and failure cases.

### SF-PAY-04 — Stripe Connect onboarding and destination charges

Add connected-account onboarding/status and destination/application-fee
creation behind feature flags. Persist reconciliation identifiers and gate
checkout on account readiness.

### SF-PAY-05 — Commission and financial ledger

Add immutable gross/fee/net records, reconciliation views, rounding/currency
rules, and photographer/platform reporting. Do not infer net revenue from the
current gross “sales” dashboard metric.

### SF-PAY-06 — Refunds, disputes, and entitlement policy

Implement idempotent refund/dispute processing, order/payment transitions,
grant revocation/suspension, notifications, and reconciliation.

### SF-PAY-07 — Photographer payment settings

Implement owner-scoped provider settings, Stripe readiness display, and
versioned settings snapshots. Keep secrets and private provider credentials
server-side.

### SF-PAY-08 — Zelle manual verification boundary

Add protected photographer Zelle configuration, order instruction snapshots,
manual verification/audit workflow, and explicit no-automatic-unlock tests.

### SF-PAY-09 — Sandbox and operational readiness

Run isolated Stripe test-mode/Connect scenarios, replay webhook fixtures,
validate payouts and failures, document runbooks, and perform a security/
accounting review before production enablement.

## Executive conclusion

The repository has a useful Stripe Checkout foundation and a strong
server-side price snapshot and secure-download boundary. It does not yet have
marketplace payouts, platform commissions, Connect onboarding, payment
settings, or trustworthy Zelle verification. The recommended target for the
U.S.-first MVP is Stripe Connect Express with destination charges and an
explicit application fee, while retaining a provider-neutral payment domain
and treating Zelle as a separately verified manual method.

SF-PAY-01 DISCOVERY: PASS

Discovery is complete. Implementation is intentionally deferred to the
SF-PAY slices above.
