import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  BATTED_BALL_DIRECTION_CONFIG,
} from "../config/battedBallDirectionConfig.js";
import {
  DEFENSE_POSITIONS,
  DEFENSIVE_LINEUP_POSITIONS,
} from "../config/defenseConfig.js";
import {
  FIELD_GEOMETRY_CONFIG,
} from "../config/fieldGeometryConfig.js";
import { RESOLUTION_AUTHORITY_CONFIG } from "../config/resolutionAuthorityConfig.js";
import { TRAJECTORY_MODEL_CONFIG } from "../config/trajectoryModelConfig.js";
import { simulateGameMutable } from "../engine/core/engineCore.js";
import { createMlbAverageValidationTeams } from "../models/teamModels.js";
import {
  buildAirTrajectory,
  buildFielderGeometryCandidates,
  buildGroundTrajectory,
  classifyTrajectoryClass,
  convertPolarToFieldPoint,
  generateGeometryShadow,
} from "../services/defense/battedBallGeometryService.js";
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
import { createInitialSimState } from "../state/gameState.js";

const lookup = JSON.parse(
  await readFile(new URL("../data/ev_la_lookup.json", import.meta.url), "utf8")
);
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => ({ ok: true, json: async () => lookup });
await loadEvLaLookup();
globalThis.fetch = originalFetch;

const teams = createMlbAverageValidationTeams();
const directionShadow = Object.freeze({
  mode: BATTED_BALL_DIRECTION_CONFIG.shadowMode,
  model: BATTED_BALL_DIRECTION_CONFIG.model,
  sprayAngle: 12,
});
const baseGeometryInput = Object.freeze({
  mode: FIELD_GEOMETRY_CONFIG.shadowMode,
  battedBallEventId: "codex16:test:event:1",
  exitVelocity: 95,
  launchAngle: 25,
  directionShadow,
});

function digest(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function assertFiniteTree(value, path = "value") {
  if (typeof value === "number") {
    assert.equal(Number.isFinite(value), true, path);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      assertFiniteTree(entry, `${path}[${index}]`)
    );
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      assertFiniteTree(entry, `${path}.${key}`);
    }
  }
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

function runGeometryGame(geometryMode) {
  const state = createInitialSimState(
    structuredClone(teams.away),
    structuredClone(teams.home)
  );
  const mainSeeded = createSeededRandom(12345);
  const directionSeeded = createSeededRandom(
    deriveNamespacedSeed(12345, BATTED_BALL_DIRECTION_CONFIG.model)
  );
  let mainRandomCalls = 0;
  let directionRandomCalls = 0;
  const battedBalls = [];
  const pitches = [];
  const logs = [];
  const patches = [];
  simulateGameMutable(state, {
    geometryMode,
    directionMode: "shadow",
    gameKey: "seed:12345:game:1",
    random: () => {
      mainRandomCalls += 1;
      return mainSeeded();
    },
    directionRandom: () => {
      directionRandomCalls += 1;
      return directionSeeded();
    },
    onBattedBallMeasurement: (event) => battedBalls.push(event),
    onPitchMeasurement: (event) => pitches.push(event),
    onLog: (line) => logs.push(line),
    onLastPitchPatch: (patch) => patches.push(patch),
  });
  return {
    state,
    battedBalls,
    pitches,
    logs,
    patches,
    mainRandomCalls,
    directionRandomCalls,
    gameplayDigest: digest(gameplayProjection(state)),
    battedBallDigest: digest(
      battedBalls.map(legacyBattedBallProjection)
    ),
    pitchDigest: digest(pitches.map(legacyPitchProjection)),
    directionDigest: digest(battedBalls.map(directionProjection)),
  };
}

const geometryOffRun = runGeometryGame("off");
const geometryShadowRun = runGeometryGame("shadow");
const measurementSummary = await runMeasurementBatches({
  awayTeam: teams.away,
  homeTeam: teams.home,
  gameCount: 10,
  seed: 13579,
});
const measurementReport = buildMeasurementReportObject({
  summary: measurementSummary,
  teams,
  generatedAt: "2026-07-28T00:00:00.000Z",
});

