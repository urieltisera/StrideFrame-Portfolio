# SF-FACE-02.7 — Commercial Provider & Quality Calibration Discovery

## Executive conclusion

**SF-FACE-02.7 DISCOVERY STATUS: PASS_WITH_EXTERNAL_RESEARCH_REQUIRED**

The repository has a suitable provider boundary and a pilot-ready search
architecture. It does not yet have evidence that any face-recognition model
is authorized for StrideFrame commercial production, and no production-quality
result has been measured on representative sports photography.

Primary classification: **B — NEEDS EXTERNAL COMMERCIAL/LICENSING RESEARCH**.

### Commercial provider due-diligence update

The current conditional decision is:

```text
COMMERCIAL_PROVIDER_DECISION=CONDITIONAL_GO_PENDING_COMMERCIAL_TERMS
COMMERCIAL_PROVIDER_PRIMARY=INSIGHTFACE_COMMERCIAL
COMMERCIAL_PROVIDER_FALLBACK=AWS_REKOGNITION
COMMERCIAL_PROVIDER_SECONDARY=DEEPFACE_DEV
COMMERCIAL_VENDOR_RESPONSE=PENDING
```

InsightFace Commercial is the preferred primary candidate because a properly
licensed self-hosted deployment appears capable of preserving the existing
embedding → compatibilityKey → PostgreSQL/pgvector architecture. This is a
candidate decision only. No commercial InsightFace license has been obtained,
no production authorization has been granted, and the existing `buffalo_l`
development weights must not be treated as the candidate production license.

AWS Rekognition remains a serious fallback, not a rejected option. Its
managed face-search collections do not expose the raw embedding vector needed
by the current pgvector path, so selecting AWS would require an additional
managed-search backend boundary and provider-specific lifecycle/reindex
behavior. `deepface.dev` remains a secondary alternative because an API that
returns embeddings could fit the current search architecture more naturally,
but its commercial, privacy, pricing, SLA, and operational terms are not yet
verified.

The current deterministic and ONNX paths remain development-only. Production
Face Search must remain unavailable until commercial rights, provider
integration, privacy terms, quality, threshold, performance, and pilot gates
are independently evidenced.

Status terms used below:

- **VERIFIED_FROM_REPOSITORY** — directly confirmed from source, schema,
  configuration, tests, or committed documentation.
- **DESIGN_REQUIREMENT** — required target behavior, not evidence that it is
  already implemented or approved.
- **EXTERNAL_VALIDATION_REQUIRED** — needs provider, operational, or dataset
  evidence outside this repository.
- **LEGAL_REVIEW_REQUIRED** — requires a documented commercial/privacy/legal
  determination.
- **NOT_YET_VALIDATED** — no qualifying evidence exists yet.

## 1. Current provider architecture

### VERIFIED_FROM_REPOSITORY

The current flow is:

```text
Photo upload
  → FaceIndexJob
  → face worker claims with PostgreSQL row locking
  → configured FaceRecognitionProvider detects faces
  → embeddings are generated and validated
  → PhotoFace vector rows store event/provider/model metadata

Customer query image
  → consent, rate and image validation
  → configured provider detects exactly one face
  → ephemeral query embedding
  → event + compatibilityKey PostgreSQL/pgvector search
  → grouped photo results, ranked and limited to 50
  → effective retail price resolver
```

The principal files are:

| Concern | Repository implementation |
|---|---|
| Provider contract | `src/lib/face-provider.ts`, `FaceRecognitionProvider` |
| Provider metadata | provider/model/version, format, dimension, cosine metric, readiness class |
| Provider selection | `FACE_PROVIDER`, server-side `faceProvider()` |
| Compatibility identity | `faceCompatibilityKey(metadata)` |
| Indexing | `processFaceIndexJob()` in `src/lib/face-search.ts` |
| Background execution | `scripts/face-worker.ts`, `FaceIndexJob`, `SKIP LOCKED` claiming |
| Query route | `src/app/api/events/[eventSlug]/face-search/route.ts` |
| Vector search | PostgreSQL `vector(512)` and pgvector cosine distance in `searchEventFaces()` |
| Persistent metadata | `PhotoFace` columns and `(eventId, compatibilityKey)` index |
| Threshold | `FACE_MATCH_THRESHOLD`, default `0.92` |
| Result limit | `FACE_MATCH_LIMIT`, default `50` |

