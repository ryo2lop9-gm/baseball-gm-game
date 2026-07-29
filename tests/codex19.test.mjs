import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { BATTED_BALL_DIRECTION_CONFIG } from "../config/battedBallDirectionConfig.js";
import { BATTED_BALL_DEFENSE_CONFIG } from "../config/defenseProbabilityConfig.js";
import { DEFENSE_POSITIONS } from "../config/defenseConfig.js";
import { FIELD_GEOMETRY_CONFIG } from "../config/fieldGeometryConfig.js";
import {
  AIR_TRAJECTORY_PATH_CONFIG,
  NEUTRAL_FENCE_CONFIG,
} from "../config/neutralFenceConfig.js";
import { TRAJECTORY_MODEL_CONFIG } from "../config/trajectoryModelConfig.js";
import { simulateGameMutable } from "../engine/core/engineCore.js";
import { createMlbAverageValidationTeams } from "../models/teamModels.js";
import {
  buildAirPathSummary,
  evaluateAirTrajectoryAtTime,
} from "../services/defense/airTrajectoryPathService.js";
import {
  buildAirTrajectory,
  convertPolarToFieldPoint,
  generateGeometryShadow,
} from "../services/defense/battedBallGeometryService.js";
import { generateDefenseShadow } from "../services/defense/defenseShadowService.js";
import {
  evaluateFenceGeometry,
  getNeutralFenceDistanceFt,
} from "../services/defense/fenceGeometryService.js";
import { loadEvLaLookup } from "../services/evLaLookupStore.js";
import {
  createDefenseCalibrationAccumulator,
  finalizeDefenseCalibrationMeasurement,
  recordDefenseCalibrationMeasurement,
} from "../services/measurement/measurementDefenseCalibrationService.js";
import {
  createFenceGeometryMeasurementAccumulator,
  finalizeFenceGeometryMeasurement,
  recordFenceGeometryMeasurement,
} from "../services/measurement/measurementFenceGeometryService.js";
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
import { createInitialSimState } from "../state/gameState.js";

const lookup = JSON.parse(
  await readFile(new URL("../data/ev_la_lookup.json", import.meta.url), "utf8")
);
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => ({
  ok: true,
  json: async () => structuredClone(lookup),
});
await loadEvLaLookup();
globalThis.fetch = originalFetch;

const teams = createMlbAverageValidationTeams();
const digest = (value) =>
  createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");

function directionShadow(sprayAngle = 12) {
  return {
    mode: BATTED_BALL_DIRECTION_CONFIG.shadowMode,
    model: BATTED_BALL_DIRECTION_CONFIG.model,
    sprayAngle,
    fieldSector:
      sprayAngle < -15
        ? "left"
        : sprayAngle > 15
          ? "right"
          : "center",
  };
}

function geometryFixture({
  eventId = "codex19:fixture:1",
  exitVelocity = 95,
  launchAngle = 30,
  sprayAngle = 12,
} = {}) {
  const direction = directionShadow(sprayAngle);
  return generateGeometryShadow({
    mode: "shadow",
    battedBallEventId: eventId,
    exitVelocity,
    launchAngle,
    directionShadow: direction,
  });
}

function airInput(geometry) {
  return {
    ...geometry.trajectory,
    sprayAngle: geometry.sprayAngle,
  };
}

function activeDefenseFixture() {
  return Object.fromEntries(
    DEFENSE_POSITIONS.map((position) => [
      position,
      {
        profile: { id: `codex19:${position}` },
        name: `Player ${position}`,
        ratings: { speed: 50 },
        defense: { fielding: 50, arm: 50 },
      },
    ])
  );
}

function defenseFixture(geometry) {
  const direction = directionShadow(geometry.sprayAngle);
  return generateDefenseShadow({
    mode: "shadow",
    battedBallEventId: geometry.battedBallEventId,
    geometryShadow: geometry,
    directionShadow: direction,
    activeDefense: activeDefenseFixture(),
    defenseSeed: 190019,
  });
}

function geometryCoreProjection(geometry) {
  return {
    trajectory: geometry.trajectory,
    candidates: geometry.fielderCandidates,
  };
}

