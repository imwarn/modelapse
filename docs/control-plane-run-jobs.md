# Durable Run jobs

## API configuration

Set on the API service:

```text
DATABASE_URL
MODELAPSE_CONTROL_TOKEN
```

Without `MODELAPSE_CONTROL_TOKEN`, control-plane routes return `503 control_plane_disabled`. Public Run reads remain available.

## Submit a Run job

```http
POST /v1/control/run-jobs
Authorization: Bearer <MODELAPSE_CONTROL_TOKEN>
Idempotency-Key: <client-generated stable key>
Content-Type: application/json

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

The response is `202` with the durable job ID and current status.

The same idempotency key and same job payload return the same job. The same key with a different payload returns `409 idempotency_conflict`.

## Read job status

```http
GET /v1/control/run-jobs/<job-id>
Authorization: Bearer <MODELAPSE_CONTROL_TOKEN>
```

A succeeded job contains `runId`. The Run itself can then be read through the evidence-safe public Run endpoint.

## Runner configuration

The runner container now defaults to:

```text
MODELAPSE_RUNNER_MODE=queue
```

Required runner settings remain:

```text
DATABASE_URL
MODELAPSE_BLOB_ROOT
MODELAPSE_BUILD
MODELAPSE_ATTESTATION_KEY_ID
OPENAI_API_KEY
MODELAPSE_ATTESTATION_PRIVATE_KEY_FILE
  or MODELAPSE_ATTESTATION_PRIVATE_KEY_PEM
```

Optional queue settings:

```text
MODELAPSE_WORKER_ID
MODELAPSE_JOB_LEASE_SECONDS=300
MODELAPSE_JOB_POLL_MS=1000
MODELAPSE_PROVIDER_TIMEOUT_MS=120000
```

The job lease must exceed the configured provider timeout by at least 30 seconds.

To run the older one-shot stdin executor, override:

```text
MODELAPSE_RUNNER_MODE=stdin
```

## Deployment separation

The API service needs the control token but does not need provider API keys or the signing private key.

The runner needs provider/signing secrets but does not expose an HTTP port.

Both services need PostgreSQL. They must also see the correct CAS storage for the Test Case prompt/evidence lifecycle.

Infrastructure-level egress rules should allow the runner only the required database/storage services and approved first-party provider endpoints.
