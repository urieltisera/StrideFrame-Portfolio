# SF-FACE-02.3 — Consent & Biometric Privacy Lifecycle

## Status

`SF-FACE-02.3 STATUS: PASS` for the minimum consent and ephemeral customer
query lifecycle.

This slice does not certify legal compliance or production biometric readiness.
No commercial provider was selected or authorized.

## Consent UX and server enforcement

The customer Face Search page now presents a product/privacy notice before the
search action. It states that:

- Face Search is optional;
- the customer submits a selfie/photo for matching;
- StrideFrame creates a temporary biometric representation;
- matching is limited to the current event;
- the query image and representation are not intended for durable storage;
- the event can be browsed without Face Search.

An unchecked checkbox explicitly says:

`I understand and want to use Face Search.`

The search control remains disabled until the customer checks it. Consent is
not inferred from visiting the page, browsing, account terms, checkout, or
inactivity.

The API independently requires the stateless request assertion:

```text
faceSearchConsent=accepted
```

Requests without this exact Face Search-specific assertion receive a safe
`FACE_SEARCH_CONSENT_REQUIRED` response. This prevents a client-side UI bypass
from reaching Face Search processing. No durable consent record or customer
biometric identity profile is created because the current public event flow
does not require one.

## Customer query lifecycle

```text
optional Face Search page
  → explicit privacy notice
  → affirmative checkbox
  → multipart query image for the active request
  → server validation and in-memory provider processing
  → event-only search
  → photo-oriented results
  → request-scoped image/embedding leave application scope
```

The query image is not inserted into `Photo`, `PhotoFace`, object storage,
session records, analytics, or generated artifacts. The query embedding is
held only for the active search and is not returned to the customer or
persisted. Photographer event embeddings remain persistent event-index data
and are unaffected by customer queries.

The application does not intentionally write a temporary query file. Memory,
reverse-proxy buffering, crash dumps, and infrastructure logs remain outside
the guarantees of this code slice and require operational retention controls.

## Validation and safe customer behavior

The server validates:

- JPEG, PNG, and WebP MIME types;
- matching supported filename extension when present;
- non-empty payload;
- maximum 5 MiB size using both declared and received byte length;
- decodable image content using Sharp;
- exactly one detected face.

Development-only deterministic marker fixtures remain available for tests.
They are not accepted as a production image-validation bypass.

Customer-facing errors are generic and actionable:

- no face: “We couldn't detect a face in that photo. Try another photo or
  browse the gallery.”
- multiple faces: “Please use a photo containing only your face, or browse the
  gallery.”
- malformed, unsupported, or oversized input: safe retry guidance without
  provider paths or stack traces.

The preferred MVP policy is exactly one face in a customer query. The system
does not silently search multiple people from one selfie.

## Availability and ordinary gallery alternative

The 02.1 readiness guard remains independent from consent. Consent cannot
authorize a provider. If no `PRODUCTION_READY` provider exists, Face Search
remains unavailable and the UI provides a manual “Browse the event manually”
path. Gallery, cart, checkout, payments, and downloads do not require Face
Search.

## Logging and error handling

No raw image bytes, base64 data, embeddings, biometric templates, multipart
payloads, or temporary image contents are logged. Existing readiness
observability remains limited to safe provider/readiness categories. Customer
responses do not expose ONNX/model paths, secrets, stack traces, or internal
provider details.

## Tests and evidence

Added focused tests for:

- consent absent by default;
- exact affirmative consent accepted;
- generic terms acceptance rejected as Face Search consent;
- empty, malformed, unsupported, and extension-mismatched images rejected;
- existing no-face and multiple-face behavior;
- continued provider production fail-closed behavior.

The isolated integration suite continued to pass the existing event,
commerce, payment, refund, dispute, and Face Search persistence coverage.
The implementation does not add query rows, and the query path contains no
storage/database write for customer images or embeddings.

## Validation

- `npx prisma generate` — PASS
- `npx prisma validate` — PASS
- `npm run typecheck` — PASS
- `npm test` — PASS: 41 passed, 15 skipped
- `npm run test:integration` — PASS: 15 passed
- `npm run lint` — PASS with 9 existing warnings and no errors
- `npm run build` — PASS
- `git diff --check` — PASS

No schema or migration change was necessary.

## Required state declarations

```text
FACE_SEARCH_CONSENT_REQUIRED=true
CUSTOMER_QUERY_IMAGE_RETENTION=EPHEMERAL
CUSTOMER_QUERY_EMBEDDING_RETENTION=EPHEMERAL
CUSTOMER_BIOMETRIC_PROFILE_CREATED=false
FACE_SEARCH_OPTIONAL=true
PRODUCTION_FACE_SEARCH_READY=false
BUFFALO_L=DEV_VALIDATION_ONLY
FACE_SEARCH_SCOPE=EVENT_ONLY
FACE_SEARCH_THRESHOLD_0_92=DEV_ONLY_NOT_PRODUCTION_APPROVED
PRODUCTION_DEV_PROVIDER_FALLBACK=FORBIDDEN
```

## Remaining privacy/security work

- Attorney/product-approved notice and consent language.
- Operational controls for proxy, crash, memory, backup, and log retention.
- Rate limiting, abuse prevention, request timeouts, and resource controls.
- Full biometric derivative deletion consistency and backup lifecycle.
- Provider data-processing terms if an external provider is selected.
- Production-approved model/provider licensing and quality validation.
- Production threshold calibration and representative sports-data testing.
