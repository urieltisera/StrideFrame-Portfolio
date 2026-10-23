# StrideFrame

StrideFrame is a sports photography SaaS prototype for photographers to publish event galleries, sell digital photos, accept payments, deliver purchased files securely, and help customers find event photos through event-scoped face search.

The project is an active engineering build. It demonstrates a production-oriented architecture and tested application flows, but it is not presented as a finished production service.

## What it demonstrates

- Full-stack development with Next.js, TypeScript, Prisma, and PostgreSQL.
- Photographer authentication, sessions, ownership authorization, and event/album management.
- Photo ingestion with validation, private originals, generated previews, and watermarking.
- Local and S3-compatible storage abstractions.
- Stable QR links for event and album sharing.
- Guest cart and server-side pricing with persisted Order/OrderItem snapshots.
- Stripe Checkout integration with verified webhook-driven payment transitions.
- Stripe Connect foundations for photographer onboarding and platform fees.
- Manual Zelle payment confirmation with audit-oriented state transitions.
- Refund, dispute, reconciliation, and download-revocation flows.
- Secure digital delivery using hashed DownloadGrants and short-lived signed downloads.
- Event-scoped face search using 512-dimensional embeddings and pgvector.
- Durable face-indexing jobs processed by an isolated worker.
- Provider boundaries for storage, payments, email delivery, and face inference.

## Architecture

```text
Photographer
    │
    ├── Event / Album management
    │       │
    │       ├── Upload → validation → private original
    │       └── Preview / watermark → publish → QR
    │
Customer
    │
    ├── Gallery / Find My Photos
    ├── Cart → Order
    ├── Stripe or manual payment flow
    └── Authorized secure download

Face worker
    │
    └── durable indexing jobs → embeddings → PostgreSQL / pgvector
```

The web application uses Next.js + TypeScript with Prisma and PostgreSQL. Provider interfaces isolate external infrastructure such as storage, payment processing, email delivery, and face inference.

## Core flows

### Photography workflow

Photographers can create events and albums, upload photos, manage publication state, and expose customer-facing galleries without making original files public.

### Commerce and payments

Pricing is resolved server-side and persisted into order snapshots. The project includes Stripe Checkout/webhook handling, Stripe Connect foundations, a manually verified Zelle path, platform-fee accounting, and refund/dispute/reconciliation logic.

Payment integrations are designed around explicit state transitions and idempotency rather than trusting browser-side payment state.

### Secure delivery

Purchased files are not exposed as public originals. Delivery authorization checks the paid order, purchased item, and DownloadGrant before returning a protected local response or an S3-compatible signed URL.

### Find My Photos

Face Search is deliberately scoped to an event rather than maintaining global identity profiles. The pipeline supports detection/alignment, 512-dimensional normalized embeddings, pgvector persistence, event isolation, and durable indexing jobs.

Selfies are processed ephemerally for matching and are not intended to become public assets or global profiles.

## Face-model boundary and licensing

The repository supports a deterministic provider for ordinary tests and an ONNX development-validation path.

The InsightFace `buffalo_l` pretrained weights used during local validation are treated as **development-validation only**. They are intentionally excluded from Git and are not represented as commercially licensed production assets.

A production deployment would require an appropriately licensed model plus further biometric threshold calibration and robustness validation.

## Security and privacy decisions

- Original photos remain private.
- Public experiences use previews rather than unrestricted originals.
- Downloads require authorization against paid order state and purchased items.
- Face search is event-scoped.
- No named global face profiles or cross-event tracking are implemented.
- Model binaries, environment secrets, storage credentials, and face benchmark data are excluded from Git.
- Sensitive provider credentials remain server-side.

## Technology

- Next.js
- TypeScript
- React
- Prisma
- PostgreSQL
- pgvector
- Docker Compose
- Stripe / Stripe Connect foundations
- S3-compatible storage boundary
- Resend email integration
- ONNX development-validation face provider

## Local development

Create a local environment file from the example and provide development credentials where required:

```bash
cp .env.example .env
docker compose up -d db
npm install
npx prisma migrate deploy
npm run dev
```

The development database uses a pgvector-enabled PostgreSQL image.

## Validation commands

The repository includes unit/integration coverage and separate static/build checks:

```bash
npm run lint
npm run typecheck
npm test
npm run test:integration
npm run build
```

Face-worker tooling is also available:

```bash
npm run face-worker
FACE_WORKER_DRAIN=true npm run face-worker
npm run face-reindex
npm run face-benchmark -- ./benchmark-data
```

## Current limitations

StrideFrame remains an active engineering project rather than a finished production platform. Known boundaries include:

- Face-match threshold calibration is not production validated.
- The development-validation face weights are not approved here for commercial production use.
- No GPU deployment is configured.
- Production hardening and deployment remain future work.
- Additional commercial/product work such as broader payout, tax, subscription, and customer-account flows may still be required.

These limitations are intentionally documented rather than hidden behind production-readiness claims.

## Repository notes

The ONNX model binaries and private benchmark data are intentionally not committed. See `models/README.md` and the project engineering notes for development-validation details.

StrideFrame is an independent technical project built to explore the engineering requirements of a sports-photography marketplace and secure AI-assisted photo discovery.
