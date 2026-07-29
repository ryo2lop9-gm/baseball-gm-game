import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { BATTED_BALL_DIRECTION_CONFIG } from "../config/battedBallDirectionConfig.js";
import {
  DEFENSE_CALIBRATION_CONFIG,
  DEFENSE_CALIBRATION_MODES,
} from "../config/defenseCalibrationConfig.js";
import { BATTED_BALL_DEFENSE_CONFIG } from "../config/defenseProbabilityConfig.js";
import { DEFENSE_POSITIONS } from "../config/defenseConfig.js";
import { generateGeometryShadow } from "../services/defense/battedBallGeometryService.js";
import { calculateDefenseAbilityProbabilities } from "../services/defense/defenseAbilityProbabilityService.js";
import { generateDefenseShadow } from "../services/defense/defenseShadowService.js";
import { loadEvLaLookup } from "../services/evLaLookupStore.js";
import {
  createDefenseCalibrationAccumulator,
  createDefenseCalibrationSeriesAccumulator,
  createDefenseCounterfactualGrid,
  finalizeDefenseCalibrationMeasurement,
  finalizeDefenseCalibrationSeries,
  getDefenseCalibrationProbabilityBinIndex,
  recordDefenseCalibrationMeasurement,
  recordDefenseCalibrationSeries,
} from "../services/measurement/measurementDefenseCalibrationService.js";
import {
  MEASUREMENT_REPORT_SCHEMA_VERSION,
  buildMeasurementMarkdown,
  buildMeasurementReportObject,
} from "../services/measurement/measurementReportService.js";
import {
  MEASUREMENT_SUMMARY_SCHEMA_VERSION,
  runMeasurementBatches,
} from "../services/measurement/measurementService.js";
import {
  createSeededRandom,
  deriveNamespacedSeed,
} from "../services/seededRandomService.js";
import { simulateGameMutable } from "../engine/core/engineCore.js";
import { createMlbAverageValidationTeams } from "../models/teamModels.js";

const lookup = JSON.parse(
  await readFile(new URL("../data/ev_la_lookup.json", import.meta.url), "utf8")
);
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => ({ ok: true, json: async () => lookup });
await loadEvLaLookup();
globalThis.fetch = originalFetch;

const teams = createMlbAverageValidationTeams();
const digest = (value) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

function directionShadow(sprayAngle = 12) {
  return {
    mode: BATTED_BALL_DIRECTION_CONFIG.shadowMode,
    model: BATTED_BALL_DIRECTION_CONFIG.model,
    sprayAngle,
    fieldSector:
      sprayAngle < -15 ? "left" : sprayAngle > 15 ? "right" : "center",
  };
}

function activeDefenseFixture({
  speed = 50,
  fielding = 50,
  arm = 50,
} = {}) {
  return Object.fromEntries(
    DEFENSE_POSITIONS.map((position) => [
      position,
      {
        profile: { id: `codex18:${position}` },
        name: `Player ${position}`,
        ratings: { speed },
        defense: { fielding, arm },
      },
    ])
  );
}

function nestedDefenseFixture({
  eventId = "codex18:event:1",
  exitVelocity = 95,
  launchAngle = 30,
  sprayAngle = 12,
  speed = 50,
  fielding = 50,
  arm = 50,
  defenseSeed = 180018,
} = {}) {
  const direction = directionShadow(sprayAngle);
  const geometry = generateGeometryShadow({
    mode: "shadow",
    battedBallEventId: eventId,
    exitVelocity,
    launchAngle,
    directionShadow: direction,
  });
  const defense = generateDefenseShadow({
    mode: "shadow",
    battedBallEventId: eventId,
    geometryShadow: geometry,
    directionShadow: direction,
    activeDefense: activeDefenseFixture({ speed, fielding, arm }),
    defenseSeed,
  });
  return { direction, geometry, defense };
}

