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
  PgCatalogCoverage,
  PgCatalogDiscovery,
  PgCatalogDriftReview,
  PgCatalogIdentityCase,
  PgCatalogIntegrity,
  PgCatalogObserver,
  PgCatalogPresence,
  PgCatalogPresenceReview,
  PgCatalogRemoteIdCase,
  PgProviderTestability,
  PgServiceCalibrationCatalog,
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
             RETURNS trigger LANGUAGE plpgsql AS $promotion_test$
             BEGIN
               RAISE EXCEPTION 'integration forced promotion audit failure';
             END;
             $promotion_test$`,
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

          const identityCases = PgCatalogIdentityCase.connect(isolatedDatabaseUrl);
          try {
            const originalCase = await identityCases.get(registered.modelId);
            expect(originalCase).not.toBeNull();
            expect(originalCase?.candidates.find((item) => item.id === candidate.id)).toMatchObject({
              id: candidate.id,
              remoteModelId: "unmapped-remote-model",
            });
            expect(
              originalCase?.candidates
                .find((item) => item.id === candidate.id)
                ?.decisions.some(
                  (decision) =>
                    decision.action === "match_existing" &&
                    decision.resolvedModelId === registered.modelId,
                ),
            ).toBe(true);
            expect(originalCase?.drift.length).toBeGreaterThan(0);
            expect(
              originalCase?.drift.some((item) =>
                item.review.decisions.some((decision) => decision.actor === "integration-test"),
              ),
            ).toBe(true);
            expect(
              originalCase?.timeline.some((event) => event.kind === "drift_review"),
            ).toBe(true);

            const promotedCase = await identityCases.get(promoted.modelId);
            expect(promotedCase).not.toBeNull();
            expect(promotedCase?.candidates).toHaveLength(1);
            expect(promotedCase?.candidates[0]).toMatchObject({
              id: candidate.id,
              observationCount: 2,
              promotion: {
                policyVersion: "provider-catalog-v1",
                actor: "integration-test",
              },
            });
            expect(
              promotedCase?.timeline.some(
                (event) =>
                  event.kind === "promotion" &&
                  event.candidateId === candidate.id &&
                  event.source?.id === candidate.lastSource.id,
              ),
            ).toBe(true);
            expect(
              promotedCase?.timeline.filter(
                (event) => event.kind === "discovery_observation",
              ),
            ).toHaveLength(2);
          } finally {
            await identityCases.close();
          }

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

  it("derives Catalog Integrity attention without mutating catalog facts or exposing raw snapshots", async () => {
    const verification = new Pool({ connectionString: isolatedDatabaseUrl });
    const integrity = PgCatalogIntegrity.connect(isolatedDatabaseUrl);
    try {
      const provider = await verification.query<{ id: string }>(
        `INSERT INTO modelapse.providers (slug, name)
         VALUES ('integrity-fixture', 'Integrity Fixture')
         RETURNING id`,
      );
      const providerId = provider.rows[0]!.id;

      const observerSource = await verification.query<{ id: string }>(
        `INSERT INTO modelapse.catalog_observer_sources
          (
            provider_id,
            source_key,
            source_kind,
            url,
            title,
            parser,
            interval_seconds,
            enabled,
            next_run_at,
            last_attempted_at
          )
         VALUES (
           $1,
           'models-api',
           'model_list',
           'https://integrity.example.test/models',
           'Integrity fixture catalog',
           'openai_models',
           3600,
           true,
           '2099-03-01T01:00:00Z',
           '2099-03-01T00:00:00Z'
         )
         RETURNING id`,
        [providerId],
      );

      const failedRun = await verification.query<{ id: string }>(
        `INSERT INTO modelapse.catalog_collection_runs
          (
            observer_source_id,
            status,
            started_at,
            completed_at,
            http_status,
            item_count,
            observations_emitted,
            collector_build
          )
         VALUES (
           $1,
           'failed',
           '2099-03-01T00:00:00Z',
           '2099-03-01T00:00:05Z',
           200,
           2,
           0,
           'integrity-fixture'
         )
         RETURNING id`,
        [observerSource.rows[0]!.id],
      );

      const catalogSource = await verification.query<{ id: string }>(
        `INSERT INTO modelapse.source_records
          (source_type, url, title, retrieved_at, content_sha256)
         VALUES (
           'provider_catalog',
           'https://integrity.example.test/models',
           'Integrity fixture catalog',
           '2099-03-01T00:00:01Z',
           $1
         )
         RETURNING id`,
        ["a".repeat(64)],
      );

      await verification.query(
        `INSERT INTO modelapse.catalog_source_snapshots
          (
            observer_source_id,
            collection_run_id,
            source_record_id,
            retrieved_at,
            content_sha256,
            response_body
          )
         VALUES ($1, $2, $3, '2099-03-01T00:00:01Z', $4, $5)`,
        [
          observerSource.rows[0]!.id,
          failedRun.rows[0]!.id,
          catalogSource.rows[0]!.id,
          "a".repeat(64),
          "raw-secret-provider-body",
        ],
      );

      const docsSource = await verification.query<{ id: string }>(
        `INSERT INTO modelapse.source_records
          (source_type, url, title, retrieved_at, content_sha256)
         VALUES (
           'provider_docs',
           'https://integrity.example.test/docs',
           'Integrity fixture docs',
           '2099-03-01T00:00:02Z',
           $1
         )
         RETURNING id`,
        ["b".repeat(64)],
      );

      const discovered = await verification.query<{ id: string }>(
        `INSERT INTO modelapse.catalog_discovery_candidates
          (
            provider_id,
            remote_model_id,
            first_seen_at,
            last_seen_at,
            first_source_record_id,
            last_source_record_id,
            first_collection_run_id,
            last_collection_run_id,
            observation_count,
            status
          )
         VALUES (
           $1,
           'integrity-unresolved',
           '2099-03-01T00:00:01Z',
           '2099-03-01T00:00:01Z',
           $2,
           $2,
           $3,
           $3,
           1,
           'discovered'
         )
         RETURNING id`,
        [providerId, catalogSource.rows[0]!.id, failedRun.rows[0]!.id],
      );

      await verification.query(
        `INSERT INTO modelapse.catalog_discovery_observations
          (candidate_id, collection_run_id, source_record_id, observed_at)
         VALUES ($1, $2, $3, '2099-03-01T00:00:01Z')`,
        [discovered.rows[0]!.id, failedRun.rows[0]!.id, catalogSource.rows[0]!.id],
      );

      const promotionReady = await verification.query<{ id: string }>(
        `INSERT INTO modelapse.catalog_discovery_candidates
          (
            provider_id,
            remote_model_id,
            first_seen_at,
            last_seen_at,
            first_source_record_id,
            last_source_record_id,
            first_collection_run_id,
            last_collection_run_id,
            observation_count,
            status
          )
         VALUES (
           $1,
           'integrity-promotion-ready',
           '2099-03-01T00:00:02Z',
           '2099-03-01T00:00:02Z',
           $2,
           $2,
           $3,
           $3,
           1,
           'promotion_ready'
         )
         RETURNING id`,
        [providerId, catalogSource.rows[0]!.id, failedRun.rows[0]!.id],
      );
      await verification.query(
        `INSERT INTO modelapse.catalog_discovery_observations
          (candidate_id, collection_run_id, source_record_id, observed_at)
         VALUES ($1, $2, $3, '2099-03-01T00:00:02Z')`,
        [promotionReady.rows[0]!.id, failedRun.rows[0]!.id, catalogSource.rows[0]!.id],
      );

      const blocked = await verification.query<{ id: string }>(
        `INSERT INTO modelapse.catalog_discovery_candidates
          (
            provider_id,
            remote_model_id,
            first_seen_at,
            last_seen_at,
            first_source_record_id,
            last_source_record_id,
            first_collection_run_id,
            last_collection_run_id,
            observation_count,
            status
          )
         VALUES (
           $1,
           'integrity-promotion-blocked',
           '2099-03-01T00:00:03Z',
           '2099-03-01T00:00:03Z',
           $2,
           $2,
           $3,
           $3,
           1,
           'promotion_ready'
         )
         RETURNING id`,
        [providerId, docsSource.rows[0]!.id, failedRun.rows[0]!.id],
      );
      await verification.query(
        `INSERT INTO modelapse.catalog_discovery_observations
          (candidate_id, collection_run_id, source_record_id, observed_at)
         VALUES ($1, $2, $3, '2099-03-01T00:00:03Z')`,
        [blocked.rows[0]!.id, failedRun.rows[0]!.id, docsSource.rows[0]!.id],
      );

      const modelA = await verification.query<{ id: string }>(
        `INSERT INTO modelapse.models
          (provider_id, canonical_slug, marketing_name, status, canonical_source_id)
         VALUES ($1, 'integrity-model-a', 'Integrity Model A', 'active', $2)
         RETURNING id`,
        [providerId, catalogSource.rows[0]!.id],
      );
      const modelB = await verification.query<{ id: string }>(
        `INSERT INTO modelapse.models
          (provider_id, canonical_slug, marketing_name, status)
         VALUES ($1, 'integrity-model-b', 'Integrity Model B', 'active')
         RETURNING id`,
        [providerId],
      );

      const alias = await verification.query<{ id: string }>(
        `INSERT INTO modelapse.model_aliases (provider_id, alias)
         VALUES ($1, 'integrity-moving-alias')
         RETURNING id`,
        [providerId],
      );
      await verification.query(
        `INSERT INTO modelapse.alias_resolution_events
          (alias_id, resolved_model_id, observed_at, source_type, source_id)
         VALUES ($1, $2, '2099-03-01T00:10:00Z', 'provider_catalog', $3)`,
        [alias.rows[0]!.id, modelA.rows[0]!.id, catalogSource.rows[0]!.id],
      );
      const changedAlias = await verification.query<{ id: string }>(
        `INSERT INTO modelapse.alias_resolution_events
          (alias_id, resolved_model_id, observed_at, source_type, source_id)
         VALUES ($1, $2, '2099-03-01T00:20:00Z', 'provider_catalog', $3)
         RETURNING id`,
        [alias.rows[0]!.id, modelB.rows[0]!.id, catalogSource.rows[0]!.id],
      );
      await verification.query(
        `INSERT INTO modelapse.catalog_identity_drift_reviews
          (drift_event_id, status, acknowledged_at)
         VALUES ($1, 'acknowledged', '2099-03-01T00:30:00Z')`,
        ["alias:" + changedAlias.rows[0]!.id],
      );

      const factCountsBefore = await verification.query(
        `SELECT
           (SELECT count(*)::text FROM modelapse.catalog_source_snapshots) AS snapshots,
           (SELECT count(*)::text FROM modelapse.catalog_discovery_candidates) AS candidates,
           (SELECT count(*)::text FROM modelapse.catalog_reconciliation_events) AS reconciliations,
           (SELECT count(*)::text FROM modelapse.catalog_promotion_events) AS promotions,
           (SELECT count(*)::text FROM modelapse.catalog_identity_drift_reviews) AS drift_reviews`,
      );

      const dashboard = await integrity.getDashboard();

      expect(dashboard.observerSources).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            provider: expect.objectContaining({ slug: "integrity-fixture" }),
            sourceKey: "models-api",
            health: "failed",
            attentionCategory: "collection_failed",
          }),
        ]),
      );
      expect(dashboard.discovery).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            candidateId: discovered.rows[0]!.id,
            attentionCategory: "discovery_unresolved",
          }),
          expect.objectContaining({
            candidateId: promotionReady.rows[0]!.id,
            attentionCategory: "promotion_ready",
          }),
          expect.objectContaining({
            candidateId: blocked.rows[0]!.id,
            attentionCategory: "promotion_blocked",
          }),
        ]),
      );
      expect(
        dashboard.drift.find(
          (item) => item.eventId === "alias:" + changedAlias.rows[0]!.id,
        ),
      ).toMatchObject({
        attentionCategory: "drift_acknowledged",
        reviewStatus: "acknowledged",
        model: { id: modelB.rows[0]!.id },
      });
      expect(
        dashboard.provenance.find((item) => item.model.id === modelB.rows[0]!.id),
      ).toMatchObject({
        attentionCategory: "provenance_incomplete",
        reasons: expect.arrayContaining([
          "missing_canonical_source",
          "missing_current_first_party_binding",
        ]),
      });
      expect(JSON.stringify(dashboard)).not.toContain("raw-secret-provider-body");
      expect(JSON.stringify(dashboard)).not.toContain("response_body");
      expect(JSON.stringify(dashboard)).not.toContain("responseBody");

      const factCountsAfter = await verification.query(
        `SELECT
           (SELECT count(*)::text FROM modelapse.catalog_source_snapshots) AS snapshots,
           (SELECT count(*)::text FROM modelapse.catalog_discovery_candidates) AS candidates,
           (SELECT count(*)::text FROM modelapse.catalog_reconciliation_events) AS reconciliations,
           (SELECT count(*)::text FROM modelapse.catalog_promotion_events) AS promotions,
           (SELECT count(*)::text FROM modelapse.catalog_identity_drift_reviews) AS drift_reviews`,
      );
      expect(factCountsAfter.rows[0]).toEqual(factCountsBefore.rows[0]);
    } finally {
      await integrity.close();
      await verification.end();
    }
  });

  it("reconstructs provider catalog coverage from immutable observations without reading raw response bodies", async () => {
    await catalog!.bootstrapDeepSeekSmoke({
      runnerBuild: "coverage-prerequisite",
    });
    const known = await modelCatalog!.bootstrapDeepSeekFlash();
    const missing = await modelCatalog!.registerFirstPartyModel({
      providerSlug: "deepseek",
      canonicalSlug: "coverage-missing",
      marketingName: "Coverage Missing",
      apiModelId: "coverage-missing",
      sourceUrl: "https://api-docs.deepseek.com/guides/responses_api/",
      sourceTitle: "DeepSeek Responses API guide",
    });

    const verification = new Pool({ connectionString: isolatedDatabaseUrl });
    const discovery = PgCatalogDiscovery.connect(isolatedDatabaseUrl);
    const coverage = PgCatalogCoverage.connect(isolatedDatabaseUrl);
    const observer = PgCatalogObserver.connect(isolatedDatabaseUrl, {
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            object: "list",
            data: [
              { id: "deepseek-flash" },
              { id: "coverage-discovered" },
              { id: "coverage-ready" },
              { id: "coverage-ignored" },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      credentialResolver: () => undefined,
    });

    try {
      await verification.query(
        `INSERT INTO modelapse.catalog_observer_sources
          (
            provider_id,
            source_key,
            source_kind,
            url,
            title,
            parser,
            interval_seconds,
            enabled,
            next_run_at
          )
         VALUES (
           $1,
           'coverage-models-api',
           'model_list',
           'https://coverage.example.test/models',
           'Coverage fixture model list',
           'openai_models',
           3600,
           true,
           '2099-04-01T00:00:00Z'
         )
         ON CONFLICT (provider_id, source_key) DO NOTHING`,
        [known.providerId],
      );

      const collected = await observer.collectDue({
        collectorBuild: "coverage-build",
        providerSlug: "deepseek",
        sourceKey: "coverage-models-api",
        force: true,
        now: "2099-04-01T00:00:00.000Z",
      });
      expect(collected).toEqual([
        expect.objectContaining({
          sourceKey: "coverage-models-api",
          status: "succeeded",
          itemCount: 4,
        }),
      ]);

      const candidates = await discovery.listCandidates({
        providerSlug: "deepseek",
        limit: 200,
      });
      const ready = candidates.find(
        (candidate) => candidate.remoteModelId === "coverage-ready",
      );
      const ignored = candidates.find(
        (candidate) => candidate.remoteModelId === "coverage-ignored",
      );
      expect(ready).toBeDefined();
      expect(ignored).toBeDefined();

      await discovery.reconcileCandidate({
        candidateId: ready!.id,
        action: "mark_promotion_ready",
        actor: "coverage-test",
        decidedAt: "2099-04-01T00:10:00.000Z",
      });
      await discovery.reconcileCandidate({
        candidateId: ignored!.id,
        action: "ignore",
        actor: "coverage-test",
        decidedAt: "2099-04-01T00:11:00.000Z",
      });

      const factCountsBefore = await verification.query(
        `SELECT
           (SELECT count(*)::text FROM modelapse.catalog_source_snapshots) AS snapshots,
           (SELECT count(*)::text FROM modelapse.alias_resolution_events) AS alias_observations,
           (SELECT count(*)::text FROM modelapse.catalog_discovery_observations) AS discovery_observations,
           (SELECT count(*)::text FROM modelapse.catalog_reconciliation_events) AS reconciliation_events`,
      );

      const detail = await coverage.getProvider(known.providerId);
      expect(detail).not.toBeNull();

      const fixtureSource = detail!.sources.find(
        (source) => source.sourceKey === "coverage-models-api",
      );
      expect(fixtureSource).toMatchObject({
        latestEvidence: {
          status: "succeeded",
          itemCount: 4,
          projectedItemCount: 4,
          unprojectedItemCount: 0,
        },
      });

      expect(
        detail!.remoteItems.find(
          (item) => item.remoteModelId === "deepseek-flash",
        ),
      ).toMatchObject({
        disposition: "canonical_observed",
        canonicalModel: { id: known.modelId },
      });
      expect(
        detail!.remoteItems.find(
          (item) => item.remoteModelId === "coverage-discovered",
        ),
      ).toMatchObject({
        disposition: "candidate_discovered",
        candidate: { status: "discovered" },
      });
      expect(
        detail!.remoteItems.find(
          (item) => item.remoteModelId === "coverage-ready",
        ),
      ).toMatchObject({
        disposition: "candidate_promotion_ready",
        candidate: { status: "promotion_ready" },
      });
      expect(
        detail!.remoteItems.find(
          (item) => item.remoteModelId === "coverage-ignored",
        ),
      ).toMatchObject({
        disposition: "candidate_ignored",
        candidate: { status: "ignored" },
      });
      expect(
        detail!.currentBindingsNotObserved.find(
          (item) => item.model.id === missing.modelId,
        ),
      ).toMatchObject({
        apiModelId: "coverage-missing",
        interpretation: "not_observed_in_latest_model_list_evidence",
      });

      const listed = await coverage.listProviders();
      expect(
        listed.find((item) => item.provider.id === known.providerId),
      ).toMatchObject({
        provider: { slug: "deepseek" },
        summary: {
          canonicalObserved: expect.any(Number),
          currentBindingsNotObserved: expect.any(Number),
        },
      });

      expect(JSON.stringify(detail)).not.toContain("response_body");
      expect(JSON.stringify(detail)).not.toContain("responseBody");
      expect(JSON.stringify(detail)).not.toContain("raw-secret-provider-body");
      expect(JSON.stringify(detail)).not.toContain("error_message");

      const factCountsAfter = await verification.query(
        `SELECT
           (SELECT count(*)::text FROM modelapse.catalog_source_snapshots) AS snapshots,
           (SELECT count(*)::text FROM modelapse.alias_resolution_events) AS alias_observations,
           (SELECT count(*)::text FROM modelapse.catalog_discovery_observations) AS discovery_observations,
           (SELECT count(*)::text FROM modelapse.catalog_reconciliation_events) AS reconciliation_events`,
      );
      expect(factCountsAfter.rows[0]).toEqual(factCountsBefore.rows[0]);
    } finally {
      await observer.close();
      await coverage.close();
      await discovery.close();
      await verification.end();
    }
  });

  it("derives catalog presence transitions only across complete reconstructable snapshots", async () => {
    const verification = new Pool({ connectionString: isolatedDatabaseUrl });
    const presence = PgCatalogPresence.connect(isolatedDatabaseUrl);
    try {
      const provider = await verification.query<{ id: string }>(
        `INSERT INTO modelapse.providers (slug, name)
         VALUES ('presence-fixture', 'Presence Fixture')
         RETURNING id`,
      );
      const providerId = provider.rows[0]!.id;

      const observerSource = await verification.query<{ id: string }>(
        `INSERT INTO modelapse.catalog_observer_sources
          (provider_id, source_key, source_kind, url, title, parser, interval_seconds)
         VALUES (
           $1,
           'models-api',
           'model_list',
           'https://presence.example.test/models',
           'Presence fixture catalog',
           'openai_models',
           3600
         )
         RETURNING id`,
        [providerId],
      );
      const observerSourceId = observerSource.rows[0]!.id;

      const runIds: string[] = [];
      const sourceIds: string[] = [];
      for (let index = 0; index < 4; index += 1) {
        const second = String(index).padStart(2, "0");
        const source = await verification.query<{ id: string }>(
          `INSERT INTO modelapse.source_records
            (source_type, url, title, retrieved_at, content_sha256)
           VALUES (
             'provider_catalog',
             'https://presence.example.test/models',
             'Presence fixture catalog',
             $1,
             $2
           )
           RETURNING id`,
          [
            `2099-05-01T00:0${index}:00.000Z`,
            String(index + 1).repeat(64),
          ],
        );
        const itemCount = index === 0 ? 2 : index === 1 ? 2 : 3;
        const run = await verification.query<{ id: string }>(
          `INSERT INTO modelapse.catalog_collection_runs
            (
              observer_source_id,
              status,
              started_at,
              completed_at,
              item_count,
              observations_emitted,
              collector_build
            )
           VALUES ($1, 'succeeded', $2, $3, $4, 0, 'presence-fixture')
           RETURNING id`,
          [
            observerSourceId,
            `2099-05-01T00:0${index}:00.000Z`,
            `2099-05-01T00:0${index}:${second}.500Z`,
            itemCount,
          ],
        );
        await verification.query(
          `INSERT INTO modelapse.catalog_source_snapshots
            (
              observer_source_id,
              collection_run_id,
              source_record_id,
              retrieved_at,
              content_sha256,
              response_body
            )
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            observerSourceId,
            run.rows[0]!.id,
            source.rows[0]!.id,
            `2099-05-01T00:0${index}:00.000Z`,
            String(index + 1).repeat(64),
            "raw-presence-snapshot-" + index,
          ],
        );
        runIds.push(run.rows[0]!.id);
        sourceIds.push(source.rows[0]!.id);
      }

      const remoteIds = ["presence-alpha", "presence-beta", "presence-gamma"];
      const candidateIds = new Map<string, string>();
      for (const remoteModelId of remoteIds) {
        const candidate = await verification.query<{ id: string }>(
          `INSERT INTO modelapse.catalog_discovery_candidates
            (
              provider_id,
              remote_model_id,
              first_seen_at,
              last_seen_at,
              first_source_record_id,
              last_source_record_id,
              first_collection_run_id,
              last_collection_run_id,
              observation_count,
              status
            )
           VALUES ($1, $2, '2099-05-01T00:00:00Z', '2099-05-01T00:03:00Z', $3, $4, $5, $6, 1, 'discovered')
           RETURNING id`,
          [
            providerId,
            remoteModelId,
            sourceIds[0]!,
            sourceIds[3]!,
            runIds[0]!,
            runIds[3]!,
          ],
        );
        candidateIds.set(remoteModelId, candidate.rows[0]!.id);
      }

      const observations = [
        [0, "presence-alpha"],
        [0, "presence-beta"],
        [1, "presence-alpha"],
        [1, "presence-gamma"],
        [2, "presence-beta"],
        [3, "presence-alpha"],
        [3, "presence-beta"],
        [3, "presence-gamma"],
      ] as const;
      for (const [runIndex, remoteModelId] of observations) {
        await verification.query(
          `INSERT INTO modelapse.catalog_discovery_observations
            (candidate_id, collection_run_id, source_record_id, observed_at)
           VALUES ($1, $2, $3, $4)`,
          [
            candidateIds.get(remoteModelId)!,
            runIds[runIndex]!,
            sourceIds[runIndex]!,
            `2099-05-01T00:0${runIndex}:00.000Z`,
          ],
        );
      }

      const factCountsBefore = await verification.query(
        `SELECT
           (SELECT count(*)::text FROM modelapse.catalog_source_snapshots) AS snapshots,
           (SELECT count(*)::text FROM modelapse.catalog_discovery_observations) AS observations,
           (SELECT count(*)::text FROM modelapse.catalog_discovery_candidates) AS candidates`,
      );

      const history = await presence.getProvider(providerId, { runLimit: 10 });
      expect(history).not.toBeNull();
      expect(history!.summary).toMatchObject({
        evidenceRuns: 4,
        completeProjectionRuns: 3,
        incompleteProjectionRuns: 1,
        appearanceEvents: 1,
        absenceEvents: 1,
        reappearanceEvents: 1,
      });

      expect(history!.runs.find((run) => run.runId === runIds[2])).toMatchObject({
        itemCount: 3,
        projectedItemCount: 1,
        completeProjection: false,
      });

      expect(history!.events).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: "not_observed_in_complete_snapshot",
            remoteModelId: "presence-beta",
            runId: runIds[1],
            interpretation: "not_observed_in_complete_model_list_evidence",
          }),
          expect.objectContaining({
            kind: "reobserved_in_complete_snapshot",
            remoteModelId: "presence-beta",
            runId: runIds[3],
            previousCompleteRunId: runIds[1],
          }),
        ]),
      );
      expect(
        history!.events.some(
          (event) =>
            event.runId === runIds[2] &&
            event.kind === "not_observed_in_complete_snapshot",
        ),
      ).toBe(false);
      expect(JSON.stringify(history)).not.toContain("raw-presence-snapshot");
      expect(JSON.stringify(history)).not.toContain("response_body");
      expect(JSON.stringify(history)).not.toContain("responseBody");

      const factCountsAfter = await verification.query(
        `SELECT
           (SELECT count(*)::text FROM modelapse.catalog_source_snapshots) AS snapshots,
           (SELECT count(*)::text FROM modelapse.catalog_discovery_observations) AS observations,
           (SELECT count(*)::text FROM modelapse.catalog_discovery_candidates) AS candidates`,
      );
      expect(factCountsAfter.rows[0]).toEqual(factCountsBefore.rows[0]);
    } finally {
      await presence.close();
      await verification.end();
    }
  });

  it("reviews derived presence gaps without mutating catalog identity facts", async () => {
    const verification = new Pool({ connectionString: isolatedDatabaseUrl });
    const review = PgCatalogPresenceReview.connect(isolatedDatabaseUrl);
    try {
      const provider = await verification.query<{ id: string }>(
        `INSERT INTO modelapse.providers (slug, name)
         VALUES ('presence-review-fixture', 'Presence Review Fixture')
         RETURNING id`,
      );
      const providerId = provider.rows[0]!.id;

      const observerSource = await verification.query<{ id: string }>(
        `INSERT INTO modelapse.catalog_observer_sources
          (provider_id, source_key, source_kind, url, title, parser, interval_seconds)
         VALUES (
           $1,
           'models-api',
           'model_list',
           'https://presence-review.example.test/models',
           'Presence review fixture catalog',
           'openai_models',
           3600
         )
         RETURNING id`,
        [providerId],
      );
      const observerSourceId = observerSource.rows[0]!.id;

      const runIds: string[] = [];
      const sourceIds: string[] = [];
      for (let index = 0; index < 2; index += 1) {
        const source = await verification.query<{ id: string }>(
          `INSERT INTO modelapse.source_records
            (source_type, url, title, retrieved_at, content_sha256)
           VALUES (
             'provider_catalog',
             'https://presence-review.example.test/models',
             'Presence review fixture catalog',
             $1,
             $2
           )
           RETURNING id`,
          [
            `2099-06-01T00:0${index}:00.000Z`,
            String(index + 7).repeat(64),
          ],
        );
        const run = await verification.query<{ id: string }>(
          `INSERT INTO modelapse.catalog_collection_runs
            (
              observer_source_id,
              status,
              started_at,
              completed_at,
              item_count,
              observations_emitted,
              collector_build
            )
           VALUES (
             $1,
             'succeeded',
             $2,
             $3,
             $4,
             $4,
             'presence-review-fixture'
           )
           RETURNING id`,
          [
            observerSourceId,
            `2099-06-01T00:0${index}:00.000Z`,
            `2099-06-01T00:0${index}:30.000Z`,
            index === 0 ? 2 : 1,
          ],
        );
        await verification.query(
          `INSERT INTO modelapse.catalog_source_snapshots
            (
              observer_source_id,
              collection_run_id,
              source_record_id,
              retrieved_at,
              content_sha256,
              response_body
            )
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            observerSourceId,
            run.rows[0]!.id,
            source.rows[0]!.id,
            `2099-06-01T00:0${index}:00.000Z`,
            String(index + 7).repeat(64),
            "raw-presence-review-" + index,
          ],
        );
        runIds.push(run.rows[0]!.id);
        sourceIds.push(source.rows[0]!.id);
      }

      const candidateIds = new Map<string, string>();
      for (const remoteModelId of ["presence-review-alpha", "presence-review-beta"]) {
        const candidate = await verification.query<{ id: string }>(
          `INSERT INTO modelapse.catalog_discovery_candidates
            (
              provider_id,
              remote_model_id,
              first_seen_at,
              last_seen_at,
              first_source_record_id,
              last_source_record_id,
              first_collection_run_id,
              last_collection_run_id,
              observation_count,
              status
            )
           VALUES (
             $1,
             $2,
             '2099-06-01T00:00:00Z',
             '2099-06-01T00:01:00Z',
             $3,
             $4,
             $5,
             $6,
             1,
             'discovered'
           )
           RETURNING id`,
          [
            providerId,
            remoteModelId,
            sourceIds[0]!,
            sourceIds[1]!,
            runIds[0]!,
            runIds[1]!,
          ],
        );
        candidateIds.set(remoteModelId, candidate.rows[0]!.id);
      }

      for (const [runIndex, remoteModelId] of [
        [0, "presence-review-alpha"],
        [0, "presence-review-beta"],
        [1, "presence-review-alpha"],
      ] as const) {
        await verification.query(
          `INSERT INTO modelapse.catalog_discovery_observations
            (candidate_id, collection_run_id, source_record_id, observed_at)
           VALUES ($1, $2, $3, $4)`,
          [
            candidateIds.get(remoteModelId)!,
            runIds[runIndex]!,
            sourceIds[runIndex]!,
            `2099-06-01T00:0${runIndex}:00.000Z`,
          ],
        );
      }

      const factsBefore = await verification.query(
        `SELECT
           (SELECT count(*)::text FROM modelapse.models) AS models,
           (SELECT count(*)::text FROM modelapse.model_execution_bindings) AS bindings,
           (SELECT count(*)::text FROM modelapse.catalog_discovery_candidates) AS candidates,
           (SELECT count(*)::text FROM modelapse.catalog_discovery_observations) AS observations`,
      );

      const open = await review.list({ status: "open" });
      const item = open.find(
        (candidate) =>
          candidate.provider.id === providerId &&
          candidate.remoteModelId === "presence-review-beta",
      );
      expect(item).toMatchObject({
        interpretation: "not_observed_in_complete_model_list_evidence",
        review: { status: "open" },
        previousCompleteRunId: runIds[0],
        runId: runIds[1],
      });

      const acknowledged = await review.decide({
        providerId,
        eventId: item!.eventId,
        action: "acknowledge",
        actor: "presence-review-test",
        note: "checked provider catalog evidence",
      });
      expect(acknowledged.status).toBe("acknowledged");

      const acknowledgedItems = await review.list({ status: "acknowledged" });
      expect(
        acknowledgedItems.find((candidate) => candidate.eventId === item!.eventId),
      ).toMatchObject({
        review: {
          status: "acknowledged",
          latestDecision: {
            action: "acknowledge",
            actor: "presence-review-test",
          },
        },
      });

      const resolved = await review.decide({
        providerId,
        eventId: item!.eventId,
        action: "resolve",
        actor: "presence-review-test",
        note: "review completed without lifecycle inference",
      });
      expect(resolved.status).toBe("resolved");

      const reopened = await review.decide({
        providerId,
        eventId: item!.eventId,
        action: "reopen",
        actor: "presence-review-test",
      });
      expect(reopened.status).toBe("open");

      const audit = await verification.query<{ count: string }>(
        `SELECT count(*)::text AS count
           FROM modelapse.catalog_presence_review_events
          WHERE presence_event_id = $1`,
        [item!.eventId],
      );
      expect(audit.rows[0]?.count).toBe("3");

      await expect(
        verification.query(
          `UPDATE modelapse.catalog_presence_review_events
              SET note = 'mutated'
            WHERE presence_event_id = $1`,
          [item!.eventId],
        ),
      ).rejects.toThrow();

      const factsAfter = await verification.query(
        `SELECT
           (SELECT count(*)::text FROM modelapse.models) AS models,
           (SELECT count(*)::text FROM modelapse.model_execution_bindings) AS bindings,
           (SELECT count(*)::text FROM modelapse.catalog_discovery_candidates) AS candidates,
           (SELECT count(*)::text FROM modelapse.catalog_discovery_observations) AS observations`,
      );
      expect(factsAfter.rows[0]).toEqual(factsBefore.rows[0]);

      const allItems = await review.list();
      expect(JSON.stringify(allItems)).not.toContain("raw-presence-review");
      expect(JSON.stringify(allItems)).not.toContain("response_body");
      expect(JSON.stringify(allItems)).not.toContain("responseBody");
    } finally {
      await review.close();
      await verification.end();
    }
  });

  it("builds one remote ID evidence case across discovery, promotion, presence, and review facts", async () => {
    const verification = new Pool({ connectionString: isolatedDatabaseUrl });
    const review = PgCatalogPresenceReview.connect(isolatedDatabaseUrl);
    const remoteCases = PgCatalogRemoteIdCase.connect(isolatedDatabaseUrl);
    try {
      const provider = await verification.query<{ id: string }>(
        `INSERT INTO modelapse.providers (slug, name)
         VALUES ('remote-case-fixture', 'Remote Case Fixture')
         RETURNING id`,
      );
      const providerId = provider.rows[0]!.id;

      const observerSource = await verification.query<{ id: string }>(
        `INSERT INTO modelapse.catalog_observer_sources
          (provider_id, source_key, source_kind, url, title, parser, interval_seconds)
         VALUES (
           $1,
           'models-api',
           'model_list',
           'https://remote-case.example.test/models',
           'Remote case fixture catalog',
           'openai_models',
           3600
         )
         RETURNING id`,
        [providerId],
      );
      const observerSourceId = observerSource.rows[0]!.id;

      const runIds: string[] = [];
      const sourceIds: string[] = [];
      const shas = ["a".repeat(64), "b".repeat(64), "c".repeat(64)];
      for (let index = 0; index < 3; index += 1) {
        const source = await verification.query<{ id: string }>(
          `INSERT INTO modelapse.source_records
            (source_type, url, title, retrieved_at, content_sha256)
           VALUES (
             'provider_catalog',
             'https://remote-case.example.test/models',
             'Remote case fixture catalog',
             $1,
             $2
           )
           RETURNING id`,
          [`2099-07-01T00:0${index}:00.000Z`, shas[index]],
        );
        const run = await verification.query<{ id: string }>(
          `INSERT INTO modelapse.catalog_collection_runs
            (
              observer_source_id,
              status,
              started_at,
              completed_at,
              item_count,
              observations_emitted,
              collector_build
            )
           VALUES (
             $1,
             'succeeded',
             $2,
             $3,
             1,
             1,
             'remote-case-fixture'
           )
           RETURNING id`,
          [
            observerSourceId,
            `2099-07-01T00:0${index}:00.000Z`,
            `2099-07-01T00:0${index}:30.000Z`,
          ],
        );
        await verification.query(
          `INSERT INTO modelapse.catalog_source_snapshots
            (
              observer_source_id,
              collection_run_id,
              source_record_id,
              retrieved_at,
              content_sha256,
              response_body
            )
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            observerSourceId,
            run.rows[0]!.id,
            source.rows[0]!.id,
            `2099-07-01T00:0${index}:00.000Z`,
            shas[index],
            "raw-remote-case-secret-" + index,
          ],
        );
        sourceIds.push(source.rows[0]!.id);
        runIds.push(run.rows[0]!.id);
      }

      const model = await verification.query<{ id: string }>(
        `INSERT INTO modelapse.models
          (provider_id, canonical_slug, marketing_name, status, canonical_source_id)
         VALUES ($1, 'remote-case-model', 'Remote Case Model', 'active', $2)
         RETURNING id`,
        [providerId, sourceIds[0]],
      );
      const modelId = model.rows[0]!.id;

      const targetCandidate = await verification.query<{ id: string }>(
        `INSERT INTO modelapse.catalog_discovery_candidates
          (
            provider_id,
            remote_model_id,
            first_seen_at,
            last_seen_at,
            first_source_record_id,
            last_source_record_id,
            first_collection_run_id,
            last_collection_run_id,
            observation_count,
            status,
            resolved_model_id,
            resolved_at
          )
         VALUES (
           $1,
           'remote-case-target',
           '2099-07-01T00:00:00Z',
           '2099-07-01T00:00:00Z',
           $2,
           $2,
           $3,
           $3,
           1,
           'matched',
           $4,
           '2099-07-01T00:00:20Z'
         )
         RETURNING id`,
        [providerId, sourceIds[0], runIds[0], modelId],
      );
      const targetCandidateId = targetCandidate.rows[0]!.id;

      await verification.query(
        `INSERT INTO modelapse.catalog_discovery_observations
          (candidate_id, collection_run_id, source_record_id, observed_at)
         VALUES ($1, $2, $3, '2099-07-01T00:00:00Z')`,
        [targetCandidateId, runIds[0], sourceIds[0]],
      );

      await verification.query(
        `INSERT INTO modelapse.catalog_reconciliation_events
          (candidate_id, action, resolved_model_id, decided_at, actor, note)
         VALUES (
           $1,
           'match_existing',
           $2,
           '2099-07-01T00:00:20Z',
           'remote-case-test',
           'matched to canonical model'
         )`,
        [targetCandidateId, modelId],
      );

      await verification.query(
        `INSERT INTO modelapse.catalog_promotion_events
          (
            candidate_id,
            model_id,
            source_record_id,
            canonical_slug,
            marketing_name,
            model_status,
            actor,
            promoted_at,
            policy_version,
            evidence
          )
         VALUES (
           $1,
           $2,
           $3,
           'remote-case-model',
           'Remote Case Model',
           'active',
           'remote-case-test',
           '2099-07-01T00:00:25Z',
           'provider-catalog-v1',
           $4::jsonb
         )`,
        [
          targetCandidateId,
          modelId,
          sourceIds[0],
          JSON.stringify({
            sourceRecordId: sourceIds[0],
            sourceType: "provider_catalog",
            contentSha256: shas[0],
          }),
        ],
      );

      const alias = await verification.query<{ id: string }>(
        `INSERT INTO modelapse.model_aliases (provider_id, alias)
         VALUES ($1, 'remote-case-target')
         RETURNING id`,
        [providerId],
      );
      await verification.query(
        `INSERT INTO modelapse.alias_resolution_events
          (
            alias_id,
            resolved_model_id,
            observed_at,
            source_type,
            source_id
          )
         VALUES (
           $1,
           $2,
           '2099-07-01T00:01:00Z',
           'provider_catalog',
           $3
         )`,
        [alias.rows[0]!.id, modelId, sourceIds[1]],
      );

      const otherCandidate = await verification.query<{ id: string }>(
        `INSERT INTO modelapse.catalog_discovery_candidates
          (
            provider_id,
            remote_model_id,
            first_seen_at,
            last_seen_at,
            first_source_record_id,
            last_source_record_id,
            first_collection_run_id,
            last_collection_run_id,
            observation_count,
            status
          )
         VALUES (
           $1,
           'remote-case-other',
           '2099-07-01T00:02:00Z',
           '2099-07-01T00:02:00Z',
           $2,
           $2,
           $3,
           $3,
           1,
           'discovered'
         )
         RETURNING id`,
        [providerId, sourceIds[2], runIds[2]],
      );
      await verification.query(
        `INSERT INTO modelapse.catalog_discovery_observations
          (candidate_id, collection_run_id, source_record_id, observed_at)
         VALUES ($1, $2, $3, '2099-07-01T00:02:00Z')`,
        [otherCandidate.rows[0]!.id, runIds[2], sourceIds[2]],
      );

      const openReviews = await review.list({ status: "open" });
      const absence = openReviews.find(
        (item) =>
          item.provider.id === providerId &&
          item.remoteModelId === "remote-case-target",
      );
      expect(absence).toMatchObject({
        runId: runIds[2],
        previousCompleteRunId: runIds[1],
        interpretation: "not_observed_in_complete_model_list_evidence",
      });

      await review.decide({
        providerId,
        eventId: absence!.eventId,
        action: "acknowledge",
        actor: "remote-case-reviewer",
        note: "checked model-list evidence",
      });

      const factsBefore = await verification.query(
        `SELECT
           (SELECT count(*)::text FROM modelapse.catalog_discovery_observations) AS discovery_observations,
           (SELECT count(*)::text FROM modelapse.alias_resolution_events) AS alias_observations,
           (SELECT count(*)::text FROM modelapse.catalog_reconciliation_events) AS reconciliations,
           (SELECT count(*)::text FROM modelapse.catalog_promotion_events) AS promotions,
           (SELECT count(*)::text FROM modelapse.catalog_presence_reviews) AS presence_reviews,
           (SELECT count(*)::text FROM modelapse.catalog_presence_review_events) AS presence_review_events`,
      );

      const remoteCase = await remoteCases.get(providerId, "remote-case-target");
      expect(remoteCase).not.toBeNull();
      expect(remoteCase!.provider).toMatchObject({
        id: providerId,
        slug: "remote-case-fixture",
      });
      expect(remoteCase!.current).toMatchObject({
        candidate: {
          id: targetCandidateId,
          status: "matched",
          resolvedModel: { id: modelId },
        },
        canonicalModel: {
          id: modelId,
          canonicalSlug: "remote-case-model",
          marketingName: "Remote Case Model",
          status: "active",
        },
        promotion: {
          modelId,
          actor: "remote-case-test",
          policyVersion: "provider-catalog-v1",
        },
      });
      expect(remoteCase!.summary).toMatchObject({
        observationEvents: 2,
        presenceTransitions: 1,
        reconciliationEvents: 1,
        reviewDecisions: 1,
        openPresenceReviews: 0,
        acknowledgedPresenceReviews: 1,
        resolvedPresenceReviews: 0,
      });
      expect(remoteCase!.presenceReviews).toEqual([
        expect.objectContaining({
          eventId: absence!.eventId,
          status: "acknowledged",
          decisions: [
            expect.objectContaining({
              action: "acknowledge",
              actor: "remote-case-reviewer",
            }),
          ],
        }),
      ]);
      expect(remoteCase!.timeline.map((event) => event.kind)).toEqual(
        expect.arrayContaining([
          "discovery_observation",
          "reconciliation",
          "promotion",
          "canonical_observation",
          "presence_not_observed",
          "presence_review",
        ]),
      );
      expect(JSON.stringify(remoteCase)).not.toContain("raw-remote-case-secret");
      expect(JSON.stringify(remoteCase)).not.toContain("response_body");
      expect(JSON.stringify(remoteCase)).not.toContain("responseBody");
      expect(JSON.stringify(remoteCase)).not.toContain("raw_observation");

      const factsAfter = await verification.query(
        `SELECT
           (SELECT count(*)::text FROM modelapse.catalog_discovery_observations) AS discovery_observations,
           (SELECT count(*)::text FROM modelapse.alias_resolution_events) AS alias_observations,
           (SELECT count(*)::text FROM modelapse.catalog_reconciliation_events) AS reconciliations,
           (SELECT count(*)::text FROM modelapse.catalog_promotion_events) AS promotions,
           (SELECT count(*)::text FROM modelapse.catalog_presence_reviews) AS presence_reviews,
           (SELECT count(*)::text FROM modelapse.catalog_presence_review_events) AS presence_review_events`,
      );
      expect(factsAfter.rows[0]).toEqual(factsBefore.rows[0]);
    } finally {
      await remoteCases.close();
      await review.close();
      await verification.end();
    }
  });

  it("archives provider testability access, cost, region, and environment evidence append-only", async () => {
    const verification = new Pool({ connectionString: isolatedDatabaseUrl });
    const registry = PgProviderTestability.connect(isolatedDatabaseUrl);
    try {
      const provider = await verification.query<{ id: string }>(
        `INSERT INTO modelapse.providers (slug, name)
         VALUES ('testability-fixture', 'Testability Fixture')
         RETURNING id`,
      );
      const providerId = provider.rows[0]!.id;

      const model = await verification.query<{ id: string }>(
        `INSERT INTO modelapse.models
          (provider_id, canonical_slug, marketing_name, status)
         VALUES ($1, 'testability-model', 'Testability Model', 'active')
         RETURNING id`,
        [providerId],
      );
      const modelId = model.rows[0]!.id;

      const otherProvider = await verification.query<{ id: string }>(
        `INSERT INTO modelapse.providers (slug, name)
         VALUES ('testability-other', 'Testability Other')
         RETURNING id`,
      );
      const otherModel = await verification.query<{ id: string }>(
        `INSERT INTO modelapse.models
          (provider_id, canonical_slug, marketing_name, status)
         VALUES ($1, 'other-model', 'Other Model', 'active')
         RETURNING id`,
        [otherProvider.rows[0]!.id],
      );

      const policy = await registry.recordObservation({
        providerId,
        executionPath: "first_party_direct",
        subjectKind: "provider_policy",
        accessState: "restricted",
        registrationRequirement: "restricted_signup",
        billingRequirement: "prepaid_credit",
        regionPolicy: "restricted",
        allowedRegions: ["US", "JP"],
        blockedRegions: ["ZZ"],
        serviceAssurance: "documented_variant",
        pricing: {
          currency: "USD",
          inputPerMillion: 1.25,
          outputPerMillion: 4.5,
        },
        source: {
          sourceType: "provider_policy",
          url: "https://testability.example.test/policy",
          title: "Fixture access policy",
          contentSha256: "d".repeat(64),
        },
        observedAt: "2099-08-01T00:00:00Z",
        actor: "testability-test",
        note: "documented provider policy",
      });

      const uncertain = await registry.recordObservation({
        providerId,
        modelId,
        executionPath: "first_party_direct",
        subjectKind: "runner_access",
        accessState: "available",
        accountTier: "paid-standard",
        serviceTier: "default",
        serviceAssurance: "operator_uncertain",
        source: {
          sourceType: "operator_verification",
          title: "Runner access verification",
        },
        observedAt: "2099-08-01T00:01:00Z",
        actor: "testability-test",
        note: "access works but representative service is not yet calibrated",
      });

      const before = await registry.getProvider(providerId);
      expect(before).not.toBeNull();
      expect(before!.summary).toMatchObject({
        modelCount: 1,
        currentObservationCount: 2,
        providerPolicyCount: 1,
        runnerAccessCount: 1,
        restrictedOrUnavailableCount: 1,
        uncertainServiceCount: 1,
      });
      expect(before!.current).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: policy.observationId,
            subjectKind: "provider_policy",
            accessState: "restricted",
            allowedRegions: ["US", "JP"],
            pricing: expect.objectContaining({
              currency: "USD",
              inputPerMillion: "1.250000",
              outputPerMillion: "4.500000",
            }),
            source: expect.objectContaining({
              sourceType: "provider_policy",
              contentSha256: "d".repeat(64),
            }),
          }),
          expect.objectContaining({
            id: uncertain.observationId,
            subjectKind: "runner_access",
            serviceAssurance: "operator_uncertain",
            accountTier: "paid-standard",
            serviceTier: "default",
          }),
        ]),
      );

      const confirmed = await registry.recordObservation({
        providerId,
        modelId,
        executionPath: "first_party_direct",
        subjectKind: "runner_access",
        accessState: "available",
        accountTier: "paid-standard",
        serviceTier: "default",
        serviceAssurance: "documented_default",
        source: {
          sourceType: "operator_verification",
          title: "Runner access re-verification",
        },
        observedAt: "2099-08-01T00:02:00Z",
        actor: "testability-test",
        note: "later evidence supersedes only the current projection",
      });

      const after = await registry.getProvider(providerId);
      expect(after).not.toBeNull();
      expect(after!.summary).toMatchObject({
        currentObservationCount: 2,
        uncertainServiceCount: 0,
      });
      expect(
        after!.current.find(
          (item) =>
            item.subjectKind === "runner_access" &&
            item.model?.id === modelId,
        ),
      ).toMatchObject({
        id: confirmed.observationId,
        serviceAssurance: "documented_default",
      });
      expect(after!.history.map((item) => item.id)).toEqual(
        expect.arrayContaining([
          policy.observationId,
          uncertain.observationId,
          confirmed.observationId,
        ]),
      );

      const listed = await registry.listProviders();
      expect(
        listed.find((item) => item.provider.id === providerId),
      ).toMatchObject({
        providerPolicyCount: 1,
        runnerAccessCount: 1,
        uncertainServiceCount: 0,
      });

      await expect(
        verification.query(
          `UPDATE modelapse.provider_testability_observations
              SET note = 'rewritten'
            WHERE id = $1`,
          [policy.observationId],
        ),
      ).rejects.toThrow(/append-only/);

      await expect(
        registry.recordObservation({
          providerId,
          modelId: otherModel.rows[0]!.id,
          executionPath: "first_party_direct",
          subjectKind: "runner_access",
          accessState: "available",
          serviceAssurance: "unknown",
          source: {
            sourceType: "operator_verification",
            title: "Invalid cross-provider model",
          },
          actor: "testability-test",
        }),
      ).rejects.toThrow(/model provider mismatch/);

      expect(JSON.stringify(after)).not.toContain("api_key");
      expect(JSON.stringify(after)).not.toContain("password");
      expect(JSON.stringify(after)).not.toContain("response_body");
    } finally {
      await registry.close();
      await verification.end();
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

    const verification = new Pool({ connectionString: isolatedDatabaseUrl });
    try {
      const capabilities = await verification.query<{
        capability: string;
        support_state: string;
      }>(
        `SELECT capability, support_state
           FROM modelapse.provider_capability_current
          WHERE provider_id = $1
          ORDER BY capability`,
        [first.providerId],
      );
      expect(capabilities.rows).toEqual(
        expect.arrayContaining([
          { capability: "returned_model_metadata", support_state: "supported" },
          { capability: "model_version_metadata", support_state: "unsupported" },
          { capability: "provider_request_id", support_state: "supported" },
          { capability: "provider_response_id", support_state: "supported" },
          { capability: "service_tier_metadata", support_state: "unsupported" },
          { capability: "token_usage", support_state: "supported" },
        ]),
      );
    } finally {
      await verification.end();
    }
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

      const capabilities = await verification.query<{
        capability: string;
        support_state: string;
      }>(
        `SELECT capability, support_state
           FROM modelapse.provider_capability_current
          WHERE provider_id = $1
          ORDER BY capability`,
        [first.providerId],
      );
      expect(capabilities.rows).toEqual(
        expect.arrayContaining([
          { capability: "returned_model_metadata", support_state: "supported" },
          { capability: "model_version_metadata", support_state: "unsupported" },
          { capability: "provider_request_id", support_state: "supported" },
          { capability: "provider_response_id", support_state: "supported" },
          { capability: "service_tier_metadata", support_state: "supported" },
          { capability: "token_usage", support_state: "supported" },
        ]),
      );
    } finally {
      await verification.end();
    }
  });

  it("bootstraps the service-health calibration Test Case idempotently", async () => {
    const calibration = PgServiceCalibrationCatalog.connect(
      isolatedDatabaseUrl,
      new FileSystemContentAddressedBlobStore(root),
    );
    const verification = new Pool({ connectionString: isolatedDatabaseUrl });
    try {
      const first = await calibration.bootstrap({
        runnerBuild: "calibration-bootstrap-a",
      });
      const second = await calibration.bootstrap({
        runnerBuild: "calibration-bootstrap-b",
      });
      expect(second).toEqual(first);

      const row = await verification.query<{
        case_type: string;
        visibility: string;
        status: string;
        expected: string | null;
        assertion: string | null;
        leaderboard_eligible: string | null;
        evaluator_slug: string;
        evaluator_version: string;
      }>(
        `SELECT
           tc.case_type,
           tc.visibility,
           tc.status,
           tc.metadata->>'expected' AS expected,
           tc.metadata->>'assertion' AS assertion,
           tc.metadata->>'leaderboardEligible' AS leaderboard_eligible,
           evaluator.slug AS evaluator_slug,
           evaluator.version AS evaluator_version
         FROM modelapse.test_cases tc
         JOIN modelapse.test_version_evaluators binding
           ON binding.test_version_id = tc.test_version_id
         JOIN modelapse.evaluators evaluator
           ON evaluator.id = binding.evaluator_id
        WHERE tc.id = $1`,
        [first.testCaseId],
      );

      expect(row.rows[0]).toMatchObject({
        case_type: "calibration",
        visibility: "public",
        status: "active",
        expected: "modelapse-calibration-ok",
        assertion: "exact-text",
        leaderboard_eligible: "false",
        evaluator_slug: "exact-text",
        evaluator_version: "1.0.0",
      });
    } finally {
      await verification.end();
      await calibration.close();
    }
  });

});
