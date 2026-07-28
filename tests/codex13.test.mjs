import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  createFastSimulationOptions,
  simulateGameMutable,
} from "../engine/core/engineCore.js";
import { createMlbAverageValidationTeams } from "../models/teamModels.js";
import { advanceRunnersOnHit } from "../services/baseRunningService.js";
import { applySelectedBattedBallOutcome } from "../services/battedBallOutcomeApplicationService.js";
import {
  selectBattedBallOutcome,
  selectOutcomeFromProbabilities,
} from "../services/battedBallOutcomeSelectionService.js";
import { resolveContactResult } from "../services/contactResolutionService.js";
import { loadEvLaLookup } from "../services/evLaLookupStore.js";
import {
  MEASUREMENT_REPORT_SCHEMA_VERSION,
  buildMeasurementReportObject,
} from "../services/measurement/measurementReportService.js";
import {
  MEASUREMENT_SUMMARY_SCHEMA_VERSION,
  runMeasurementBatches,
} from "../services/measurement/measurementService.js";
import { createSeededRandom } from "../services/seededRandomService.js";
import {
  addHitStat,
  addOutInPlayStat,
} from "../services/statsUpdateService.js";
import { createInitialSimState } from "../state/gameState.js";

const lookup = JSON.parse(
  await readFile(new URL("../data/ev_la_lookup.json", import.meta.url), "utf8")
);
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => ({ ok: true, json: async () => lookup });
await loadEvLaLookup();
globalThis.fetch = originalFetch;

const probabilities = Object.freeze({
  out: 0.1,
  single: 0.2,
  double: 0.3,
  triple: 0.15,
  homeRun: 0.25,
});
const compatibilityTeams = createMlbAverageValidationTeams();

