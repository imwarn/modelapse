import { serve } from "@hono/node-server";
import {
  PgCatalogCoverage,
  PgCatalogDiscovery,
  PgCatalogDriftReview,
  PgCatalogIdentityCase,
  PgCatalogIntegrity,
  PgCatalogPresence,
  PgCatalogPresenceReview,
  PgCatalogRemoteIdCase,
  PgProviderTestability,
} from "@modelapse/catalog-admin";
import {
  PgExecutionFleet,
  PgRunJobQueue,
  PgRunPlanner,
} from "@modelapse/control-plane";
import {
  PgArchiveRepository,
  PgCalibrationRepository,
  PgComparabilityRepository,
  PgCostLedger,
  PgRunRepository,
} from "@modelapse/persistence";
import { createApp } from "./app.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

const runs = PgRunRepository.connect(databaseUrl);
const jobs = PgRunJobQueue.connect(databaseUrl);
const fleet = PgExecutionFleet.connect(databaseUrl);
const planner = PgRunPlanner.connect(databaseUrl);
const archive = PgArchiveRepository.connect(databaseUrl);
const costLedger = PgCostLedger.connect(databaseUrl);
const calibration = PgCalibrationRepository.connect(databaseUrl);
const comparability = PgComparabilityRepository.connect(databaseUrl);
const catalogCoverage = PgCatalogCoverage.connect(databaseUrl);
const catalogDiscovery = PgCatalogDiscovery.connect(databaseUrl);
const catalogDriftReview = PgCatalogDriftReview.connect(databaseUrl);
const catalogIdentityCase = PgCatalogIdentityCase.connect(databaseUrl);
const catalogIntegrity = PgCatalogIntegrity.connect(databaseUrl);
const catalogPresence = PgCatalogPresence.connect(databaseUrl);
const catalogPresenceReview = PgCatalogPresenceReview.connect(databaseUrl);
const catalogRemoteIdCase = PgCatalogRemoteIdCase.connect(databaseUrl);
const providerTestability = PgProviderTestability.connect(databaseUrl);
const controlToken = process.env.MODELAPSE_CONTROL_TOKEN;
const port = Number(process.env.PORT ?? "3000");
const app = createApp({
  runs,
  jobs,
  fleet,
  planner,
  archive,
  costLedger,
  calibration,
  comparability,
  catalogCoverage,
  catalogDiscovery,
  catalogDriftReview,
  catalogIdentityCase,
  catalogIntegrity,
  catalogPresence,
  catalogPresenceReview,
  catalogRemoteIdCase,
  providerTestability,
  ...(controlToken ? { controlToken } : {}),
});

const server = serve({
  fetch: app.fetch,
  port,
});

let shuttingDown = false;

function shutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(signal + ": shutting down modelapse-api");

  server.close((error) => {
    void Promise.all([
      runs.close(),
      jobs.close(),
      fleet.close(),
      planner.close(),
      archive.close(),
      costLedger.close(),
      calibration.close(),
      comparability.close(),
      catalogCoverage.close(),
      catalogDiscovery.close(),
      catalogDriftReview.close(),
      catalogIdentityCase.close(),
      catalogIntegrity.close(),
      catalogPresence.close(),
      catalogPresenceReview.close(),
      catalogRemoteIdCase.close(),
      providerTestability.close(),
    ]).finally(() => {
      if (error) {
        console.error(error);
        process.exit(1);
      }
      process.exit(0);
    });
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
