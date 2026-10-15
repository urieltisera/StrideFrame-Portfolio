# SF-FACE-02.2 — Persisted Embedding Metadata & Multi-Face

## Status

`SF-FACE-02.2 STATUS: PASS` for persisted embedding metadata and multi-face
index semantics.

Face Search remains development-only and is not production-ready.

## Schema evolution and uniqueness

The former `PhotoFace` uniqueness rule was:

```text
(photoId, modelVersion)
```

That allowed at most one row for a photo/model and could not represent two or
more detected faces. The previous insertion loop therefore could fail or leave
multi-face processing incomplete.

Migration:

`20261019100000_face_embedding_metadata_multiface`

adds:

- `faceIndex` — deterministic zero-based face position within one processing
  result;
- `providerId`;
- `modelId`;
- `modelVersion` (existing field retained);
- `embeddingFormatVersion`;
- `embeddingDimension`;
- `similarityMetric`;
- `compatibilityKey`.

The new uniqueness identity is:

```text
(photoId, compatibilityKey, faceIndex)
```

Each face has a durable identity derived from the photo, compatibility key,
and deterministic face index. Embedding bytes are never used as identity.

The migration preserves old rows. Because those rows lack truthful provider
and format history, they are explicitly classified as:

```text
providerId=legacy
modelId=legacy-unclassified
embeddingFormatVersion=legacy-unknown
```

Their compatibility key cannot match a newly indexed provider. They remain
auditable but are excluded from current searches until a future reindex records
real metadata.

## Multi-face ingestion semantics

Index processing now:

1. resolves the provider metadata;
2. rejects providers incompatible with the current persisted `vector(512)`
   storage;
3. sorts detected faces deterministically by bounding-box position and stable
   dimensions/confidence tie-breakers;
4. deletes all prior rows for the photo and exact compatibility key inside the
   same transaction;
5. validates every embedding and metadata field;
6. inserts zero, one, or N rows with `faceIndex` values `0..N-1`;
7. marks the indexing job complete.

Thus:

- zero faces leaves zero current rows;
- one face creates one row;
- three faces creates three rows;
- reprocessing three faces as two removes the stale third row;
- repeating the same processing does not create unbounded duplicates and
  derives stable row IDs from photo + compatibility identity + face index.

## Compatibility identity and search

`faceCompatibilityKey` is derived from:

```text
providerId | modelId | modelVersion | embeddingFormatVersion |
embeddingDimension | similarityMetric
```

Search validates the query embedding against the active provider metadata and
filters candidates by the exact persisted compatibility key before applying
cosine similarity. Incompatible provider/model/version/format/dimension/metric
records are not numerically compared. Legacy records are therefore safely
excluded rather than reinterpreted.

The query remains event-scoped through the trusted event ID resolved from the
public event slug. Candidate SQL applies `eventId`, compatibility key, and
published event/album/photo filters before similarity ordering. Photographer
ownership remains enforced through the event/album relationship; customers do
not supply photographer or event identity as authorization data.

Search is photo-oriented: SQL groups candidate face rows by `photoId` and uses
the best compatible face score. A photo with multiple matching faces appears
once and embeddings are never returned to the customer.

## Deletion behavior

`PhotoFace.photoId` retains the existing cascading relation to `Photo`.
Deleting a photo removes all face derivatives, including all face indexes and
compatibility versions. Deleting an event/album cascades through descendant
photos and removes their derivatives. This slice does not add the full
privacy/backup retention lifecycle planned for later Face Search work.

## QA evidence

The isolated PostgreSQL integration suite created two photographers and three
events, including an event owned by the second photographer. It verified:

- a simulated three-face photo stores three distinct `PhotoFace` rows;
- search in Event A returns the Event A photo once;
- Event B and Photographer B data do not leak into Event A results;
- incompatible legacy metadata is not used as a current comparison space;
- reprocessing the photo from three faces to two leaves exactly two current
  rows;
- repeating the same replacement remains at two rows;
- deleting a photo removes its face rows;
- deleting an event removes descendant face rows.

## Validation

- `npx prisma generate` — PASS
- `npx prisma validate` — PASS
- `npm run typecheck` — PASS
- `npm test` — PASS: 39 passed, 15 skipped
- `npm run test:integration` — PASS: 15 passed with 15 migrations applied
  to the disposable local PostgreSQL database
- `npm run lint` — PASS with existing warnings and no errors
- `npm run build` — PASS
- `git diff --check` — PASS

## Explicit preserved invariants

```text
BUFFALO_L=DEV_VALIDATION_ONLY
FACE_SEARCH_SCOPE=EVENT_ONLY
FACE_SEARCH_THRESHOLD_0_92=DEV_ONLY_NOT_PRODUCTION_APPROVED
PRODUCTION_FACE_SEARCH_READY=false
FACE_SEARCH_OPTIONAL=true
PRODUCTION_DEV_PROVIDER_FALLBACK=FORBIDDEN
```

## Limitations and deferred work

- The current persisted vector column remains `vector(512)`; other dimensions
  are rejected until a separately reviewed storage migration exists.
- Complete provider metadata is now stored for new records, but old legacy
  rows require reindexing to become searchable.
- The provider/model metadata schema is not yet versioned as a separate index
  namespace or reindex state machine.
- Explicit photographer ID denormalization, orphan checks, and stronger
  tenant defense-in-depth belong to SF-FACE-02.3.
- Consent, retention/deletion guarantees, backup policy, upload hardening, and
  rate limiting belong to later privacy/security slices.
- Exact-scan/vector-index performance work belongs to SF-FACE-02.5/02.6.
- `buffalo_l` remains development validation only; no commercial provider was
  enabled or downloaded.