test("field axes, units, and base coordinates match the configured model", () => {
  const axis = 90 / Math.sqrt(2);
  assert.equal(FIELD_GEOMETRY_CONFIG.coordinateSystem, "home_plate_xy_feet_v1");
  assert.deepEqual(FIELD_GEOMETRY_CONFIG.units, {
    distance: "feet",
    time: "seconds",
    speed: "feet_per_second",
  });
  assert.deepEqual(FIELD_GEOMETRY_CONFIG.bases.home, { x: 0, y: 0 });
  assert.deepEqual(FIELD_GEOMETRY_CONFIG.bases.first, { x: axis, y: axis });
  assert.deepEqual(FIELD_GEOMETRY_CONFIG.bases.second, {
    x: 0,
    y: 90 * Math.sqrt(2),
  });
  assert.deepEqual(FIELD_GEOMETRY_CONFIG.bases.third, { x: -axis, y: axis });
});

test("negative and positive spray angles map left and right", () => {
  assert.ok(convertPolarToFieldPoint(100, -20).x < 0);
  assert.ok(convertPolarToFieldPoint(100, 20).x > 0);
  assert.ok(convertPolarToFieldPoint(100, 0).y > 0);
});

test("minus and plus 45 degrees lie on the fair lines", () => {
  for (const angle of [-45, 45]) {
    const point = convertPolarToFieldPoint(100, angle);
    assert.ok(Math.abs(Math.abs(point.x) - point.y) < 1e-9);
  }
});

test("trajectoryClass uses every fixed launch-angle boundary", () => {
  assert.equal(classifyTrajectoryClass(4.999), "ground");
  assert.equal(classifyTrajectoryClass(5), "low_liner");
  assert.equal(classifyTrajectoryClass(10), "air_liner");
  assert.equal(classifyTrajectoryClass(25), "fly");
  assert.equal(classifyTrajectoryClass(50), "popup");
});

test("measurementClass retains its existing independent boundaries", () => {
  assert.equal(getMeasurementClass(9.999), "GB");
  assert.equal(getMeasurementClass(10), "LD");
  assert.equal(getMeasurementClass(25), "FB");
  assert.equal(getMeasurementClass(50), "PU");
  assert.notEqual(getMeasurementClass(7), classifyTrajectoryClass(7));
});

test("identical EV, LA, and spray inputs produce identical Geometry", () => {
  assert.deepEqual(
    generateGeometryShadow(baseGeometryInput),
    generateGeometryShadow(baseGeometryInput)
  );
});

test("all numeric air trajectory and candidate values are finite", () => {
  assertFiniteTree(generateGeometryShadow(baseGeometryInput));
});

test("all numeric ground trajectory and candidate values are finite", () => {
  assertFiniteTree(
    generateGeometryShadow({
      ...baseGeometryInput,
      launchAngle: 0,
    })
  );
});

test("radial distance equals the landing point Euclidean distance", () => {
  const geometry = generateGeometryShadow(baseGeometryInput);
  const { landingPoint, radialDistanceFt } = geometry.trajectory;
  assert.ok(
    Math.abs(Math.hypot(landingPoint.x, landingPoint.y) - radialDistanceFt) <
      1e-9
  );
});

test("mirrored spray angles change only the landing x sign", () => {
  const left = buildAirTrajectory({
    exitVelocity: 95,
    launchAngle: 25,
    sprayAngle: -20,
  });
  const right = buildAirTrajectory({
    exitVelocity: 95,
    launchAngle: 25,
    sprayAngle: 20,
  });
  assert.equal(left.landingPoint.x, -right.landingPoint.x);
  assert.equal(left.landingPoint.y, right.landingPoint.y);
});

