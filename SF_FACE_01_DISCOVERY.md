# SF-FACE-01 — Face Search Production Readiness Discovery

## Status

`SF-FACE-01 STATUS: PASS` — discovery/design completed.

This document is an audit and production-readiness design only. No
application code, Prisma schema, migration, model, configuration, or provider
was changed by this task. No model was downloaded. No commit or push was made.

## 1. Current implementation map

### Components inspected

- `src/lib/face-config.ts` — dimensions, model version, threshold, result
  limit, upload limits, detector settings, and model paths.
- `src/lib/face-provider.ts` — deterministic test provider and optional ONNX
  provider.
- `src/lib/face-search.ts` — indexing jobs, selfie validation, vector search,
  and result matching.
- `src/app/api/events/[eventSlug]/face-search/route.ts` — public event-scoped
  search endpoint.
- `src/app/e/[eventSlug]/find/page.tsx` — customer upload/search UI.
- `src/lib/photos.ts` — photo validation, storage, and FaceIndexJob creation.
- `src/lib/storage.ts` and `src/lib/storage-factory.ts` — local/S3 media
  storage and protected-original access.
- `scripts/face-worker.ts` — database-polled background index worker.
- `scripts/enqueue-face-reindex.ts` — reindex job creation.
- `scripts/face-benchmark.ts` — local throughput benchmark.
- `Dockerfile.face-worker` — CPU worker image and ONNX runtime configuration.
- `prisma/schema.prisma` and the two Face Search migrations.
- `models/README.md`, `.env.example`, README Face Search documentation, and
  `src/lib/face.test.ts`.

### Actual provider/model status

There are two implementations:

1. `deterministic`/`fake`, the default provider, intended for tests and local
   validation. It creates deterministic synthetic embeddings and recognizes
   test markers such as `NO_FACE` and `MULTI_FACE`.
2. `onnx`, which loads SCRFD-like detection and ArcFace recognition ONNX
   files through `onnxruntime-node`. The repository documents the `buffalo_l`
   weights as `DEV_VALIDATION_ONLY` because commercial production usage rights
   have not been approved.

The repository documentation is clear about that restriction, but the code
does not currently enforce a production authorization/readiness state. There
is no `FACE_SEARCH_MODE`, provider license gate, or fail-closed production
resolver.

## 2. Current data flow

### Photographer photo indexing

```text
photographer uploads photo
  → MIME/size/dimension/corruption validation
  → protected original + watermarked preview stored
  → Photo row created
  → FaceIndexJob created
  → DB-polling worker claims job
  → protected original read
  → configured provider detects faces
  → provider generates one embedding per detected face
  → PhotoFace vector rows stored with event/album/model metadata
```

The worker retries failed jobs up to three attempts. It has no explicit stale
`PROCESSING` recovery or timeout mechanism. A photo with no detected faces is
completed with no `PhotoFace` rows. The current `PhotoFace` uniqueness rule is
`(photoId, modelVersion)`, so multiple detected faces in one photo cannot be
persisted safely: the insertion loop can conflict on a multi-face photo.

### Customer query

```text
published event slug
  → multipart selfie upload
  → MIME/size validation
  → provider detects faces
  → exactly one face required
  → query embedding generated in memory
  → pgvector cosine search filtered by eventId/modelVersion/published state
  → threshold and top-k applied
  → best score per photo selected
  → preview URLs and scores returned
```

The current endpoint does not persist the selfie or query embedding. It does
not return embeddings. The customer can use ordinary gallery browsing without
Face Search.

## 3. Storage and data classification