function defenseProjection(defense) {
  return {
    mode: defense.mode,
    model: defense.model,
    source: defense.source,
    schema: defense.defenseEventSchemaVersion,
    eligible: defense.eligible,
    reason: defense.exclusionReason,
    responsibleFielder: defense.responsibleFielder,
    movementDirection: defense.movementDirection,
    ratings: defense.ratings,
    timing: defense.timing,
    probabilities: defense.probabilities,
    result: defense.shadowCatchResult,
    metrics: defense.metrics,
    defenseRngCalls: defense.defenseRngCalls,
    fallbackUsed: defense.fallbackUsed,
    shadowAuthority: defense.shadowAuthority,
  };
}

function legacyProjection(event) {
  return {
    exitVelocity: event.exitVelocity,
    launchAngle: event.launchAngle,
    qoc: event.qoc,
    evLaKey: event.evLaKey,
    source: event.source,
    sampleQuality: event.sampleQuality,
    neighborMode: event.neighborMode,
    expansionLevel: event.expansionLevel,
    outcome: event.outcome,
    selectedOutcome: event.selectedOutcome,
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
    directionRngCalls: event.directionRngCalls,
  };
}

function runSeed(seed = 12345) {
  const state = createInitialSimState(
    structuredClone(teams.away),
    structuredClone(teams.home)
  );
  const mainSource = createSeededRandom(seed);
  const directionSource = createSeededRandom(
    deriveNamespacedSeed(
      seed,
      BATTED_BALL_DIRECTION_CONFIG.model
    )
  );
  let mainRngCalls = 0;
  let directionRngCalls = 0;
  const events = [];
  simulateGameMutable(state, {
    random: () => {
      mainRngCalls += 1;
      return mainSource();
    },
    directionMode: "shadow",
    directionRandom: () => {
      directionRngCalls += 1;
      return directionSource();
    },
    geometryMode: "shadow",
    defenseMode: "shadow",
    defenseSeed: deriveNamespacedSeed(
      seed,
      BATTED_BALL_DEFENSE_CONFIG.model
    ),
    gameKey: `seed:${seed}:game:1`,
    onBattedBallMeasurement: (event) => events.push(event),
  });
  return {
    state,
    events,
    mainRngCalls,
    directionRngCalls,
    geometryRngCalls: events.reduce(
      (sum, event) => sum + event.geometryRngCalls,
      0
    ),
    defenseRngCalls: events.reduce(
      (sum, event) => sum + event.defenseRngCalls,
      0
    ),
  };
}

function syntheticAirTrajectory({
  radialDistanceFt,
  targetHeightAtFenceFt = null,
  hangTimeSec = 5,
  sprayAngle = 0,
}) {
  const fenceDistanceFt =
    getNeutralFenceDistanceFt(sprayAngle);
  let verticalSpeedFtPerSec = 30;
  if (
    targetHeightAtFenceFt !== null &&
    radialDistanceFt >= fenceDistanceFt &&
    radialDistanceFt > 0
  ) {
    const ratio = fenceDistanceFt / radialDistanceFt;
    const contactHeightFt =
      TRAJECTORY_MODEL_CONFIG.contactHeightFt;
    verticalSpeedFtPerSec =
      (targetHeightAtFenceFt -
        contactHeightFt * (1 - ratio ** 2)) /
      (hangTimeSec * (ratio - ratio ** 2));
  }
  return {
    trajectoryKind: "air",
    radialDistanceFt,
    hangTimeSec,
    verticalSpeedFtPerSec,
    sprayAngle,
    landingPoint: convertPolarToFieldPoint(
      radialDistanceFt,
      sprayAngle
    ),
  };
}

function flattenFenceEvent(geometry, defense, outcome = "out") {
  return {
    battedBallEventId: geometry.battedBallEventId,
    outcome,
    exitVelocity: geometry.exitVelocity,
    launchAngle: geometry.launchAngle,
    sprayAngle: geometry.sprayAngle,
    fieldSector: "center",
    geometryMode: geometry.mode,
    geometryModel: geometry.model,
    geometryEventSchemaVersion:
      geometry.geometryEventSchemaVersion,
    geometrySource: geometry.source,
    geometryRngCalls: geometry.geometryRngCalls,
    geometryFallbackUsed: geometry.fallbackUsed,
    parkId: geometry.parkId,
    trajectoryClass: geometry.trajectoryClass,
    trajectoryKind: geometry.trajectoryKind,
    radialDistanceFt: geometry.trajectory.radialDistanceFt,
    hangTimeSec: geometry.trajectory.hangTimeSec,
    landingX: geometry.trajectory.landingPoint.x,
    landingY: geometry.trajectory.landingPoint.y,
    fielderGeometryCandidates: geometry.fielderCandidates,
    airPathModel: geometry.airPathModel,
    fenceModel: geometry.fenceModel,
    fenceSource: geometry.fenceSource,
    airPath: geometry.airPath,
    fence: geometry.fence,
    wallContext: geometry.wallContext,
    wallIntersection: geometry.wallIntersection,
    isOverFence: geometry.isOverFence,
    defenseEligible: defense.eligible,
    responsibleFielderPosition:
      defense.responsibleFielder?.position ?? null,
    shadowCaught:
      defense.shadowCatchResult?.caught ?? false,
  };
}