function flattenedCalibrationEvent({
  outcome = "out",
  speed = 50,
  fielding = 50,
  arm = 50,
  eventId = "codex18:event:1",
} = {}) {
  const { geometry, defense } = nestedDefenseFixture({
    speed,
    fielding,
    arm,
    eventId,
  });
  return {
    battedBallEventId: eventId,
    outcome,
    exitVelocity: geometry.exitVelocity,
    launchAngle: geometry.launchAngle,
    trajectoryClass: defense.trajectoryClass,
    fieldSector: defense.fieldSector,
    defenseMode: defense.mode,
    defenseModel: defense.model,
    defenseSource: defense.source,
    defenseEventSchemaVersion: defense.defenseEventSchemaVersion,
    defenseEligible: defense.eligible,
    defenseExclusionReason: defense.exclusionReason,
    responsibleFielderPosition: defense.responsibleFielder.position,
    responsibleFielderPlayerId: defense.responsibleFielder.playerId,
    movementDirection: defense.movementDirection,
    defenseFieldingRating: defense.ratings.fielding,
    defenseSpeedRating: defense.ratings.speed,
    defensePathDistanceFt: defense.timing.pathDistanceFt,
    defenseBallTimeSec: defense.timing.ballTimeSec,
    defenseAverageMarginSec: defense.timing.adjustedAverageMargin,
    defenseActualMarginSec: defense.timing.adjustedActualMargin,
    pReachAverage: defense.probabilities.pReachAverage,
    pSecureAverage: defense.probabilities.pSecureAverage,
    pReachActual: defense.probabilities.pReachActual,
    pSecureActual: defense.probabilities.pSecureActual,
    pStandardAlignmentOut:
      defense.probabilities.pStandardAlignmentOut,
    pAlignedAverageOut: defense.probabilities.pAlignedAverageOut,
    pActualOut: defense.probabilities.pActualOut,
    reachSuccess: defense.shadowCatchResult.reachSuccess,
    secureAttempted: defense.shadowCatchResult.secureAttempted,
    secureSuccess: defense.shadowCatchResult.secureSuccess,
    shadowCaught: defense.shadowCatchResult.caught,
    simCatchOAA: defense.metrics.simCatchOAA,
    expectedSkillOuts: defense.metrics.expectedSkillOuts,
    executionResidual: defense.metrics.executionResidual,
    teamOAA_vsStandard: defense.metrics.teamOAA_vsStandard,
    teamExecutionOAA: defense.metrics.teamExecutionOAA,
    positioningExpectedOuts: defense.metrics.positioningExpectedOuts,
    defenseRngCalls: defense.defenseRngCalls,
    defenseFallbackUsed: defense.fallbackUsed,
    shadowAuthority: defense.shadowAuthority,
  };
}

function directionProjection(event) {
  return {
    eventId: event.battedBallEventId,
    mode: event.directionMode,
    model: event.directionModel,
    direction: event.direction,
    fieldSector: event.fieldSector,
    sprayAngle: event.sprayAngle,
  };
}

function geometryProjection(event) {
  return {
    eventId: event.battedBallEventId,
    mode: event.geometryMode,
    model: event.geometryModel,
    trajectoryClass: event.trajectoryClass,
    radialDistanceFt: event.radialDistanceFt,
    hangTimeSec: event.hangTimeSec,
    landingX: event.landingX,
    landingY: event.landingY,
    candidates: event.fielderGeometryCandidates,
  };
}

function defenseProjection(event) {
  return {
    eventId: event.battedBallEventId,
    mode: event.defenseMode,
    model: event.defenseModel,
    source: event.defenseSource,
    schema: event.defenseEventSchemaVersion,
    eligible: event.defenseEligible,
    reason: event.defenseExclusionReason,
    position: event.responsibleFielderPosition,
    playerId: event.responsibleFielderPlayerId,
    movement: event.movementDirection,
    pReachActual: event.pReachActual,
    pSecureActual: event.pSecureActual,
    pActualOut: event.pActualOut,
    reachSuccess: event.reachSuccess,
    secureAttempted: event.secureAttempted,
    secureSuccess: event.secureSuccess,
    caught: event.shadowCaught,
    simCatchOAA: event.simCatchOAA,
    defenseRngCalls: event.defenseRngCalls,
  };
}

function legacyProjection(event) {
  return {
    eventId: event.battedBallEventId,
    exitVelocity: event.exitVelocity,
    launchAngle: event.launchAngle,
    qoc: event.qoc,
    evLaKey: event.evLaKey,
    source: event.source,
    outcome: event.outcome,
  };
}

