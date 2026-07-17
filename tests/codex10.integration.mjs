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

test("100-game codex10 measurement completes with all advanced invariants", async () => {
  const teams = createMlbAverageValidationTeams();
  const summary = await runMeasurementBatches({
    awayTeam: teams.away,
    homeTeam: teams.home,
    gameCount: 100,
    seed: 123456789,
  });

  assert.equal(summary.status, "completed");
  assert.equal(summary.run.completedGames, 100);
  assert.equal(summary.run.failedGames, 0);
  assert.ok(summary.plateDiscipline.combined.pitches > summary.results.combined.PA);
  assert.equal(summary.gameDistribution.games, 100);
  assert.equal(summary.players.away.length, 9);
  assert.equal(summary.players.home.length, 9);
  assert.ok(summary.pitchers.away.length >= 1);
  assert.ok(summary.pitchers.home.length >= 1);
  assert.ok(summary.smoothingDiagnostics.combined.targetWeight.count > 0);
  assert.equal(summary.simulationErrors.length, 0);
  for (const [key, value] of Object.entries(summary.diagnostics)) {
    assert.equal(value, 0, key);
  }
});
