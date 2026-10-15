# SF-FACE-02.4 — Security, Abuse Prevention & Rate Limiting

## Status

PARTIAL — security hardening is implemented and validated locally. Face Search remains development-only because no production-authorized provider exists.

## Security posture

The public Face Search POST route now applies a server-side limiter before multipart parsing, image validation, face detection, embedding generation, or similarity search. The limiter uses a hashed, server-derived network bucket plus the public event slug and endpoint. Raw network identifiers and biometric data are not persisted.

By default proxy headers are not trusted. `FACE_SEARCH_TRUST_PROXY=true` is required only when a deployment has a controlled proxy that sanitizes `x-forwarded-for`/`x-real-ip`; otherwise requests use a conservative shared unknown-network bucket. This assumption must be reviewed for deployment.

Threats covered in this slice:

- repeated selfie/inference requests and brute-force probing;
- event-scoped request flooding and accidental cross-event probing;
- oversized, malformed, and unreasonably large decoded images;
- concurrent inference stampedes and provider timeouts;
- consent bypass attempts and customer-controlled provider parameters;
- provider/path/stack-trace/embedding leakage in public responses.

## Limits and containment

Current configurable development/MVP defaults are:

- `FACE_SEARCH_RATE_LIMIT_MAX=10` requests per `FACE_SEARCH_RATE_LIMIT_WINDOW_MS=60000` per hashed network/event bucket;
- `FACE_SELFIE_MAX_BYTES=5242880` (5 MiB);
- `FACE_SELFIE_MAX_DIMENSION=6000` pixels per axis;
- `FACE_SELFIE_MAX_PIXELS=12000000` decoded pixels;
- `FACE_SEARCH_CONCURRENCY_MAX=2` active provider/search operations;
- `FACE_SEARCH_TIMEOUT_MS=15000`.

The limits are server-side configuration and cannot be changed by the customer. Over-limit requests return HTTP 429 and `Retry-After`. Concurrency saturation and provider timeout return safe temporary-failure responses. There is no unbounded queue. A timed-out native/provider promise remains accounted for until it settles; the current provider boundary does not expose cancellation.

Explicit status:

```text
FACE_SEARCH_RATE_LIMITED=true
RATE_LIMIT_SCOPE=SINGLE_PROCESS
FACE_SEARCH_CONCURRENCY_BOUNDED=true
FACE_SEARCH_CONCURRENCY_SCOPE=SINGLE_PROCESS
BIOMETRIC_OUTPUT_PUBLIC=false
MULTI_INSTANCE_DISTRIBUTED_RATE_LIMIT=PENDING
PRODUCTION_FACE_SEARCH_READY=false
```

The in-memory limiter and semaphore protect one process only. Production multi-instance deployments require an edge/Redis/database-backed limiter and calibrated limits; Redis, queues, vector infrastructure, and GPU workers are intentionally out of scope here.

## Image and consent controls

`validateSelfie` validates MIME/extension, compressed byte size, decoded dimensions/pixel count, and a bounded decode before inference. It does not write a query image to Photo, PhotoFace, object storage, or a customer/session record. Query embeddings remain request-scoped and are not returned.

Face Search consent remains an exact single form value: `faceSearchConsent=accepted`. Missing, duplicate, conflicting, or values such as `true`, `1`, and `yes` are rejected. Consent is still independent from provider readiness; it cannot enable Face Search in production.

The route ignores customer-supplied provider, model, version, threshold, compatibility, dimension, metric, and top-k controls. These remain server-controlled. Event lookup and candidate filtering remain based on the trusted published event and event-only search path.

## Safe errors and observability

Public responses normalize consent-required, invalid/unsupported/malformed image, excessive dimensions, no-face, multi-face, rate-limited, busy, unavailable, and timeout states. They do not expose model paths, provider metadata, stack traces, embeddings, image bytes, or secrets.

The limiter records only process-local counters keyed by a salted hash. No raw IP, selfie, face crop, embedding, multipart body, or biometric template is logged or persisted. Future operational telemetry may record only category-level events such as rate-limit, malformed upload, timeout, or concurrency rejection.

## Regression and QA evidence

- No Prisma schema or migration was required.
- No model was downloaded and no external Face Search provider was called.
- Unit tests: **45 passed, 15 skipped**. Added exact-consent, rate-limit, concurrency, and timeout coverage.
- Typecheck: **PASS**.
- Integration tests, lint, build, and diff check are run as part of the final validation for this slice.

Existing gallery, cart, checkout, payments, downloads, event isolation, provider fail-closed behavior, multi-face persistence, and ephemeral query lifecycle remain unchanged in scope.

## Remaining blockers and next work

- `BUFFALO_L=DEV_VALIDATION_ONLY` remains enforced.
- `FACE_SEARCH_OPTIONAL=true`, `FACE_SEARCH_SCOPE=EVENT_ONLY`, `PRODUCTION_DEV_PROVIDER_FALLBACK=FORBIDDEN`, and `PRODUCTION_FACE_SEARCH_READY=false` remain in force.
- A commercially permitted production provider, production threshold/quality validation, explicit privacy/legal approval, full biometric retention/deletion operations, distributed rate limiting, proxy trust configuration, and deeper image/rate-limit observability remain for later Face Search slices.
- This slice is not a claim of complete production security or biometric compliance.
