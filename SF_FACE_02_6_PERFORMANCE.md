# SF-FACE-02.6 — Performance & Infrastructure Assessment

## Status

PASS — measured search/index architecture is sufficient for a first single-instance pilot. Production provider authorization remains a separate blocker; no production Face Search readiness is claimed.

## Invariants preserved

```text
FACE_SEARCH_OPTIONAL=true
FACE_SEARCH_SCOPE=EVENT_ONLY
FACE_SEARCH_CONSENT_REQUIRED=true
CUSTOMER_QUERY_IMAGE_RETENTION=EPHEMERAL
CUSTOMER_QUERY_EMBEDDING_RETENTION=EPHEMERAL
CUSTOMER_BIOMETRIC_PROFILE_CREATED=false
BIOMETRIC_OUTPUT_PUBLIC=false
BUFFALO_L=DEV_VALIDATION_ONLY
PRODUCTION_DEV_PROVIDER_FALLBACK=FORBIDDEN
PRODUCTION_FACE_SEARCH_READY=false
ACTIVE_BIOMETRIC_DELETION=IMPLEMENTED
PHOTOGRAPHER_ACCOUNT_DELETION=PENDING_PRODUCT_PRIVACY_OPERATIONS
BACKUP_BIOMETRIC_RECONCILIATION=PENDING_PRODUCTION_OPERATIONS
RESTORE_MUST_NOT_SILENTLY_RESURRECT_DELETED_BIOMETRIC_DATA
FACE_SEARCH_RATE_LIMITED=true
RATE_LIMIT_SCOPE=SINGLE_PROCESS
FACE_SEARCH_CONCURRENCY_BOUNDED=true
FACE_SEARCH_CONCURRENCY_SCOPE=SINGLE_PROCESS
MULTI_INSTANCE_DISTRIBUTED_RATE_LIMIT=PENDING
```

## Current request path

```text
validated customer image
→ exact Face Search consent
→ process-local rate limit
→ provider readiness check
→ bounded inference slot
→ provider face detection / query embedding
→ trusted published event lookup
→ PhotoFace event + compatibility filtering
→ PostgreSQL pgvector cosine distance (<=>)
→ SQL grouping by photo and best-face score
→ limit 50
→ photo lookup and effective retail price resolution
→ photo-oriented response
```

The public route performs the expensive provider work inside the existing 2-operation process-local concurrency boundary and 15-second timeout. `searchEventFaces` performs one parameterized SQL query with joins to `Photo`, `Album`, and `Event`; it does not load all event vectors into Node and does not issue an N+1 query. The query returns at most `FACE_MATCH_LIMIT` rows after grouping by `photoId`. Face Search result pricing continues to use `resolveEffectivePhotoPrice`.

The stored embedding dimension is 512 float values. The current persisted representation is PostgreSQL `vector(512)`, with provider/model compatibility filtering before comparison. Provider inference was not benchmarked: the active deterministic provider is `DEV_VALIDATION_ONLY` and was used only to create synthetic query-compatible vectors.

## Benchmark methodology

Harness: `scripts/face-search-benchmark.ts`

- Local Docker PostgreSQL/pgvector QA database only: `localhost:5432/sportpix_test_migrated`.
- Synthetic deterministic 512-dimensional vectors; no model download, external provider, customer image, or production data.
- Each scenario creates a fresh photographer/event/album, inserts synthetic photos and PhotoFace rows, executes the real `searchEventFaces` path, runs `EXPLAIN (ANALYZE, BUFFERS)`, then deletes the event and cascaded rows.
- `searchMs` is end-to-end database search-path time excluding provider inference and image validation.
- `explainMs` is PostgreSQL execution time from the corresponding query plan.
- `heapDeltaMB`/`rssDeltaMB` are process deltas around the search call, not a complete allocator profile.
- The first result at each run can include connection/cache warm-up; values are comparative evidence, not an SLA.

## Measured results

### One face per photo

| Photos | Searchable faces | Search ms | EXPLAIN ms | Node heap delta MB | Estimated vector payload MB |
|---:|---:|---:|---:|---:|---:|
| 100 | 100 | 26.61 | 0.42 | 0.176 | 0.195 |
| 500 | 500 | 3.33 | 3.30 | 0.039 | 0.977 |
| 1,000 | 1,000 | 5.94 | 2.73 | 0.028 | 1.953 |
| 5,000 | 5,000 | 16.05 | 24.99 | 0.030 | 9.766 |
| 10,000 | 10,000 | 56.29 | 73.39 | 0.039 | 19.531 |

### Two faces per photo

| Photos | Searchable faces | Search ms | Status |
|---:|---:|---:|---|
| 100 | 200 | 5.93 | measured |
| 500 | 1,000 | 10.80 | measured |
| 1,000 | 2,000 | 20.11 | measured |
| 5,000 | 10,000 | 101.71 | measured |

The 10,000-photo/two-face run was not retained after the initial long benchmark process ended before emitting its row; it is not represented as an estimate.

### Three faces per photo

| Photos | Searchable faces | Search ms | EXPLAIN ms | Node heap delta MB | Estimated vector payload MB |
|---:|---:|---:|---:|---:|---:|
| 100 | 300 | 28.84 | 0.84 | 0.177 | 0.586 |
| 500 | 1,500 | 6.65 | 3.70 | 0.037 | 2.930 |
| 1,000 | 3,000 | 15.99 | 15.58 | 0.029 | 5.859 |
| 5,000 | 15,000 | 73.96 | 68.12 | 0.047 | 29.297 |
| 10,000 | 30,000 | 175.70 | 146.21 | 0.196 | 58.594 |

