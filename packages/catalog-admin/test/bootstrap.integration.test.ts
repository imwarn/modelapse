import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { FileSystemContentAddressedBlobStore } from "@modelapse/blob-store";
import { migrateDatabase } from "@modelapse/database";
import { PgRunRepository } from "@modelapse/persistence";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  PgCatalogAdmin,
  PgCatalogDiscovery,
  PgCatalogDriftReview,
  PgCatalogObserver,
  PgModelCatalogAdmin,
} from "../src/index.js";

const ADMIN_DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgres://modelapse:modelapse@127.0.0.1:5432/modelapse";

function databaseUrl(databaseName: string): string {
  const url = new URL(ADMIN_DATABASE_URL);
  url.pathname = "/" + databaseName;
  return url.toString();
}

describe("production catalog bootstrap", () => {
  const adminPool = new Pool({ connectionString: ADMIN_DATABASE_URL });
  const databaseName =
    "modelapse_catalog_" + randomUUID().replace(/-/g, "").slice(0, 12);
  const isolatedDatabaseUrl = databaseUrl(databaseName);
  let root = "";
  let catalog: PgCatalogAdmin | undefined;
  let modelCatalog: PgModelCatalogAdmin | undefined;
  let runs: PgRunRepository | undefined;

  beforeAll(async () => {
    await adminPool.query(`CREATE DATABASE "${databaseName}"`);

    await migrateDatabase({
      connectionString: isolatedDatabaseUrl,
      migrationsDirectory: fileURLToPath(
        new URL("../../database/migrations/", import.meta.url),
      ),
      runnerBuild: "catalog-bootstrap-integration",
    });

    root = await mkdtemp(join(tmpdir(), "modelapse-catalog-bootstrap-"));
    catalog = PgCatalogAdmin.connect(
      isolatedDatabaseUrl,
      new FileSystemContentAddressedBlobStore(root),
    );
    modelCatalog = PgModelCatalogAdmin.connect(isolatedDatabaseUrl);
    runs = PgRunRepository.connect(isolatedDatabaseUrl, { max: 2 });
  });

  afterAll(async () => {
    await runs?.close();
    await catalog?.close();
    await modelCatalog?.close();
    await adminPool.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
    await adminPool.end();
    if (root) await rm(root, { recursive: true, force: true });
  });

  it("registers the DeepSeek model and execution binding idempotently", async () => {
    await catalog!.bootstrapDeepSeekSmoke({
      runnerBuild: "deepseek-model-prerequisite",
    });

    const first = await modelCatalog!.bootstrapDeepSeekFlash();
    const second = await modelCatalog!.bootstrapDeepSeekFlash();

    expect(second).toEqual(first);

    const verification = new Pool({ connectionString: isolatedDatabaseUrl });
    try {
      const row = await verification.query<{
        canonical_source_id: string | null;
        api_model_id: string;
        binding_source_id: string;
        alias: string;
        alias_observations: string;
      }>(
        `SELECT
           m.canonical_source_id,
           meb.api_model_id,
           meb.source_id AS binding_source_id,
           ma.alias,
           COUNT(are.id)::text AS alias_observations
         FROM modelapse.models m
         JOIN modelapse.model_execution_bindings meb ON meb.model_id = m.id
         JOIN modelapse.model_aliases ma
           ON ma.provider_id = m.provider_id
          AND ma.alias = meb.api_model_id
         LEFT JOIN modelapse.alias_resolution_events are
           ON are.alias_id = ma.id
          AND are.resolved_model_id = m.id
         WHERE m.id = $1
         GROUP BY
           m.canonical_source_id,
           meb.api_model_id,
           meb.source_id,
           ma.alias`,
        [first.modelId],
      );

      expect(row.rows[0]).toMatchObject({
        canonical_source_id: first.sourceId,
        api_model_id: "deepseek-flash",
        binding_source_id: first.sourceId,
        alias: "deepseek-flash",
        alias_observations: "1",
      });
    } finally {
      await verification.end();
    }
  });

  it("records source-backed identity drift without rewriting prior observations", async () => {
    await catalog!.bootstrapDeepSeekSmoke({
      runnerBuild: "deepseek-drift-prerequisite",
    });
    const registered = await modelCatalog!.bootstrapDeepSeekFlash();

    const first = await modelCatalog!.observeFirstPartyIdentity({
      providerSlug: "deepseek",
      canonicalSlug: "deepseek-flash",
      apiModelId: "deepseek-flash",
      providerSnapshotId: "deepseek-flash-drift-a",
      sourceUrl: "https://api-docs.deepseek.com/guides/responses_api/",
      sourceTitle: "DeepSeek Responses API guide",
      observedAt: "2099-01-01T00:00:00.000Z",
    });
    const same = await modelCatalog!.observeFirstPartyIdentity({
      providerSlug: "deepseek",
      canonicalSlug: "deepseek-flash",
      apiModelId: "deepseek-flash",
      providerSnapshotId: "deepseek-flash-drift-a",
      sourceUrl: "https://api-docs.deepseek.com/guides/responses_api/",
      sourceTitle: "DeepSeek Responses API guide",
      observedAt: "2099-01-02T00:00:00.000Z",
    });
    const second = await modelCatalog!.observeFirstPartyIdentity({
      providerSlug: "deepseek",
      canonicalSlug: "deepseek-flash",
      apiModelId: "deepseek-flash",
      providerSnapshotId: "deepseek-flash-drift-b",
      sourceUrl: "https://api-docs.deepseek.com/guides/responses_api/",
      sourceTitle: "DeepSeek Responses API guide",
      observedAt: "2099-01-03T00:00:00.000Z",
    });

    expect(first.bindingChanged).toBe(true);
    expect(same.bindingChanged).toBe(false);
    expect(second.bindingChanged).toBe(true);
    expect(new Set([first.sourceId, same.sourceId, second.sourceId]).size).toBe(3);

    const verification = new Pool({ connectionString: isolatedDatabaseUrl });
    try {
      const drift = await verification.query<{
        change_type: string;
        changed_fields: string[];
        current_snapshot_id: string | null;
      }>(
        `SELECT change_type, changed_fields, current_snapshot_id
           FROM modelapse.catalog_identity_drift_events
          WHERE previous_model_id = $1 OR current_model_id = $1
          ORDER BY occurred_at, change_type`,
        [registered.modelId],
      );

      expect(drift.rows).toHaveLength(4);
      expect(
        drift.rows.filter((row) => row.change_type === "alias_target_changed"),
      ).toHaveLength(2);
      expect(
        drift.rows.filter((row) => row.change_type === "execution_binding_changed"),
      ).toHaveLength(2);
      expect(drift.rows.every((row) => row.changed_fields.includes("snapshot"))).toBe(true);
      expect(
        drift.rows.some((row) => row.current_snapshot_id === second.snapshotId),
      ).toBe(true);

      await expect(
        verification.query(
          `UPDATE modelapse.alias_resolution_events
              SET confidence = 0.5
            WHERE id = $1`,
          [first.aliasObservationId],
        ),
      ).rejects.toThrow(/append-only/);

      await expect(
        verification.query(
          `UPDATE modelapse.model_execution_bindings
              SET api_model_id = 'rewritten'
            WHERE id = $1`,
          [second.bindingId],
        ),
      ).rejects.toThrow(/identity is immutable/);
    } finally {
      await verification.end();
    }
  });

  it("periodically snapshots a first-party model list and feeds identity drift", async () => {
    await catalog!.bootstrapDeepSeekSmoke({
      runnerBuild: "deepseek-observer-prerequisite",
    });
    const registered = await modelCatalog!.bootstrapDeepSeekFlash();

    let providerSnapshotId = "deepseek-flash-observer-a";
    const observer = PgCatalogObserver.connect(isolatedDatabaseUrl, {
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            object: "list",
            data: [
              {
                id: "deepseek-flash",
                provider_snapshot_id: providerSnapshotId,
              },
              { id: "unmapped-remote-model" },
            ],
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
              etag: '"observer-test"',
            },
          },
        ),
      credentialResolver: () => "observer-test-secret",
    });

    try {
      const first = await observer.collectDue({
        collectorBuild: "observer-build-a",
        providerSlug: "deepseek",
        sourceKey: "models-api",
        force: true,
        now: "2099-02-01T00:00:00.000Z",
      });
      providerSnapshotId = "deepseek-flash-observer-b";
      const second = await observer.collectDue({
        collectorBuild: "observer-build-b",
        providerSlug: "deepseek",
        sourceKey: "models-api",
        force: true,
        now: "2099-02-02T00:00:00.000Z",
      });

      expect(first).toEqual([
        expect.objectContaining({
          providerSlug: "deepseek",
          sourceKey: "models-api",
          status: "succeeded",
          itemCount: 2,
          observationsEmitted: 1,
        }),
      ]);
      expect(second).toEqual([
        expect.objectContaining({
          providerSlug: "deepseek",
          sourceKey: "models-api",
          status: "succeeded",
          itemCount: 2,
          observationsEmitted: 1,
        }),
      ]);

      const verification = new Pool({ connectionString: isolatedDatabaseUrl });
      try {
        const snapshots = await verification.query<{
          source_record_id: string;
          content_sha256: string;
          response_body: string;
        }>(
          `SELECT
             snapshot.source_record_id,
             snapshot.content_sha256,
             snapshot.response_body
           FROM modelapse.catalog_source_snapshots snapshot
           JOIN modelapse.catalog_observer_sources source
             ON source.id = snapshot.observer_source_id
           JOIN modelapse.providers provider
             ON provider.id = source.provider_id
          WHERE provider.slug = 'deepseek'
            AND source.source_key = 'models-api'
          ORDER BY snapshot.retrieved_at`,
        );

        expect(snapshots.rows).toHaveLength(2);
        expect(
          new Set(snapshots.rows.map((row) => row.source_record_id)).size,
        ).toBe(2);
        expect(
          snapshots.rows.map((row) => JSON.parse(row.response_body).data[0].provider_snapshot_id),
        ).toEqual([
          "deepseek-flash-observer-a",
          "deepseek-flash-observer-b",
        ]);

        const observerDrift = await verification.query<{
          change_type: string;
          changed_fields: string[];
          provider_snapshot_id: string | null;
        }>(
          `SELECT
             drift.change_type,
             drift.changed_fields,
             current_snapshot.provider_snapshot_id
           FROM modelapse.catalog_identity_drift_events drift
           LEFT JOIN modelapse.model_snapshots current_snapshot
             ON current_snapshot.id = drift.current_snapshot_id
          WHERE drift.current_model_id = $1
            AND drift.current_source_id = ANY($2::uuid[])
          ORDER BY drift.occurred_at, drift.change_type`,
          [
            registered.modelId,
            snapshots.rows.map((row) => row.source_record_id),
          ],
        );

        expect(observerDrift.rows).toHaveLength(4);
        expect(
          observerDrift.rows.filter(
            (row) => row.change_type === "alias_target_changed",
          ),
        ).toHaveLength(2);
        expect(
          observerDrift.rows.filter(
            (row) => row.change_type === "execution_binding_changed",
          ),
        ).toHaveLength(2);
        expect(
          observerDrift.rows.every((row) =>
            row.changed_fields.includes("snapshot"),
          ),
        ).toBe(true);
        expect(
          observerDrift.rows.some(
            (row) =>
              row.provider_snapshot_id === "deepseek-flash-observer-b",
          ),
        ).toBe(true);

        const driftReview = PgCatalogDriftReview.connect(isolatedDatabaseUrl);
        try {
          const open = await driftReview.list({ status: "open" });
          const reviewTarget = open.find((item) => item.model?.id === registered.modelId);
          expect(reviewTarget).toBeDefined();
          const eventId = reviewTarget!.eventId;

          await expect(
            driftReview.decide({
              eventId,
              action: "acknowledge",
              actor: "integration-test",
              note: "triaged",
            }),
          ).resolves.toMatchObject({ eventId, status: "acknowledged" });

          await expect(
            driftReview.decide({
              eventId,
              action: "resolve",
              actor: "integration-test",
              note: "source-backed identity accepted",
            }),
          ).resolves.toMatchObject({ eventId, status: "resolved" });

          await expect(
            driftReview.decide({
              eventId,
              action: "reopen",
              actor: "integration-test",
              note: "needs another look",
            }),
          ).resolves.toMatchObject({ eventId, status: "open" });

          const reviewEvents = await verification.query<{ id: string }>(
            `SELECT id
               FROM modelapse.catalog_identity_drift_review_events
              WHERE drift_event_id = $1
              ORDER BY created_at, id`,
            [eventId],
          );
          expect(reviewEvents.rows).toHaveLength(3);
          await expect(
            verification.query(
              `UPDATE modelapse.catalog_identity_drift_review_events
                  SET actor = 'rewritten'
                WHERE id = $1`,
              [reviewEvents.rows[0]!.id],
            ),
          ).rejects.toThrow(/append-only/);
        } finally {
          await driftReview.close();
        }

        const runMetadata = await verification.query<{
          status: string;
          metadata: {
            unmatchedRemoteModelIds?: string[];
          };
        }>(
          `SELECT run.status, run.metadata
             FROM modelapse.catalog_collection_runs run
             JOIN modelapse.catalog_observer_sources source
               ON source.id = run.observer_source_id
             JOIN modelapse.providers provider
               ON provider.id = source.provider_id
            WHERE provider.slug = 'deepseek'
              AND source.source_key = 'models-api'
            ORDER BY run.started_at`,
        );
        expect(runMetadata.rows).toHaveLength(2);
        expect(runMetadata.rows[0]).toMatchObject({
          status: "succeeded",
          metadata: {
            unmatchedRemoteModelIds: ["unmapped-remote-model"],
          },
        });

        const discovery = PgCatalogDiscovery.connect(isolatedDatabaseUrl);
        try {
          const candidates = await discovery.listCandidates({
            providerSlug: "deepseek",
            status: "discovered",
          });
          const candidate = candidates.find(
            (item) => item.remoteModelId === "unmapped-remote-model",
          );
          expect(candidate).toMatchObject({
            provider: { slug: "deepseek" },
            remoteModelId: "unmapped-remote-model",
            observationCount: 2,
            status: "discovered",
            resolvedModel: null,
            latestDecision: null,
          });
          expect(candidate?.firstSeenAt).toBe("2099-02-01T00:00:00.000Z");
          expect(candidate?.lastSeenAt).toBe("2099-02-02T00:00:00.000Z");

          if (!candidate) {
            throw new Error("Expected unmatched discovery candidate");
          }

          await expect(
            discovery.reconcileCandidate({
              candidateId: candidate.id,
              action: "match_existing",
              resolvedModelId: registered.modelId,
              actor: "integration-test",
              note: "exact provider reconciliation",
              decidedAt: "2099-02-03T00:00:00.000Z",
            }),
          ).resolves.toMatchObject({ status: "matched" });

          const matched = await discovery.listCandidates({
            providerSlug: "deepseek",
            status: "matched",
          });
          expect(matched.find((item) => item.id === candidate.id)).toMatchObject({
            status: "matched",
            resolvedModel: {
              id: registered.modelId,
              canonicalSlug: "deepseek-flash",
            },
            latestDecision: {
              action: "match_existing",
              actor: "integration-test",
            },
          });

          await expect(
            discovery.reconcileCandidate({
              candidateId: candidate.id,
              action: "ignore",
              actor: "integration-test",
              note: "reclassified for state-machine coverage",
              decidedAt: "2099-02-04T00:00:00.000Z",
            }),
          ).resolves.toMatchObject({ status: "ignored" });

          await expect(
            discovery.reconcileCandidate({
              candidateId: candidate.id,
              action: "mark_promotion_ready",
              actor: "integration-test",
              decidedAt: "2099-02-05T00:00:00.000Z",
            }),
          ).resolves.toMatchObject({ status: "promotion_ready" });

          const promotionReady = (
            await discovery.listCandidates({
              providerSlug: "deepseek",
              status: "promotion_ready",
            })
          ).find((item) => item.id === candidate.id);
          expect(promotionReady?.promotionPolicy).toMatchObject({
            version: "provider-catalog-v1",
            eligible: true,
            blockers: [],
            evidence: {
              sourceRecordId: candidate.lastSource.id,
              sourceType: "provider_catalog",
              observationCount: 2,
            },
          });

          await verification.query(
            `CREATE OR REPLACE FUNCTION modelapse.reject_integration_promotion()
             RETURNS trigger LANGUAGE plpgsql AS $
             BEGIN
               RAISE EXCEPTION 'integration forced promotion audit failure';
             END;
             $`,
          );
          await verification.query(
            `CREATE TRIGGER reject_integration_promotion
             BEFORE INSERT ON modelapse.catalog_promotion_events
             FOR EACH ROW EXECUTE FUNCTION modelapse.reject_integration_promotion()`,
          );
          try {
            await expect(
              discovery.promoteCandidate({
                candidateId: candidate.id,
                canonicalSlug: "atomic-rollback-probe",
                marketingName: "Atomic Rollback Probe",
                status: "preview",
                actor: "integration-test",
              }),
            ).rejects.toThrow(/forced promotion audit failure/);
          } finally {
            await verification.query(
              `DROP TRIGGER IF EXISTS reject_integration_promotion
               ON modelapse.catalog_promotion_events`,
            );
            await verification.query(
              `DROP FUNCTION IF EXISTS modelapse.reject_integration_promotion()`,
            );
          }

          const rollbackProbe = await verification.query<{
            candidate_status: string;
            model_count: string;
            binding_count: string;
          }>(
            `SELECT
               candidate.status AS candidate_status,
               (
                 SELECT COUNT(*)::text
                   FROM modelapse.models model
                  WHERE model.provider_id = candidate.provider_id
                    AND model.canonical_slug = 'atomic-rollback-probe'
               ) AS model_count,
               (
                 SELECT COUNT(*)::text
                   FROM modelapse.model_execution_bindings binding
                  WHERE binding.api_model_id = candidate.remote_model_id
               ) AS binding_count
             FROM modelapse.catalog_discovery_candidates candidate
            WHERE candidate.id = $1`,
            [candidate.id],
          );
          expect(rollbackProbe.rows[0]).toEqual({
            candidate_status: "promotion_ready",
            model_count: "0",
            binding_count: "0",
          });

          const promoted = await discovery.promoteCandidate({
            candidateId: candidate.id,
            canonicalSlug: "unmapped-remote-model",
            marketingName: "Unmapped Remote Model",
            status: "preview",
            actor: "integration-test",
            note: "explicit v0.9 promotion",
          });
          expect(promoted.candidateId).toBe(candidate.id);

          const promotedCandidates = await discovery.listCandidates({
            providerSlug: "deepseek",
            status: "matched",
          });
          expect(
            promotedCandidates.find((item) => item.id === candidate.id),
          ).toMatchObject({
            status: "matched",
            resolvedModel: {
              id: promoted.modelId,
              canonicalSlug: "unmapped-remote-model",
              marketingName: "Unmapped Remote Model",
            },
            promotion: {
              actor: "integration-test",
              modelId: promoted.modelId,
            },
            latestDecision: {
              action: "match_existing",
              actor: "integration-test",
            },
          });

          const promotedModel = await verification.query<{
            canonical_source_id: string;
            api_model_id: string;
          }>(
            `SELECT model.canonical_source_id, binding.api_model_id
               FROM modelapse.models model
               JOIN modelapse.model_execution_bindings binding
                 ON binding.model_id = model.id
                AND binding.valid_to IS NULL
              WHERE model.id = $1`,
            [promoted.modelId],
          );
          expect(promotedModel.rows[0]).toEqual({
            canonical_source_id: candidate.lastSource.id,
            api_model_id: "unmapped-remote-model",
          });

          const promotionEvents = await verification.query<{
            id: string;
            policy_version: string;
            evidence: {
              sourceRecordId: string;
              sourceType: string;
              contentSha256: string;
              observationCount: number;
            };
          }>(
            `SELECT id, policy_version, evidence
               FROM modelapse.catalog_promotion_events
              WHERE candidate_id = $1`,
            [candidate.id],
          );
          expect(promotionEvents.rows).toHaveLength(1);
          expect(promotionEvents.rows[0]).toMatchObject({
            policy_version: "provider-catalog-v1",
            evidence: {
              sourceRecordId: candidate.lastSource.id,
              sourceType: "provider_catalog",
              contentSha256: candidate.lastSource.contentSha256,
              observationCount: 2,
            },
          });
          await expect(
            verification.query(
              `UPDATE modelapse.catalog_promotion_events
                  SET actor = 'rewritten'
                WHERE id = $1`,
              [promotionEvents.rows[0]!.id],
            ),
          ).rejects.toThrow(/append-only/);

          await expect(
            discovery.promoteCandidate({
              candidateId: candidate.id,
              canonicalSlug: "duplicate-promotion",
              marketingName: "Duplicate Promotion",
              actor: "integration-test",
            }),
          ).rejects.toThrow(/promotion_ready/);

          await expect(
            discovery.reconcileCandidate({
              candidateId: candidate.id,
              action: "reopen",
              actor: "integration-test",
              decidedAt: "2099-02-06T00:00:00.000Z",
            }),
          ).resolves.toMatchObject({ status: "discovered" });

          const otherProvider = await verification.query<{ id: string }>(
            `INSERT INTO modelapse.providers (slug, name)
             VALUES ('integration-other-provider', 'Integration Other Provider')
             ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
             RETURNING id`,
          );
          const otherModel = await verification.query<{ id: string }>(
            `INSERT INTO modelapse.models
              (provider_id, canonical_slug, marketing_name, status)
             VALUES ($1, 'other-model', 'Other Model', 'active')
             ON CONFLICT (provider_id, canonical_slug)
             DO UPDATE SET marketing_name = EXCLUDED.marketing_name
             RETURNING id`,
            [otherProvider.rows[0]!.id],
          );

          await expect(
            discovery.reconcileCandidate({
              candidateId: candidate.id,
              action: "match_existing",
              resolvedModelId: otherModel.rows[0]!.id,
              actor: "integration-test",
            }),
          ).rejects.toThrow(/share a provider/);

          await expect(
            verification.query(
              `INSERT INTO modelapse.catalog_reconciliation_events
                (candidate_id, action, resolved_model_id, actor)
               VALUES ($1, 'match_existing', $2, 'direct-sql-test')`,
              [candidate.id, otherModel.rows[0]!.id],
            ),
          ).rejects.toThrow(/provider mismatch/);

          const decisions = await verification.query<{ id: string }>(
            `SELECT id
               FROM modelapse.catalog_reconciliation_events
              WHERE candidate_id = $1
              ORDER BY decided_at, id`,
            [candidate.id],
          );
          expect(decisions.rows).toHaveLength(5);

          await expect(
            verification.query(
              `UPDATE modelapse.catalog_reconciliation_events
                  SET note = 'rewritten'
                WHERE id = $1`,
              [decisions.rows[0]!.id],
            ),
          ).rejects.toThrow(/append-only/);

          const observations = await verification.query<{ id: string }>(
            `SELECT id
               FROM modelapse.catalog_discovery_observations
              WHERE candidate_id = $1
              ORDER BY observed_at, id`,
            [candidate.id],
          );
          expect(observations.rows).toHaveLength(2);
          await expect(
            verification.query(
              `DELETE FROM modelapse.catalog_discovery_observations
                WHERE id = $1`,
              [observations.rows[0]!.id],
            ),
          ).rejects.toThrow(/append-only/);
        } finally {
          await discovery.close();
        }
      } finally {
        await verification.end();
      }
    } finally {
      await observer.close();
    }
  });

  it("bootstraps DeepSeek idempotently and resolves its sourced direct target", async () => {
    const first = await catalog!.bootstrapDeepSeekSmoke({
      runnerBuild: "deepseek-build-a",
    });
    const second = await catalog!.bootstrapDeepSeekSmoke({
      runnerBuild: "deepseek-build-b",
    });

    expect(second).toEqual(first);

    const target = await runs!.resolveDirectExecutionTarget({
      testCaseId: first.testCaseId,
      providerSlug: "deepseek",
      endpointHostname: "api.deepseek.com",
    });

    expect(target.providerId).toBe(first.providerId);
    expect(target.endpointBaseUrl).toBe("https://api.deepseek.com");
    expect(target.promptBlob.sha256).toBe(first.promptSha256);
  });

  it("is idempotent and produces an executable sourced direct target", async () => {
    const first = await catalog!.bootstrapOpenAISmoke({
      runnerBuild: "build-a",
    });
    const second = await catalog!.bootstrapOpenAISmoke({
      runnerBuild: "build-b",
    });

    expect(second).toEqual(first);

    const target = await runs!.resolveDirectExecutionTarget({
      testCaseId: first.testCaseId,
      providerSlug: "openai",
      endpointHostname: "api.openai.com",
    });

    expect(target.providerId).toBe(first.providerId);
    expect(target.endpointBaseUrl).toBe("https://api.openai.com");
    expect(target.promptBlob.sha256).toBe(first.promptSha256);

    const verification = new Pool({ connectionString: isolatedDatabaseUrl });
    try {
      const row = await verification.query<{
        version_status: string;
        endpoint_source_id: string | null;
        family_source_id: string | null;
        version_source_id: string | null;
      }>(
        `SELECT
           tv.status AS version_status,
           pe.source_id AS endpoint_source_id,
           tf.canonical_source_id AS family_source_id,
           tv.source_id AS version_source_id
         FROM modelapse.test_cases tc
         JOIN modelapse.test_versions tv ON tv.id = tc.test_version_id
         JOIN modelapse.test_variants tvar ON tvar.id = tv.variant_id
         JOIN modelapse.test_families tf ON tf.id = tvar.family_id
         JOIN modelapse.providers p ON p.slug = 'openai'
         JOIN modelapse.provider_endpoints pe
           ON pe.provider_id = p.id
          AND pe.path = 'first_party_direct'
          AND pe.hostname = 'api.openai.com'
        WHERE tc.id = $1`,
        [first.testCaseId],
      );

      expect(row.rows[0]).toMatchObject({
        version_status: "published",
        endpoint_source_id: first.providerSourceId,
        family_source_id: first.definitionSourceId,
        version_source_id: first.definitionSourceId,
      });
    } finally {
      await verification.end();
    }
  });
});