The query is server-controlled. Customers cannot choose provider, model,
threshold, compatibility key, dimension, or metric. Candidate rows are
restricted to the trusted published event and exact compatibility space.

### Current providers

1. **Deterministic provider** — synthetic, test/development provider. It
   produces normalized 512-dimensional vectors and is explicitly
   `DEV_VALIDATION_ONLY`.
2. **ONNX provider** — loads configured detector and recognizer ONNX files
   through `onnxruntime-node`; it is also explicitly
   `DEV_VALIDATION_ONLY`. It does not download models at runtime and fails
   when configured artifacts are missing.

The configured model contract is SCRFD-like detection followed by aligned
112×112 face input and a normalized 512-dimensional embedding. The repository
documentation identifies the validation artifacts as InsightFace `buffalo_l`
(`det_10g.onnx` and `w600k_r50.onnx`).

The following invariants remain in force:

```text
BUFFALO_L=DEV_VALIDATION_ONLY
PRODUCTION_DEV_PROVIDER_FALLBACK=FORBIDDEN
PRODUCTION_FACE_SEARCH_READY=false
FACE_SEARCH_OPTIONAL=true
FACE_SEARCH_SCOPE=EVENT_ONLY
```

In production, a provider whose readiness class is not
`PRODUCTION_READY` makes Face Search unavailable; the gallery and commerce
flows remain available. Unknown or missing providers fail closed. No
development provider fallback is permitted.

## 2. Licensing boundary

### VERIFIED_FROM_REPOSITORY

The application package declares an ISC project license. `onnxruntime-node`
and other dependency license metadata are present in the lockfile, but that
does not establish rights to any face model weights or to commercial
biometric use of an assembled model.

`models/README.md` states that the InsightFace source code is MIT while the
provided pretrained `buffalo_l` weights are **not approved for StrideFrame
commercial production without a separate commercial model license**. The
weights are therefore not production-authorized by repository evidence.

The repository contains no production license agreement, vendor terms,
commercial grant, data-processing agreement, regional processing commitment,
or model-weight entitlement that would change that conclusion.

### Code versus weights

| Item | Finding | Classification |
|---|---|---|
| StrideFrame application code | Project metadata says ISC | VERIFIED_FROM_REPOSITORY; does not authorize model use |
| ONNX Runtime package | Dependency metadata is present; package rights are separate from model rights | NOT_VERIFIED for the full production use case |
| InsightFace source references | Repository documentation describes source as MIT | Code license only; not a weight authorization |
| `buffalo_l` detector/recognizer weights | Repository explicitly marks production use as requiring separate licensing | D — DEVELOPMENT/NON-COMMERCIAL ONLY |
| Deterministic provider | Synthetic test implementation | E — TEST-ONLY |
| Any alternative provider/model | No agreement or weights are present in the repository | C — UNCLEAR / LEGAL_REVIEW_REQUIRED |

No provider/model is currently classified A — clearly commercially
authorized. The preferred candidate is conditional and commercial
authorization remains **NOT_VERIFIED** pending vendor response and legal
review.

### SF-FACE-COMMERCIAL-GATE

InsightFace can proceed to a non-production adapter spike only after confirming
all of the following for the exact selected model/package:

- commercial production license;
- SaaS and multi-tenant usage rights;
- self-hosted deployment rights;
- CPU deployment rights if CPU is used for the pilot;
- server/instance limitations;
- geographic restrictions;
- pricing and startup/pilot terms;
- scaling, upgrade, and support terms;
- permission to generate and use embeddings inside StrideFrame's own
  event-scoped search infrastructure.

Current gate state:

```text
SF-FACE-COMMERCIAL-GATE=AWAITING_VENDOR_RESPONSE
```

