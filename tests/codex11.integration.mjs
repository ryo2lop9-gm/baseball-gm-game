import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  createFastSimulationOptions,
  simulateGameMutable,
} from "../engine/core/engineCore.js";
import { createGmBasicReferenceValidationTeams } from "../models/teamModels.js";
import { loadEvLaLookup } from "../services/evLaLookupStore.js";
import { runMeasurementBatches } from "../services/measurement/measurementService.js";
import { createSeededRandom } from "../services/seededRandomService.js";
import { createInitialSimState } from "../state/gameState.js";

const lookup = JSON.parse(
  await readFile(new URL("../data/ev_la_lookup.json", import.meta.url), "utf8")
);
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => ({ ok: true, json: async () => lookup });
await loadEvLaLookup();
globalThis.fetch = originalFetch;

test("GM reference normal simulation completes 1, 10, and 162 games", () => {
  const teams = createGmBasicReferenceValidationTeams();
  for (const gameCount of [1, 10, 162]) {
    const random = createSeededRandom(123456789);
    let completed = 0;
    for (let index = 0; index < gameCount; index += 1) {
      const state = createInitialSimState(
        structuredClone(teams.away),
        structuredClone(teams.home)
      );
      simulateGameMutable(state, createFastSimulationOptions({ random }));
      assert.equal(state.isComplete, true, `${gameCount} games: ${index}`);
      completed += 1;
    }
    assert.equal(completed, gameCount);
  }
});

test("GM reference high-speed measurement completes 100, 1000, and 10000 games", async () => {
  const teams = createGmBasicReferenceValidationTeams();
  for (const gameCount of [100, 1000, 10000]) {
    const summary = await runMeasurementBatches({
      awayTeam: teams.away,
      homeTeam: teams.home,
      gameCount,
      seed: 123456789,
    });
    assert.equal(summary.status, "completed", `${gameCount}.status`);
    assert.equal(summary.run.completedGames, gameCount, `${gameCount}.completed`);
    assert.equal(summary.run.failedGames, 0, `${gameCount}.failed`);
    assert.equal(summary.simulationErrors.length, 0, `${gameCount}.errors`);
    assert.equal(
      summary.contactDisposition.fouls + summary.contactDisposition.fairBattedBalls,
      summary.contactDisposition.contacts,
      `${gameCount}.contactDisposition`
    );
    for (const [key, value] of Object.entries(summary.diagnostics)) {
      assert.equal(value, 0, `${gameCount}.${key}`);
    }
  }
});
