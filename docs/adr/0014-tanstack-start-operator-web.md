# ADR 0014: TanStack Start is a separate Web trust boundary

- Status: Accepted
- Date: 2026-09-24

## Context

Modelapse now has a stable Hono read/control API, a selection-based Run Planner, a durable PostgreSQL queue, sealed E4 Runs, deterministic Evaluation, and public Archive projections.

The next layer needs a usable browser interface without moving provider credentials, the Hono control token, database access, or execution responsibilities into browser JavaScript.

## Decision

Use TanStack Start as a separate SSR/Web process.

The Web process:

1. reads public Archive projections through the Hono API;
2. uses server functions for privileged control-plane calls;
3. keeps `MODELAPSE_CONTROL_TOKEN` server-only;
4. requires a separate `MODELAPSE_WEB_OPERATOR_TOKEN` before Run submission or private job polling;
5. does not connect directly to PostgreSQL;
6. does not execute provider requests;
7. does not read private CAS bytes.

The normal Run form sends canonical `modelId` and `testCaseId` selections only. The existing Run Planner remains authoritative for provider, API model alias, endpoint, prompt, queue kind, and evaluator-compatible Test selection.

## Consequences

### Positive

- The browser does not become a new holder of the control-plane credential.
- Hono remains the application boundary instead of duplicating data access in SSR loaders.
- API and Web can deploy or roll back independently.
- A future public site can reuse the same Archive contract while replacing the temporary operator-token gate with real account/session authorization.
- Existing runner isolation and evidence semantics remain unchanged.

### Trade-offs

- Production has a third container/resource.
- The temporary operator token is intentionally narrower than a full authentication system but still requires secure distribution to operators.
- v0.1 job progress uses bounded polling rather than SSE/WebSocket infrastructure.
- The Web process depends on API availability even for SSR Archive rendering.

## Rejected alternatives

### Expose MODELAPSE_CONTROL_TOKEN to the browser

Rejected because it would turn a server control credential into a client secret and make extraction trivial.

### Connect the Web process directly to PostgreSQL

Rejected because it would duplicate repository/query policy and widen the database trust boundary.

### Execute provider calls in TanStack Start server functions

Rejected because the runner owns provider credentials, evidence capture, durable state transitions, and execution isolation.

### Add a full identity system before any UI

Deferred. The v0.1 operator gate is sufficient for an internal control surface while the public Archive remains unauthenticated.