Naming InsightFace as the primary candidate does not authorize production
use. If terms are unacceptable, AWS Rekognition becomes the fallback path and
requires architecture discovery before implementation.

## 3. Provider-class comparison

These are architecture evaluations, not vendor recommendations.

| Dimension | External commercial API | Self-hosted commercial CPU | Self-hosted commercial GPU |
|---|---|---|---|
| Commercial clarity | UNKNOWN until contract/terms reviewed | UNKNOWN until model license reviewed | UNKNOWN until model/license reviewed |
| Integration effort | MEDIUM | MEDIUM | MEDIUM/HIGH |
| Operational complexity | MEDIUM | MEDIUM | HIGH |
| Privacy | MEDIUM; query/photo data may leave StrideFrame | GOOD if infrastructure is controlled | GOOD if infrastructure is controlled |
| Query image leaves StrideFrame | Usually yes; provider contract must prohibit unwanted retention/training | No | No |
| Stored photographer embeddings leave StrideFrame | Provider-dependent; avoid unless explicitly required | No | No |
| Latency | UNKNOWN; network-dependent | UNKNOWN; CPU-dependent | UNKNOWN; hardware-dependent |
| Cost model | Variable provider usage cost; no price assumed | Infrastructure plus license cost | Infrastructure, GPU, license, and operations |
| Scaling | Provider-managed capacity, quota and outage dependency | Add workers/instances when measured | GPU scheduling and capacity planning |
| Compatibility migration | New adapter and compatibility space | New adapter/reindex space | New adapter/reindex space |
| Observability | Provider latency, status, quota, region, failures | CPU latency, memory, model health | GPU utilization, memory, queueing, model health |
| Deletion/lifecycle | Contractual deletion and retention must be verified | Application/storage lifecycle remains under control | Application/storage lifecycle remains under control |
| Vendor lock-in | HIGHER | LOWER/MEDIUM | LOWER/MEDIUM, hardware dependency |
| Outage behavior | Disable Face Search, never dev-fallback | Disable or shed load, never dev-fallback | Disable or shed load, never dev-fallback |
| Pilot suitability | MEDIUM/UNKNOWN | GOOD/UNKNOWN | MEDIUM/UNKNOWN |

### External API requirements

An external provider is acceptable only if the contract and technical
integration establish, at minimum:

- permitted biometric processing purpose and geography;
- no provider training or secondary use unless explicitly approved;
- retention and deletion behavior for query images, intermediate data, and
  provider-side embeddings;
- subprocessors, incident handling, access controls, and audit evidence;
- encryption, transport, authentication, rate/quota behavior, and outage
  semantics;
- whether photographer embeddings are sent outside StrideFrame at all;
- a provider-specific stable metadata/version identity and reindex plan.

These are **LEGAL_REVIEW_REQUIRED** and **EXTERNAL_VALIDATION_REQUIRED**.

## 4. FaceProvider contract assessment

### VERIFIED_FROM_REPOSITORY

The current interface exposes:

- provider metadata;
- readiness class;
- face detection;
- embedding generation.

Metadata already contains the required embedding-space identity:

```text
providerId
modelId
modelVersion
embeddingFormatVersion
embeddingDimension
similarityMetric
readinessClass
```

The current contract is sufficient as a minimal adapter boundary for a
commercial provider. Domain code does not need to depend on ONNX paths,
InsightFace names, or model files.

### Concrete gaps to validate before implementation

No migration is proposed in this discovery task. A future adapter may need
provider-specific operational methods or an explicit result/error taxonomy
if the provider needs them, such as:

- readiness/health without loading a model during an ordinary customer
  request;
- bounded cancellation/timeout semantics for network or inference calls;
- provider request correlation without logging biometric data;
- explicit provider-side deletion confirmation if data leaves StrideFrame.

These are design considerations, not evidence of a blocking domain-contract
gap. The smallest next implementation should first prove that a candidate
provider can fit the existing metadata and detection/embedding methods.

### Conditional provider consequences

InsightFace Commercial is expected to fit the existing contract if its
licensed model produces the current required metadata and embedding behavior:

```text
licensed self-hosted model
  → FaceRecognitionProvider
  → existing compatibility metadata
  → PostgreSQL/pgvector event search
```

This preserves the current search path, avoids a second managed vector system,
keeps processing inside controlled StrideFrame infrastructure, and leaves CPU
pilot deployment and future GPU scaling as operational choices.

AWS Rekognition is architecturally different. Its managed face-search
collections use provider-managed vectors/collections rather than exposing the
raw vector required by `PhotoFace`/pgvector. If selected, the target design
would need a provider-neutral backend boundary conceptually similar to:

```text
FaceSearchBackend
  ├─ EmbeddingBackedSearch
  │    └─ FaceRecognitionProvider → PostgreSQL/pgvector
  └─ ManagedFaceSearch
       └─ AWS Rekognition Collections
```

This is a design consequence only; it is not implemented here. It introduces
more provider lock-in and requires provider-specific enrollment, search,
deletion, reindex, outage, and lifecycle handling.

`deepface.dev` remains below both candidates until commercial rights,
provider/model licensing, pricing, privacy/data handling, SLA, operational
maturity, and long-term suitability are verified. No integration is proposed.

## 5. Compatibility and provider migration

### VERIFIED_FROM_REPOSITORY

`faceCompatibilityKey()` incorporates provider, model, model version,
embedding format, dimension, and similarity metric. Search requires the
active provider compatibility key before pgvector comparison. Persisted
`PhotoFace` rows retain their own metadata rather than inferring it from the
current runtime provider.

Indexing replaces the current compatibility-space rows transactionally and
removes stale incompatible rows for the photo. Reindexing is idempotent by
`(photoId, compatibilityKey, faceIndex)`. Photo/event deletion cascades the
derivatives through the current relational lifecycle.

### DESIGN_REQUIREMENT

Provider migration must follow this sequence:

```text
OLD_PROVIDER rows remain an explicit old compatibility space
  → NEW_PROVIDER is configured and validated
  → event/photo reindex creates NEW_PROVIDER rows
  → search uses only the authorized active compatibility space
  → old rows are removed only after successful replacement and policy review
```

Different spaces must never be compared numerically. A failed or partial
reindex must not silently activate an incomplete space. Future work should
make active-space selection and reindex completeness observable if a provider
migration is required at scale.

## 6. Sports-photo validation dataset

### DESIGN_REQUIREMENT

Before production selection, build an authorized, consented or licensed
ground-truth dataset with an immutable manifest. It must contain identities
and event boundaries without using live customer data in development.

Each query should have known positive photos and known hard negatives in the
same event. The manifest should record source event, photo ID, query ID,
identity label, face count, image conditions, and whether a result is
expected. Raw images and biometric derivatives require separate controlled
access and retention rules.

Required categories:

- frontal, 3/4 angle, profile, looking down, and looking away;
- sunglasses, cap/helmet, partial occlusion, and multiple athletes;
- motion blur, low light, harsh sunlight, and shadows;
- small and large faces, crowded start/finish lines, and similar-looking
  people;
- the same athlete across multiple moments, distances, and focal lengths;
- portrait/landscape orientation, compression/resizing, and watermark
  presence/absence where relevant;
- no-face queries, multiple-face queries, and event-scoped hard negatives.

The test split must prevent leakage between tuning and final evaluation.
Ground truth must distinguish “athlete appears in this photo” from “the
photo contains another similar-looking person.”

## 7. Quality metrics

### DESIGN_REQUIREMENT

For every candidate threshold, report a confusion matrix:

```text
TP — correct athlete/photo match
FP — unrelated athlete/photo returned
TN — unrelated candidate correctly excluded
FN — valid athlete/photo omitted
```

Report:

- precision, recall, false-positive rate, false-negative rate;
- top-1, top-5, and top-10 hit rate;
- no-match correctness;
- multiple-face photo retrieval correctness;
- event isolation correctness;
- per-condition results, not only aggregate averages;
- query-level and photo-level metrics, with the deduplicated photo result
  contract used by StrideFrame.

