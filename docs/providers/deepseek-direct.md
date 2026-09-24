# DeepSeek first-party direct execution

Modelapse supports DeepSeek as a first-party direct provider through the official DeepSeek Responses API.

## Provider boundary

The adapter is fixed to:

```text
provider slug: deepseek
execution path: first_party_direct
allowed host: api.deepseek.com
request URL: https://api.deepseek.com/responses
credential: DEEPSEEK_API_KEY
```

The job caller cannot override the host, URL, credential name, evidence level or prompt bytes.

The adapter uses the Responses API request shape. The current production smoke model should be:

```text
deepseek-flash
```

## Coolify runner secret

Add only at runtime:

```text
DEEPSEEK_API_KEY=<DeepSeek API key>
```

Do not add this value to GitHub Actions and do not expose it to the API container.

## Bootstrap the DeepSeek catalog target

After the runner image has deployed:

```bash
node packages/catalog-admin/dist/src/cli.js bootstrap-deepseek-smoke
```

This creates or verifies:

- a sourced `deepseek` provider;
- the sourced `https://api.deepseek.com` first-party direct endpoint;
- a provider-neutral first-party direct smoke Test Family;
- a published immutable smoke Test Case;
- the prompt in the content-addressed blob store.

The command is idempotent and returns the `testCaseId`.

## Submit a production smoke Run

From the API container, or another trusted client holding `MODELAPSE_CONTROL_TOKEN`:

```json
{
  "provider": "deepseek",
  "testCaseId": "<bootstrap-test-case-id>",
  "model": "deepseek-flash",
  "config": {
    "reasoningEffort": "none",
    "maxOutputTokens": 64
  }
}
```

The durable job is dispatched to the same runner worker as OpenAI jobs.

A successful external response is sealed as E4 only after the catalog target resolves to the sourced DeepSeek first-party endpoint and the captured request/response is attested.
