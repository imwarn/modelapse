# Production catalog bootstrap

Modelapse production catalog writes are performed through the `@modelapse/catalog-admin` domain service.

The first operational surface is a CLI shipped in the runner image. This is intentionally narrower than a general-purpose web admin panel.

## Why CLI first

The first production requirement is to create a small, provenance-safe catalog entry so the verified control plane can execute a real provider Run.

The important reusable asset is the catalog write logic:

- prompt bytes are stored in CAS first;
- the blob descriptor is registered and verified in PostgreSQL;
- provider endpoint provenance is required;
- Test Version definitions are hash-locked;
- Test Cases are inserted before publication;
- published definitions remain immutable;
- repeat execution is idempotent;
- conflicting existing catalog data fails closed.

A future admin platform should call the same service rather than implement a second write path.

## Canonical OpenAI smoke TestPack

The v0.1 bootstrap creates or verifies:

```text
Provider
  openai

First-party direct endpoint
  https://api.openai.com
  hostname: api.openai.com
  source: OpenAI Responses API reference

Test Family
  modelapse-smoke

Variant
  openai-direct-text

Version
  1.0.0 / published

Case
  exact-modelapse

Prompt
  Return exactly the lowercase word modelapse and nothing else.
```

The prompt is public, content-addressed and intentionally deterministic.

## Run the bootstrap in Coolify

After the runner image containing this package has deployed, open the `modelapse-runner` Terminal in Coolify and execute:

```bash
node packages/catalog-admin/dist/src/cli.js bootstrap-openai-smoke
```

The command uses the runner's existing runtime configuration:

```text
DATABASE_URL
MODELAPSE_BLOB_ROOT
MODELAPSE_BUILD
```

It does not require the caller to pass database credentials, a blob path or provider credentials on the command line.

The command returns JSON containing the canonical catalog IDs, including:

```json
{
  "providerId": "...",
  "testVersionId": "...",
  "testCaseId": "...",
  "promptSha256": "...",
  "definitionSha256": "..."
}
```

Running the command again should return the same identifiers.

## Submit the first live Run

Use the returned `testCaseId` with the authenticated control endpoint:

```bash
curl --fail-with-body \
  --request POST \
  https://modelapse-api.imwarn.com/v1/control/run-jobs \
  --header "Authorization: Bearer $MODELAPSE_CONTROL_TOKEN" \
  --header "Idempotency-Key: first-live-e4-smoke" \
  --header "Content-Type: application/json" \
  --data '{
    "provider": "openai",
    "testCaseId": "<BOOTSTRAP_TEST_CASE_ID>",
    "model": "<OPENAI_MODEL_ID>",
    "config": {
      "maxOutputTokens": 32
    }
  }'
```

Do not paste the control token into issue trackers, chat logs or repository files.

The control response contains a durable job ID. Poll:

```text
GET /v1/control/run-jobs/<job-id>
```

with the same Bearer token.

Once the job is `succeeded`, read the factual Run through:

```text
GET /v1/runs/<run-id>
```

The first successful external provider Run should show:

```text
executionPath = first_party_direct
evidence.level = E4
status = completed
```

## Failure semantics

Bootstrap conflicts are not auto-repaired.

Examples that fail closed:

- `openai` exists with a different provider identity;
- the direct endpoint has an incompatible hostname;
- the smoke Test Family/Variant slug is already occupied by another definition;
- version `1.0.0` exists with another definition hash;
- the published Test Case points at different prompt bytes;
- the version has already been retired.

These failures require explicit catalog review instead of silent mutation.
