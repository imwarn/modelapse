# Community intake

Community discovery is valuable, but discovery, attribution, reproducibility and verification are separate things.

## Candidate flow

```text
Discovered
  ↓
Candidate Registry
  ↓
Rights / origin check
  ↓
Prompt + fixture completeness
  ↓
Replayability / reproducibility
  ↓
Provenance classification
  ↓
Referenced | Imported | Adopted
```

## Discovery sources

Candidates may come from:

- original author repositories and blogs;
- provider release demos;
- benchmark directories;
- GitHub;
- academic papers;
- Hacker News / Reddit / X / Bluesky;
- 微博 / 知乎 / B站 and other regional communities;
- direct submissions.

Search/discovery is only the beginning. Modelapse should preserve the earliest credible source and avoid treating a later viral repost as the origin.

## Candidate registry

Store at least:

- canonical source URL;
- author;
- first-seen / first-published dates;
- verbatim prompt availability;
- fixtures/assets availability;
- raw artifact availability;
- implementation code availability;
- license/permission;
- models shown;
- claimed execution path;
- replayability;
- contamination risk;
- rights risk;
- shadow-suite potential.

## Editorial outcomes

### Referenced

Use when the result has historical relevance but redistribution rights, prompt completeness or replayability are weak.

Keep source metadata and only the minimal permitted evidence.

### Imported

Use when source and rights permit Modelapse to preserve a reproducible pack/artifact.

Keep the original author, source URL, original hash and imported version.

### Adopted

Use when Modelapse will maintain a versioned fork, evaluator and/or shadow suite.

Adoption never rewrites authorship. The Test Pack origin remains external or hybrid.

## Historical runs

A historical result may enter the archive even when the model is retired.

The run should record the strongest claim supported by evidence, while evidence level communicates certainty.

Examples:

- public screenshot only → E0/E1;
- prompt + raw artifact + source + model/date → potentially E2;
- Modelapse re-runs the same case through a router → new E3 Run related with `reproduces`;
- Modelapse directly calls the official provider endpoint → new E4 Run.

Do not mutate the old community run into the new verified run. Link them.

## Determining whether an API result was first-party direct

Never decide from model output alone.

A community author may claim “official API,” and that claim should be recorded, but without Modelapse-controlled execution or a future independently verifiable provider receipt it does not become E4.

For Modelapse-run results, direct provenance requires:

1. a provider adapter classified as `first_party_direct`;
2. an official endpoint allowlist;
3. a Modelapse-controlled transport that performs the actual request;
4. credential injection outside the adapter;
5. captured/redacted request and response bytes;
6. provider request/response IDs and model-version fields when available;
7. timestamps and content hashes;
8. a signed run attestation.

Third-party routers remain routed even if they identify the upstream provider.

## Community BYOK

A future BYOK workflow can create E4 results when the API key is used only inside an ephemeral Modelapse-controlled runner that talks directly to the official endpoint.

Keys must never be persisted in logs, database rows, artifacts, request blobs or attestations.
