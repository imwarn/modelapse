# ADR 0011 — First-party direct providers share one control-plane contract

Status: Accepted

## Decision

The durable Run job contract supports explicit first-party providers:

```text
openai
deepseek
```

Provider-specific adapters own protocol translation and fixed network boundaries. The control-plane payload remains provider-agnostic apart from the provider slug, requested model and limited generation config.

## DeepSeek

DeepSeek uses:

```text
https://api.deepseek.com/responses
```

with the runner-only credential:

```text
DEEPSEEK_API_KEY
```

The adapter declares `api.deepseek.com` as its only allowed host and `first_party_direct` as its execution path.

## Evidence semantics

Adding a provider does not weaken E4.

E4 still requires:

- a Test Case loaded from the published catalog;
- prompt bytes loaded from CAS and hash-verified;
- a sourced current provider endpoint;
- an adapter-declared first-party direct host;
- controlled credential injection immediately before I/O;
- captured request and response evidence;
- redacted credentials;
- signed Run attestation;
- sealed persistence.

## Queue semantics

The PostgreSQL queue stores provider-specific kinds:

```text
openai_direct
deepseek_direct
```

while the worker dispatches through the shared direct-provider execution composition.

The queue remains at-least-once and explicit execution failures remain terminal.