`matches` remained photo-oriented and capped at 50 where the synthetic data produced enough candidates. This verifies SQL-side grouping/deduplication behavior rather than returning one result per face.

## Database and complexity findings

Measured/current:

- `PhotoFace` has the composite B-tree index `("eventId", "compatibilityKey")`, which matches the primary candidate filter.
- The query additionally checks publication state through `Photo`, `Album`, and `Event` joins.
- `PhotoFace` has no application-side full-event fetch. The vector distance and ordering execute in PostgreSQL/pgvector.
- Current cost grows with compatible face rows in the event and the 512-dimensional distance operation: approximately O(F × 512) for a scan of F compatible candidates, with SQL grouping/ordering overhead. The current query plan root was `Limit`; local `EXPLAIN` execution remained below 150 ms at 30,000 synthetic faces.
- No N+1 query or global cross-event scan was observed.

Estimated/operational interpretation:

- Small and medium events through approximately 10,000 photos / 30,000 faces are reasonable candidates for a single-instance pilot on the measured local setup.
- This is not a production SLA. Disk, CPU, PostgreSQL configuration, concurrent traffic, provider inference, and image/indexing workload still need pilot telemetry.
- Vector storage is approximately 1.95 MB per 1,000 one-face photos and 5.86 MB per 1,000 three-face photos before PostgreSQL/index/table overhead.

## Concurrency and rate limits

Measured controls remain process-local: two active provider operations, no unbounded queue, and 10 requests/minute per hashed network/event bucket. Database search is not separately queued, but it is bounded indirectly by the inference slot in the public route. Under saturation, additional requests receive the existing safe temporary response rather than accumulating work.

For a single-instance pilot this is adequate as an abuse boundary. Redis/distributed limiting becomes necessary before multiple application instances share public Face Search traffic, or when observed legitimate traffic requires limits consistent across replicas. A queue is not required for the synchronous customer query path at the measured sizes.

## Indexing and workers

Photo indexing already has a durable `FaceIndexJob`, claim/retry behavior, and `scripts/face-worker.ts` using `FOR UPDATE SKIP LOCKED`. This is sufficient as a pilot background boundary. Inline indexing is not required for customer search; a persistent external queue is deferred until measured backlog, retry volume, or deployment topology justifies it.

## pgvector and external vector database decision

pgvector is already present and actively used by the current query; introducing a new vector system is unnecessary. The current event/compatibility B-tree index and database-side vector operation preserve event isolation and avoid Node memory growth.

Do not add a second vector database for the MVP. Qdrant, Pinecone, Weaviate, and Milvus would add synchronization, deletion, compatibility-space, backup, and tenant-isolation obligations without measured need. Reconsider only if production telemetry shows sustained search latency or resource saturation at materially larger events (for example, beyond 30,000 faces per event), or if PostgreSQL maintenance becomes the demonstrated bottleneck.

If a future pgvector optimization is needed, evaluate an HNSW/IVFFlat strategy only after representative production-authorized embeddings and query distributions exist. Compatibility keys and event scope must remain part of the candidate boundary; an approximate index must never allow cross-event or incompatible-space comparisons.

## Provider and inference considerations

Not yet validated:

- production-authorized provider latency and memory;
- CPU/GPU requirements of the eventual commercial model;
- representative sports-event quality/threshold calibration;
- external API latency, data-retention terms, and commercial licensing.

An authorized local CPU provider keeps the current service boundary but may require worker capacity based on measured inference time. A local GPU provider may reduce latency but adds scheduling and deployment complexity. An external API would shift inference capacity and licensing/retention review to the provider while requiring a secure provider adapter. None is selected here, and buffalo_l/ONNX remains development-only.

## Pilot classification and triggers

Classification: **A — PILOT READY AS-IS for the search/index architecture**, conditional on a production-authorized provider and privacy/legal gates. No safe optimization or migration was justified by the measurements.

Reconsider infrastructure when measured pilot telemetry shows one or more of:

- p95 search-path latency materially above the pilot target at representative event sizes;
- PostgreSQL CPU/IO saturation or connection pool exhaustion;
- compatible face counts materially above 30,000 per event;
- indexing backlog that exceeds the event publishing window or retry budget;
- more than one application instance serving Face Search;
- provider inference exceeding the 15-second containment boundary or consuming more than the bounded process capacity.

Potential responses should be evidence-driven: query/index tuning first, then pgvector approximate indexing, a durable worker/queue, distributed rate limiting, GPU capacity, or a separate service. These are not implemented in this slice.

## Regression and limitations

No schema/migration or payment changes were made. Pricing remains USD with album inheritance/photo overrides and Face Search results use the centralized effective-price resolver. Stripe, Zelle, refunds, disputes, reconciliation, DownloadGrant, consent, ephemeral query data, event isolation, compatibility filtering, deletion lifecycle, rate limits, and safe errors remain unchanged.

Measured data is synthetic and local. No real biometric data, model download, external Face Search call, staging/production database, Stripe call, or Zelle call was used. The production provider and real pilot capacity remain unvalidated.