function pitchProjection(event) {
  return {
    actualPoint: event.actualPoint,
    normalizedX: event.normalizedX,
    normalizedZ: event.normalizedZ,
    normalizedRadius: event.normalizedRadius,
    actualIsZone: event.actualIsZone,
    attackRegion: event.attackRegion,
    attackRegionDetail: event.attackRegionDetail,
    zoneRow: event.zoneRow,
    zoneCol: event.zoneCol,
    locationCourse: event.locationCourse,
    locationModel: event.locationModel,
    pitchResult: event.pitchResult,
    paResult: event.paResult,
  };
}

async function runCalibrationMode(mode) {
  const seed = 180018;
  const mainSource = createSeededRandom(seed);
  const directionSource = createSeededRandom(
    deriveNamespacedSeed(seed, BATTED_BALL_DIRECTION_CONFIG.model)
  );
  let mainRngCalls = 0;
  let directionRngCalls = 0;
  const battedBalls = [];
  const pitches = [];
  const summary = await runMeasurementBatches({
    awayTeam: teams.away,
    homeTeam: teams.home,
    gameCount: 10,
    seed,
    batchSize: 10,
    runtime: {
      random: () => {
        mainRngCalls += 1;
        return mainSource();
      },
      directionRandom: () => {
        directionRngCalls += 1;
        return directionSource();
      },
      directionMode: "shadow",
      geometryMode: "shadow",
      defenseMode: "shadow",
      defenseCalibrationMode: mode,
      simulateGame: (state, options) =>
        simulateGameMutable(state, {
          ...options,
          onPitchMeasurement: (event) => {
            pitches.push(event);
            options.onPitchMeasurement(event);
          },
          onBattedBallMeasurement: (event) => {
            battedBalls.push(event);
            options.onBattedBallMeasurement(event);
          },
        }),
      yieldControl: async () => {},
    },
  });
  return {
    summary,
    battedBalls,
    pitches,
    mainRngCalls,
    directionRngCalls,
    geometryRngCalls: battedBalls.reduce(
      (sum, event) => sum + event.geometryRngCalls,
      0
    ),
    defenseRngCalls: battedBalls.reduce(
      (sum, event) => sum + event.defenseRngCalls,
      0
    ),
    legacyDigest: digest(battedBalls.map(legacyProjection)),
    directionDigest: digest(battedBalls.map(directionProjection)),
    geometryDigest: digest(battedBalls.map(geometryProjection)),
    defenseDigest: digest(battedBalls.map(defenseProjection)),
    eventIdDigest: digest(
      battedBalls.map((event) => event.battedBallEventId)
    ),
    pitchDigest: digest(pitches.map(pitchProjection)),
  };
}

const offRun = await runCalibrationMode("off");
const diagnosticRun = await runCalibrationMode("diagnostic");
const fixtureEvent = flattenedCalibrationEvent();
const diagnosticReport = buildMeasurementReportObject({
  summary: diagnosticRun.summary,
  teams,
  generatedAt: "2026-07-30T00:00:00.000Z",
});

test("1 Calibration default mode is off", () => {
  assert.deepEqual(DEFENSE_CALIBRATION_MODES, ["off", "diagnostic"]);
  assert.equal(DEFENSE_CALIBRATION_CONFIG.defaultMode, "off");
  assert.equal(offRun.summary.run.defenseCalibrationMode, "off");
  assert.equal(offRun.summary.defenseCalibration.mode, "off");
});

test("2 diagnostic mode is accepted", () => {
  assert.equal(
    diagnosticRun.summary.run.defenseCalibrationMode,
    "diagnostic"
  );
  assert.equal(
    diagnosticRun.summary.defenseCalibration.model,
    "provisional_simple_catch_calibration_v1"
  );
  assert.equal(
    diagnosticRun.summary.defenseCalibration.source,
    "internal_shadow_self_consistency"
  );
});

test("3 invalid Calibration mode is rejected structurally", async () => {
  await assert.rejects(
    runMeasurementBatches({
      awayTeam: teams.away,
      homeTeam: teams.home,
      gameCount: 1,
      seed: 1,
      runtime: { defenseCalibrationMode: "invalid" },
    }),
    { code: "BATTED_BALL_DEFENSE_CALIBRATION_MODE_INVALID" }
  );
});

test("4 off mode performs zero additional evaluations", () => {
  const calibration = offRun.summary.defenseCalibration;
  assert.equal(calibration.evaluations, 0);
  assert.equal(calibration.eligible, 0);
  assert.equal(calibration.performance.counterfactualEvaluations, 0);
});