| Data | Current location | Current retention/deletion | Ownership/scope | Current protection/risk |
|---|---|---|---|---|
| Source photographer photo | Local storage or S3 original plus preview; `Photo` metadata in Prisma | Persistent until photo deletion; DB cascades derivatives, while event/album storage cleanup is not fully shown | Photographer → event → album → photo | Originals are protected by server storage APIs; encryption at rest and backup retention are deployment-dependent and unverified |
| Customer query selfie | Request `Buffer` only in the Face Search path; no Prisma/object-storage record | Not intentionally persisted; request/proxy/memory retention is not explicitly governed | Customer request, scoped to event route | Not returned or stored by application code, but no explicit proxy/log/temp-file deletion SLA |
| Detected face crops/aligned images | In-memory `alignedImage` buffer in provider path only | Request/job lifetime | Derived from source photo | Not persisted by current implementation |
| Biometric embeddings | `PhotoFace.embedding` as `vector(512)` in PostgreSQL | Persistent with photo; Photo cascade deletes `PhotoFace`; event/account deletion cleanup should be verified | Event and album fields; photographer inferred through relations | Never sent to normal clients; no application-level encryption, retention policy, or backup deletion policy established |
| Similarity scores/results | Computed per request; score returned with result | Request/client response lifetime; no persistence found | Event query | Score is exposed to the customer, embeddings are not |
| Face metadata/logs | `detectionConfidence`, bounding box, model version, timestamps, job/error logs | Normal DB/log retention; no biometric-specific policy | Photo/event/model | Worker logs job IDs, provider/model, counts and errors; logging rules should explicitly prohibit image bytes, vectors, and raw query data |

Embeddings must be treated as sensitive biometric derivatives even when the
source image is absent. Backup retention, database encryption, object-storage
encryption, and operator access controls remain deployment-level decisions and
are not proven by this repository.

## 4. Current security, privacy, and isolation audit

### Event and photographer isolation

The current public route resolves a published event by slug. The SQL search
filters `PhotoFace.eventId` to that event, requires the matching event/album/
photo to be published, and the final photo query repeats the event check. The
effective current search scope is therefore:

`FACE_SEARCH_SCOPE = EVENT_ONLY` (implemented by query behavior, not an
explicit configuration/readiness invariant).

The route cannot request a photographer-wide or global search. Photographer
isolation is indirect through Event → Photographer and the event-scoped
joins. `PhotoFace` stores `eventId` and `albumId` but not `photographerId`, and
those denormalized fields are not all relational foreign keys. A future design
should pass and enforce both event and photographer scope as defense in depth.

### Existing controls

- Published event, album, and photo filters are applied before results return.
- Original files are accessed through protected server storage APIs.
- Search returns preview URLs, not original storage URLs or embeddings.
- Selfie MIME types are limited to JPEG, PNG, and WebP.
- Selfie size defaults to 5 MiB; photographer photo size defaults to 10 MiB.
- Sharp/ONNX processing is used by the real image path for image validation and
  inference.
- Face Search is optional; the event gallery remains browsable without it.
- The UI identifies the feature as a development validation feature.

### Current gaps/risks

- No explicit consent record or affirmative consent checkbox; the UI provides
  notice but not a final privacy/consent workflow.
- No rate limiting, per-event quota, abuse detection, or brute-force controls
  on the public search endpoint.
- No explicit production fail-closed check. `FACE_PROVIDER=onnx` can load the
  documented `buffalo_l` paths if model files are supplied.
- No provider/model metadata beyond a model-version string; dimension, metric,
  embedding format, provider identity, and threshold configuration are not
  persisted per derivative.
- No explicit raw-query deletion guarantee beyond the fact that the current
  application path does not save the query.
- Operational errors are returned through `error.message`; production error
  responses should avoid exposing internal details.
- Image content sniffing, decompression/image-bomb limits, inference timeouts,
  and resource quotas need hardening for an untrusted public endpoint.
- No application-level encryption or biometric-specific database/storage
  access policy is established.
- Event/album deletion cascades database face rows, but storage cleanup for
  all source files is not demonstrated. Backup copies can retain derivatives
  unless a separate backup policy exists.
- No vector ANN index was found; search is an exact pgvector scan with
  event/model filters, so latency must be measured at realistic event sizes.

## 5. Buffalo_l production blocker

