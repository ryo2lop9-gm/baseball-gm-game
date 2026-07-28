import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createTuningBootstrap } from "../bootstrap/tuningBootstrap.js";
import {
  BATTER_DIRECTION_TYPES,
  BATTED_BALL_DIRECTION_CONFIG,
} from "../config/battedBallDirectionConfig.js";
import { PITCH_LOCATION_CONFIG } from "../config/pitchLocationConfig.js";
import {
  createFastSimulationOptions,
  simulateGameMutable,
  stepPitchMutable,
} from "../engine/core/engineCore.js";
import { createRosterPlayerFromExternalPlayer } from "../engine/gm/gmRosterEngine.js";
import {
  createGameBatter,
  createGamePitcher,
  createSeasonBatterSnapshot,
} from "../models/playerModels.js";
import {
  createDefaultLeagueTeams,
  createDefaultTeams,
  createGmBasicReferenceValidationTeams,
  createMlbAverageValidationTeams,
} from "../models/teamModels.js";
import { applySelectedBattedBallOutcome } from "../services/battedBallOutcomeApplicationService.js";
import {
  buildDirectionProbabilities,
  classifyBatterRelativeDirection,
  classifyFieldSector,
  convertToFieldSprayAngle,
  generateDirectionShadow,
  resolveBattingSide,
  sampleBatterRelativeSprayAngle,
  selectDirectionFromProbabilities,
} from "../services/battedBallDirectionService.js";
import {
  DEFENSIVE_LINEUP_POSITIONS,
} from "../config/defenseConfig.js";
import {
  resolveActiveDefense,
  validateDefensiveAlignment,
} from "../services/defensiveAlignmentService.js";
import { loadEvLaLookup } from "../services/evLaLookupStore.js";
import { getMeasurementClass } from "../services/measurement/measurementClassService.js";
import {
  MEASUREMENT_REPORT_SCHEMA_VERSION,
  buildMeasurementMarkdown,
  buildMeasurementReportObject,
} from "../services/measurement/measurementReportService.js";
import {
  MEASUREMENT_SUMMARY_SCHEMA_VERSION,
  isStructuralMeasurementError,
  runMeasurementBatches,
} from "../services/measurement/measurementService.js";
import {
  createSeededRandom,
  deriveNamespacedSeed,
} from "../services/seededRandomService.js";
import {
  createInitialGameState,
  createInitialSimState,
} from "../state/gameState.js";

const lookup = JSON.parse(
  await readFile(new URL("../data/ev_la_lookup.json", import.meta.url), "utf8")
);
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => ({ ok: true, json: async () => lookup });
await loadEvLaLookup();
globalThis.fetch = originalFetch;

const compatibilityTeams = createMlbAverageValidationTeams();

