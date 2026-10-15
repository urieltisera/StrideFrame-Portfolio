# SF-FACE-02.1 — Provider Boundary & Production Fail-Closed

## Status

`SF-FACE-02.1 STATUS: PASS` for the provider-boundary and readiness slice.

Face Search is **not** production-ready after this slice. No production model
was approved, downloaded, or enabled.

## Provider boundary

`src/lib/face-provider.ts` now exposes a provider-neutral boundary containing:

- face detection;
- embedding creation;
- provider/model/embedding-space metadata;
- readiness classification;
- safe provider resolution and compatibility validation.

The existing SQL/vector similarity search remains in `src/lib/face-search.ts`,
where it belongs as storage/search behavior. It uses the selected provider's
metadata and does not accept provider or model choices from the customer.

Each provider exposes:

- `providerId`
- `modelId`
- `modelVersion`
- `embeddingFormatVersion`
- `embeddingDimension`
- `similarityMetric`
- `readinessClass`

The current provider implementations remain internal adapters. Domain code no
longer needs to inspect ONNX paths or provider-specific model names.

## Readiness and fail-closed behavior

Supported readiness classes are:

- `DISABLED`
- `DEV_VALIDATION_ONLY`
- `PRODUCTION_READY`

Current classifications:

- deterministic/fake provider: `DEV_VALIDATION_ONLY`;
- ONNX provider, including the documented `buffalo_l` setup:
  `DEV_VALIDATION_ONLY`;
- no provider is `PRODUCTION_READY`.

In `NODE_ENV=production`, any development-only, unknown, invalid, or missing
provider configuration makes Face Search unavailable. The application does
not fall back to deterministic or ONNX/buffalo_l. The guard is scoped to Face
Search; gallery, events, cart, checkout, payments, and downloads are not
disabled by this state.

The public Face Search endpoint returns a generic `503` response:

```json
{
  "error": "Face Search is currently unavailable for this event.",
  "code": "FACE_SEARCH_UNAVAILABLE"
}
```

It does not expose provider paths, licensing details, secrets, or stack traces.
The availability `GET` endpoint lets the customer UI disable the Face Search
control while retaining the manual gallery path.

## Model loading and fallback behavior

The ONNX provider still loads configured model files lazily when its detection
or embedding methods are called. It does not download models. Provider
selection is server-side and is resolved from server configuration only.

No production fallback exists. If the configured provider is not explicitly
production-authorized in a future implementation, Face Search stays disabled.

## Compatibility boundary

Embedding creation and search now validate finite values and exact dimension
against the selected provider metadata. Search also filters stored vectors by
the selected model version, preserving the existing compatibility check.

The current schema stores only `modelVersion` alongside the fixed
`vector(512)` column. Provider ID, embedding format, metric, and full metadata
persistence are intentionally deferred to SF-FACE-02.2; this slice fails
safely on runtime dimension/metadata incompatibility rather than silently
mixing spaces. No schema change or migration was necessary.

## Observability

The resolver emits a deduplicated, non-sensitive JSON status record containing
only the Face Search component, enabled state, readiness class, provider ID
when available, and a coarse failure category. It never logs embeddings,
templates, image bytes, model paths, or secrets.

## Tests and validation

Added focused tests for:

- deterministic provider metadata and development-only classification;
- ONNX provider development-only classification;
- production blocking of deterministic providers;
- unknown-provider fail-closed behavior;
- incompatible embedding rejection;
- existing selfie validation behavior.

Validation completed:

- `npx prisma generate` — PASS
- `npx prisma validate` — PASS
- `npm run typecheck` — PASS
- `npm test` — PASS: 38 passed, 14 skipped across 14 files
- `npm run test:integration` — PASS: 14 passed; isolated local PostgreSQL
  database had no pending migrations
- `npm run lint` — PASS with 9 pre-existing warnings and no errors
- `npm run build` — PASS
- `git diff --check` — PASS

No Prisma schema or migration was changed.

## Explicit product/security invariants

```text
BUFFALO_L=DEV_VALIDATION_ONLY
FACE_SEARCH_OPTIONAL=true
PRODUCTION_DEV_PROVIDER_FALLBACK=FORBIDDEN
```

Face Search remains optional. If unavailable, ordinary gallery browsing and
commerce flows remain available.

## Deferred SF-FACE-02 work

- Persist complete provider/model/format/metric metadata and implement safe
  versioned reindex/cutover behavior.
- Add explicit photographer scope and deletion consistency checks.
- Add consent, retention/deletion guarantees, image hardening, rate limits,
  timeouts, and abuse controls.
- Resolve multi-face photo persistence and indexing reliability.
- Approve a commercially permitted provider/model and complete representative
  quality, load, privacy, and security validation.