`models/README.md` identifies the InsightFace `buffalo_l` package and its
pretrained weights as `DEV_VALIDATION_ONLY`. The repository records that the
weights are not approved for StrideFrame commercial production without a
separate commercial model license. This is a documented product/legal review
blocker; this discovery does not make an independent licensing determination.

The ONNX implementation loads files from configured paths and does not
auto-download them at runtime. The worker Dockerfile defaults to
`FACE_PROVIDER=onnx`, while model files are expected to be mounted or supplied
separately. That default is operationally useful for validation but is not a
production authorization control. Production must not be able to silently use
`buffalo_l` merely because its files exist.

## 6. Proposed provider-neutral architecture

Implement a small provider registry/resolver in a later slice. Domain code
should depend on a provider boundary, not ONNX, buffalo_l, InsightFace, a
specific ONNX filename, or a fixed embedding dimension.

Conceptually:

```ts
type FaceProviderMetadata = {
  providerId: string;
  modelId: string;
  modelVersion: string;
  embeddingFormatVersion: string;
  embeddingDimension: number;
  similarityMetric: "COSINE";
  thresholdConfigVersion: string;
};

interface FaceSearchProvider {
  metadata: FaceProviderMetadata;
  readiness(): Promise<{
    state: "FACE_SEARCH_DISABLED" | "DEV_VALIDATION_ONLY" | "PRODUCTION_READY";
    reason?: string;
  }>;
  detectFaces(input: { bytes: Buffer; contentType: string }): Promise<DetectedFace[]>;
  createEmbedding(input: DetectedFace): Promise<number[]>;
  searchSimilar(input: {
    eventId: string;
    photographerId: string;
    embedding: number[];
    topK: number;
    threshold: number;
  }): Promise<FaceMatch[]>;
}
```

The exact names can follow repository conventions. The important boundaries
are provider metadata, readiness, detection, embedding, and scoped search.
Commercially licensed self-hosted models and an external provider can then be
adapters behind the same boundary. No provider should be recommended for
commercial deployment until model/weight or vendor usage rights, processing
terms, and operational controls are approved.

## 7. Model/version compatibility strategy

Every persisted derivative should carry, directly or through an immutable
index namespace:

- provider ID
- model ID and model/package version
- embedding format version
- embedding dimension
- similarity metric
- threshold configuration version
- event, photographer, album, and photo ownership scope

Search must require exact compatibility. Incompatible dimensions, formats,
metrics, or model spaces must fail closed or return no matches; they must never
be mixed silently.

A model/provider change should create a new versioned index namespace, run a
controlled reindex of photographer photos, validate quality and latency, and
cut over only after the new index is complete. Old vectors should be retained
only for a defined migration/rollback period and then deleted according to
retention policy. Future migrations must not use the current pre-production
pattern of deleting all vectors merely to change dimension.

## 8. Event/tenant isolation design

Make `FACE_SEARCH_SCOPE=EVENT_ONLY` an explicit production invariant.

For every query:

1. Resolve the published event slug to both `eventId` and its
   `photographerId`.
2. Pass both values to the provider/search repository.
3. Require candidate derivatives to match both scopes and the exact model
   compatibility metadata.
4. Re-check photo → album → event → photographer ownership before returning a
   result.
5. Never expose a photographer-wide or global search API in the MVP.

Photo/event/account deletion must remove all derived face records and queued
jobs transactionally where possible, followed by storage cleanup. Consistency
checks should detect orphaned or mismatched derivatives.

## 9. Customer query-image lifecycle

The proposed privacy-minimizing lifecycle is:

```text
customer explicitly chooses Face Search
  → clear notice and affirmative consent
  → validated query image accepted
  → one-face detection and ephemeral embedding
  → event-scoped search
  → previews/results returned
  → raw query bytes released immediately
  → query embedding released after search
```

