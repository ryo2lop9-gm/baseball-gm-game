import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  createFastSimulationOptions,
  simulateGameMutable,
} from "../engine/core/engineCore.js";
import { createMlbAverageValidationTeams } from "../models/teamModels.js";
import { createInitialSimState } from "../state/gameState.js";
import { loadEvLaLookup } from "../services/evLaLookupStore.js";
import { createSeededRandom } from "../services/seededRandomService.js";
import {
  createGameMeasurementAccumulator,
  recordPitchMeasurementEvent,
  runMeasurementBatches,
} from "../services/measurement/measurementService.js";
import {
  createMeasurementHistogram,
  finalizeMeasurementHistogram,
  mergeMeasurementHistogram,
  recordMeasurementHistogram,
} from "../services/measurement/measurementHistogramService.js";
import {
  buildMeasurementJson,
  buildMeasurementMarkdown,
  buildMeasurementReportObject,
} from "../services/measurement/measurementReportService.js";

const lookup = JSON.parse(
  await readFile(new URL("../data/ev_la_lookup.json", import.meta.url), "utf8")
);
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => ({ ok: true, json: async () => lookup });
await loadEvLaLookup();
globalThis.fetch = originalFetch;

const deterministicTeams = createMlbAverageValidationTeams();

function runSingleGame({ measure }) {
  const teams = deterministicTeams;
  const state = createInitialSimState(
    structuredClone(teams.away),
    structuredClone(teams.home)
  );
  const seeded = createSeededRandom(246813579);
  let randomCalls = 0;
  const pitches = [];
  const battedBalls = [];
  const random = () => {
    randomCalls += 1;
    return seeded();
  };
  const runtime = { random };
  if (measure) {
    runtime.onPitchMeasurement = (event) => pitches.push(event);
    runtime.onBattedBallMeasurement = (event) => battedBalls.push(event);
  }
  simulateGameMutable(state, createFastSimulationOptions(runtime));
  return { state, randomCalls, pitches, battedBalls };
}

function sumGroup(group, key) {
  return Object.values(group?.combined || {}).reduce(
    (sum, entry) => sum + (Number(entry?.[key]) || 0),
    0
  );
}

test("pitch and batted-ball measurement hooks do not change RNG or game result", () => {
  const baseline = runSingleGame({ measure: false });
  const measured = runSingleGame({ measure: true });

  assert.equal(measured.randomCalls, baseline.randomCalls);
  assert.deepEqual(measured.state, baseline.state);
  assert.ok(measured.pitches.length > 0);

  const terminalPitches = measured.pitches.filter((event) => event.paResult);
  const inPlayPitches = measured.pitches.filter(
    (event) => event.pitchResult === "in_play"
  );
  const teamPA = [measured.state.awayTeam, measured.state.homeTeam].reduce(
    (sum, team) =>
      sum + team.lineup.reduce(
        (teamSum, player) => teamSum + (player.gameStats?.PA || 0),
        0
      ),
    0
  );

  assert.equal(terminalPitches.length, teamPA);
  assert.equal(inPlayPitches.length, measured.battedBalls.length);
  assert.equal(
    measured.pitches.filter((event) => event.madeContact).length,
    measured.pitches.filter((event) =>
      event.pitchResult === "foul" || event.pitchResult === "in_play"
    ).length
  );
  assert.ok(measured.pitches.every((event) =>
    ["away", "home"].includes(event.battingSide) &&
    Number.isInteger(event.ballsBefore) &&
    Number.isInteger(event.strikesBefore)
  ));
});

test("sparse measurement histograms merge and expose deterministic percentiles", () => {
  const first = createMeasurementHistogram(1);
  const second = createMeasurementHistogram(1);
  for (const value of [1, 2, 3, 4, 5]) recordMeasurementHistogram(first, value);
  for (const value of [6, 7, 8, 9, 10]) recordMeasurementHistogram(second, value);
  mergeMeasurementHistogram(first, second);
  const result = finalizeMeasurementHistogram(first);

  assert.equal(result.count, 10);
  assert.equal(result.average, 5.5);
  assert.equal(result.p10, 1);
  assert.equal(result.p50, 5);
  assert.equal(result.p90, 9);
  assert.equal(result.p95, 10);
  assert.equal(result.min, 1);
  assert.equal(result.max, 10);
});

