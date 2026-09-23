# ADR 0006 — First-party direct Runs execute outside the public API

Status: Accepted for control-plane v0.1

## Decision

The first real E4 execution path is a one-shot runner process, not a Hono route.

The runner receives only a narrow job payload:

- provider: currently exactly `openai`;
- Test Case UUID;
- requested provider model string;
- a limited generation config.

The caller cannot supply the prompt bytes, provider endpoint, credential, evidence level, collector classification, or attestation payload.

## Catalog gate

Before a Run is created, the runner resolves the Test Case and provider through PostgreSQL.

Execution is allowed only when:

- the Test Case is active;
- its Test Version is published;
- its active time window includes the current time;
- its prompt references a registered blob;
- the provider has a currently valid `first_party_direct` endpoint for the adapter hostname;
- that endpoint has a source record.

The runner then reads the prompt from content-addressed storage, verifies its byte length and SHA-256 against PostgreSQL, and decodes it as UTF-8 text.

This prevents a control-plane caller from silently replacing the benchmark prompt while still receiving E4 evidence.

## Provider boundary

The initial implementation uses `OpenAIResponsesAdapter` plus `NodeEvidenceTransport`.

The adapter fixes the request destination to the OpenAI first-party API and declares `api.openai.com` as its allowed host. The controlled transport:

- injects `OPENAI_API_KEY` only immediately before I/O;
- does not follow redirects;
- captures only allowlisted response headers;
- persists redacted request headers;
- records exact request/response bytes and timestamps.

Production runner containers must also enforce infrastructure-level egress policy. Application host validation is defense in depth, not the only network boundary.

## Evidence

A successfully captured OpenAI first-party direct response is sealed through the persistence layer with E4 evidence.

Preflight failures such as missing catalog provenance, invalid prompt bytes, invalid attestation key, or missing credentials happen before the planned Run is created.

Once provider execution starts, state transitions are persisted. Transport failures without a captured response remain terminal unsealed Runs; captured HTTP responses can be sealed even when the provider returns an error.

## Process model

The current runner is intentionally one-shot:

```text
control plane / operator
        |
        | JSON job on stdin
        v
modelapse-runner
        |
        +-- PostgreSQL catalog + Run persistence
        +-- content-addressed blob store
        +-- provider first-party endpoint
```

A queue can invoke the same runner composition later. Adding a queue must not move provider execution into the public API process.
