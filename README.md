# StrideFrame MVP

StrideFrame is a platform for sports/event photographers to publish and sell photos through public galleries and QR sharing.

Plataforma web para fotógrafos deportivos y de eventos. El workspace inicial estaba vacío, por eso se creó una base Next.js 16 + TypeScript con Prisma/PostgreSQL y Docker Compose.

## Arquitectura

- **Photographer area**: private `/photographer/*` routes, bcrypt password hashes, signed httpOnly JWT cookie sessions, and owner-scoped Prisma queries.
- **Área cliente**: `/e/[eventSlug]`, sin cuenta; previews públicas con watermark. Checkout y orden quedan desacoplados del usuario para permitir cuentas futuras.
- **Datos**: `Photographer → Event → Album → Photo` y `Order → OrderItem → Photo`, con `Payment` y `DownloadGrant`.
- **Archivos**: `originalKey` y `previewKey` separados. La interfaz de almacenamiento debe emitir URLs firmadas para originales. El schema ya evita exponer la key original en las rutas públicas.
- **Payments**: provider-neutral `PaymentProvider` interface. `Payment` stores provider, external ID, integer `amount`, `currency` (USD by default), status and timestamps. Stripe is the intended primary US adapter; PayPal and Mercado Pago remain future adapters.
- **Language**: English is the default product language. `src/lib/i18n.ts` provides a small locale boundary for adding Spanish later without duplicating the application.
- **Reconocimiento facial**: no implementado; queda como módulo futuro que indexe `Photo` sin contaminar el dominio de pedidos.

## Flujo MVP

1. Photographer registers/signs in, creates an event and albums, and manages only their own resources.
2. Public customer galleries remain separate and do not require customer accounts.
3. Uploads, previews, cart, checkout and downloads are intentionally deferred.

## Ejecutar localmente

```bash
cp .env.example .env
docker compose up -d db
npm install
npx prisma generate
npx prisma migrate deploy
npm run dev
```

The repository now contains one clean pre-production baseline migration at `prisma/migrations/00000000000000_init`. The two invalid pre-production migrations were squashed because they referenced tables from a migration that was not present. Do not apply this baseline over an existing database without a separate data migration plan.

For PostgreSQL integration tests, use the isolated `sportpix_test_migrated` database. The test command creates it when Docker Compose is running, deploys the repository migrations from zero, and then runs the integration suite:

```bash
cp .env.test.example .env.test
npm test
npm run test:integration
```

`DATABASE_URL` is for development; `TEST_DATABASE_URL` is for the dedicated test database. Never point the integration command at production.

## QR Sharing v1

Photographers can create one canonical QR link per Event or Album. The QR encodes only a stable StrideFrame route:

```text
PUBLIC_BASE_URL/q/{opaque-code}
```

The redirect route checks that the QR is active and that its target is currently public. Event QR requires a published Event; Album QR requires both a published Event and published Album. Disabling a QR makes it unavailable without changing the printed code, and re-enabling it restores it. Unpublishing content also makes existing QR links unavailable without deleting them.

PNG and SVG downloads are available from the photographer sharing sections. `PUBLIC_BASE_URL` must be configured; it is never hardcoded. Scan analytics can be added later through the `QRLink` model without collecting visitor fingerprints in this iteration.

## Photo Pipeline v1

Local development storage lives outside `public/`:

```text
storage/
  originals/   # private; no unauthenticated route
  previews/    # served only through the controlled preview route
```

Uploads currently accept JPEG, PNG and WebP files up to 10 MB by default (`MAX_PHOTO_BYTES` can override this), with a 50-photo batch default (`MAX_PHOTOS_PER_UPLOAD`). The photographer enters dollars in the UI (`12.50`) while the database stores integer cents (`1250`). The server decodes the image with Sharp, validates dimensions, creates a resized WebP preview with a visible STRIDEFRAME watermark, stores the original and preview separately, and creates the `Photo` record only after both files are stored. Partial failures clean up stored files where possible.

Photographers upload only to albums they own. Public pages and the preview endpoint require a published Event, published Album and published Photo. Original storage keys are never returned by public pages or routes. Set `STORAGE_PROVIDER=local` for development/tests or `STORAGE_PROVIDER=s3` with the `S3_*` variables for AWS S3, Cloudflare R2, Backblaze B2, DigitalOcean Spaces, or another S3-compatible service. S3 configuration fails clearly and never silently falls back to local storage. Original objects remain private; previews use the configured controlled/public preview base.

## Cart + Order v1

Customers use a guest cart stored in an `httpOnly` cookie containing only Photo IDs. Checkout reloads eligible Photos from PostgreSQL and never trusts browser prices, totals, currency or publication state. Orders are restricted to one photographer in this MVP, use USD integer cents, snapshot each `OrderItem` price, and start as `PENDING_PAYMENT`. The public reference is a random `publicOrderCode`; internal IDs and original storage keys are not exposed.

