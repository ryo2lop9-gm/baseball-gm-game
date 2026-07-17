import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createTuningBootstrap } from "../bootstrap/tuningBootstrap.js";
import { simulateGame } from "../engine/game/gameEngine.js";
import { simulateSeason } from "../engine/game/seasonEngine.js";
import { loadEvLaLookup } from "../services/evLaLookupStore.js";

const lookup = JSON.parse(
  await readFile(new URL("../data/ev_la_lookup.json", import.meta.url), "utf8")
);

globalThis.fetch = async () => ({
  ok: true,
  status: 200,
  json: async () => lookup,
});

await loadEvLaLookup();

function createTeamsAndGame() {
  const tuning = createTuningBootstrap();
  const rosterBundle = tuning.createDefaultRosterBundle();

  return {
    teams: tuning.buildCurrentTuningTeams(rosterBundle),
    game: tuning.createFreshTuningGame(rosterBundle),
  };
}

test("a normal visible game completes with EV/LA smoothing in fair-ball logs", () => {
  const { game } = createTeamsAndGame();
  const result = simulateGame(game);
  const fairBallLogs = result.presentation.logLines.filter((line) =>
    line.includes("ev_la_")
  );

  assert.equal(result.isComplete, true);
  assert.ok(fairBallLogs.length > 0);
  assert.ok(
    fairBallLogs.some(
      (line) =>
        line.includes("ev_la_smoothed") || line.includes("ev_la_neighbor")
    )
  );
  assert.ok(fairBallLogs.every((line) => !line.includes("qoc_fallback")));
  assert.ok(
    fairBallLogs.every((line) => !line.includes("ev_la_emergency_fallback"))
  );
});

for (const gameCount of [10, 162]) {
  test(`${gameCount}-game fast simulation completes without isolated failures`, () => {
    const { teams } = createTeamsAndGame();
    const result = simulateSeason(teams.away, teams.home, gameCount);

    assert.equal(result.requestedGames, gameCount);
    assert.equal(result.completedGames, gameCount);
    assert.equal(result.failedGames, 0);
    assert.equal(result.aborted, false);
    assert.equal(result.simulationErrors.length, 0);
    assert.equal(
      Object.values(result.away.qoc).reduce((sum, value) => sum + value, 0) > 0,
      true
    );
    assert.equal(
      Object.values(result.home.qoc).reduce((sum, value) => sum + value, 0) > 0,
      true
    );
  });
}