False positives require special scrutiny: returning another athlete’s photo
is more harmful than merely missing a legitimate result. Generic vendor
accuracy claims are not substitutes for this dataset.

## 8. Threshold calibration

### VERIFIED_FROM_REPOSITORY

The current threshold is cosine similarity `0.92`, configured through
`FACE_MATCH_THRESHOLD`. It remains:

```text
FACE_SEARCH_THRESHOLD_0_92=DEV_ONLY_NOT_PRODUCTION_APPROVED
```

### DESIGN_REQUIREMENT

Evaluate a candidate threshold grid on a calibration split and lock the
chosen threshold only after a separate evaluation split passes. For each
threshold calculate the metrics above, including hard-negative false
positives, no-match correctness, and per-condition recall.

The procedure must also verify that provider score semantics match the
stored `COSINE` metric and that normalization is consistent between
indexing and query inference. Do not select a production threshold in this
task.

## 9. Privacy and security requirements

### VERIFIED_FROM_REPOSITORY

The current boundaries preserve:

```text
FACE_SEARCH_OPTIONAL=true
FACE_SEARCH_CONSENT_REQUIRED=true
FACE_SEARCH_SCOPE=EVENT_ONLY
CUSTOMER_QUERY_IMAGE_RETENTION=EPHEMERAL
CUSTOMER_QUERY_EMBEDDING_RETENTION=EPHEMERAL
CUSTOMER_BIOMETRIC_PROFILE_CREATED=false
BIOMETRIC_OUTPUT_PUBLIC=false
ACTIVE_BIOMETRIC_DELETION=IMPLEMENTED
```

Rate limiting, bounded concurrency, timeout, image validation, safe errors,
server-controlled parameters, compatibility filtering, and provider
fail-closed behavior remain required.

### EXTERNAL_VALIDATION_REQUIRED / LEGAL_REVIEW_REQUIRED

For an external provider, verify contractually and technically:

- retention duration and deletion API/attestation;
- no training, profiling, or secondary use without explicit authorization;
- processing region and subprocessors;
- encryption and access logging;
- whether queries or persistent photographer embeddings leave StrideFrame;
- incident response and breach notification;
- data ownership, portability, and termination deletion;
- compatibility with the event-only scope and customer consent notice.

An outage or provider rejection must produce a safe unavailable state. It
must never select deterministic or buffalo_l as a fallback. Gallery, cart,
checkout, payment, and download flows must remain operational.

## 10. Inference and indexing performance plan

### DESIGN_REQUIREMENT

Inference must be measured separately from the already validated pgvector
search path.

For customer queries capture:

1. request/image preprocessing;
2. face detection;
3. embedding generation;
4. provider network latency, if external;
5. total provider inference latency;
6. pgvector search latency;
7. total end-to-end latency;
8. timeout/error rate and memory/CPU or GPU usage.

For indexing capture:

- photos/minute and faces/minute;
- batch size and peak memory;
- detection/embedding latency separately;
- failure and retry rates;
- queue depth and age;
- time to index representative event sizes;
- partial-reindex and provider-outage behavior.

Do not mix provider inference results with the SF-FACE-02.6 synthetic search
measurements. Use the same event-scope, compatibility, deduplication, and
privacy checks in the end-to-end test harness.

## 11. Production acceptance gates

`PRODUCTION_FACE_SEARCH_READY=true` requires all gates below to have named
evidence. No gate is currently marked PASS.

1. **Commercial rights** — provider/model and weight authorization documented.
2. **Technical integration** — adapter works through `FaceProvider` without
   provider leakage into domain code.
3. **Compatibility** — stable metadata/key, dimensional validation, and
   migration/reindex behavior proven.
4. **Privacy** — retention, training use, region, subprocessors, deletion,
   and consent handling accepted.
5. **Quality** — sports-photo ground-truth dataset evaluated.
6. **Threshold** — production threshold selected from measured evidence.
7. **Performance** — inference and end-to-end latency/error budgets accepted.
8. **Failure mode** — provider outage disables Face Search safely with no
   development fallback.