Query embeddings should not be persisted for synchronous MVP search. If an
external provider or asynchronous workflow makes persistence unavoidable,
use a short TTL, encryption, a query identifier rather than customer identity,
and a deterministic cleanup job. Provider contracts must address deletion,
retention, training use, region, and subprocessors before use.

Ordinary gallery browsing and purchasing must remain available without Face
Search. Face Search should never be required to buy a photo.

## 10. Photographer photo embeddings and deletion

Persistent photo embeddings are reasonable for efficient event search, but
they must be scoped to the photographer, event, album, photo, provider, and
model/version. Face crops should remain transient unless a documented provider
requirement makes persistence necessary.

Deletion semantics should be deterministic:

- Photo deletion removes its face derivatives and pending/failed jobs.
- Event/album deletion removes all descendant derivatives and storage objects.
- Photographer account deletion removes or legally retains derivatives only
  under an explicitly documented retention/legal-hold policy.
- Reindex/version cleanup removes obsolete vectors after cutover.
- Backup copies are handled by a separate documented backup-expiry process;
  database deletion alone does not prove backup deletion.

## 11. Consent and opt-out UX requirements

Before submission, the customer UI should state, in product-approved language:

- Face Search is optional and ordinary gallery browsing is available.
- The image is used only to search the selected event.
- The purpose is photo matching, not identifying the customer by name.
- What is retained and when raw query data/ephemeral embeddings are deleted.
- The customer must affirmatively choose to submit the image.
- How to stop using Face Search and how to request deletion where applicable.

This is a product/privacy requirement, not final legal text. Photographer
configuration should also make the feature's availability explicit; disabling
Face Search must not break the gallery, checkout, or secure downloads.

## 12. Security requirements for SF-FACE-02

- Validate declared and detected image type, decoded dimensions, pixel count,
  compressed size, and processing time; reject malformed or decompression-bomb
  inputs.
- Enforce event-scoped authorization and published-state checks on every query.
- Add per-IP/session/event rate limits, attempt quotas, request timeouts, and
  abuse monitoring without logging raw images or embeddings.
- Never return embeddings, face crops, raw originals, storage credentials, or
  provider tokens to customers.
- Keep originals behind protected storage and return only authorized previews.
- Use generic customer-facing errors; keep detailed errors server-side with
  redaction.
- Define database, object-storage, backup, and operator access controls for
  biometric derivatives.
- Ensure temporary buffers/files are deleted promptly and do not enter logs,
  analytics, or crash reports.
- Verify photo/event/account deletion and orphan cleanup in integration tests.
- Fail closed if a configured provider is not production-authorized or if
  metadata compatibility is missing.

## 13. Search-quality validation plan

Current behavior is development-only:

- metric: cosine similarity via pgvector `<=>`, score `1 - distance`;
- default threshold: `0.92`;
- default result limit: `50`;
- customer selfie: exactly one face required;
- photographer photo: zero faces yields no result; multiple faces are
  detected, but the current uniqueness constraint cannot safely persist more
  than one face per photo/model;
- results are deduplicated by photo using the best score;
- false-positive and false-negative rates are not measured.

Do not promote `0.92` to a production threshold. Use a representative,
consented sports-event validation set with varied lighting, pose, distance,
occlusion, race/event conditions, and non-matches. Measure precision/recall,
false accepts, false rejects, top-k behavior, multi-face policy, and latency.
Approve a threshold and model version only with documented quality evidence.

## 14. Infrastructure assessment

The current self-hosted path is CPU-oriented: Node + ONNX Runtime + Sharp,
PostgreSQL/pgvector, and a database-polling worker. No GPU deployment path or
vector ANN index was found. The worker defaults to batch size 1 and a short
poll interval; a stuck `PROCESSING` job has no demonstrated recovery path.

Self-hosting can remain an MVP option if an authorized provider passes
representative benchmarks and the operational controls above are added. Test
at least 1k, 10k, and 100k-photo event scales (or actual expected sizes),
including cold-start model load, photo indexing throughput, memory, query
p50/p95/p99, and concurrent requests. Exact scans may become unsuitable as
event face counts grow; an ANN index or external vector service may be needed.