function digest(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function normalizeStateForCompatibility(state) {
  const normalized = structuredClone(state);
  const visit = (value) => {
    if (!value || typeof value !== "object") return;
    delete value.defense;
    delete value.defensiveAlignment;
    delete value.pitchSequence;
    if (value.profile && typeof value.profile === "object") {
      value.profile.id = "<profile-id>";
      delete value.profile.bats;
      delete value.profile.throws;
      delete value.profile.directionType;
    }
    for (const child of Object.values(value)) visit(child);
  };
  visit(normalized);
  return normalized;
}

function normalizeSummaryForCompatibility(summary) {
  const normalized = structuredClone(summary);
  normalized.reportSchemaVersion = 3;
  normalized.run.elapsedMs = 0;
  normalized.run.gamesPerSecond = 0;
  delete normalized.run.directionMode;
  delete normalized.run.directionSeed;
  delete normalized.direction;
  for (const side of ["away", "home"]) {
    for (const player of normalized.players?.[side] || []) {
      player.key = "<player-key>";
    }
    for (const pitcher of normalized.pitchers?.[side] || []) {
      pitcher.key = "<pitcher-key>";
    }
  }
  return normalized;
}

function runSeed(seed) {
  const state = createInitialSimState(
    structuredClone(compatibilityTeams.away),
    structuredClone(compatibilityTeams.home)
  );
  const seeded = createSeededRandom(seed);
  let randomCalls = 0;
  const random = () => {
    randomCalls += 1;
    return seeded();
  };
  simulateGameMutable(state, createFastSimulationOptions({ random }));
  return {
    randomCalls,
    stateDigest: digest(normalizeStateForCompatibility(state)),
  };
}

function createApplicationHarness(selectedOutcome, occupiedBases = []) {
  const teams = createMlbAverageValidationTeams();
  const state = createInitialSimState(
    structuredClone(teams.away),
    structuredClone(teams.home)
  );
  const batter = state.awayTeam.lineup[0];
  const baseNames = ["first", "second", "third"];
  for (const base of occupiedBases) {
    const player = state.awayTeam.lineup[baseNames.indexOf(base) + 1];
    state.bases[base] = {
      side: "away",
      name: player.name,
      batterName: player.name,
    };
  }

  const calls = {
    qoc: 0,
    nextBatter: 0,
    finish: 0,
    maybeEnd: 0,
  };
  const logs = [];
  const patches = [];
  const events = [];
  const options = {
    onBattedBallMeasurement: (event) => events.push(event),
    pitchMeasurementContext: {
      battingSide: "away",
      defenseSide: "home",
      batterKey: "away:batter:0",
      batterName: batter.name,
      batterRatings: batter.ratings,
      lineupIndex: 0,
      pitcherKey: "home:pitcher:starter",
      pitcherName: state.homeTeam.startingPitcher.name,
      pitchType: "fourSeam",
      course: "A",
      isStrike: true,
      ballsBefore: 1,
      strikesBefore: 1,
    },
  };
  const args = {
    selectedOutcome,
    source: "ev_la_smoothed",
    evLaKey: "95|21",
    sampleQuality: "good",
    smoothing: {
      neighborMode: "local",
      expansionLevel: 0,
      targetBattedBalls: 100,
      targetWeight: 0.8,
      neighborEffectiveSampleSize: 50,
      neighborCount: 3,
      weightedNeighborBattedBalls: 80,
      effectivePriorStrength: 20,
      nearestDistanceSquared: 1,
      nearestEvDistance: 1,
      nearestLaDistance: 0,
      physicalConstraints: [],
    },
    state,
    batter,
    side: "away",
    pitchType: "fourSeam",
    course: "A",
    pitchVelocity: 95,
    qoc: "Solid",
    battedBall: { exitVelocity: 95, launchAngle: 21, qoc: "Solid" },
    options,
    addQoCToBox: (runtimeState, qoc) => {
      calls.qoc += 1;
      runtimeState.box.away.qoc[qoc] =
        (runtimeState.box.away.qoc[qoc] || 0) + 1;
    },
    addOutInPlayStat,
    addHitStat,
    advanceRunnersOnHit,
    maybeEndGameMidInning: () => {
      calls.maybeEnd += 1;
    },
    moveToNextBatter: () => {
      calls.nextBatter += 1;
    },
    finishPlateAppearanceState: () => {
      calls.finish += 1;
    },
    emitLog: (_runtimeOptions, text) => logs.push(text),
    emitLastPitchPatch: (_runtimeOptions, patch) => patches.push(patch),
  };
  return { args, state, batter, calls, logs, patches, events };
}

function applyHarness(harness) {
  return applySelectedBattedBallOutcome(harness.args);
}

const measurementSummary = await runMeasurementBatches({
  awayTeam: compatibilityTeams.away,
  homeTeam: compatibilityTeams.home,
  gameCount: 10,
  seed: 13579,
});

test("selectOutcomeFromProbabilities selects all five outcomes", () => {
  assert.equal(selectOutcomeFromProbabilities(probabilities, 0.05), "out");
  assert.equal(selectOutcomeFromProbabilities(probabilities, 0.2), "single");
  assert.equal(selectOutcomeFromProbabilities(probabilities, 0.4), "double");
  assert.equal(selectOutcomeFromProbabilities(probabilities, 0.7), "triple");
  assert.equal(selectOutcomeFromProbabilities(probabilities, 0.9), "homeRun");
});

test("cumulative boundaries retain strict less-than comparisons", () => {
  assert.equal(selectOutcomeFromProbabilities(probabilities, 0.1), "single");
  assert.equal(
    selectOutcomeFromProbabilities(probabilities, 0.1 + 0.2),
    "double"
  );
  assert.equal(
    selectOutcomeFromProbabilities(probabilities, 0.1 + 0.2 + 0.3),
    "triple"
  );
  assert.equal(
    selectOutcomeFromProbabilities(
      probabilities,
      0.1 + 0.2 + 0.3 + 0.15
    ),
    "homeRun"
  );
});

test("batted-ball selection consumes exactly one random value", () => {
  let randomCalls = 0;
  const selection = selectBattedBallOutcome({
    state: { inning: 1, half: "top", balls: 0, strikes: 0 },
    batter: { name: "Selection Batter" },
    pitchType: "fourSeam",
    course: "A",
    battedBall: { exitVelocity: 95, launchAngle: 21 },
    random: () => {
      randomCalls += 1;
      return 0.5;
    },
  });
  assert.equal(randomCalls, 1);
  assert.ok(
    ["out", "single", "double", "triple", "homeRun"].includes(
      selection.selectedOutcome
    )
  );
  assert.equal(selection.outcomeRoll, 0.5);
});

test("batted-ball selection does not mutate state, batter, or runners", () => {
  const state = {
    inning: 4,
    half: "bottom",
    balls: 2,
    strikes: 1,
    outs: 1,
    bases: {
      first: { side: "home", name: "Runner" },
      second: null,
      third: null,
    },
  };
  const batter = { name: "Pure Batter", gameStats: { AB: 2, H: 1 } };
  const before = structuredClone({ state, batter });
  selectBattedBallOutcome({
    state,
    batter,
    pitchType: "slider",
    course: "B",
    battedBall: { exitVelocity: 95, launchAngle: 21 },
    random: () => 0.5,
  });
  assert.deepEqual({ state, batter }, before);
});

test("selection does not call log, patch, or measurement hooks", () => {
  let sideEffects = 0;
  const poison = () => {
    sideEffects += 1;
  };
  selectBattedBallOutcome({
    state: {},
    batter: { name: "No Side Effects" },
    pitchType: "curve",
    course: "C",
    battedBall: { exitVelocity: 95, launchAngle: 21 },
    random: () => 0.5,
    emitLog: poison,
    emitLastPitchPatch: poison,
    options: { onBattedBallMeasurement: poison },
  });
  assert.equal(sideEffects, 0);
});

test("missing EV/LA fails before consuming outcome random", () => {
  let randomCalls = 0;
  assert.throws(
    () =>
      selectBattedBallOutcome({
        state: { inning: 3, half: "top", balls: 1, strikes: 2 },
        batter: { name: "Missing EV Batter" },
        pitchType: "fourSeam",
        course: "A",
        battedBall: null,
        random: () => {
          randomCalls += 1;
          return 0;
        },
      }),
    (error) =>
      error.code === "BATTED_BALL_MISSING" &&
      error.context?.batter === "Missing EV Batter"
  );
  assert.equal(randomCalls, 0);
});

test("unloaded lookup fails before consuming outcome random", () => {
  const serviceUrl = new URL(
    "../services/battedBallOutcomeSelectionService.js",
    import.meta.url
  ).href;
  const script = `
    import { selectBattedBallOutcome } from ${JSON.stringify(serviceUrl)};
    let randomCalls = 0;
    try {
      selectBattedBallOutcome({
        state: { inning: 2, half: "top", balls: 0, strikes: 1 },
        batter: { name: "Lookup Batter" },
        pitchType: "fourSeam",
        course: "A",
        battedBall: { exitVelocity: 95, launchAngle: 21 },
        random: () => { randomCalls += 1; return 0; },
      });
    } catch (error) {
      console.log(JSON.stringify({
        code: error.code,
        batter: error.context?.batter,
        randomCalls,
      }));
    }
  `;
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout.trim()), {
    code: "EV_LA_LOOKUP_NOT_READY",
    batter: "Lookup Batter",
    randomCalls: 0,
  });
});