9. **Lifecycle** — reindex, deletion, rollback, and old-space cleanup tested.
10. **Pilot** — authorized photographer acceptance test completed.

## 12. Decision matrix

| Option | Commercial clarity | Privacy | Integration | Operations | Upfront cost | Variable cost | Latency | Scalability | Vendor dependency | Hardware dependency | Pilot suitability |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `EXTERNAL_COMMERCIAL_API` | UNKNOWN | MEDIUM | MEDIUM | MEDIUM | UNKNOWN | UNKNOWN | UNKNOWN | GOOD/UNKNOWN | POOR | GOOD | MEDIUM/UNKNOWN |
| `SELF_HOSTED_COMMERCIAL_CPU` | UNKNOWN | GOOD | MEDIUM | MEDIUM | UNKNOWN | GOOD/UNKNOWN | UNKNOWN | MEDIUM | GOOD | GOOD | GOOD/UNKNOWN |
| `SELF_HOSTED_COMMERCIAL_GPU` | UNKNOWN | GOOD | MEDIUM/HIGH | HIGH | UNKNOWN | GOOD/UNKNOWN | UNKNOWN | GOOD/UNKNOWN | GOOD | POOR | MEDIUM/UNKNOWN |

No prices, vendor SLAs, or license terms are assumed. “UNKNOWN” means
external commercial or technical evidence is still required.

## 13. Recommended next task

**SF-FACE-02.8 — Commercial Provider Adapter Spike**

Status: **BLOCKED BY `SF-FACE-COMMERCIAL-GATE`**.

After acceptable InsightFace terms are documented, the spike should:

1. integrate the exact licensed candidate through the existing embedding
   provider boundary;
2. validate metadata, compatibilityKey, reindex, deletion, and failure
   behavior;
3. prepare the ground-truth sports-photo evaluation harness using synthetic
   or specifically authorized test imagery;
4. keep production Face Search disabled until all acceptance gates pass.

If InsightFace terms are unsuitable, perform AWS Rekognition fallback
architecture discovery before implementation. `deepface.dev` remains a
secondary candidate. StrideFrame as a whole is not blocked; unrelated work
may continue while the commercial gate is pending.

Do not enable a provider until the acceptance gates are evidenced.

## 14. Unresolved questions

- Which provider/model has a commercially documented grant suitable for the
  intended entity, geography, and use case?
- Will customer query images or photographer embeddings leave StrideFrame?
- What processing region, retention, training-use exclusion, and deletion
  evidence will be contractually available?
- What sports-photo dataset can be legally and operationally authorized?
- What false-positive ceiling is acceptable for the customer experience?
- Does the selected provider require a richer health/cancellation/error
  contract than the current adapter needs?
- What production inference latency and index-throughput budgets are
  acceptable for the first pilot?
- When a provider migration occurs, what operational signal certifies that
  the new compatibility space is complete before old rows are removed?

## 15. Explicit readiness status

```text
SEARCH_ARCHITECTURE=PILOT_READY_AS_IS
FACE_SEARCH_ARCHITECTURE=PILOT_READY_AS_IS
COMMERCIAL_PROVIDER_DECISION=CONDITIONAL
COMMERCIAL_PROVIDER_PRIMARY=INSIGHTFACE_COMMERCIAL
COMMERCIAL_PROVIDER_FALLBACK=AWS_REKOGNITION
COMMERCIAL_PROVIDER_SECONDARY=DEEPFACE_DEV
COMMERCIAL_VENDOR_RESPONSE=PENDING
PRODUCTION_FACE_SEARCH_READY=false
BUFFALO_L=DEV_VALIDATION_ONLY
PRODUCTION_DEV_PROVIDER_FALLBACK=FORBIDDEN
FACE_SEARCH_THRESHOLD_0_92=DEV_ONLY_NOT_PRODUCTION_APPROVED
```

Infrastructure readiness is not provider authorization or recognition-quality
validation. No provider was enabled or authorized, no model was downloaded,
no external biometric API was called, and no real customer biometric data was
used. Commercial terms, sports-photo quality calibration, privacy/legal
review, and production operations remain pending.
