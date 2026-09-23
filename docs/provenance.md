# Provenance model

## Rule

**Never infer first-party API direct from output alone.**

Screenshots, copied response JSON, request IDs, model names and raw HTTP files are editable. They can improve archival confidence, but do not prove network execution path.

## Execution path vs evidence level

Execution paths:

- `first_party_direct` — Modelapse-controlled runner talks directly to an official provider API endpoint.
- `first_party_product` — provider-owned consumer product/UI, not raw API.
- `routed_provider` — OpenRouter or another third-party gateway/router.
- `cloud_hosted` — Azure/Bedrock/Vertex-style hosted execution.
- `community_claimed` — Modelapse did not control the request.

Evidence levels:

- E0 — Historical reference only.
- E1 — Community attestation.
- E2 — Reproducible archive with prompt/artifact/source material.
- E3 — Modelapse-controlled routed/cloud execution.
- E4 — Modelapse-controlled first-party direct API execution.
- E5 — Reserved for future independently provider-verifiable receipts.

## E4 capture

An E4 run should capture exact adapter/runner build, destination classification, requested and returned model identifiers, provider request/response IDs when supplied, selected headers, redacted request and raw response bytes, timestamps, usage, SHA-256 hashes and a signed Modelapse run attestation.

Request IDs are supporting evidence, not independent proof.

A run routed through OpenRouter may be strongly verified, but remains `routed_provider`; an upstream provider name never turns it into `first_party_direct`.
