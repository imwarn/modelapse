# ADR 0007 — Durable Run jobs use PostgreSQL leases

Status: Accepted for control-plane v0.2

## Decision

The public API may accept authenticated Run requests, but it does not execute provider calls.

Submission creates a durable `run_jobs` row. A separate runner process claims jobs from PostgreSQL and invokes the already-verified first-party direct execution composition.

No Redis, broker or workflow engine is introduced at this stage.

## Submission boundary

The control endpoint is:

```text
POST /v1/control/run-jobs
```

It is enabled only when `MODELAPSE_CONTROL_TOKEN` is configured and requires a matching Bearer token.

The request body uses the same narrow job contract as the worker:

- provider is currently exactly `openai`;
- Test Case UUID;
- requested model string;
- limited generation config.

Prompt bytes, endpoint, provider credential, evidence level and attestation fields cannot be supplied by the caller.

Clients should send `Idempotency-Key` for retry-safe submission. The same key and same normalized payload return the existing job. Reusing the key for a different payload is a conflict.

## Queue semantics

The queue is PostgreSQL-backed.

Workers claim one eligible job with `FOR UPDATE SKIP LOCKED` and receive a lease. While the lease is active, another worker cannot claim that job.

A claimed job records:

- worker ID;
- claim timestamp;
- lease expiry;
- attempt count.

A worker may complete or fail a job only while it still owns an active lease.

Explicit execution errors are terminal for that job. They are not automatically retried because blindly replaying provider requests can duplicate cost or side effects.

If a worker disappears without recording a result, the expired lease makes the job claimable again, up to `max_attempts` (default 3).

## Delivery guarantee

This system is **at-least-once**, not exactly-once.

`Idempotency-Key` prevents duplicate queue submissions. It does not prove that a provider request was executed exactly once.

A worker can fail after the provider accepted a request but before the queue success update is committed. After lease expiry another worker may execute the job again. A later provider-specific request-idempotency mechanism may narrow this window where first-party APIs support it.

Modelapse must not describe the current queue as exactly-once.

## Lease sizing

The runner requires:

```text
job lease >= provider timeout + 30 seconds
```

The container defaults to queue mode. Current application defaults are:

- provider timeout: 120 seconds;
- job lease: 300 seconds;
- empty-queue poll interval: 1 second.

The lease can be configured up to 3600 seconds.

## Process boundary

```text
authenticated client
        |
        v
modelapse-api
        |
        | durable enqueue
        v
PostgreSQL run_jobs
        |
        | SKIP LOCKED lease
        v
modelapse-runner
        |
        +--> catalog + CAS verification
        +--> first-party provider API
        +--> evidence + attestation + Run persistence
```

The API container does not receive provider API credentials or attestation private keys. Those secrets belong only to the runner deployment.

## Future evolution

A different queue or workflow engine can replace PostgreSQL later if operational needs justify it. The job contract and runner execution composition should remain independent from the transport used to dispatch jobs.