An external provider can reduce model operations but introduces image/biometric
data transfer, vendor retention, region, cost, outage, and contract risks. No
infrastructure was provisioned by this discovery.

## 15. SF-FACE-02 implementation plan

Recommended slices:

1. **SF-FACE-02.1 — Provider registry and fail-closed readiness**
   Add explicit `FACE_SEARCH_DISABLED`, `DEV_VALIDATION_ONLY`, and
   `PRODUCTION_READY` states. Prevent production fallback to deterministic or
   buffalo_l providers.
2. **SF-FACE-02.2 — Versioned provider metadata and reindex strategy**
   Introduce compatibility metadata and safe versioned reindex/cutover
   behavior; resolve the multi-face persistence model.
3. **SF-FACE-02.3 — Event/tenant isolation and deletion consistency**
   Add explicit photographer scope, relational/consistency checks, and
   verified derivative/storage cleanup.
4. **SF-FACE-02.4 — Query privacy and abuse controls**
   Add affirmative consent boundary, ephemeral lifecycle guarantees, upload
   hardening, rate limiting, timeouts, and generic errors.
5. **SF-FACE-02.5 — Indexing reliability and performance**
   Add stale-job recovery, operational metrics, representative benchmarks,
   and an ANN decision based on evidence.
6. **SF-FACE-02.6 — Provider/model approval and adapter**
   Select a commercially permitted self-hosted model or external provider
   only after rights/data-processing review; implement only its adapter.
7. **SF-FACE-02.7 — Production acceptance QA**
   Run isolation, deletion, compatibility, quality, load, security, and
   gallery/checkout independence tests.

## 16. Production acceptance criteria

Production Face Search is not ready until all of the following are true:

- Provider and model/weight commercial usage rights are documented and
  approved by the appropriate project owners.
- Production readiness is explicit and unauthorized providers fail closed.
- Event-only scope is enforced and tested for event and photographer
  isolation.
- Provider/model/format/dimension/metric compatibility is enforced.
- Reindex and cutover are complete before a provider/model change is used.
- Raw query bytes are not retained beyond the request/provider contract, and
  query embeddings are ephemeral by default.
- Optional-use notice, affirmative consent, alternative browsing, and
  retention/deletion behavior are implemented.
- Upload limits, decompression protection, rate limits, timeouts, and generic
  errors are in place.
- Embeddings and protected media are not exposed to normal clients or logs.
- Photo/event/account deletion removes searchable derivatives, with backup
  retention explicitly documented.
- Threshold/top-k and multi-face behavior are calibrated on representative
  sports data with quality evidence.
- Provider E2E, load, monitoring, incident, and privacy/security reviews pass.
- Gallery, checkout, payment, and secure download flows continue when Face
  Search is disabled.

## 17. Explicit unresolved decisions

- Which commercially permitted model/weights or external provider will be
  approved; this includes technical, commercial, privacy, and regional review.
- Self-hosted versus external provider and the required data-processing terms.
- Final threshold, top-k, and multi-face photographer-photo policy.
- Query consent wording, retention SLA, and whether any async workflow needs
  short-lived query persistence.
- Database/object-storage encryption, operator access, backup expiry, and
  legal-hold behavior.
- Rate limits, abuse response, and customer support/opt-out procedures.
- Expected event sizes, latency SLOs, CPU/GPU budget, and ANN/index choice.
- Exact provider metadata schema, migration/reindex/cutover procedure, and
  whether `photographerId` is added directly to derivatives.
- External provider region, retention, training-use restrictions, and
  subprocessors.

## Repository evidence and current status

Current implementation is event-scoped and testable, but not production-safe
for commercial biometric search. The principal blocker is the absence of an
approved production provider/model plus a code-enforced readiness gate.

No application/schema/configuration changes were made. No model was
downloaded. No Stripe, database migration, or external provider call was
performed.
