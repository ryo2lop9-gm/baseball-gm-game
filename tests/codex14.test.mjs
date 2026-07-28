import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createTuningBootstrap } from "../bootstrap/tuningBootstrap.js";
import {
  DEFENSE_POSITIONS,
  DEFENSIVE_LINEUP_POSITIONS,
  DESIGNATED_HITTER_POSITION,
  PLAYER_DEFENSE_POSITIONS,
} from "../config/defenseConfig.js";
import {
  createFastSimulationOptions,
  simulateGameMutable,
} from "../engine/core/engineCore.js";
import {
  createGameBatter,
  createGamePitcher,
  createPlayerDefense,
} from "../models/playerModels.js";
import {
  createDefaultLeagueTeams,
  createDefaultTeams,
  createGmBasicReferenceValidationTeams,
  createMlbAverageValidationTeams,
} from "../models/teamModels.js";
import { advanceRunnersOnHit } from "../services/baseRunningService.js";
import {
  APPLICABLE_BATTED_BALL_OUTCOMES,
  applySelectedBattedBallOutcome,
} from "../services/battedBallOutcomeApplicationService.js";
import {
  DEFENSIVE_ALIGNMENT_ERROR_CODES,
  assertValidDefensiveAlignment,
  resolveActiveDefense,
  resolvePositionPlayers,
  validateDefensiveAlignment,
} from "../services/defensiveAlignmentService.js";
import { loadEvLaLookup } from "../services/evLaLookupStore.js";
import {
  MEASUREMENT_REPORT_SCHEMA_VERSION,
  buildMeasurementReportObject,
} from "../services/measurement/measurementReportService.js";
import {
  MEASUREMENT_SUMMARY_SCHEMA_VERSION,
  isStructuralMeasurementError,
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

const compatibilityTeams = createMlbAverageValidationTeams();
const measurementSummary = await runMeasurementBatches({
  awayTeam: compatibilityTeams.away,
  homeTeam: compatibilityTeams.home,
  gameCount: 10,
  seed: 13579,
});

function digest(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function normalizeStateForCompatibility(state) {
  const normalized = structuredClone(state);
  const visit = (value) => {
    if (!value || typeof value !== "object") return;
    delete value.defense;
    delete value.defensiveAlignment;
    if (value.profile && typeof value.profile === "object") {
      value.profile.id = "<profile-id>";
    }
    for (const child of Object.values(value)) visit(child);
  };
  visit(normalized);
  return normalized;
}

function normalizeSummaryForCompatibility(summary) {
  const normalized = structuredClone(summary);
  normalized.run.elapsedMs = 0;
  normalized.run.gamesPerSecond = 0;
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

function createApplicationHarness(selectedOutcome) {
  const teams = createMlbAverageValidationTeams();
  const state = createInitialSimState(
    structuredClone(teams.away),
    structuredClone(teams.home)
  );
  const batter = state.awayTeam.lineup[0];
  const calls = {
    qoc: 0,
    log: 0,
    patch: 0,
    measurement: 0,
    nextBatter: 0,
    finish: 0,
    maybeEnd: 0,
  };
  const options = {
    onBattedBallMeasurement: () => {
      calls.measurement += 1;
    },
    pitchMeasurementContext: {
      battingSide: "away",
      defenseSide: "home",
      batterKey: batter.profile.id,
      batterName: batter.name,
      batterRatings: batter.ratings,
      lineupIndex: 0,
      pitcherKey: state.activePitchers.home.profile.id,
      pitcherName: state.activePitchers.home.name,
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
    smoothing: {},
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
      runtimeState.box.away.qoc[qoc] += 1;
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
    emitLog: () => {
      calls.log += 1;
    },
    emitLastPitchPatch: () => {
      calls.patch += 1;
    },
  };
  return { args, state, batter, calls };
}

function createAllPublicGameableTeams() {
  const defaultTeams = createDefaultTeams();
  const mlbTeams = createMlbAverageValidationTeams();
  const gmTeams = createGmBasicReferenceValidationTeams();
  const teams = [
    defaultTeams.away,
    defaultTeams.home,
    ...createDefaultLeagueTeams(),
    mlbTeams.away,
    mlbTeams.home,
    gmTeams.away,
    gmTeams.home,
  ];

  const tuning = createTuningBootstrap();
  for (const createBundle of [
    tuning.createDefaultRosterBundle,
    tuning.createMlbValidationRosterBundle,
    tuning.createGmBasicReferenceRosterBundle,
  ]) {
    const pair = tuning.buildCurrentTuningTeams(createBundle());
    teams.push(pair.away, pair.home);
  }
  return teams;
}

function playerId(player) {
  return player?.profile?.id || player?.id || null;
}

test("all five allowed outcomes retain their application branches", () => {
  assert.deepEqual(APPLICABLE_BATTED_BALL_OUTCOMES, [
    "out",
    "single",
    "double",
    "triple",
    "homeRun",
  ]);
  for (const outcome of APPLICABLE_BATTED_BALL_OUTCOMES) {
    const harness = createApplicationHarness(outcome);
    const result = applySelectedBattedBallOutcome(harness.args);
    assert.equal(result.outcome, outcome);
    assert.equal(harness.calls.qoc, 1);
    assert.equal(harness.calls.log, 1);
    assert.equal(harness.calls.measurement, 1);
    assert.equal(harness.calls.nextBatter, 1);
    assert.equal(harness.calls.finish, 1);
    if (outcome === "out") {
      assert.deepEqual(result, { outcome, runsScored: 0 });
      assert.equal(harness.state.outs, 1);
      assert.equal(harness.state.box.away.outsInPlay, 1);
    } else {
      assert.equal(harness.state.box.away.hits, 1);
    }
  }
});

test("invalid selected outcomes throw BATTED_BALL_OUTCOME_INVALID with context", () => {
  for (const selectedOutcome of [
    null,
    undefined,
    "",
    "unknown",
    { outcome: "homeRun" },
  ]) {
    const harness = createApplicationHarness(selectedOutcome);
    assert.throws(
      () => applySelectedBattedBallOutcome(harness.args),
      (error) =>
        error.code === "BATTED_BALL_OUTCOME_INVALID" &&
        error.context?.selectedOutcome === selectedOutcome
    );
  }
});

test("invalid outcomes do not change QoC, stats, runners, or score", () => {
  const harness = createApplicationHarness("invalid");
  harness.state.bases.first = {
    side: "away",
    name: harness.state.awayTeam.lineup[1].name,
  };
  const before = structuredClone(harness.state);
  assert.throws(
    () => applySelectedBattedBallOutcome(harness.args),
    { code: "BATTED_BALL_OUTCOME_INVALID" }
  );
  assert.deepEqual(harness.state, before);
  assert.equal(harness.calls.qoc, 0);
});

test("invalid outcomes do not call log, lastPitch, or measurement hooks", () => {
  const harness = createApplicationHarness({});
  assert.throws(
    () => applySelectedBattedBallOutcome(harness.args),
    { code: "BATTED_BALL_OUTCOME_INVALID" }
  );
  assert.equal(harness.calls.log, 0);
  assert.equal(harness.calls.patch, 0);
  assert.equal(harness.calls.measurement, 0);
});

test("invalid outcomes do not move the lineup or finish the plate appearance", () => {
  const harness = createApplicationHarness([]);
  assert.throws(
    () => applySelectedBattedBallOutcome(harness.args),
    { code: "BATTED_BALL_OUTCOME_INVALID" }
  );
  assert.equal(harness.calls.nextBatter, 0);
  assert.equal(harness.calls.finish, 0);
  assert.equal(harness.calls.maybeEnd, 0);
});

test("invalid batted-ball outcomes abort high-speed measurement structurally", async () => {
  assert.equal(
    isStructuralMeasurementError({ code: "BATTED_BALL_OUTCOME_INVALID" }),
    true
  );
  assert.equal(isStructuralMeasurementError({ code: "ordinary-error" }), false);

  let simulationCalls = 0;
  await assert.rejects(
    runMeasurementBatches({
      awayTeam: {},
      homeTeam: {},
      gameCount: 3,
      seed: 14,
      batchSize: 3,
      runtime: {
        createGameState: () => ({}),
        simulateGame: () => {
          simulationCalls += 1;
          const error = new Error("invalid selected outcome");
          error.code = "BATTED_BALL_OUTCOME_INVALID";
          error.context = { selectedOutcome: null };
          throw error;
        },
        now: () => 0,
        yieldControl: async () => {},
      },
    }),
    (error) =>
      error.code === "BATTED_BALL_OUTCOME_INVALID" &&
      error.context?.selectedOutcome === null &&
      error.measurementSummary?.run?.failedGames === 1
  );
  assert.equal(simulationCalls, 1);
});

test("defense position definitions use immutable fixed orders", () => {
  assert.deepEqual(DEFENSE_POSITIONS, [
    "P",
    "C",
    "1B",
    "2B",
    "3B",
    "SS",
    "LF",
    "CF",
    "RF",
  ]);
  assert.deepEqual(DEFENSIVE_LINEUP_POSITIONS, [
    "C",
    "1B",
    "2B",
    "3B",
    "SS",
    "LF",
    "CF",
    "RF",
  ]);
  assert.equal(DESIGNATED_HITTER_POSITION, "DH");
  assert.equal(PLAYER_DEFENSE_POSITIONS.includes("unknown"), false);
  assert.equal(Object.isFrozen(DEFENSE_POSITIONS), true);
  assert.equal(Object.isFrozen(DEFENSIVE_LINEUP_POSITIONS), true);
  assert.equal(Object.isFrozen(PLAYER_DEFENSE_POSITIONS), true);
});

test("batter and pitcher defense defaults are neutral and separate", () => {
  const batter = createGameBatter("Neutral Batter", 50, 50, 50);
  const pitcher = createGamePitcher("Neutral Pitcher", 50, 50);
  assert.deepEqual(batter.defense, {
    primaryPosition: "DH",
    eligiblePositions: ["DH"],
    fielding: 50,
    arm: 50,
  });
  assert.deepEqual(pitcher.defense, {
    primaryPosition: "P",
    eligiblePositions: ["P"],
    fielding: 50,
    arm: 50,
  });
  assert.equal("defense" in batter.ratings, false);
  assert.equal("defense" in batter.profile, false);
  assert.equal("defense" in pitcher.ratings, false);
  assert.equal("defense" in pitcher.profile, false);
});

test("invalid ratings, positions, and duplicate eligibility are rejected", () => {
  const invalidDefenseValues = [
    { primaryPosition: "unknown" },
    { primaryPosition: null },
    { primaryPosition: "SS", eligiblePositions: ["SS", "SS"] },
    { primaryPosition: "SS", eligiblePositions: ["2B"] },
    { primaryPosition: "SS", eligiblePositions: 1 },
    { primaryPosition: "SS", fielding: -1 },
    { primaryPosition: "SS", fielding: 101 },
    { primaryPosition: "SS", fielding: Number.NaN },
    { primaryPosition: "SS", fielding: null },
    { primaryPosition: "SS", arm: Number.POSITIVE_INFINITY },
    { primaryPosition: "SS", arm: "50" },
  ];
  for (const defense of invalidDefenseValues) {
    assert.throws(
      () => createPlayerDefense(defense),
      { code: "PLAYER_DEFENSE_INVALID" }
    );
  }
  assert.throws(
    () =>
      createGamePitcher("Invalid Pitcher", 50, 50, {}, {
        defense: { primaryPosition: "SS" },
      }),
    { code: "PLAYER_DEFENSE_INVALID" }
  );
});

test("all public gameable team factories produce valid eight-fielders-plus-DH teams", () => {
  const teams = createAllPublicGameableTeams();
  assert.equal(teams.length, 16);
  for (const team of teams) {
    assert.equal(validateDefensiveAlignment(team).valid, true, team.name);
    assert.equal(team.lineup.length, 9, team.name);
    assert.deepEqual(
      Object.keys(team.defensiveAlignment),
      DEFENSIVE_LINEUP_POSITIONS,
      team.name
    );
    assert.equal(
      team.lineup.filter(
        (player) => player.defense.primaryPosition === "DH"
      ).length,
      1,
      team.name
    );
    for (const player of [
      ...team.lineup,
      team.startingPitcher,
      ...(team.bullpen || []),
    ]) {
      assert.equal(player.defense.fielding, 50, player.name);
      assert.equal(player.defense.arm, 50, player.name);
    }
  }
});

test("every defensive alignment ID resolves to its actual lineup player", () => {
  for (const team of createAllPublicGameableTeams()) {
    const resolved = resolvePositionPlayers(team);
    for (const position of DEFENSIVE_LINEUP_POSITIONS) {
      assert.equal(
        playerId(resolved[position]),
        team.defensiveAlignment[position],
        `${team.name} ${position}`
      );
    }
  }
});

test("no defensive alignment assigns one player more than once", () => {
  for (const team of createAllPublicGameableTeams()) {
    const assigned = Object.values(team.defensiveAlignment);
    assert.equal(new Set(assigned).size, 8, team.name);
  }
});

test("every aligned player is eligible at the assigned position", () => {
  for (const team of createAllPublicGameableTeams()) {
    const resolved = resolvePositionPlayers(team);
    for (const position of DEFENSIVE_LINEUP_POSITIONS) {
      assert.equal(
        resolved[position].defense.eligiblePositions.includes(position),
        true,
        `${team.name} ${position}`
      );
    }
  }
});

test("the designated hitter is never part of the active defense", () => {
  const teams = createDefaultTeams();
  const state = createInitialSimState(teams.away, teams.home);
  const active = resolveActiveDefense(state, "home");
  const dh = state.homeTeam.lineup.find(
    (player) => player.defense.primaryPosition === "DH"
  );
  assert.ok(dh);
  assert.equal(Object.values(active).includes(dh), false);
  assert.equal(
    Object.values(state.homeTeam.defensiveAlignment).includes(playerId(dh)),
    false
  );
});

test("resolveActiveDefense returns all nine positions in fixed order", () => {
  const teams = createDefaultTeams();
  const state = createInitialSimState(teams.away, teams.home);
  assert.deepEqual(
    Object.keys(resolveActiveDefense(state, "home")),
    DEFENSE_POSITIONS
  );
});

test("active defense P is the exact current active pitcher", () => {
  const teams = createDefaultTeams();
  const state = createInitialSimState(teams.away, teams.home);
  assert.strictEqual(
    resolveActiveDefense(state, "home").P,
    state.activePitchers.home
  );
});

test("a pitching change replaces only P in the resolved defense", () => {
  const teams = createDefaultTeams();
  const state = createInitialSimState(teams.away, teams.home);
  const before = resolveActiveDefense(state, "home");
  const replacement = createGamePitcher("Replacement", 50, 50);
  state.activePitchers.home = replacement;
  const after = resolveActiveDefense(state, "home");
  assert.strictEqual(after.P, replacement);
  assert.notStrictEqual(after.P, before.P);
  for (const position of DEFENSIVE_LINEUP_POSITIONS) {
    assert.strictEqual(after[position], before[position], position);
  }
});

test("reordering the batting lineup does not alter ID-based defense resolution", () => {
  const team = createDefaultTeams().home;
  const before = resolvePositionPlayers(team);
  const reordered = {
    ...team,
    lineup: [...team.lineup].reverse(),
  };
  const after = resolvePositionPlayers(reordered);
  for (const position of DEFENSIVE_LINEUP_POSITIONS) {
    assert.equal(playerId(after[position]), playerId(before[position]), position);
  }
});

test("defense resolution does not mutate the team, lineup, alignment, or state", () => {
  const teams = createDefaultTeams();
  const state = createInitialSimState(teams.away, teams.home);
  const before = structuredClone(state);
  resolvePositionPlayers(state.homeTeam);
  resolveActiveDefense(state, "home");
  assert.deepEqual(state, before);
});

test("missing, duplicate, unknown, and ineligible assignments are distinguished", () => {
  const baseTeam = createDefaultTeams().home;
  const cases = [
    {
      code: DEFENSIVE_ALIGNMENT_ERROR_CODES.POSITION_MISSING,
      mutate(team) {
        delete team.defensiveAlignment.C;
      },
    },
    {
      code: DEFENSIVE_ALIGNMENT_ERROR_CODES.PLAYER_DUPLICATE,
      mutate(team) {
        team.defensiveAlignment["1B"] = team.defensiveAlignment.C;
      },
    },
    {
      code: DEFENSIVE_ALIGNMENT_ERROR_CODES.PLAYER_UNKNOWN,
      mutate(team) {
        team.defensiveAlignment.C = "missing-player-id";
      },
    },
    {
      code: DEFENSIVE_ALIGNMENT_ERROR_CODES.PLAYER_INELIGIBLE,
      mutate(team) {
        const dh = team.lineup.find(
          (player) => player.defense.primaryPosition === "DH"
        );
        team.defensiveAlignment.C = playerId(dh);
      },
    },
  ];

  for (const scenario of cases) {
    const team = structuredClone(baseTeam);
    scenario.mutate(team);
    const validation = validateDefensiveAlignment(team);
    assert.equal(validation.valid, false);
    assert.equal(
      validation.errors.some((error) => error.code === scenario.code),
      true,
      scenario.code
    );
    assert.throws(
      () => assertValidDefensiveAlignment(team),
      (error) =>
        error.code === "DEFENSIVE_ALIGNMENT_INVALID" &&
        error.context?.team === team.name &&
        error.context.errors.some((item) => item.code === scenario.code)
    );
  }
});

test("three pre-edit seeds preserve complete gameplay state", () => {
  const expected = new Map([
    [
      12345,
      "3bf1aa1dedf09e4e330c895ad3a57015e1f0f5ed1283e50aba0855c2ec1e5881",
    ],
    [
      246813579,
      "edbf84478f9aabe9ac1bdd1c3a249f97b93c25e3f609b28500d8d26581fdeb51",
    ],
    [
      987654321,
      "b597769d51030e90b88df88b23c60e006b45a785093f4b9e0c9bd771a02026f8",
    ],
  ]);
  for (const [seed, expectedDigest] of expected) {
    assert.equal(runSeed(seed).stateDigest, expectedDigest);
  }
});

test("three pre-edit seeds preserve total random call counts", () => {
  const expected = new Map([
    [12345, 3115],
    [246813579, 2512],
    [987654321, 2902],
  ]);
  for (const [seed, expectedCalls] of expected) {
    assert.equal(runSeed(seed).randomCalls, expectedCalls);
  }
});

test("application and defense foundation consume no random values", async () => {
  const [applicationSource, defenseSource] = await Promise.all([
    readFile(
      new URL(
        "../services/battedBallOutcomeApplicationService.js",
        import.meta.url
      ),
      "utf8"
    ),
    readFile(
      new URL("../services/defensiveAlignmentService.js", import.meta.url),
      "utf8"
    ),
  ]);
  const randomCallPattern = /\b(?:Math\.)?random\s*\(/;
  assert.doesNotMatch(applicationSource, randomCallPattern);
  assert.doesNotMatch(defenseSource, randomCallPattern);
});

test("fixed-seed high-speed measurement summary matches pre-edit output", () => {
  assert.equal(
    digest(normalizeSummaryForCompatibility(measurementSummary)),
    "743822314a7b654518b19a565a27dd83f5bd293235d7d2eaaefbf978901d1c6a"
  );
});

test("Pitch Location aggregation, all 25 cells, and diagnostics do not regress", () => {
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

test("Summary and Report schema versions remain three", () => {
  const report = buildMeasurementReportObject({
    summary: measurementSummary,
    teams: compatibilityTeams,
    generatedAt: "2026-07-28T00:00:00.000Z",
  });
  assert.equal(MEASUREMENT_SUMMARY_SCHEMA_VERSION, 3);
  assert.equal(MEASUREMENT_REPORT_SCHEMA_VERSION, 3);
  assert.equal(measurementSummary.reportSchemaVersion, 3);
  assert.equal(report.reportSchemaVersion, 3);
});
