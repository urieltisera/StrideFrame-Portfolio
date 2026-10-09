# StrideFrame Handoff

## Current milestone

StrideFrame core MVP with photographer management, public galleries, QR sharing, photo pipeline, cart/orders, Stripe test payments, secure delivery, and event-scoped Face Search architecture.

## Architecture summary

Next.js + TypeScript web application, PostgreSQL + Prisma, pgvector, provider abstractions for storage/payments/face inference, and an isolated face worker. Original photos remain private; public experiences use previews.

## Customer flow

Photographer → Event → Album → Upload → Preview / Watermark → Publish → QR → Customer gallery → Find My Photos → Cart → Order → Stripe → Verified webhook → Secure Download

## Completed capabilities

- Photographer registration, login, sessions and ownership authorization.
- Event and Album CRUD with publication controls.
- Photo upload validation, local/S3-compatible storage abstraction, previews and watermarking.
- QR Event/Album sharing with stable redirect codes.
- Guest cart, server-side pricing, Order/OrderItem snapshots and single-photographer restriction.
- Stripe Checkout abstraction and verified webhook transitions.
- Hashed DownloadGrant delivery with local protected responses and S3 signed URL support.
- Event-scoped Face Search architecture with pgvector and durable indexing jobs.

## Face Search status

The official InsightFace buffalo_l development artifacts were validated locally:

- SCRFD-10GF detection and landmarks.
- 112×112 alignment.
- ArcFace-compatible 512-dimensional embeddings.
- L2 normalization.
- pgvector persistence and Event isolation.

Same-person/different-person calibration and sports-event robustness remain inconclusive because no suitable private validation dataset was available.

## Model licensing blocker

The buffalo_l pretrained weights are `DEV_VALIDATION_ONLY`. InsightFace source code is MIT, but these weights are not approved for StrideFrame commercial production use without appropriate licensing. The ONNX binaries are intentionally outside Git and must not be shipped to production.

## Environment variables required

Copy `.env.example` to `.env` and configure PostgreSQL, `AUTH_SECRET`, storage, `PUBLIC_BASE_URL`, Stripe test credentials, and Face Search settings. Real validation uses `FACE_PROVIDER=onnx` and the local ignored buffalo_l paths; ordinary tests use `FACE_PROVIDER=deterministic`.

## Local development startup

```bash
cp .env.example .env
docker compose up -d db
npx prisma migrate deploy
npm run dev
```

The development database uses the pgvector-enabled `pgvector/pgvector:pg16` image.

## Database setup

Migrations are append-only. Use `npx prisma migrate deploy` for a clean database. Do not use `prisma db push` as the normal setup path.

## Test commands

```bash
npm run lint
npm run typecheck
npm test
npm run test:integration
npm run build
```

## Face worker commands

```bash
npm run face-worker
FACE_WORKER_DRAIN=true npm run face-worker
npm run face-reindex
npm run face-benchmark -- ./benchmark-data
```

The worker uses PostgreSQL-safe job claiming and does not expose originals publicly.

## Model setup

Download the official `buffalo_l.zip` release explicitly from the InsightFace release mechanism, extract only `det_10g.onnx` and `w600k_r50.onnx` under `models/insightface/buffalo_l/`, and verify the checksums documented in `models/README.md`. Models are ignored by Git.

## Known limitations

- Face threshold calibration is not production validated.
- No commercial license exists for the validation weights.
- No GPU deployment is configured.
- No customer accounts, ZIP downloads, rate limiting, payouts, taxes or production deployment.
- Existing informational `<img>` lint warnings remain.

## Security/privacy guarantees

- Originals are never public.
- Downloads require paid Order, valid DownloadGrant and purchased OrderItem authorization.
- Face search is scoped to the current Event and publication state.
- Selfies are processed ephemerally and are not stored in public storage.
- Embeddings and storage credentials are never sent to browsers.
- No named identities, global face profiles or cross-event tracking are implemented.

## Current migration chain

1. `00000000000000_init`
2. `20261009070000_photo_pipeline`
3. `20261009080000_qr_links`
4. `20261009090000_cart_orders`
5. `20261009100000_stripe_payments`
6. `20261009101000_payment_webhook_events`
7. `20261009110000_secure_delivery`
8. `20261009120000_face_search`
9. `20261009130000_face_embedding_512`

## Next recommended work

1. UI/UX design in Figma
2. Commercially licensed face model selection
3. Biometric threshold calibration
4. Production hardening
5. Subscription/pricing system
6. Deployment
