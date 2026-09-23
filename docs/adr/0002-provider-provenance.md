# ADR 0002 — Provider adapters do not own network transport

Status: Accepted for v0.1

A screenshot, response JSON or request ID cannot prove a result came directly from a first-party API.

Provider adapters therefore remain transport-free. They translate canonical requests into HTTP request plans, declare allowed destination hosts and execution-path classification, and normalize captured HTTP exchanges.

A Modelapse-controlled EvidenceTransport owns credentials, endpoint allowlists, network access, redaction, raw capture and timestamps.

Execution paths are: first_party_direct, first_party_product, routed_provider, cloud_hosted and community_claimed. Evidence strength is separate (E0–E5). E4 is reserved for Modelapse-controlled first-party direct API execution.
