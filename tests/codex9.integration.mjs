import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createMlbAverageValidationTeams } from "../models/teamModels.js";
import { loadEvLaLookup } from "../services/evLaLookupStore.js";
import { runMeasurementBatches } from "../services/measurement/measurementService.js";

const lookup = JSON.parse(
  await readFile(new URL("../data/ev_la_lookup.json", import.meta.url), "utf8")
);
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => ({ ok: true, json: async () => lookup });
await loadEvLaLookup();
globalThis.fetch = originalFetch;

test("100-game seeded measurement completes with real EV/LA diagnostics", async () => {
  const teams = createMlbAverageValidationTeams();
  const summary = await runMeasurementBatches({
    awayTeam: teams.away,
    homeTeam: teams.home,
    gameCount: 100,
    seed: 123456789,
  });
  const metrics = summary.battedBallMetrics;
  const sourceCount = Object.values(metrics.source).reduce(
    (sum, value) => sum + value.count,
    0
  );
  const modeCount = Object.values(metrics.neighborMode).reduce(
    (sum, value) => sum + value.count,
    0
  );

  assert.equal(summary.status, "completed");
  assert.equal(summary.run.completedGames, 100);
  assert.equal(summary.run.failedGames, 0);
  assert.ok(summary.run.gamesPerSecond > 0);
  assert.ok(metrics.fairBattedBalls > 0);
  assert.equal(sourceCount, metrics.fairBattedBalls);
  assert.equal(modeCount, metrics.fairBattedBalls);
  assert.equal(summary.diagnostics.unexpectedSourceCount, 0);
  assert.equal(summary.diagnostics.unknownNeighborModeCount, 0);
  assert.equal(summary.diagnostics.unknownSampleQualityCount, 0);
  assert.equal(summary.diagnostics.invalidMeasurementEventCount, 0);
  assert.equal(summary.diagnostics.negativeLaHomeRunCount, 0);
  assert.equal(summary.simulationErrors.length, 0);
});
