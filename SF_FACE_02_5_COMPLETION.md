# SF-FACE-02.5 — Retention, Deletion & Backup Lifecycle

## Status

PASS_WITH_DEFERRED_PRODUCTION_OPERATIONS — active-system biometric lifecycle guarantees are implemented and tested. Backup deletion/reconciliation and a complete photographer-account deletion policy remain explicitly deferred production operations.

## Required invariants

```text
CUSTOMER_QUERY_IMAGE_RETENTION=EPHEMERAL
CUSTOMER_QUERY_EMBEDDING_RETENTION=EPHEMERAL
CUSTOMER_BIOMETRIC_PROFILE_CREATED=false
DELETED_BIOMETRIC_DERIVATIVE_SEARCHABLE=false
ACTIVE_BIOMETRIC_DELETION=IMPLEMENTED
PHOTOGRAPHER_ACCOUNT_DELETION=PENDING_PRODUCT_PRIVACY_OPERATIONS
BACKUP_BIOMETRIC_RECONCILIATION=PENDING_PRODUCTION_OPERATIONS
RESTORE_MUST_NOT_SILENTLY_RESURRECT_DELETED_BIOMETRIC_DATA
PRODUCTION_FACE_SEARCH_READY=false
```

Face Search remains optional, event-scoped, consent-gated, development-provider-only, and fail-closed in production. Payment, download entitlement, and other commerce records are separate from the Face Search index.

## Data-location inventory

| Data class | Current location/lifetime | Deletion or cleanup behavior |
| --- | --- | --- |
| Customer query image | Request memory (`File`/`Buffer`) only | Validated and consumed in the active request; never inserted into `Photo`, `PhotoFace`, object storage, customer/session records, or analytics. No temporary file is created by this path. |
| Customer query embedding | Request-local array passed to provider/search | Not persisted, logged, returned, or stored in a customer profile. On timeout, the underlying provider promise is retained only until it settles; it is not durable. |
| Photographer source photo | `Photo` row plus `originals/<key>` in the configured local/S3 storage provider | Authoritative photo deletion removes the row and cascades biometric rows, then attempts original-file cleanup. |
| Photo previews/watermarked derivatives | `Photo.previewKey` plus `previews/<key>` in local/S3 storage | Photo/event deletion attempts preview cleanup after DB revocation. |
| Persistent `PhotoFace` derivative | PostgreSQL `PhotoFace`, including vector, provider/model metadata, compatibility key, and face index | Cascades from `Photo`; event deletion cascades through albums/photos. Search joins source state and event scope. |
| Face index jobs | PostgreSQL `FaceIndexJob`, attached to `Photo` | Cascades with the source photo. Successful reindex replaces the active compatibility space and removes stale spaces for that photo. |
| Operational metadata | Face index job status/errors and safe category-level logs | No image/vector values are logged. Existing worker logs contain job ID, model version, count, duration, and error category/message; they must remain free of biometric payloads. |
| Backups | Not provisioned or described by this repository | Backup retention/deletion is not verifiable here; production restore reconciliation is required. |

## Customer query lifecycle

The public route reads the multipart image, validates and decodes it in memory, detects exactly one face, creates an embedding, searches the trusted published event, returns photo-oriented results, and lets the request-local values leave scope. No normal success, validation failure, inference failure, or timeout path creates durable query biometric data. The timeout boundary cannot cancel an opaque provider promise, so it holds the in-process concurrency slot until that promise settles.

## Photo and event deletion

`deletePhoto(photoId, photographerId)` derives ownership from the album relationship. It deletes the authoritative `Photo` row first; the schema cascade removes every face derivative and face-index job. Only after that revocation does it attempt original/preview storage cleanup. If external cleanup fails, the service reports a retryable cleanup error, but the source row and searchable `PhotoFace` records are already gone.

`deleteEventWithAssets(eventId, photographerId)` is the event deletion boundary used by the photographer action. It derives owned event photos, deletes the event so albums/photos/PhotoFace rows cascade, then attempts all original/preview cleanups. A storage failure cannot leave the deleted event searchable. Existing order foreign-key semantics may reject deletion of an event with dependent commercial records; that is an existing product constraint and is not bypassed by this slice.

The denormalized `PhotoFace.eventId` and `albumId` are checked by `findFaceLifecycleIssues()`. Normal foreign keys make missing source parents impossible, while the audit detects relationship drift and derivatives whose source photo/album/event is no longer published. Search itself also requires the published source relationship and trusted event ID.

## Reindex lifecycle

Face ingestion remains transactional. It sorts detected faces deterministically, replaces rows for the active compatibility key, inserts the current 0..N faces, and then removes rows for older compatibility keys for that photo before completing the job. A failed transaction does not mark the job complete. Repeated processing is idempotent. This means an old model space is not silently searchable after a successful replacement; reindexing a future provider/model requires the same successful replacement process.

## Photographer account deletion

There is no implemented photographer-account deletion product flow in this repository. The schema has cascading photographer relationships for events/albums/photos/PhotoFace, but financial/order relations intentionally include restrictive semantics. Account deletion, retention exceptions for commercial records, and a complete storage cleanup runbook remain a privacy/legal/product blocker and are not claimed here.

## Storage, logs, and backup boundary

Local storage uses filesystem objects; S3 storage uses `originals/` and `previews/` keys. Storage deletion is best-effort after database revocation and must be retried operationally when it fails. The repository does not implement a deletion queue or distributed cleanup engine.

No raw selfie bytes, base64 payloads, embeddings, templates, or face crops are logged. Database deletion does not prove deletion from snapshots, database backups, object-versioning, or external backup systems. The production runbook must define database/object-storage retention, expiration, restore-time tombstone reconciliation, and verification that restore cannot silently resurrect deleted biometric derivatives.

```text
ACTIVE_DATA_DELETION != BACKUP_RETENTION
RESTORE_MUST_NOT_SILENTLY_RESURRECT_DELETED_BIOMETRIC_DATA
BACKUP_BIOMETRIC_RECONCILIATION=PENDING_PRODUCTION_OPERATIONS
```

## Commerce independence

Face Search derivative deletion does not delete `Order`, `Payment`, `DownloadGrant`, refund, dispute, or reconciliation history. Existing secure-download authorization remains based on commerce entitlements, not on the presence of `PhotoFace`. Purchased-photo behavior is therefore not changed by index cleanup.

## QA evidence

- Disposable/local integration PostgreSQL was used by the existing integration harness (`localhost:5432`, `sportpix_test_migrated`); no staging or production database was touched.
- Integration coverage verifies multi-face deletion, event deletion, photographer-owned lifecycle boundaries, lifecycle issue auditing, and storage-cleanup failure revocation.
- No external provider calls or model downloads occurred.
- Prisma generate/validate: PASS.
- Unit tests: **46 passed, 16 skipped**.
- Integration tests: **16 passed**.

## Remaining production work

- `BACKUP_BIOMETRIC_RECONCILIATION=PENDING_PRODUCTION_OPERATIONS`.
- Define and implement photographer-account deletion with commercial-record retention rules.
- Add durable cleanup retry/reconciliation for failed object-storage deletion.
- Verify backup/versioning behavior with the actual production database and object-storage providers.
- Complete biometric retention, privacy operations, legal review, and production-provider authorization.
- Preserve `PRODUCTION_FACE_SEARCH_READY=false` until all required provider, privacy, quality, and operations gates pass.