function digest(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function createBatter(bats = "R", directionType = "balanced") {
  return createGameBatter("Direction Batter", 50, 50, 50, {
    bats,
    directionType,
  });
}

function createPitcher(throws = "R") {
  return createGamePitcher("Direction Pitcher", 50, 50, {}, { throws });
}

function gameplayProjection(state) {
  const projectTeam = (team) => ({
    name: team.name,
    lineup: team.lineup.map((player) => ({
      name: player.name,
      ratings: player.ratings,
      defense: player.defense,
      gameStats: player.gameStats,
    })),
    startingPitcher: {
      name: team.startingPitcher.name,
      ratings: team.startingPitcher.ratings,
      defense: team.startingPitcher.defense,
      pitchMix: team.startingPitcher.pitchMix,
    },
    bullpen: team.bullpen.map((pitcher) => ({
      name: pitcher.name,
      ratings: pitcher.ratings,
      defense: pitcher.defense,
      pitchMix: pitcher.pitchMix,
    })),
    defensiveAlignmentPositions: Object.keys(team.defensiveAlignment),
  });
  return {
    inning: state.inning,
    half: state.half,
    outs: state.outs,
    balls: state.balls,
    strikes: state.strikes,
    bases: state.bases,
    score: state.score,
    battingIndex: state.battingIndex,
    activePitchers: Object.fromEntries(
      Object.entries(state.activePitchers).map(([side, pitcher]) => [
        side,
        {
          name: pitcher.name,
          ratings: pitcher.ratings,
          defense: pitcher.defense,
          pitchMix: pitcher.pitchMix,
        },
      ])
    ),
    pitcherUsage: state.pitcherUsage,
    plateAppearanceActive: state.plateAppearanceActive,
    isComplete: state.isComplete,
    finalInning: state.finalInning,
    finalHalf: state.finalHalf,
    box: state.box,
    awayTeam: projectTeam(state.awayTeam),
    homeTeam: projectTeam(state.homeTeam),
  };
}

function legacyBattedBallProjection(event) {
  return {
    exitVelocity: event.exitVelocity,
    launchAngle: event.launchAngle,
    qoc: event.qoc,
    outcome: event.outcome,
    source: event.source,
    sampleQuality: event.sampleQuality,
    neighborMode: event.neighborMode,
    expansionLevel: event.expansionLevel,
    targetBattedBalls: event.targetBattedBalls,
    targetWeight: event.targetWeight,
    neighborEffectiveSampleSize: event.neighborEffectiveSampleSize,
    physicalConstraints: event.physicalConstraints,
  };
}

function legacyPitchProjection(event) {
  return {
    pitchType: event.pitchType,
    pitchVelocity: event.pitchVelocity,
    course: event.course,
    isStrike: event.isStrike,
    swung: event.swung,
    actualPoint: event.actualPoint,
    normalizedX: event.normalizedX,
    normalizedZ: event.normalizedZ,
    normalizedRadius: event.normalizedRadius,
    normalizedZoneEdgeDistance: event.normalizedZoneEdgeDistance,
    actualIsZone: event.actualIsZone,
    attackRegion: event.attackRegion,
    attackRegionDetail: event.attackRegionDetail,
    shadowSide: event.shadowSide,
    isMeatball: event.isMeatball,
    zoneRow: event.zoneRow,
    zoneCol: event.zoneCol,
    locationCourse: event.locationCourse,
    locationModel: event.locationModel,
    pitchResult: event.pitchResult,
    paResult: event.paResult,
  };
}

function directionProjection(event) {
  return {
    battedBallEventId: event.battedBallEventId,
    directionMode: event.directionMode,
    directionModel: event.directionModel,
    batterBats: event.batterBats,
    pitcherThrows: event.pitcherThrows,
    resolvedBattingSide: event.resolvedBattingSide,
    directionType: event.directionType,
    measurementClass: event.measurementClass,
    direction: event.direction,
    fieldSector: event.fieldSector,
    batterRelativeSprayAngle: event.batterRelativeSprayAngle,
    sprayAngle: event.sprayAngle,
    horizontalLocation: event.horizontalLocation,
    verticalLocation: event.verticalLocation,
  };
}

function runDirectionGame({
  seed = 12345,
  directionMode = "off",
  directionSeed = 1515,
  capturePresentation = false,
} = {}) {
  const state = createInitialSimState(
    structuredClone(compatibilityTeams.away),
    structuredClone(compatibilityTeams.home)
  );
  const mainSeeded = createSeededRandom(seed);
  const directionSeeded = createSeededRandom(directionSeed);
  const battedBalls = [];
  const pitches = [];
  const logs = [];
  const patches = [];
  let mainRandomCalls = 0;
  let directionRandomCalls = 0;
  const random = () => {
    mainRandomCalls += 1;
    return mainSeeded();
  };
  const directionRandom = () => {
    directionRandomCalls += 1;
    return directionSeeded();
  };
  const options = {
    random,
    directionMode,
    gameKey: `seed:${seed}:game:1`,
    onPitchMeasurement: (event) => pitches.push(event),
    onBattedBallMeasurement: (event) => battedBalls.push(event),
  };
  if (directionMode === "shadow") {
    options.directionRandom = directionRandom;
  }
  if (capturePresentation) {
    options.onLog = (line) => logs.push(line);
    options.onLastPitchPatch = (patch) => patches.push(patch);
  }
  simulateGameMutable(state, options);
  return {
    state,
    battedBalls,
    pitches,
    logs,
    patches,
    mainRandomCalls,
    directionRandomCalls,
    gameplayDigest: digest(gameplayProjection(state)),
    battedBallDigest: digest(battedBalls.map(legacyBattedBallProjection)),
    pitchDigest: digest(pitches.map(legacyPitchProjection)),
    directionDigest: digest(battedBalls.map(directionProjection)),
  };
}

function normalizeLegacySummary(summary) {
  const normalized = structuredClone(summary);
  normalized.reportSchemaVersion = 3;
  normalized.run.elapsedMs = 0;
  normalized.run.gamesPerSecond = 0;
  delete normalized.run.directionMode;
  delete normalized.run.directionSeed;
  delete normalized.run.geometryMode;
  delete normalized.run.defenseMode;
  delete normalized.run.defenseSeed;
  delete normalized.direction;
  delete normalized.geometry;
  delete normalized.defense;
  const removeSpeed = (value) => {
    if (!value || typeof value !== "object") return;
    if (value.ratings && typeof value.ratings === "object") {
      delete value.ratings.speed;
    }
    for (const child of Object.values(value)) removeSpeed(child);
  };
  removeSpeed(normalized);
  for (const side of ["away", "home"]) {
    for (const player of normalized.players[side]) {
      player.key = "<player-key>";
    }
    for (const pitcher of normalized.pitchers[side]) {
      pitcher.key = "<pitcher-key>";
    }
  }
  return normalized;
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

const offRun = runDirectionGame({ directionMode: "off" });
const shadowRun = runDirectionGame({
  directionMode: "shadow",
  directionSeed: 1515,
});
const measurementSummary = await runMeasurementBatches({
  awayTeam: compatibilityTeams.away,
  homeTeam: compatibilityTeams.home,
  gameCount: 10,
  seed: 13579,
});

test("bats, throws, and directionType defaults are correct", () => {
  const batter = createGameBatter("Default Batter", 50, 50, 50);
  const pitcher = createGamePitcher("Default Pitcher", 50, 50);
  assert.equal(batter.profile.bats, "R");
  assert.equal(batter.profile.directionType, "balanced");
  assert.equal(pitcher.profile.throws, "R");
  assert.equal("bats" in batter.ratings, false);
  assert.equal("directionType" in batter.defense, false);
  assert.equal("throws" in pitcher.ratings, false);
});

test("R, L, S bats and R, L throws metadata are validated and retained", () => {
  for (const bats of ["R", "L", "S"]) {
    assert.equal(createBatter(bats).profile.bats, bats);
  }
  for (const throws of ["R", "L"]) {
    assert.equal(createPitcher(throws).profile.throws, throws);
  }
  for (const directionType of BATTER_DIRECTION_TYPES) {
    assert.equal(
      createBatter("R", directionType).profile.directionType,
      directionType
    );
  }
  const snapshot = createSeasonBatterSnapshot(createBatter("L", "oppoLean"));
  assert.equal(snapshot.profile.bats, "L");
  assert.equal(snapshot.profile.directionType, "oppoLean");
  const rosterBatter = createRosterPlayerFromExternalPlayer(
    createBatter("L", "oppoLean")
  );
  const rosterPitcher = createRosterPlayerFromExternalPlayer(
    createPitcher("L")
  );
  assert.equal(rosterBatter.profile.bats, "L");
  assert.equal(rosterBatter.profile.directionType, "oppoLean");
  assert.equal(rosterPitcher.profile.throws, "L");
});

test("switch hitters bat opposite the pitcher's throwing side", () => {
  assert.equal(resolveBattingSide(createBatter("S"), createPitcher("R")), "L");
  assert.equal(resolveBattingSide(createBatter("S"), createPitcher("L")), "R");
  assert.equal(resolveBattingSide(createBatter("R"), createPitcher("L")), "R");
  assert.equal(resolveBattingSide(createBatter("L"), createPitcher("R")), "L");
});

test("explicit invalid identity metadata is rejected", () => {
  for (const extra of [
    { bats: null },
    { bats: "B" },
    { directionType: null },
    { directionType: "power" },
  ]) {
    assert.throws(
      () => createGameBatter("Invalid", 50, 50, 50, extra),
      { code: "PLAYER_IDENTITY_METADATA_INVALID" }
    );
  }
  for (const throws of [null, "S", "right"]) {
    assert.throws(
      () => createGamePitcher("Invalid", 50, 50, {}, { throws }),
      { code: "PLAYER_IDENTITY_METADATA_INVALID" }
    );
  }
});

test("measurementClass boundaries are shared with existing measurement", async () => {
  assert.equal(getMeasurementClass(-90), "GB");
  assert.equal(getMeasurementClass(9.999), "GB");
  assert.equal(getMeasurementClass(10), "LD");
  assert.equal(getMeasurementClass(24.999), "LD");
  assert.equal(getMeasurementClass(25), "FB");
  assert.equal(getMeasurementClass(49.999), "FB");
  assert.equal(getMeasurementClass(50), "PU");
  const advancedSource = await readFile(
    new URL(
      "../services/measurement/measurementAdvancedService.js",
      import.meta.url
    ),
    "utf8"
  );
  assert.match(advancedSource, /getMeasurementClass\(launchAngle\)/);
  assert.doesNotMatch(advancedSource, /function getBattedBallType/);
});

test("Direction probabilities are finite, positive, and normalized", () => {
  for (const launchAngle of [-20, 10, 25, 50]) {
    const built = buildDirectionProbabilities({
      batter: createBatter("R", "balanced"),
      pitcher: createPitcher("R"),
      pitchType: "slider",
      launchAngle,
      normalizedX: -0.5,
      normalizedZ: 0.5,
    });
    const values = Object.values(built.probabilities);
    assert.ok(values.every((value) => Number.isFinite(value) && value > 0));
    assert.ok(Math.abs(values.reduce((sum, value) => sum + value, 0) - 1) < 1e-12);
  }
});

test("GM basic class and directionType ratios match the specified values", () => {
  assert.deepEqual(BATTED_BALL_DIRECTION_CONFIG.measurementClassRatios, {
    GB: { pull: 0.43, center: 0.34, oppo: 0.23 },
    LD: { pull: 0.38, center: 0.37, oppo: 0.25 },
    FB: { pull: 0.4, center: 0.35, oppo: 0.25 },
    PU: { pull: 0.36, center: 0.42, oppo: 0.22 },
  });
  assert.deepEqual(BATTED_BALL_DIRECTION_CONFIG.directionTypeRatios, {
    pullHeavy: { pull: 0.44, center: 0.34, oppo: 0.22 },
    balanced: { pull: 0.35, center: 0.33, oppo: 0.32 },
    oppoLean: { pull: 0.23, center: 0.35, oppo: 0.42 },
  });
});

test("Direction selection preserves strict cumulative boundaries", () => {
  const probabilities = { pull: 0.4, center: 0.35, oppo: 0.25 };
  assert.equal(selectDirectionFromProbabilities(probabilities, 0), "pull");
  assert.equal(selectDirectionFromProbabilities(probabilities, 0.3999), "pull");
  assert.equal(selectDirectionFromProbabilities(probabilities, 0.4), "center");
  assert.equal(selectDirectionFromProbabilities(probabilities, 0.7499), "center");
  assert.equal(selectDirectionFromProbabilities(probabilities, 0.75), "oppo");
});

test("pull, center, and oppo angle sectors are non-overlapping", () => {
  for (const roll of [0, 0.25, 0.5, 0.999999]) {
    const pull = sampleBatterRelativeSprayAngle("pull", roll);
    const center = sampleBatterRelativeSprayAngle("center", roll);
    const oppo = sampleBatterRelativeSprayAngle("oppo", roll);
    assert.ok(pull > 15 && pull <= 45);
    assert.ok(center >= -15 && center < 15);
    assert.ok(oppo >= -45 && oppo < -15);
  }
});

test("sampled categories and angle reclassification always agree", () => {
  for (const direction of ["pull", "center", "oppo"]) {
    for (const roll of [0, 0.1, 0.5, 0.999999]) {
      const angle = sampleBatterRelativeSprayAngle(direction, roll);
      assert.equal(classifyBatterRelativeDirection(angle), direction);
    }
  }
});

test("right- and left-handed field spray angles are mirrors", () => {
  for (const angle of [-45, -15, 0, 15.001, 45]) {
    assert.equal(
      convertToFieldSprayAngle(angle, "R"),
      -convertToFieldSprayAngle(angle, "L")
    );
  }
  assert.equal(classifyFieldSector(convertToFieldSprayAngle(30, "R")), "left");
  assert.equal(classifyFieldSector(convertToFieldSprayAngle(30, "L")), "right");
});

test("inside and outside normalized-X adjustments mirror for R and L", () => {
  const common = {
    pitchType: "fourSeam",
    launchAngle: 20,
    normalizedZ: 0,
  };
  const rightInside = buildDirectionProbabilities({
    ...common,
    batter: createBatter("R"),
    pitcher: createPitcher("R"),
    normalizedX: -0.6,
  });
  const leftInside = buildDirectionProbabilities({
    ...common,
    batter: createBatter("L"),
    pitcher: createPitcher("R"),
    normalizedX: 0.6,
  });
  const rightOutside = buildDirectionProbabilities({
    ...common,
    batter: createBatter("R"),
    pitcher: createPitcher("R"),
    normalizedX: 0.6,
  });
  const leftOutside = buildDirectionProbabilities({
    ...common,
    batter: createBatter("L"),
    pitcher: createPitcher("R"),
    normalizedX: -0.6,
  });
  assert.equal(rightInside.horizontalLocation, "inside");
  assert.equal(leftInside.horizontalLocation, "inside");
  assert.deepEqual(rightInside.probabilities, leftInside.probabilities);
  assert.equal(rightOutside.horizontalLocation, "outside");
  assert.equal(leftOutside.horizontalLocation, "outside");
  assert.deepEqual(rightOutside.probabilities, leftOutside.probabilities);
});

test("course and locationCourse do not alter normalized-coordinate probabilities", () => {
  const base = {
    batter: createBatter("R"),
    pitcher: createPitcher("L"),
    pitchType: "fork",
    launchAngle: 30,
    normalizedX: -0.5,
    normalizedZ: -0.5,
  };
  const first = buildDirectionProbabilities({
    ...base,
    course: "A",
    locationCourse: "Ball",
  });
  const second = buildDirectionProbabilities({
    ...base,
    course: "C",
    locationCourse: "C",
  });
  assert.deepEqual(first, second);
});

test("QoC alone cannot alter Direction probabilities", () => {
  const base = {
    batter: createBatter("R"),
    pitcher: createPitcher("R"),
    pitchType: "curve",
    launchAngle: 12,
    normalizedX: 0,
    normalizedZ: 0,
  };
  assert.deepEqual(
    buildDirectionProbabilities({ ...base, qoc: "Weak" }),
    buildDirectionProbabilities({ ...base, qoc: "Barrel" })
  );
});

test("selectedOutcome is not a Direction input", async () => {
  const base = {
    batter: createBatter("L"),
    pitcher: createPitcher("R"),
    pitchType: "slider",
    launchAngle: 5,
    normalizedX: 0.5,
    normalizedZ: 0,
  };
  assert.deepEqual(
    buildDirectionProbabilities({ ...base, selectedOutcome: "out" }),
    buildDirectionProbabilities({ ...base, selectedOutcome: "homeRun" })
  );
  const source = await readFile(
    new URL("../services/battedBallDirectionService.js", import.meta.url),
    "utf8"
  );
  assert.doesNotMatch(source, /selectedOutcome|attackDirection/);
});

test("off mode consumes no Direction random values", () => {
  let calls = 0;
  const result = generateDirectionShadow({
    mode: "off",
    directionRandom: () => {
      calls += 1;
      return 0;
    },
  });
  assert.equal(result.mode, "off");
  assert.equal(result.directionRngCalls, 0);
  assert.equal(calls, 0);
});

test("shadow mode consumes exactly two Direction random values per fair ball", () => {
  let calls = 0;
  const values = [0.2, 0.8];
  const result = generateDirectionShadow({
    mode: "shadow",
    batter: createBatter("R"),
    pitcher: createPitcher("R"),
    pitchType: "fourSeam",
    launchAngle: 20,
    normalizedX: 0,
    normalizedZ: 0,
    directionRandom: () => values[calls++],
  });
  assert.equal(calls, 2);
  assert.equal(result.directionRngCalls, 2);
  assert.equal(shadowRun.directionRandomCalls, shadowRun.battedBalls.length * 2);
});

test("Direction random cannot be the main random source", async () => {
  const shared = createSeededRandom(15);
  await assert.rejects(
    runMeasurementBatches({
      awayTeam: compatibilityTeams.away,
      homeTeam: compatibilityTeams.home,
      gameCount: 1,
      seed: 15,
      runtime: { random: shared, directionRandom: shared },
    }),
    { code: "BATTED_BALL_DIRECTION_RANDOM_SHARED" }
  );
  const source = await readFile(
    new URL("../services/battedBallDirectionService.js", import.meta.url),
    "utf8"
  );
  assert.doesNotMatch(source, /Math\.random|options\.random/);
});

test("missing Shadow random is a structural error", () => {
  assert.throws(
    () =>
      generateDirectionShadow({
        mode: "shadow",
        batter: createBatter(),
        pitcher: createPitcher(),
        pitchType: "fourSeam",
        launchAngle: 20,
        normalizedX: 0,
        normalizedZ: 0,
      }),
    { code: "BATTED_BALL_DIRECTION_RANDOM_MISSING" }
  );
  assert.equal(
    isStructuralMeasurementError({
      code: "BATTED_BALL_DIRECTION_RANDOM_MISSING",
    }),
    true
  );
});

test("Direction service does not mutate inputs", () => {
  const args = {
    mode: "shadow",
    batter: createBatter("S", "pullHeavy"),
    pitcher: createPitcher("L"),
    pitchType: "slider",
    launchAngle: 24,
    normalizedX: -0.4,
    normalizedZ: 0.4,
  };
  const before = structuredClone(args);
  generateDirectionShadow({
    ...args,
    directionRandom: createSeededRandom(15),
  });
  assert.deepEqual(args, before);
});

test("pitchSequence increments exactly once for each pitch step", () => {
  const teams = createDefaultTeams();
  const state = createInitialGameState(teams.away, teams.home);
  const random = createSeededRandom(1500);
  assert.equal(state.pitchSequence, 0);
  for (let expected = 1; expected <= 3; expected += 1) {
    stepPitchMutable(state, { random });
    assert.equal(state.pitchSequence, expected);
  }
  state.isComplete = true;
  stepPitchMutable(state, { random });
  assert.equal(state.pitchSequence, 3);
});

test("battedBallEventId is unique within a game and independent of UUIDs", () => {
  const ids = shadowRun.battedBalls.map((event) => event.battedBallEventId);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.every((id) => /^seed:12345:game:1:pitch:\d+$/.test(id)));
  for (const team of [
    shadowRun.state.awayTeam,
    shadowRun.state.homeTeam,
  ]) {
    for (const player of team.lineup) {
      assert.ok(ids.every((id) => !id.includes(player.profile.id)));
    }
  }
});

test("off and shadow modes produce identical event keys", () => {
  assert.deepEqual(
    offRun.battedBalls.map((event) => event.battedBallEventId),
    shadowRun.battedBalls.map((event) => event.battedBallEventId)
  );
});

test("the same main and Direction seeds reproduce Direction exactly", () => {
  const repeated = runDirectionGame({
    directionMode: "shadow",
    directionSeed: 1515,
  });
  assert.equal(repeated.directionDigest, shadowRun.directionDigest);
  assert.equal(
    deriveNamespacedSeed(13579, BATTED_BALL_DIRECTION_CONFIG.model),
    deriveNamespacedSeed(13579, BATTED_BALL_DIRECTION_CONFIG.model)
  );
});

test("changing Direction seed changes only Direction metadata", () => {
  const changed = runDirectionGame({
    directionMode: "shadow",
    directionSeed: 999999,
  });
  assert.notEqual(changed.directionDigest, shadowRun.directionDigest);
  assert.equal(changed.gameplayDigest, shadowRun.gameplayDigest);
  assert.equal(changed.battedBallDigest, shadowRun.battedBallDigest);
  assert.equal(changed.pitchDigest, shadowRun.pitchDigest);
  assert.deepEqual(
    changed.battedBalls.map((event) => event.battedBallEventId),
    shadowRun.battedBalls.map((event) => event.battedBallEventId)
  );
});

test("off and shadow modes preserve main random call counts", () => {
  assert.equal(offRun.mainRandomCalls, 3115);
  assert.equal(shadowRun.mainRandomCalls, 3115);
  assert.equal(offRun.mainRandomCalls, shadowRun.mainRandomCalls);
});

test("off and shadow preserve game result, EV/LA, QoC, outcome, and Pitch Location", () => {
  const baseline = {
    gameplayDigest:
      "6894c21c327a6e08a469c0ade0ad330d979fdf419946d5f18af8bf9dc346ec2a",
    battedBallDigest:
      "10da4fcfcbabc3f7d8601c22df3ea9df4eae79b28d17ae83d82fe2daff1509fd",
    pitchDigest:
      "046124cf89a43b4892baa4d46ce667f6645ea5fecd9c12b671cf79012d6592f0",
  };
  for (const run of [offRun, shadowRun]) {
    assert.equal(run.gameplayDigest, baseline.gameplayDigest);
    assert.equal(run.battedBallDigest, baseline.battedBallDigest);
    assert.equal(run.pitchDigest, baseline.pitchDigest);
  }
});

test("Direction metadata never enters lastPitch patches or Japanese logs", () => {
  const run = runDirectionGame({
    directionMode: "shadow",
    directionSeed: 1515,
    capturePresentation: true,
  });
  for (const patch of run.patches) {
    for (const key of [
      "direction",
      "fieldSector",
      "sprayAngle",
      "batterRelativeSprayAngle",
      "directionModel",
    ]) {
      assert.equal(Object.hasOwn(patch, key), false, key);
    }
  }
  assert.doesNotMatch(
    run.logs.join("\n"),
    /Direction|sprayAngle|fieldSector|pull|oppo/
  );
});

test("each fair ball emits exactly one complete Direction measurement event", () => {
  assert.equal(shadowRun.battedBalls.length, 73);
  const required = [
    "battedBallEventId",
    "directionMode",
    "directionModel",
    "batterBats",
    "pitcherThrows",
    "resolvedBattingSide",
    "directionType",
    "measurementClass",
    "direction",
    "fieldSector",
    "batterRelativeSprayAngle",
    "sprayAngle",
    "horizontalLocation",
    "verticalLocation",
  ];
  for (const event of shadowRun.battedBalls) {
    for (const field of required) {
      assert.equal(Object.hasOwn(event, field), true, field);
    }
    assert.equal(event.directionMode, "shadow");
    assert.equal(event.directionModel, "gm_basic_direction_shadow_v1");
    assert.equal(event.outcome, legacyBattedBallProjection(event).outcome);
  }
});

test("Direction opportunities equal fairBattedBalls and RNG calls equal twice that", () => {
  assert.equal(
    measurementSummary.direction.opportunities,
    measurementSummary.battedBallMetrics.fairBattedBalls
  );
  assert.equal(measurementSummary.direction.invalidEvents, 0);
  assert.equal(
    measurementSummary.direction.diagnostics.directionRngCalls,
    measurementSummary.battedBallMetrics.fairBattedBalls * 2
  );
  assert.equal(
    measurementSummary.direction.diagnostics
      .opportunityFairBattedBallMismatchCount,
    0
  );
});

test("direction and fieldSector totals each equal Direction opportunities", () => {
  const total = (distribution) =>
    Object.values(distribution).reduce(
      (sum, value) => sum + value.count,
      0
    );
  assert.equal(
    total(measurementSummary.direction.direction),
    measurementSummary.direction.opportunities
  );
  assert.equal(
    total(measurementSummary.direction.fieldSector),
    measurementSummary.direction.opportunities
  );
  assert.equal(
    measurementSummary.direction.diagnostics.categoryAngleMismatchCount,
    0
  );
});

test("Direction summary retains aggregates but no raw event collection or rolls", () => {
  assert.equal("events" in measurementSummary.direction, false);
  assert.equal("rawEvents" in measurementSummary.direction, false);
  const serialized = JSON.stringify(measurementSummary.direction);
  assert.doesNotMatch(
    serialized,
    /battedBallEventId|directionRoll|angleRoll/
  );
});

test("Summary and Report schemas are version six", () => {
  const report = buildMeasurementReportObject({
    summary: measurementSummary,
    teams: compatibilityTeams,
    generatedAt: "2026-07-28T00:00:00.000Z",
  });
  assert.equal(MEASUREMENT_SUMMARY_SCHEMA_VERSION, 6);
  assert.equal(MEASUREMENT_REPORT_SCHEMA_VERSION, 6);
  assert.equal(measurementSummary.reportSchemaVersion, 6);
  assert.equal(report.reportSchemaVersion, 6);
  assert.equal(report.direction.model, "gm_basic_direction_shadow_v1");
});

test("Markdown contains the Direction Shadow section and required constraints", () => {
  const markdown = buildMeasurementMarkdown({
    summary: measurementSummary,
    teams: compatibilityTeams,
    generatedAt: "2026-07-28T00:00:00.000Z",
  });
  assert.match(markdown, /## Direction Shadow/);
  assert.match(markdown, /sprayAngle is batted-ball field direction/);
  assert.match(markdown, /Statcast Attack Direction/);
  assert.match(markdown, /uniform continuous angle/);
  assert.match(
    markdown,
    /not connected to legacy outcomes or authoritative defense/
  );
  assert.match(markdown, /Timing and a physical intercept\/contact point/);
  assert.match(markdown, /course and locationCourse are not Direction inputs/);
  assert.match(markdown, /baseballsavant\.mlb\.com\/csv-docs/);
});

test("legacy Summary fields and Pitch Location remain exactly compatible", () => {
  assert.equal(
    digest(normalizeLegacySummary(measurementSummary)),
    "743822314a7b654518b19a565a27dd83f5bd293235d7d2eaaefbf978901d1c6a"
  );
  const grid = measurementSummary.breakdowns.locationGrid.combined;
  assert.equal(
    Object.keys(grid).filter((key) => /^r[0-4]c[0-4]$/.test(key)).length,
    25
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

test("all 16 public team outputs and Active Defense nine positions remain valid", () => {
  const teams = createAllPublicGameableTeams();
  assert.equal(teams.length, 16);
  for (const team of teams) {
    assert.equal(validateDefensiveAlignment(team).valid, true, team.name);
    assert.deepEqual(
      Object.keys(team.defensiveAlignment),
      DEFENSIVE_LINEUP_POSITIONS
    );
  }
  const defaults = createDefaultTeams();
  const state = createInitialSimState(defaults.away, defaults.home);
  assert.deepEqual(Object.keys(resolveActiveDefense(state, "home")), [
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
});

test("invalid outcome and structural error contracts do not regress", () => {
  assert.throws(
    () =>
      applySelectedBattedBallOutcome({
        selectedOutcome: "direction-out",
      }),
    { code: "BATTED_BALL_OUTCOME_INVALID" }
  );
  for (const code of [
    "BATTED_BALL_OUTCOME_INVALID",
    "BATTED_BALL_DIRECTION_RANDOM_MISSING",
    PITCH_LOCATION_CONFIG.legacyGridCompatibility.invariantErrorCode,
  ]) {
    assert.equal(isStructuralMeasurementError({ code }), true, code);
  }
});