test("higher EV does not reduce distance at the same air launch angle", () => {
  const low = buildAirTrajectory({
    exitVelocity: 80,
    launchAngle: 30,
    sprayAngle: 0,
  });
  const high = buildAirTrajectory({
    exitVelocity: 100,
    launchAngle: 30,
    sprayAngle: 0,
  });
  assert.ok(high.radialDistanceFt >= low.radialDistanceFt);
});

test("ground stop distance is never below first-ground distance", () => {
  const trajectory = buildGroundTrajectory({
    exitVelocity: 95,
    launchAngle: 0,
    sprayAngle: 10,
  });
  assert.ok(trajectory.stopDistanceFt >= trajectory.firstGroundDistanceFt);
});

test("ground stop time is never below first-ground time", () => {
  const trajectory = buildGroundTrajectory({
    exitVelocity: 95,
    launchAngle: 0,
    sprayAngle: 10,
  });
  assert.ok(trajectory.stopTimeSec >= trajectory.firstGroundTimeSec);
});

test("all nine fixed fielding positions receive a candidate", () => {
  const geometry = generateGeometryShadow(baseGeometryInput);
  assert.deepEqual(
    geometry.fielderCandidates.map((candidate) => candidate.position),
    DEFENSE_POSITIONS
  );
});

test("candidate start points exactly match the alignment config", () => {
  const geometry = generateGeometryShadow(baseGeometryInput);
  for (const candidate of geometry.fielderCandidates) {
    assert.deepEqual(
      candidate.startPoint,
      FIELD_GEOMETRY_CONFIG.fielderStartPoints[candidate.position]
    );
  }
});

test("air candidates all target the landing point", () => {
  const geometry = generateGeometryShadow(baseGeometryInput);
  for (const candidate of geometry.fielderCandidates) {
    assert.equal(candidate.candidateKind, "air_landing");
    assert.deepEqual(candidate.targetPoint, geometry.trajectory.landingPoint);
  }
});

test("ground intercept candidate times stay inside the ground path", () => {
  const geometry = generateGeometryShadow({
    ...baseGeometryInput,
    exitVelocity: 95,
    launchAngle: 0,
    directionShadow: { ...directionShadow, sprayAngle: 0 },
  });
  const intercept = geometry.fielderCandidates.find(
    (candidate) => candidate.candidateKind === "ground_intercept"
  );
  assert.ok(intercept);
  assert.ok(intercept.ballTimeSec >= 0);
  assert.ok(intercept.ballTimeSec <= geometry.trajectory.stopTimeSec);
  assert.deepEqual(intercept.targetPoint, intercept.interceptPoint);
});

test("unreachable ground paths use post-stop recovery candidates", () => {
  const trajectory = buildGroundTrajectory({
    exitVelocity: 0,
    launchAngle: 0,
    sprayAngle: 0,
  });
  const candidates = buildFielderGeometryCandidates(trajectory);
  assert.ok(
    candidates.every(
      (candidate) => candidate.candidateKind === "post_stop_recovery"
    )
  );
  assert.ok(
    candidates.every(
      (candidate) =>
        JSON.stringify(candidate.targetPoint) ===
        JSON.stringify(trajectory.stopPoint)
    )
  );
});

test("every candidate ETA and arrival margin is finite", () => {
  const geometry = generateGeometryShadow({
    ...baseGeometryInput,
    launchAngle: 0,
  });
  for (const candidate of geometry.fielderCandidates) {
    assert.equal(Number.isFinite(candidate.fielderEtaSec), true);
    assert.equal(Number.isFinite(candidate.arrivalMarginSec), true);
  }
});

test("Geometry never produces a responsible fielder or probability", () => {
  const serialized = JSON.stringify(generateGeometryShadow(baseGeometryInput));
  assert.doesNotMatch(
    serialized,
    /responsibleFielder|backupFielder|pReach|pSecure|pActualOut|shadowOutcome|simCatchOAA/
  );
});

test("QoC metadata cannot alter Geometry", () => {
  assert.deepEqual(
    generateGeometryShadow({ ...baseGeometryInput, qoc: "Barrel" }),
    generateGeometryShadow({ ...baseGeometryInput, qoc: "Weak" })
  );
});

