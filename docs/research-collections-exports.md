# Research Collections & Evidence Exports — Archive v0.27

Archive v0.27 introduces **operator-curated, publicly shareable immutable Run selections** and sourced JSON/CSV exports.

## What is saved?

A dynamic Research Explorer URL (`/research?…`) is a query. As the Archive collects new Runs, repeating that query may return different records.

A Research Collection (`/research/collections/:id`) freezes **a specific ordered list of up to 50 sealed Run IDs**, the original validated filters, title/note, creator label and capture time. Existing membership never changes as more Runs arrive.

A collection is a *selection snapshot*, not a byte-for-byte copy of the entire public Run view. It references sealed, immutable Run facts, qualification envelopes and cost evidence. Derived policy interpretations may evolve separately. Export includes a content digest for the selection manifest, not a hash of the exported JSON/CSV bytes.

Creation fails closed when:

- no matching Run exists;
- more than 50 matching Runs exist (no silent first-page truncation);
- a caller supplies a pagination cursor (a partial page is not a complete slice);
- filter, title or creator metadata is invalid;
- one of the selected IDs is not a completed, sealed, public, non-calibration Run.

## Control and public endpoints

**Operator-only, token authenticated:**

`POST /v1/control/research/collections`

Body example:

```json
{
  "title": "US paid-account snapshot",
  "description": "Bounded first-party Run selection",
  "actor": "archive-operator",
  "filters": {
    "providerSlug": "deepseek",
    "evidence": "E4+",
    "region": "US",
    "cost": "unknown"
  }
}
```

The API uses the same validated facets as `GET /v1/archive/research`, but caps the capture at 50 and refuses a partial result.

**Public, read-only:**

```text
GET /v1/archive/research/collections?limit=30
GET /v1/archive/research/collections/:collectionId
GET /v1/archive/research/collections/:collectionId/export?format=json
GET /v1/archive/research/collections/:collectionId/export?format=csv
```

The export response uses the appropriate MIME type and attachment filename.

## Manifest identity

`research_collections` is append-only. PostgreSQL validates every selected Run's sealed/public/non-calibration status on insert and rejects duplicate Run IDs.

The SHA-256 `contentSha256` uses canonical JSON of:

- manifest schema version;
- normalized Provider, Model, Test, evidence, region, account, service tier and cost facets;
- ordered Run UUIDs.

It excludes mutable presentation details such as title and capture timestamp. The repository verifies the digest again when the collection is read. This hash proves the identity of **the selected filters and Run IDs**, not a cryptographic attestation by the Provider or a guarantee that the entire externally downloaded file has never been modified.

## Exports and evidence language

Each exported row retains immutable identifiers, execution path, completion time, E-level, deterministic evaluator outcome, region/account/effective service tier/service assurance, referenced first-party access/policy evidence source IDs, pricing source ID, native currency/cost estimate and qualification/cost caveats.

JSON includes the full manifest, explicit interpretation scope and structured rows.

CSV includes one flat sourced row per Run; all cells are quoted, embedded quotes escaped, and values beginning with spreadsheet formula triggers are prefixed to prevent formula execution in spreadsheet software.

Cost unavailable remains empty or null, **never zero or free**. CSV/JSON is not a ranking, not a matched comparability set, and not proof of model degradation. Calibration Tests are excluded from snapshot membership; calibration eligibility itself is not silently inferred.

## UI

- `/research`: live filters plus a collapsed Operator-only capture form;
- `/research/collections`: public recently published collections;
- `/research/collections/:id`: fixed Run membership, manifest digest, filter replay link and JSON/CSV download.

Replaying a collection's filters launches a **new live search**, not an update to the frozen collection. Public viewing does not require operator credentials. Provider secrets and personal account identifiers never enter the collection.

## Tests and deployment

Migration `0025_research_collections.sql` adds the append-only manifest table and Run status/visibility validation trigger. It is idempotently applied by the existing migration runner.

Tests cover digest determinism, CSV formula escaping, public GET/export vs operator POST boundaries, re-open of a captured collection in PostgreSQL, cursor rejection and append-only/forged Run constraints.

If a selection grows beyond 50, operators must narrow it (for example by Provider, exact Test, or historical context). Future phases may introduce explicit multi-page snapshot transactions, but may not silently save only a partial result.