async function runDiagnosticMeasurement() {
  const events = [];
  const summary = await runMeasurementBatches({
    awayTeam: teams.away,
    homeTeam: teams.home,
    gameCount: 10,
    seed: 180019,
    batchSize: 10,
    runtime: {
      defenseCalibrationMode: "diagnostic",
      simulateGame: (state, options) =>
        simulateGameMutable(state, {
          ...options,
          onBattedBallMeasurement: (event) => {
            events.push(event);
            options.onBattedBallMeasurement(event);
          },
        }),
      yieldControl: async () => {},
    },
  });
  return { summary, events };
}

const fixedGeometry = geometryFixture();
const fixedAirInput = airInput(fixedGeometry);
const fixedAirSummary = buildAirPathSummary(fixedAirInput);
const fixedDefense = defenseFixture(fixedGeometry);
const seededRun = runSeed();
const diagnosticRun = await runDiagnosticMeasurement();
const diagnosticReport = buildMeasurementReportObject({
  summary: diagnosticRun.summary,
  teams,
  generatedAt: "2026-07-31T00:00:00.000Z",
});

test("1 Geometry default mode remains off", () => {
  assert.equal(FIELD_GEOMETRY_CONFIG.defaultMode, "off");
});

test("2 Geometry event schema is v2", () => {
  assert.equal(FIELD_GEOMETRY_CONFIG.geometryEventSchemaVersion, 2);
  assert.equal(fixedGeometry.geometryEventSchemaVersion, 2);
});

test("3 Air Path and Fence model contracts are exact", () => {
  assert.equal(
    fixedGeometry.airPathModel,
    "provisional_air_path_shadow_v1"
  );
  assert.equal(
    fixedGeometry.fenceModel,
    "provisional_neutral_fence_geometry_shadow_v1"
  );
  assert.equal(
    fixedGeometry.fenceSource,
    "provisional_neutral_park_config"
  );
});

test("4 Air Path does not mutate input", () => {
  const input = structuredClone(fixedAirInput);
  const before = structuredClone(input);
  buildAirPathSummary(input);
  evaluateAirTrajectoryAtTime(input, input.hangTimeSec / 2);
  assert.deepEqual(input, before);
});

test("5 invalid Air Path input is rejected structurally", () => {
  assert.throws(
    () => buildAirPathSummary({ trajectoryKind: "ground" }),
    (error) =>
      error.code === "BATTED_BALL_AIR_PATH_INPUT_INVALID"
  );
  assert.throws(
    () =>
      evaluateAirTrajectoryAtTime(fixedAirInput, Infinity),
    (error) =>
      error.code === "BATTED_BALL_AIR_PATH_INPUT_INVALID"
  );
});

test("6 t=0 is the contact point", () => {
  assert.deepEqual(
    evaluateAirTrajectoryAtTime(fixedAirInput, 0),
    {
      timeSec: 0,
      x: 0,
      y: 0,
      z: TRAJECTORY_MODEL_CONFIG.contactHeightFt,
      radialDistanceFt: 0,
    }
  );
});

test("7 t=T equals the existing landing point", () => {
  const point = evaluateAirTrajectoryAtTime(
    fixedAirInput,
    fixedAirInput.hangTimeSec
  );
  assert.equal(point.x, fixedAirInput.landingPoint.x);
  assert.equal(point.y, fixedAirInput.landingPoint.y);
  assert.equal(
    point.radialDistanceFt,
    fixedAirInput.radialDistanceFt
  );
});

test("8 t=T height is exactly zero", () => {
  assert.equal(
    evaluateAirTrajectoryAtTime(
      fixedAirInput,
      fixedAirInput.hangTimeSec
    ).z,
    0
  );
});