test("application uses neither random nor EV/LA lookup", async () => {
  const source = await readFile(
    new URL(
      "../services/battedBallOutcomeApplicationService.js",
      import.meta.url
    ),
    "utf8"
  );
  assert.doesNotMatch(source, /getEvLaOutcomeProbabilities|getLoadedEvLaLookup/);
  assert.doesNotMatch(source, /\brandom\s*\(/);
  assert.doesNotMatch(source, /\b(?:out|single|double|triple)Cut\b/);

  const harness = createApplicationHarness("out");
  let forbiddenCalls = 0;
  harness.args.random = () => {
    forbiddenCalls += 1;
  };
  harness.args.lookup = new Proxy(
    {},
    {
      get() {
        forbiddenCalls += 1;
      },
    }
  );
  applyHarness(harness);
  assert.equal(forbiddenCalls, 0);
});

test("out application preserves outs, stats, and PA completion behavior", () => {
  const harness = createApplicationHarness("out", ["first"]);
  const basesBefore = structuredClone(harness.state.bases);
  const result = applyHarness(harness);
  assert.deepEqual(result, { outcome: "out", runsScored: 0 });
  assert.equal(harness.state.outs, 1);
  assert.equal(harness.state.box.away.outsInPlay, 1);
  assert.equal(harness.batter.gameStats.AB, 1);
  assert.equal(harness.batter.gameStats.H, 0);
  assert.deepEqual(harness.state.bases, basesBefore);
  assert.deepEqual(
    [harness.calls.nextBatter, harness.calls.finish, harness.calls.maybeEnd],
    [1, 1, 0]
  );
});

test("single application preserves runner, run, and batting updates", () => {
  const harness = createApplicationHarness("single", ["third"]);
  const result = applyHarness(harness);
  assert.deepEqual(result, { outcome: "single", runsScored: 1 });
  assert.equal(harness.state.box.away.hits, 1);
  assert.equal(harness.state.score.away, 1);
  assert.equal(harness.state.bases.first.name, harness.batter.name);
  assert.equal(harness.batter.gameStats.H, 1);
  assert.equal(harness.batter.gameStats.RBI, 1);
  assert.deepEqual(
    [harness.calls.nextBatter, harness.calls.finish, harness.calls.maybeEnd],
    [1, 1, 1]
  );
});

test("double, triple, and home run application preserve all branch updates", () => {
  for (const expected of [
    {
      outcome: "double",
      runs: 2,
      stat: "doubles",
      hitTypeStat: "doubles",
      bases: 2,
    },
    {
      outcome: "triple",
      runs: 3,
      stat: "triples",
      hitTypeStat: "triples",
      bases: 3,
    },
    {
      outcome: "homeRun",
      runs: 4,
      stat: "hr",
      hitTypeStat: "HR",
      bases: 4,
    },
  ]) {
    const harness = createApplicationHarness(expected.outcome, [
      "first",
      "second",
      "third",
    ]);
    const result = applyHarness(harness);
    assert.deepEqual(result, {
      outcome: expected.outcome,
      runsScored: expected.runs,
    });
    assert.equal(harness.state.box.away.hits, 1);
    assert.equal(harness.state.box.away[expected.stat], 1);
    assert.equal(harness.state.score.away, expected.runs);
    assert.equal(harness.batter.gameStats.H, 1);
    assert.equal(harness.batter.gameStats[expected.hitTypeStat], 1);
    const velocityLine = Object.values(
      harness.state.box.away.velocityBandStats
    ).find((line) => line.PA === 1);
    assert.equal(velocityLine.totalBases, expected.bases);
  }
});

test("QoC is aggregated but cannot influence outcome selection", () => {
  const selectionArgs = {
    state: {},
    batter: { name: "QoC Batter" },
    pitchType: "fourSeam",
    course: "A",
    battedBall: { exitVelocity: 95, launchAngle: 21 },
    random: () => 0.5,
  };
  const weak = selectBattedBallOutcome({ ...selectionArgs, qoc: "Weak" });
  const barrel = selectBattedBallOutcome({ ...selectionArgs, qoc: "Barrel" });
  assert.equal(weak.selectedOutcome, barrel.selectedOutcome);
  assert.deepEqual(weak.probabilities, barrel.probabilities);

  const harness = createApplicationHarness("out");
  applyHarness(harness);
  assert.equal(harness.calls.qoc, 1);
  assert.equal(harness.state.box.away.qoc.Solid, 1);
});

test("lastPitch patches and Japanese log remain unchanged", () => {
  const harness = createApplicationHarness("double", ["third"]);
  applyHarness(harness);
  assert.deepEqual(harness.patches[0], {
    outcomeSource: "ev_la_smoothed",
    evLaKey: "95|21",
    sampleQuality: "good",
  });
  assert.equal(
    harness.patches[1].resultText,
    "Solid / 二塁打 (95mph, 21° / good / ev_la_smoothed / 95|21)"
  );
  assert.equal(harness.logs.length, 1);
  assert.match(harness.logs[0], /Solidで二塁打。1点/);
  assert.match(
    harness.logs[0],
    /\(95mph, 21° \/ good \/ ev_la_smoothed \/ 95\|21\)$/
  );
});

test("application emits one batted-ball measurement event", () => {
  const harness = createApplicationHarness("triple", ["third"]);
  applyHarness(harness);
  assert.equal(harness.events.length, 1);
});

test("measurement event outcome and runs match the applied result", () => {
  const harness = createApplicationHarness("homeRun", [
    "first",
    "second",
    "third",
  ]);
  const result = applyHarness(harness);
  assert.equal(harness.events[0].outcome, result.outcome);
  assert.equal(harness.events[0].runsScored, result.runsScored);
  assert.equal(harness.events[0].source, "ev_la_smoothed");
  assert.equal(harness.events[0].sampleQuality, "good");
});

test("resolveContactResult preserves its public return contract", () => {
  const harness = createApplicationHarness("out");
  let randomCalls = 0;
  const result = resolveContactResult({
    ...harness.args,
    random: () => {
      randomCalls += 1;
      return 0;
    },
  });
  assert.deepEqual(result, { outcome: "out", runsScored: 0 });
  assert.equal(randomCalls, 1);
  assert.equal(harness.calls.finish, 1);
});

test("three pre-edit seeds preserve state and total random calls", () => {
  const expected = new Map([
    [
      12345,
      {
        randomCalls: 3115,
        stateDigest:
          "3bf1aa1dedf09e4e330c895ad3a57015e1f0f5ed1283e50aba0855c2ec1e5881",
      },
    ],
    [
      246813579,
      {
        randomCalls: 2512,
        stateDigest:
          "edbf84478f9aabe9ac1bdd1c3a249f97b93c25e3f609b28500d8d26581fdeb51",
      },
    ],
    [
      987654321,
      {
        randomCalls: 2902,
        stateDigest:
          "b597769d51030e90b88df88b23c60e006b45a785093f4b9e0c9bd771a02026f8",
      },
    ],
  ]);
  for (const [seed, baseline] of expected) {
    assert.deepEqual(runSeed(seed), baseline);
  }
});

test("fixed-seed high-speed measurement summary matches pre-edit output", () => {
  const normalized = normalizeSummaryForCompatibility(measurementSummary);
  assert.equal(
    digest(normalized),
    "743822314a7b654518b19a565a27dd83f5bd293235d7d2eaaefbf978901d1c6a"
  );
});

test("Pitch Location aggregation, 25 cells, and diagnostics do not regress", () => {
  const grid = measurementSummary.breakdowns.locationGrid.combined;
  assert.equal(
    Object.keys(grid).filter((key) => /^r[0-4]c[0-4]$/.test(key)).length,
    25
  );
  assert.equal(
    measurementSummary.pitchLocation.combined.shadowPct,
    measurementSummary.pitchLocation.combined.edgePct
  );
  assert.equal(
    measurementSummary.diagnostics.invalidPitchLocationMeasurementEventCount,
    0
  );
  assert.equal(
    measurementSummary.diagnostics.pitchLocationFieldMismatchCount,
    0
  );
  assert.equal(
    measurementSummary.diagnostics.pitchLocationAggregationMismatchCount,
    0
  );
});

test("Summary and Report schema versions are four", () => {
  const report = buildMeasurementReportObject({
    summary: measurementSummary,
    teams: compatibilityTeams,
    generatedAt: "2026-07-28T00:00:00.000Z",
  });
  assert.equal(MEASUREMENT_SUMMARY_SCHEMA_VERSION, 4);
  assert.equal(MEASUREMENT_REPORT_SCHEMA_VERSION, 4);
  assert.equal(measurementSummary.reportSchemaVersion, 4);
  assert.equal(report.reportSchemaVersion, 4);
});

test("facade composes selection then application without defense overrides", async () => {
  const [facadeSource, selectionSource, applicationSource] = await Promise.all([
    readFile(
      new URL("../services/contactResolutionService.js", import.meta.url),
      "utf8"
    ),
    readFile(
      new URL(
        "../services/battedBallOutcomeSelectionService.js",
        import.meta.url
      ),
      "utf8"
    ),
    readFile(
      new URL(
        "../services/battedBallOutcomeApplicationService.js",
        import.meta.url
      ),
      "utf8"
    ),
  ]);
  assert.match(
    facadeSource,
    /selectBattedBallOutcome\([\s\S]*applySelectedBattedBallOutcome\(/
  );
  assert.doesNotMatch(
    facadeSource,
    /defense|finalOutcome|override|callback|shadow/
  );
  assert.doesNotMatch(selectionSource, /addHitStat|advanceRunners|emitLog/);
  assert.doesNotMatch(
    applicationSource,
    /getEvLaOutcomeProbabilities|getLoadedEvLaLookup|outcomeRoll/
  );
});
