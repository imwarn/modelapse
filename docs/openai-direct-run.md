# OpenAI first-party direct Run

The first control-plane executor is `@modelapse/runner-app`.

It performs one catalog-backed OpenAI Responses API Run, persists the full state transition history, stores content-addressed evidence, signs the attestation, and emits only a compact Run/hash summary to stdout.

## Prerequisites

PostgreSQL must already contain:

1. an active Test Case belonging to a published Test Version;
2. the Test Case prompt blob descriptor;
3. an `openai` provider row;
4. a currently valid `first_party_direct` provider endpoint whose hostname is `api.openai.com`;
5. a source record attached to that provider endpoint.

The prompt bytes must exist in the configured BlobStore at the registered SHA-256 address.

## Required environment

```text
DATABASE_URL
MODELAPSE_BLOB_ROOT
MODELAPSE_BUILD
MODELAPSE_ATTESTATION_KEY_ID
OPENAI_API_KEY
```

Provide the Ed25519 private key using one of:

```text
MODELAPSE_ATTESTATION_PRIVATE_KEY_FILE
MODELAPSE_ATTESTATION_PRIVATE_KEY_PEM
```

Optional:

```text
MODELAPSE_PROVIDER_TIMEOUT_MS
MODELAPSE_EVIDENCE_COLLECTOR
```

`MODELAPSE_BUILD` should be an immutable build identifier in production, such as a Git commit SHA or immutable release digest.

## Job input

Send exactly one JSON object on stdin:

```json
{
  "provider": "openai",
  "testCaseId": "00000000-0000-4000-8000-000000000000",
  "model": "provider-model-id",
  "config": {
    "maxOutputTokens": 1200,
    "reasoningEffort": "medium"
  }
}
```

The control payload cannot override the prompt, endpoint, credential name, collector class, or evidence level.

## Container

Build:

```bash
docker build -f docker/runner.Dockerfile -t modelapse-runner:dev .
```

The container defaults to:

```text
MODELAPSE_BLOB_ROOT=/var/lib/modelapse/blobs
```

Mount the same persistent CAS volume used when Test Case prompt blobs are ingested. Inject provider and signing secrets using the deployment platform's secret mechanism rather than baking them into the image.

The runner image should have outbound network access only to required internal services and the intended first-party provider endpoint.

## CI versus a live provider call

CI exercises the same PostgreSQL + CAS + OpenAI adapter + controlled transport composition with an injected fake HTTP response. It verifies the E4 record and confirms that persisted request evidence contains a redacted authorization header rather than the API key.

CI deliberately does not spend a real provider credential. A live smoke Run is an operator/deployment action using the same runner image and job contract.