test("9 radial distance is monotonically nondecreasing", () => {
  const distances = Array.from({ length: 21 }, (_, index) =>
    evaluateAirTrajectoryAtTime(
      fixedAirInput,
      (fixedAirInput.hangTimeSec * index) / 20
    ).radialDistanceFt
  );
  for (let index = 1; index < distances.length; index += 1) {
    assert.ok(distances[index] >= distances[index - 1]);
  }
});

test("10 height stays nonnegative inside the interval", () => {
  for (let index = 0; index <= 20; index += 1) {
    const point = evaluateAirTrajectoryAtTime(
      fixedAirInput,
      (fixedAirInput.hangTimeSec * index) / 20
    );
    assert.ok(point.z >= -1e-9);
  }
});

test("11 apex time is inside the flight interval", () => {
  assert.ok(fixedAirSummary.apexTimeSec >= 0);
  assert.ok(
    fixedAirSummary.apexTimeSec <= fixedAirInput.hangTimeSec
  );
});

test("12 apex height is not below either endpoint", () => {
  assert.ok(
    fixedAirSummary.apexHeightFt >=
      TRAJECTORY_MODEL_CONFIG.contactHeightFt
  );
  assert.ok(fixedAirSummary.apexHeightFt >= 0);
});

test("13 mirrored spray angles preserve distance and height", () => {
  const left = geometryFixture({ sprayAngle: -20 });
  const right = geometryFixture({ sprayAngle: 20 });
  const time = left.trajectory.hangTimeSec * 0.4;
  const leftPoint = evaluateAirTrajectoryAtTime(
    airInput(left),
    time
  );
  const rightPoint = evaluateAirTrajectoryAtTime(
    airInput(right),
    time
  );
  assert.equal(leftPoint.radialDistanceFt, rightPoint.radialDistanceFt);
  assert.equal(leftPoint.z, rightPoint.z);
});

test("14 mirrored spray coordinates are exact reflections", () => {
  const left = geometryFixture({ sprayAngle: -20 });
  const right = geometryFixture({ sprayAngle: 20 });
  const time = left.trajectory.hangTimeSec * 0.4;
  const leftPoint = evaluateAirTrajectoryAtTime(
    airInput(left),
    time
  );
  const rightPoint = evaluateAirTrajectoryAtTime(
    airInput(right),
    time
  );
  assert.equal(leftPoint.x, -rightPoint.x);
  assert.equal(leftPoint.y, rightPoint.y);
});