test("selectedOutcome is neither read nor reflected by Geometry", () => {
  assert.deepEqual(
    generateGeometryShadow({
      ...baseGeometryInput,
      selectedOutcome: "homeRun",
    }),
    generateGeometryShadow({
      ...baseGeometryInput,
      selectedOutcome: "out",
    })
  );
});

test("course and locationCourse cannot alter Geometry", () => {
  assert.deepEqual(
    generateGeometryShadow({
      ...baseGeometryInput,
      course: "A",
      locationCourse: "Ball",
    }),
    generateGeometryShadow({
      ...baseGeometryInput,
      course: "Ball",
      locationCourse: "C",
    })
  );
});

test("FLD and ARM metadata cannot alter Geometry", () => {
  assert.deepEqual(
    generateGeometryShadow({
      ...baseGeometryInput,
      fielderRatings: { FLD: 0, ARM: 0 },
    }),
    generateGeometryShadow({
      ...baseGeometryInput,
      fielderRatings: { FLD: 100, ARM: 100 },
    })
  );
});

test("Geometry service does not mutate its input object", () => {
  const input = structuredClone(baseGeometryInput);
  const before = structuredClone(input);
  generateGeometryShadow(input);
  assert.deepEqual(input, before);
});

test("off mode does not generate trajectories or candidates", () => {
  const geometry = generateGeometryShadow({
    mode: "off",
    battedBallEventId: "off:event",
  });
  assert.equal(geometry.trajectory, null);
  assert.equal(geometry.fielderCandidates, null);
  assert.equal(geometry.geometryRngCalls, 0);
});

test("Geometry shadow explicitly rejects Direction off", () => {
  assert.throws(
    () =>
      generateGeometryShadow({
        ...baseGeometryInput,
        directionShadow: { mode: "off", sprayAngle: null },
      }),
    { code: "BATTED_BALL_GEOMETRY_DIRECTION_REQUIRED" }
  );
});

test("Geometry off and shadow consume identical main RNG calls", () => {
  assert.equal(geometryOffRun.mainRandomCalls, 3115);
  assert.equal(
    geometryShadowRun.mainRandomCalls,
    geometryOffRun.mainRandomCalls
  );
});

test("Geometry off and shadow consume identical Direction RNG calls", () => {
  assert.equal(geometryOffRun.directionRandomCalls, 146);
  assert.equal(
    geometryShadowRun.directionRandomCalls,
    geometryOffRun.directionRandomCalls
  );
  assert.equal(
    geometryShadowRun.directionRandomCalls,
    geometryShadowRun.battedBalls.length * 2
  );
});

test("Geometry off and shadow preserve Direction output exactly", () => {
  assert.equal(
    geometryOffRun.directionDigest,
    "d736f0dc197be9d6d1cd49576b671fcec7fd970687e96dfa4b8978d84e64f21d"
  );
  assert.equal(
    geometryShadowRun.directionDigest,
    geometryOffRun.directionDigest
  );
});

test("Geometry modes preserve game, EV, LA, QoC, lookup, and outcome digests", () => {
  const expected = {
    gameplayDigest:
      "6894c21c327a6e08a469c0ade0ad330d979fdf419946d5f18af8bf9dc346ec2a",
    battedBallDigest:
      "10da4fcfcbabc3f7d8601c22df3ea9df4eae79b28d17ae83d82fe2daff1509fd",
    pitchDigest:
      "046124cf89a43b4892baa4d46ce667f6645ea5fecd9c12b671cf79012d6592f0",
  };
  for (const run of [geometryOffRun, geometryShadowRun]) {
    assert.equal(run.gameplayDigest, expected.gameplayDigest);
    assert.equal(run.battedBallDigest, expected.battedBallDigest);
    assert.equal(run.pitchDigest, expected.pitchDigest);
  }
});

test("Geometry modes preserve every batted-ball event key", () => {
  assert.deepEqual(
    geometryShadowRun.battedBalls.map(
      (event) => event.battedBallEventId
    ),
    geometryOffRun.battedBalls.map((event) => event.battedBallEventId)
  );
});