test("5 refactored fixed fixture exactly matches codex17 arithmetic", () => {
  assert.deepEqual(
    calculateDefenseAbilityProbabilities({
      trajectoryClass: "fly",
      exitVelocity: 95,
      pathDistanceFt: 48,
      ballTimeSec: 3,
      movementDirection: "toward_home",
      speed: 75,
      fielding: 25,
    }),
    {
      standardizedSpeed: 2.5,
      standardizedFielding: -2.5,
      speedMultiplier: 1.075,
      routeMultiplier: 0.9625,
      reactionTimeActual: 0.275,
      moveSpeedActual: 24.8325,
      fielderEtaActual: 2.2079507701600725,
      adjustedActualMargin: 0.7920492298399275,
      pReachActual: 0.7718060348589202,
      pSecureActual: 0.977089910816846,
      pActualOut: 0.7541238897682059,
    }
  );
});

test("6 Defense Shadow uses the pure ability service", async () => {
  const source = await readFile(
    new URL(
      "../services/defense/defenseShadowService.js",
      import.meta.url
    ),
    "utf8"
  );
  assert.match(source, /calculateDefenseAbilityProbabilities\(\{/);
  assert.doesNotMatch(source, /pathDistanceFt\s*\/\s*moveSpeedActual/);
});

test("7 neutral ability makes pActual equal pAligned", () => {
  assert.equal(fixtureEvent.pActualOut, fixtureEvent.pAlignedAverageOut);
});

test("8 actual player event equals the pure ability evaluation", () => {
  const event = flattenedCalibrationEvent({ speed: 75, fielding: 25 });
  const pure = calculateDefenseAbilityProbabilities({
    trajectoryClass: event.trajectoryClass,
    exitVelocity: event.exitVelocity,
    pathDistanceFt: event.defensePathDistanceFt,
    ballTimeSec: event.defenseBallTimeSec,
    movementDirection: event.movementDirection,
    speed: 75,
    fielding: 25,
  });
  assert.equal(pure.pReachActual, event.pReachActual);
  assert.equal(pure.pSecureActual, event.pSecureActual);
  assert.equal(pure.pActualOut, event.pActualOut);
});

test("9 Catch Calibration uses pActualOut", () => {
  const accumulator = createDefenseCalibrationAccumulator();
  recordDefenseCalibrationMeasurement(accumulator, fixtureEvent);
  assert.equal(accumulator.catch.predictedSum, fixtureEvent.pActualOut);
  assert.equal(
    accumulator.catch.observedSum,
    fixtureEvent.shadowCaught ? 1 : 0
  );
});

test("10 Reach Calibration uses pReachActual", () => {
  const accumulator = createDefenseCalibrationAccumulator();
  recordDefenseCalibrationMeasurement(accumulator, fixtureEvent);
  assert.equal(
    accumulator.reach.predictedSum,
    fixtureEvent.pReachActual
  );
  assert.equal(
    accumulator.reach.observedSum,
    fixtureEvent.reachSuccess ? 1 : 0
  );
});

test("11 Secure Calibration uses attempted opportunities only", () => {
  const attempted = {
    ...fixtureEvent,
    reachSuccess: true,
    secureAttempted: true,
    secureSuccess: true,
    shadowCaught: true,
  };
  const accumulator = createDefenseCalibrationAccumulator();
  recordDefenseCalibrationMeasurement(accumulator, attempted);
  assert.equal(accumulator.secure.count, 1);
  assert.equal(accumulator.secure.predictedSum, attempted.pSecureActual);
});

test("12 unused secure roll is excluded after reach failure", () => {
  const notReached = {
    ...fixtureEvent,
    reachSuccess: false,
    secureAttempted: false,
    secureSuccess: null,
    shadowCaught: false,
  };
  const accumulator = createDefenseCalibrationAccumulator();
  recordDefenseCalibrationMeasurement(accumulator, notReached);
  assert.equal(accumulator.catch.count, 1);
  assert.equal(accumulator.reach.count, 1);
  assert.equal(accumulator.secure.count, 0);
});

test("13 every 5% boundary has a fixed bin", () => {
  for (let index = 0; index < 20; index += 1) {
    const boundary = index / 20;
    assert.equal(
      getDefenseCalibrationProbabilityBinIndex(boundary),
      index
    );
    if (index > 0) {
      assert.equal(
        getDefenseCalibrationProbabilityBinIndex(
          boundary - Number.EPSILON
        ),
        index - 1
      );
    }
  }
});

test("14 p=1 belongs to the final probability bin", () => {
  assert.equal(getDefenseCalibrationProbabilityBinIndex(1), 19);
});

function twoPointSeries() {
  const accumulator = createDefenseCalibrationSeriesAccumulator();
  recordDefenseCalibrationSeries(accumulator, 0.2, false);
  recordDefenseCalibrationSeries(accumulator, 0.8, true);
  return finalizeDefenseCalibrationSeries(accumulator);
}

test("15 predictedSum and observedSum are exact", () => {
  const series = twoPointSeries();
  assert.equal(series.predictedSum, 1);
  assert.equal(series.observedSum, 1);
});

test("16 varianceSum is sum p times one-minus-p", () => {
  assert.ok(Math.abs(twoPointSeries().varianceSum - 0.32) < 1e-15);
});

test("17 standardizedResidual follows the specified formula", () => {
  const accumulator = createDefenseCalibrationSeriesAccumulator();
  recordDefenseCalibrationSeries(accumulator, 0.5, true);
  assert.equal(
    finalizeDefenseCalibrationSeries(accumulator)
      .standardizedResidual,
    1
  );
});

test("18 Brier score is the mean squared probability error", () => {
  assert.ok(Math.abs(twoPointSeries().brierScore - 0.04) < 1e-15);
});

test("19 log loss stays finite at probability endpoints", () => {
  const accumulator = createDefenseCalibrationSeriesAccumulator();
  recordDefenseCalibrationSeries(accumulator, 0, false);
  recordDefenseCalibrationSeries(accumulator, 1, true);
  assert.equal(
    Number.isFinite(
      finalizeDefenseCalibrationSeries(accumulator).logLoss
    ),
    true
  );
});

test("20 ECE and maximum bin gap use populated bins", () => {
  const series = twoPointSeries();
  assert.ok(Math.abs(series.ece - 0.2) < 1e-15);
  assert.ok(Math.abs(series.maximumBinGap - 0.2) < 1e-15);
});

test("21 Counterfactual Grid creates exactly nine cells", () => {
  const grid = createDefenseCounterfactualGrid(fixtureEvent);
  assert.equal(grid.cells.length, 9);
  assert.deepEqual(
    new Set(grid.cells.map((cell) => cell.speed)),
    new Set([25, 50, 75])
  );
  assert.deepEqual(
    new Set(grid.cells.map((cell) => cell.fielding)),
    new Set([25, 50, 75])
  );
});

test("22 Grid never reselects the Responsible Fielder", () => {
  const grid = createDefenseCounterfactualGrid(fixtureEvent);
  assert.ok(
    grid.cells.every(
      (cell) =>
        cell.responsibleFielderPosition ===
        fixtureEvent.responsibleFielderPosition
    )
  );
});

test("23 Grid consumes no random values", () => {
  const originalRandom = Math.random;
  Math.random = () => {
    throw new Error("Counterfactual Grid consumed RNG.");
  };
  try {
    assert.equal(createDefenseCounterfactualGrid(fixtureEvent).cells.length, 9);
  } finally {
    Math.random = originalRandom;
  }
});

test("24 SPD sensitivity is monotonic", () => {
  const grid = createDefenseCounterfactualGrid(fixtureEvent).cells;
  for (const fielding of [25, 50, 75]) {
    const values = grid
      .filter((cell) => cell.fielding === fielding)
      .sort((left, right) => left.speed - right.speed);
    assert.ok(values[1].pActualOut >= values[0].pActualOut);
    assert.ok(values[2].pActualOut >= values[1].pActualOut);
  }
});

test("25 FLD sensitivity is monotonic", () => {
  const grid = createDefenseCounterfactualGrid(fixtureEvent).cells;
  for (const speed of [25, 50, 75]) {
    const values = grid
      .filter((cell) => cell.speed === speed)
      .sort((left, right) => left.fielding - right.fielding);
    assert.ok(values[1].pActualOut >= values[0].pActualOut);
    assert.ok(values[2].pActualOut >= values[1].pActualOut);
  }
});

test("26 pure ability probability is independent of ARM", () => {
  const input = {
    trajectoryClass: "fly",
    exitVelocity: 95,
    pathDistanceFt: 48,
    ballTimeSec: 3,
    movementDirection: "toward_home",
    speed: 50,
    fielding: 50,
  };
  assert.deepEqual(
    calculateDefenseAbilityProbabilities({ ...input, arm: 0 }),
    calculateDefenseAbilityProbabilities({ ...input, arm: 100 })
  );
});

test("27 Neutral Grid cell has zero difference", () => {
  const neutral = createDefenseCounterfactualGrid(
    fixtureEvent
  ).cells.find((cell) => cell.speed === 50 && cell.fielding === 50);
  assert.equal(neutral.pActualOut, fixtureEvent.pAlignedAverageOut);
  assert.equal(neutral.differenceFromNeutral, 0);
});

test("28 Counterfactual evaluation does not mutate player event data", () => {
  const before = structuredClone(fixtureEvent);
  createDefenseCounterfactualGrid(fixtureEvent);
  assert.deepEqual(fixtureEvent, before);
});

test("29 selectedOutcome cannot change Calibration probabilities", () => {
  const out = createDefenseCounterfactualGrid({
    ...fixtureEvent,
    outcome: "out",
  });
  const homeRun = createDefenseCounterfactualGrid({
    ...fixtureEvent,
    outcome: "homeRun",
  });
  assert.deepEqual(out, homeRun);
});

test("30 only legacy comparison reads selectedOutcome", () => {
  const outAccumulator = createDefenseCalibrationAccumulator();
  const safeAccumulator = createDefenseCalibrationAccumulator();
  recordDefenseCalibrationMeasurement(outAccumulator, {
    ...fixtureEvent,
    outcome: "out",
  });
  recordDefenseCalibrationMeasurement(safeAccumulator, {
    ...fixtureEvent,
    outcome: "single",
  });
  const out = finalizeDefenseCalibrationMeasurement(outAccumulator, {
    mode: "diagnostic",
  });
  const safe = finalizeDefenseCalibrationMeasurement(safeAccumulator, {
    mode: "diagnostic",
  });
  assert.deepEqual(out.calibration, safe.calibration);
  assert.deepEqual(out.counterfactualGrid, safe.counterfactualGrid);
  assert.equal(out.legacyComparison.overall.legacyOutCount, 1);
  assert.equal(safe.legacyComparison.overall.legacySafeCount, 1);
});

test("31 Calibration off and diagnostic preserve legacy digest", () => {
  assert.equal(offRun.legacyDigest, diagnosticRun.legacyDigest);
  assert.deepEqual(offRun.summary.results, diagnosticRun.summary.results);
});

test("32 Direction, Geometry, and Defense digests are unchanged", () => {
  assert.equal(offRun.directionDigest, diagnosticRun.directionDigest);
  assert.equal(offRun.geometryDigest, diagnosticRun.geometryDigest);
  assert.equal(offRun.defenseDigest, diagnosticRun.defenseDigest);
  assert.equal(offRun.eventIdDigest, diagnosticRun.eventIdDigest);
});

test("33 every RNG call count is unchanged", () => {
  assert.equal(offRun.mainRngCalls, diagnosticRun.mainRngCalls);
  assert.equal(offRun.directionRngCalls, diagnosticRun.directionRngCalls);
  assert.equal(offRun.geometryRngCalls, diagnosticRun.geometryRngCalls);
  assert.equal(offRun.defenseRngCalls, diagnosticRun.defenseRngCalls);
  assert.equal(offRun.geometryRngCalls, 0);
});

test("34 Calibration retains no raw events or raw probability arrays", () => {
  const accumulator = createDefenseCalibrationAccumulator();
  const serialized = JSON.stringify(accumulator);
  assert.doesNotMatch(
    serialized,
    /battedBallEventId|reachRoll|secureRoll|rawEvents|probabilityValues/
  );
  assert.equal("events" in accumulator, false);
  assert.equal(
    diagnosticRun.summary.defenseCalibration.performance.rawEventsStored,
    false
  );
  assert.equal(
    diagnosticRun.summary.defenseCalibration.performance
      .rawProbabilitiesStored,
    false
  );
});

test("35 Authority Readiness Gate remains closed", () => {
  const gate = diagnosticRun.summary.defenseCalibration.readinessGate;
  assert.equal(gate.alignmentComparisonAvailable, false);
  assert.equal(gate.wallModelAvailable, false);
  assert.equal(gate.linerCatchModelAvailable, false);
  assert.equal(gate.authoritySwitchReady, false);
  assert.ok(gate.blockers.includes("legacy_authority_retained"));
});

test("36 Summary and Report schema are v7", () => {
  assert.equal(MEASUREMENT_SUMMARY_SCHEMA_VERSION, 7);
  assert.equal(MEASUREMENT_REPORT_SCHEMA_VERSION, 7);
  assert.equal(diagnosticRun.summary.reportSchemaVersion, 7);
  assert.equal(diagnosticReport.reportSchemaVersion, 7);
});

test("37 every schema v6 top-level field remains present", () => {
  const summaryFields = [
    "battedBallMetrics", "battingProfiles", "breakdowns",
    "contactDisposition", "defense", "diagnostics", "direction",
    "gameDistribution", "geometry", "pitchLocation", "pitchers",
    "plateDiscipline", "players", "qoc", "referenceBenchmark",
    "referenceComparison", "reportSchemaVersion", "results", "run",
    "simulationErrors", "smoothingDiagnostics", "status",
  ];
  const reportFields = [
    "battedBallMetrics", "battedBallProfiles", "batting", "breakdowns",
    "contactDisposition", "defense", "definitions", "diagnostics",
    "direction", "engineConfig", "gameDistribution", "generatedAt",
    "geometry", "modelLimitations", "partial", "pitchLocation",
    "pitchers", "pitching", "plateDiscipline", "players", "qoc",
    "referenceBenchmark", "referenceComparison", "reportSchemaVersion",
    "reportType", "results", "run", "simulationErrors",
    "smoothingDiagnostics", "status", "teams", "validationPreset",
    "validationPresetLabel",
  ];
  for (const field of summaryFields) {
    assert.equal(Object.hasOwn(diagnosticRun.summary, field), true, field);
  }
  for (const field of reportFields) {
    assert.equal(Object.hasOwn(diagnosticReport, field), true, field);
  }
});

test("38 Markdown states every Calibration definition and limitation", () => {
  const markdown = buildMeasurementMarkdown({
    summary: diagnosticRun.summary,
    teams,
    generatedAt: "2026-07-30T00:00:00.000Z",
  });
  for (const expected of [
    "Simple Catch Defense Calibration",
    "internal Shadow self-consistency",
    "not calibration to an official MLB model",
    "eligible fly/popup",
    "Secure is conditional on reach success",
    "executionResidual = caught - pActualOut",
    "legacy out is a comparison result",
    "contact as t = 0",
    "Walls, liner en-route catches",
    "Resolution Authority remains legacy",
    "authoritySwitchReady: false",
  ]) {
    assert.match(markdown, new RegExp(expected.replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&"
    )));
  }
});

test("39 normal UI, lastPitch, logs, and engine authority stay untouched", async () => {
  const [engineSource, plateSource, html] = await Promise.all([
    readFile(
      new URL("../engine/core/engineCore.js", import.meta.url),
      "utf8"
    ),
    readFile(
      new URL("../services/plateAppearanceService.js", import.meta.url),
      "utf8"
    ),
    readFile(new URL("../index.html", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(engineSource, /defenseCalibration/i);
  assert.doesNotMatch(plateSource, /defenseCalibration/i);
  assert.match(
    html,
    /id="measurementDefenseCalibrationMode"[\s\S]*value="off" selected/
  );
  assert.deepEqual(offRun.summary.results, diagnosticRun.summary.results);
});

test("40 Pitch Location and measurement outputs preserve compatibility", async () => {
  assert.equal(offRun.pitchDigest, diagnosticRun.pitchDigest);
  assert.deepEqual(
    offRun.summary.pitchLocation,
    diagnosticRun.summary.pitchLocation
  );
  assert.equal(
    diagnosticRun.summary.defenseCalibration.performance
      .counterfactualEvaluations,
    diagnosticRun.summary.defenseCalibration.eligible * 9
  );
  const [pageSource, workerSource] = await Promise.all([
    readFile(
      new URL("../pages/measurementPage.js", import.meta.url),
      "utf8"
    ),
    readFile(
      new URL("../workers/tuningMeasurementWorker.js", import.meta.url),
      "utf8"
    ),
  ]);
  assert.match(pageSource, /defenseCalibrationMode/);
  assert.match(workerSource, /defenseCalibrationMode/);
});