test("15 Air Path uses no tick scan", async () => {
  const source = await readFile(
    new URL(
      "../services/defense/airTrajectoryPathService.js",
      import.meta.url
    ),
    "utf8"
  );
  assert.doesNotMatch(source, /\bwhile\s*\(|setInterval|setTimeout/);
});

test("16 Air Path and event retain no raw point arrays", () => {
  assert.equal(Array.isArray(fixedGeometry.airPath), false);
  assert.equal(Object.hasOwn(fixedGeometry.airPath, "points"), false);
  assert.equal(
    Object.hasOwn(fixedGeometry, "trajectoryPoints"),
    false
  );
});

test("17 every Neutral Fence anchor is exact", () => {
  for (const [angle, distance] of
    NEUTRAL_FENCE_CONFIG.fenceDistanceAnchors) {
    assert.equal(getNeutralFenceDistanceFt(angle), distance);
  }
});

test("18 Fence interpolation is continuous at anchors", () => {
  for (const [angle, distance] of
    NEUTRAL_FENCE_CONFIG.fenceDistanceAnchors.slice(1, -1)) {
    assert.ok(
      Math.abs(
        getNeutralFenceDistanceFt(angle - 1e-8) - distance
      ) < 1e-6
    );
    assert.ok(
      Math.abs(
        getNeutralFenceDistanceFt(angle + 1e-8) - distance
      ) < 1e-6
    );
  }
});

test("19 Fence profile is symmetric", () => {
  for (let angle = 0; angle <= 45; angle += 0.5) {
    assert.equal(
      getNeutralFenceDistanceFt(-angle),
      getNeutralFenceDistanceFt(angle)
    );
  }
});

test("20 out-of-fair-range angles are rejected", () => {
  assert.throws(
    () => getNeutralFenceDistanceFt(-45.0001),
    (error) =>
      error.code ===
      "BATTED_BALL_FENCE_GEOMETRY_INPUT_INVALID"
  );
  assert.throws(() => getNeutralFenceDistanceFt(45.0001));
});

test("21 more than eight feet inside is none", () => {
  const distance = getNeutralFenceDistanceFt(0);
  assert.equal(
    evaluateFenceGeometry(
      syntheticAirTrajectory({
        radialDistanceFt: distance - 8.01,
      })
    ).wallContext,
    "none"
  );
});

test("22 within eight feet inside is near_wall_inside", () => {
  const distance = getNeutralFenceDistanceFt(0);
  assert.equal(
    evaluateFenceGeometry(
      syntheticAirTrajectory({
        radialDistanceFt: distance - 8,
      })
    ).wallContext,
    "near_wall_inside"
  );
});

test("23 low fence intersection is wall_contact", () => {
  assert.equal(
    evaluateFenceGeometry(
      syntheticAirTrajectory({
        radialDistanceFt: 420,
        targetHeightAtFenceFt: 7,
      })
    ).wallContext,
    "wall_contact"
  );
});

test("24 high fence intersection is over_fence", () => {
  assert.equal(
    evaluateFenceGeometry(
      syntheticAirTrajectory({
        radialDistanceFt: 420,
        targetHeightAtFenceFt: 9,
      })
    ).wallContext,
    "over_fence"
  );
});

test("25 exact wall top is wall_contact", () => {
  const result = evaluateFenceGeometry(
    syntheticAirTrajectory({
      radialDistanceFt: 420,
      targetHeightAtFenceFt:
        NEUTRAL_FENCE_CONFIG.wallHeightFt,
    })
  );
  assert.ok(Math.abs(result.wallIntersection.clearanceFt) < 1e-9);
  assert.equal(result.wallContext, "wall_contact");
});

test("26 isOverFence identity always holds", () => {
  for (const result of [
    evaluateFenceGeometry(
      syntheticAirTrajectory({ radialDistanceFt: 100 })
    ),
    evaluateFenceGeometry(
      syntheticAirTrajectory({
        radialDistanceFt: 420,
        targetHeightAtFenceFt: 7,
      })
    ),
    evaluateFenceGeometry(
      syntheticAirTrajectory({
        radialDistanceFt: 420,
        targetHeightAtFenceFt: 9,
      })
    ),
  ]) {
    assert.equal(
      result.isOverFence,
      result.wallContext === "over_fence"
    );
  }
});

test("27 R=0 avoids division and stays finite", () => {
  const result = evaluateFenceGeometry(
    syntheticAirTrajectory({ radialDistanceFt: 0 })
  );
  assert.equal(result.wallContext, "none");
  assert.equal(result.wallIntersection, null);
  assert.ok(Number.isFinite(result.fence.landingDistanceToFenceFt));
});

test("28 ground wall fields are null", () => {
  assert.deepEqual(
    evaluateFenceGeometry({ trajectoryKind: "ground" }),
    {
      airPath: null,
      fence: null,
      wallContext: null,
      wallIntersection: null,
      isOverFence: null,
    }
  );
});

test("29 Geometry RNG remains zero", () => {
  assert.equal(fixedGeometry.geometryRngCalls, 0);
  assert.equal(seededRun.geometryRngCalls, 0);
});

test("30 new services are RNG-independent", async () => {
  const combined = [
    "../services/defense/airTrajectoryPathService.js",
    "../services/defense/fenceGeometryService.js",
  ];
  for (const relative of combined) {
    const source = await readFile(
      new URL(relative, import.meta.url),
      "utf8"
    );
    assert.doesNotMatch(source, /Math\.random|createSeededRandom|random\(/);
  }
});

test("31 existing carry and hang time are exactly preserved", () => {
  assert.equal(fixedGeometry.trajectory.carryScale, 0.68);
  assert.equal(fixedGeometry.trajectory.hangTimeScale, 1);
  assert.equal(
    fixedGeometry.trajectory.radialDistanceFt,
    358.83929320109183
  );
  assert.equal(
    fixedGeometry.trajectory.hangTimeSec,
    4.3732612410385325
  );
});

test("32 existing landing point is exactly preserved", () => {
  assert.deepEqual(fixedGeometry.trajectory.landingPoint, {
    x: 74.60688418128869,
    y: 350.99779369366263,
  });
});

test("33 existing nine fielder candidates are exactly preserved", () => {
  assert.equal(fixedGeometry.fielderCandidates.length, 9);
  assert.equal(
    fixedGeometry.fielderCandidates[7].pathDistanceFt,
    99.60871417537464
  );
  assert.equal(
    fixedGeometry.fielderCandidates[7].arrivalMarginSec,
    -0.02710184960207762
  );
});

test("34 v1 Geometry core projection digest is unchanged", () => {
  assert.equal(
    digest(geometryCoreProjection(fixedGeometry)),
    "082581d3fc315e5a15df544d3c4c7d861aeb4e0156591f36e37ee4b73ac28ee0"
  );
});

test("35 legacy digest is unchanged", () => {
  assert.equal(
    digest(seededRun.events.map(legacyProjection)),
    "60935e20d836d2a0a4e716fa75be16c61b7aa3dea55deeb13b3ba848e4426d62"
  );
});

test("36 Direction digest is unchanged", () => {
  assert.equal(
    digest(seededRun.events.map(directionProjection)),
    "01b522271fbf2731f76eafc331faacb9084d990e327754649189ed9798be29a8"
  );
});

test("37 Defense digest is unchanged", () => {
  assert.equal(
    digest(defenseProjection(fixedDefense)),
    "7be7426a8f999e5710d34b4e34b99ee5b5d21da8baeb602876e123805a432972"
  );
});

test("38 Calibration statistics and Grid ignore wall fields", () => {
  const event = diagnosticRun.events.find(
    (entry) => entry.defenseEligible
  );
  const withoutWall = structuredClone(event);
  for (const key of [
    "airPathModel",
    "fenceModel",
    "fenceSource",
    "airPath",
    "fence",
    "wallContext",
    "wallIntersection",
    "isOverFence",
  ]) {
    delete withoutWall[key];
  }
  const left = createDefenseCalibrationAccumulator();
  const right = createDefenseCalibrationAccumulator();
  recordDefenseCalibrationMeasurement(left, event);
  recordDefenseCalibrationMeasurement(right, withoutWall);
  assert.deepEqual(
    finalizeDefenseCalibrationMeasurement(left, {
      mode: "diagnostic",
    }),
    finalizeDefenseCalibrationMeasurement(right, {
      mode: "diagnostic",
    })
  );
});

test("39 every existing RNG call count is unchanged", () => {
  assert.equal(seededRun.mainRngCalls, 3115);
  assert.equal(seededRun.directionRngCalls, 146);
  assert.equal(seededRun.geometryRngCalls, 0);
  assert.equal(seededRun.defenseRngCalls, 34);
});

test("40 each fair ball records one Fence evaluation", () => {
  assert.equal(
    diagnosticRun.summary.fenceGeometry.evaluations,
    diagnosticRun.summary.battedBallMetrics.fairBattedBalls
  );
  assert.equal(
    diagnosticRun.summary.fenceGeometry.validEvents,
    diagnosticRun.summary.battedBallMetrics.fairBattedBalls
  );
  assert.equal(
    diagnosticRun.summary.fenceGeometry.invalidEvents,
    0
  );
});

test("41 Fence accumulator retains no raw events or paths", () => {
  const accumulator =
    createFenceGeometryMeasurementAccumulator();
  const event = diagnosticRun.events[0];
  recordFenceGeometryMeasurement(accumulator, event);
  const serialized = JSON.stringify(accumulator);
  assert.doesNotMatch(
    serialized,
    /battedBallEventId|trajectoryPoints|rawEvents/
  );
  assert.equal(
    finalizeFenceGeometryMeasurement(accumulator, {
      mode: "shadow",
    }).performance.rawTrajectoryArraysStored,
    false
  );
});

test("42 Authority Readiness Gate remains false", () => {
  assert.equal(
    diagnosticRun.summary.defenseCalibration.readinessGate
      .authoritySwitchReady,
    false
  );
});

test("43 wallGeometryAvailable is true", () => {
  assert.equal(
    diagnosticRun.summary.defenseCalibration.readinessGate
      .wallGeometryAvailable,
    true
  );
});

test("44 wallModelAvailable remains false", () => {
  assert.equal(
    diagnosticRun.summary.defenseCalibration.readinessGate
      .wallModelAvailable,
    false
  );
});

test("45 Summary and Report schema are v8", () => {
  assert.equal(MEASUREMENT_SUMMARY_SCHEMA_VERSION, 8);
  assert.equal(MEASUREMENT_REPORT_SCHEMA_VERSION, 8);
  assert.equal(diagnosticRun.summary.reportSchemaVersion, 8);
  assert.equal(diagnosticReport.reportSchemaVersion, 8);
});

test("46 every schema v7 top-level field remains present", () => {
  const summaryV7 = [
    "battedBallMetrics",
    "battingProfiles",
    "breakdowns",
    "contactDisposition",
    "defense",
    "defenseCalibration",
    "diagnostics",
    "direction",
    "gameDistribution",
    "geometry",
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
  const reportV7 = [
    "battedBallMetrics",
    "battedBallProfiles",
    "batting",
    "breakdowns",
    "contactDisposition",
    "defense",
    "defenseCalibration",
    "definitions",
    "diagnostics",
    "direction",
    "engineConfig",
    "gameDistribution",
    "generatedAt",
    "geometry",
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
  for (const key of summaryV7) {
    assert.ok(Object.hasOwn(diagnosticRun.summary, key));
  }
  for (const key of reportV7) {
    assert.ok(Object.hasOwn(diagnosticReport, key));
  }
});

test("47 Markdown includes every definition and limitation", () => {
  const markdown = buildMeasurementMarkdown({
    summary: diagnosticRun.summary,
    teams,
  });
  for (const phrase of [
    "Air Trajectory and Fence Geometry Shadow",
    "effectiveGravity",
    "Neutral Fence",
    "not a measured physical gravity",
    "neither an MLB average nor measured park geometry",
    "Air resistance",
    "Wall bounce",
    "En-route liner catches",
    "not inputs to Defense probabilities",
    "do not change legacy outcomes",
    "t = 0",
    "Resolution Authority remains legacy",
  ]) {
    assert.match(markdown, new RegExp(phrase));
  }
});

test("48 Debugger imports and uses both pure services", async () => {
  const source = await readFile(
    new URL("../pages/geometryDebuggerPage.js", import.meta.url),
    "utf8"
  );
  const html = await readFile(
    new URL("../geometry-debugger.html", import.meta.url),
    "utf8"
  );
  assert.match(source, /airTrajectoryPathService\.js/);
  assert.match(source, /fenceGeometryService\.js/);
  assert.match(source, /evaluateAirTrajectoryAtTime/);
  assert.match(source, /getNeutralFenceDistanceFt/);
  assert.match(html, /trajectory-time/);
  assert.match(html, /side-svg/);
});

test("49 normal UI, lastPitch, and logs remain untouched", async () => {
  for (const relative of [
    "../index.html",
    "../state/gameState.js",
    "../services/pitchExecutionService.js",
    "../engine/core/engineCore.js",
  ]) {
    const source = await readFile(
      new URL(relative, import.meta.url),
      "utf8"
    );
    assert.doesNotMatch(
      source,
      /wallContext|wallIntersection|airPathModel|fenceModel/
    );
  }
});

test("50 EV, LA, and spray grid stays finite with endpoint identity", () => {
  for (const exitVelocity of [50, 80, 110]) {
    for (const launchAngle of [5, 10, 25, 49, 60]) {
      for (const sprayAngle of [-45, -22.5, 0, 22.5, 45]) {
        const geometry = geometryFixture({
          eventId: `grid:${exitVelocity}:${launchAngle}:${sprayAngle}`,
          exitVelocity,
          launchAngle,
          sprayAngle,
        });
        const input = airInput(geometry);
        const summary = buildAirPathSummary(input);
        const start = evaluateAirTrajectoryAtTime(input, 0);
        const end = evaluateAirTrajectoryAtTime(
          input,
          input.hangTimeSec
        );
        for (const value of [
          summary.effectiveGravityFtPerSec2,
          summary.apexTimeSec,
          summary.apexHeightFt,
          summary.apexRadialDistanceFt,
          start.x,
          start.y,
          start.z,
          end.x,
          end.y,
          end.z,
        ]) {
          assert.ok(Number.isFinite(value));
        }
        assert.equal(start.z, TRAJECTORY_MODEL_CONFIG.contactHeightFt);
        assert.equal(end.x, geometry.trajectory.landingPoint.x);
        assert.equal(end.y, geometry.trajectory.landingPoint.y);
        assert.equal(end.z, 0);
      }
    }
  }
});