test("each fair ball emits exactly one complete Geometry event", () => {
  assert.equal(geometryShadowRun.battedBalls.length, 73);
  assert.equal(
    new Set(
      geometryShadowRun.battedBalls.map(
        (event) => event.battedBallEventId
      )
    ).size,
    geometryShadowRun.battedBalls.length
  );
  for (const event of geometryShadowRun.battedBalls) {
    assert.equal(event.geometryMode, "shadow");
    assert.equal(event.geometryModel, FIELD_GEOMETRY_CONFIG.model);
    assert.equal(event.fielderGeometryCandidates.length, 9);
    assert.equal(event.geometryRngCalls, 0);
  }
});

test("Geometry opportunities equal fair batted balls", () => {
  assert.equal(measurementSummary.geometry.opportunities, 661);
  assert.equal(
    measurementSummary.geometry.opportunities,
    measurementSummary.battedBallMetrics.fairBattedBalls
  );
  assert.equal(
    measurementSummary.geometry.diagnostics
      .opportunityFairBattedBallMismatchCount,
    0
  );
});

test("Geometry opportunities equal Direction opportunities", () => {
  assert.equal(
    measurementSummary.geometry.opportunities,
    measurementSummary.direction.opportunities
  );
  assert.equal(
    measurementSummary.geometry.diagnostics
      .opportunityDirectionMismatchCount,
    0
  );
  assert.equal(
    measurementSummary.direction.diagnostics.directionRngCalls,
    1322
  );
});

test("Geometry aggregation retains no raw events or raw value arrays", () => {
  const serialized = JSON.stringify(measurementSummary.geometry);
  assert.doesNotMatch(
    serialized,
    /battedBallEventId|rawEvents|radialDistanceValues|candidateEvents/
  );
  assert.equal("events" in measurementSummary.geometry, false);
});

test("Summary and Report use schema v7", () => {
  assert.equal(MEASUREMENT_SUMMARY_SCHEMA_VERSION, 7);
  assert.equal(MEASUREMENT_REPORT_SCHEMA_VERSION, 7);
  assert.equal(measurementSummary.reportSchemaVersion, 7);
  assert.equal(measurementReport.reportSchemaVersion, 7);
  assert.equal(
    measurementReport.geometry.model,
    "provisional_ev_la_geometry_shadow_v1"
  );
});

test("all pre-v5 Summary and Report top-level fields remain present", () => {
  const previousSummaryFields = [
    "battedBallMetrics",
    "battingProfiles",
    "breakdowns",
    "contactDisposition",
    "diagnostics",
    "direction",
    "gameDistribution",
    "pitchLocation",
    "pitchers",
    "plateDiscipline",
    "players",
    "qoc",
    "referenceBenchmark",
    "referenceComparison",
    "reportSchemaVersion",
    "results",
    "run",
    "simulationErrors",
    "smoothingDiagnostics",
    "status",
  ];
  const previousReportFields = [
    "battedBallMetrics",
    "battedBallProfiles",
    "batting",
    "breakdowns",
    "contactDisposition",
    "definitions",
    "diagnostics",
    "direction",
    "engineConfig",
    "gameDistribution",
    "generatedAt",
    "modelLimitations",
    "partial",
    "pitchLocation",
    "pitchers",
    "pitching",
    "plateDiscipline",
    "players",
    "qoc",
    "referenceBenchmark",
    "referenceComparison",
    "reportSchemaVersion",
    "reportType",
    "results",
    "run",
    "simulationErrors",
    "smoothingDiagnostics",
    "status",
    "teams",
    "validationPreset",
    "validationPresetLabel",
  ];
  for (const field of previousSummaryFields) {
    assert.equal(Object.hasOwn(measurementSummary, field), true, field);
  }
  for (const field of previousReportFields) {
    assert.equal(Object.hasOwn(measurementReport, field), true, field);
  }
});