Payment providers remain behind the existing abstraction and are intentionally not invoked. Future verified payment events can transition the order and start the `DownloadGrant` flow.

## Payments v1 — Stripe test mode

Payments use the provider-independent `PaymentProvider` interface with Stripe as the first adapter. StrideFrame creates a Stripe-hosted Checkout Session server-side from the frozen Order/OrderItem cents, using an idempotency key tied to the Order. The browser return URL never marks an Order paid.

## Secure delivery

After a verified payment webhook changes an Order to `PAID`, the customer can prepare a short-lived DownloadGrant. The grant stores only a SHA-256 token hash, while the raw capability is kept in an HTTP-only browser cookie and used to build controlled download links. `publicOrderCode` is only an order reference and is not download authorization.

Each download revalidates the grant, expiration, Order state and the requested `OrderItem`; it cannot access other photos from the same album. Local storage streams originals through the application with private cache headers. S3-compatible storage uses short-lived signed URLs controlled by `SIGNED_DOWNLOAD_TTL_SECONDS`. Grant lifetime is controlled by `DOWNLOAD_GRANT_TTL_HOURS` and is separate from signed URL lifetime.

Refunded or cancelled Orders are rejected dynamically and active grants can be revoked. ZIP/download-all, production rate limiting and CDN/WAF hardening remain future work.

## Face Search v1

Face Search is scoped to one published Event. A customer uploads a temporary JPEG, PNG or WebP selfie from the Event page; the application detects one clear face, generates an embedding through the provider abstraction, and searches only compatible `PhotoFace` vectors for that Event. Results still apply Event, Album and Photo publication rules and return previews only. The selfie is not written to public storage, embeddings are never returned to the browser, and the feature does not identify people by name.

PostgreSQL must provide the `vector` extension. Development Compose uses `pgvector/pgvector:pg16`; migrations enable the extension and create `PhotoFace` plus durable `FaceIndexJob` tables. Uploads enqueue indexing and the normal gallery remains available if indexing fails. Run `npm run face-worker` to claim and process one pending job; jobs are retry-limited and indexing is idempotent per Photo/model version.

The deterministic provider remains the default for tests (`FACE_PROVIDER=deterministic`) and emits normalized 512-dimensional vectors. The optional `FACE_PROVIDER=onnx` adapter loads explicitly configured SCRFD and ArcFace-compatible ONNX files; it never downloads models at runtime and fails clearly when artifacts are missing. The model contract expects detector rows containing bounding box, confidence and five landmarks, followed by 112x112 aligned face preprocessing and a 512-dimensional normalized embedding. `FACE_MATCH_THRESHOLD` is cosine similarity (not distance) and must be calibrated on sports-event imagery; the default is development-only.

Run `npm run face-worker` for the bounded worker loop, `FACE_WORKER_DRAIN=true npm run face-worker` to drain available jobs, `npm run face-reindex` to enqueue reindexing, and `npm run face-benchmark -- ./benchmark-data` against a private local dataset. Do not commit benchmark images or ONNX artifacts. `Dockerfile.face-worker` provides an isolated CPU-compatible Node worker boundary; GPU runtime configuration, CUDA and model distribution remain deployment work for a later iteration.

Configure only test credentials locally:

```text
PAYMENT_PROVIDER=stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
PUBLIC_BASE_URL=http://localhost:3000
```

Forward Stripe test webhooks locally with Stripe CLI, conceptually:

```bash
stripe listen --forward-to localhost:3000/api/payments/stripe/webhook
```

The signed webhook validates amount, currency, provider/payment identifiers and updates Payment + Order transactionally. Duplicate event IDs are persisted and ignored. Cancelled or failed payments do not mark Orders paid; retries reuse the existing Payment attempt in this MVP. Stripe Checkout may surface Apple Pay or Google Pay when eligible and enabled in the Stripe account/browser; availability is not guaranteed. PayPal is not implemented yet. Secure original delivery is implemented through short-lived `DownloadGrant` capabilities.

Abrir http://localhost:3000. La demo incluye un evento público y un login de demostración. `npm run lint`, `npx tsc --noEmit` y `npm test` son los checks esperados.

## Riesgos y pendientes

- Procesamiento de imágenes asíncrono, límites de tamaño, antivirus y reintentos.
- Sesiones, CSRF, rate limiting, autorización por propietario y auditoría todavía deben endurecerse antes de producción.
- Integrate Stripe first, then PayPal and regional adapters through `PaymentProvider`; add signed webhooks, refunds, taxes and emails.
- Implementar S3-compatible adapter, CDN para previews y URLs firmadas de descarga.
- Photo upload/processing, cart/checkout, orders, storage adapter and E2E tests remain.
- No hacer deploy de producción desde este MVP.