test("invalid pitch events are diagnosed and excluded", () => {
  const game = createGameMeasurementAccumulator();
  assert.equal(recordPitchMeasurementEvent(game, {}), false);
  assert.equal(game.advanced.diagnostics.invalidPitchMeasurementEventCount, 1);
});

test("advanced aggregate groups and entity totals reconcile", async () => {
  const teams = createMlbAverageValidationTeams();
  const summary = await runMeasurementBatches({
    awayTeam: teams.away,
    homeTeam: teams.home,
    gameCount: 25,
    seed: 987654321,
  });
  const pitches = summary.plateDiscipline.combined.pitches;

  assert.equal(summary.status, "completed");
  assert.equal(summary.reportSchemaVersion, 2);
  assert.ok(pitches > 0);
  assert.equal(sumGroup(summary.breakdowns.count, "pitches"), pitches);
  assert.equal(sumGroup(summary.breakdowns.pitchType, "pitches"), pitches);
  assert.equal(sumGroup(summary.breakdowns.velocityBand, "pitches"), pitches);
  assert.equal(sumGroup(summary.breakdowns.course, "pitches"), pitches);
  assert.ok(Math.abs(
    Object.values(summary.breakdowns.pitchType.combined).reduce(
      (sum, value) => sum + value.usagePct,
      0
    ) - 1
  ) < 1e-12);
  assert.equal(summary.battingProfiles.combined.BIP, summary.battedBallMetrics.fairBattedBalls);
  assert.equal("exitVelocityHistogram" in summary.battingProfiles.combined, false);
  assert.equal("launchAngleHistogram" in summary.battingProfiles.combined, false);
  assert.equal(summary.gameDistribution.games, 25);
  for (const group of ["qoc", "source", "sampleQuality", "neighborMode"]) {
    assert.equal(
      Object.values(summary.breakdowns[group].combined).reduce(
        (sum, value) => sum + value.BIP,
        0
      ),
      summary.battedBallMetrics.fairBattedBalls
    );
  }
  assert.equal(
    [...summary.players.away, ...summary.players.home].reduce(
      (sum, player) => sum + player.PA,
      0
    ),
    summary.results.combined.PA
  );
  assert.equal(
    [...summary.pitchers.away, ...summary.pitchers.home].reduce(
      (sum, pitcher) => sum + pitcher.BF,
      0
    ),
    summary.results.combined.PA
  );
  for (const [key, value] of Object.entries(summary.diagnostics)) {
    assert.equal(value, 0, key);
  }
});

test("schema v2 report carries diagnostics, definitions, and explicit limitations", async () => {
  const teams = createMlbAverageValidationTeams();
  const summary = await runMeasurementBatches({
    awayTeam: teams.away,
    homeTeam: teams.home,
    gameCount: 2,
    seed: 13579,
  });
  const options = {
    summary,
    teams,
    generatedAt: "2026-07-18T00:00:00.000Z",
  };
  const report = buildMeasurementReportObject(options);
  const json = buildMeasurementJson(options);
  const markdown = buildMeasurementMarkdown(options);

  assert.equal(report.reportSchemaVersion, 2);
  for (const key of [
    "definitions",
    "modelLimitations",
    "gameDistribution",
    "plateDiscipline",
    "batting",
    "pitching",
    "players",
    "pitchers",
    "breakdowns",
    "smoothingDiagnostics",
  ]) {
    assert.ok(Object.hasOwn(report, key), key);
  }
  assert.match(report.definitions.qoc, /analysis label/);
  assert.equal(Object.hasOwn(report.breakdowns, "direction"), false);
  assert.ok(report.modelLimitations.unavailableMetrics.some(
    (item) => item.metric.includes("Direction")
  ));
  assert.match(markdown, /Plate Discipline/);
  assert.match(markdown, /Smoothing Percentiles/);
  assert.match(markdown, /Model Limitations/);
  assert.doesNotMatch(json, /NaN|Infinity|undefined/);
});