test("Markdown includes Geometry aggregates and every required limitation", () => {
  const markdown = buildMeasurementMarkdown({
    summary: measurementSummary,
    teams,
    generatedAt: "2026-07-28T00:00:00.000Z",
  });
  for (const expected of [
    "## Geometry Shadow",
    "Resolution Authority Map",
    "contact as t = 0",
    "not MLB Catch Probability Opportunity Time",
    "not an official Statcast model",
    "Park walls, wind, spin",
    "separate Defense Shadow consumes eligible Geometry events",
    "not connected to legacy outcomes or authoritative defense",
    "selectedOutcome, QoC, course, and locationCourse",
    "https://baseballsavant.mlb.com/csv-docs",
    "https://www.mlb.com/glossary/statcast/catch-probability",
  ]) {
    assert.match(markdown, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("Visual Debugger imports the pure Geometry service directly", async () => {
  const html = await readFile(
    new URL("../geometry-debugger.html", import.meta.url),
    "utf8"
  );
  const page = await readFile(
    new URL("../pages/geometryDebuggerPage.js", import.meta.url),
    "utf8"
  );
  assert.match(html, /pages\/geometryDebuggerPage\.js/);
  assert.match(page, /battedBallGeometryService\.js/);
  assert.match(page, /generateGeometryShadow/);
  assert.doesNotMatch(page, /selectBattedBallOutcome/);
});

test("Pitch Location and defensive inputs remain unchanged by Geometry", () => {
  assert.equal(
    geometryShadowRun.pitchDigest,
    geometryOffRun.pitchDigest
  );
  for (const side of ["awayTeam", "homeTeam"]) {
    assert.deepEqual(
      Object.keys(geometryShadowRun.state[side].defensiveAlignment),
      DEFENSIVE_LINEUP_POSITIONS
    );
    assert.deepEqual(
      Object.keys(geometryShadowRun.state[side].defensiveAlignment),
      Object.keys(geometryOffRun.state[side].defensiveAlignment)
    );
  }
  assert.doesNotMatch(
    JSON.stringify([
      geometryShadowRun.logs,
      geometryShadowRun.patches,
    ]),
    /geometry|trajectory|fielderCandidates/i
  );
});

test("invalid Geometry inputs and existing structural errors remain explicit", () => {
  for (const invoke of [
    () => classifyTrajectoryClass(Number.NaN),
    () => convertPolarToFieldPoint(100, 45.001),
    () =>
      generateGeometryShadow({
        ...baseGeometryInput,
        battedBallEventId: "",
      }),
    () =>
      generateGeometryShadow({
        ...baseGeometryInput,
        exitVelocity: Number.POSITIVE_INFINITY,
      }),
  ]) {
    assert.throws(invoke, {
      code: "BATTED_BALL_GEOMETRY_INPUT_INVALID",
    });
  }
  assert.throws(
    () =>
      generateGeometryShadow({
        ...baseGeometryInput,
        exitVelocity: Number.MAX_VALUE,
      }),
    { code: "BATTED_BALL_GEOMETRY_OUTPUT_INVALID" }
  );
  for (const code of [
    "BATTED_BALL_GEOMETRY_INPUT_INVALID",
    "BATTED_BALL_GEOMETRY_OUTPUT_INVALID",
    "BATTED_BALL_GEOMETRY_DIRECTION_REQUIRED",
    "BATTED_BALL_OUTCOME_INVALID",
    "BATTED_BALL_DIRECTION_RANDOM_MISSING",
  ]) {
    assert.equal(isStructuralMeasurementError({ code }), true, code);
  }
  assert.deepEqual(
    RESOLUTION_AUTHORITY_CONFIG,
    {
      fairFoul: "legacy_contact",
      homeRun: "legacy_ev_la",
      outSafe: "legacy_ev_la",
      hitType: "legacy_ev_la",
      runnerAdvance: "legacy_base_running",
      officialScoring: "legacy_contact",
    }
  );
  assert.equal(TRAJECTORY_MODEL_CONFIG.source, "provisional_ev_la_model");
});
