import { BATTED_BALL_FIELD_SECTORS } from "../../config/battedBallDirectionConfig.js";
import { FIELD_GEOMETRY_CONFIG } from "../../config/fieldGeometryConfig.js";
import {
  AIR_TRAJECTORY_PATH_CONFIG,
  NEUTRAL_FENCE_CONFIG,
} from "../../config/neutralFenceConfig.js";
import { RESOLUTION_AUTHORITY_CONFIG } from "../../config/resolutionAuthorityConfig.js";
import { TRAJECTORY_MODEL_CONFIG } from "../../config/trajectoryModelConfig.js";
import {
  evaluateAirTrajectoryAtTime,
} from "../defense/airTrajectoryPathService.js";
import {
  FENCE_WALL_CONTEXTS,
  getNeutralFenceDistanceFt,
} from "../defense/fenceGeometryService.js";
import {
  GEOMETRY_TRAJECTORY_CLASSES,
} from "./measurementGeometryService.js";
import {
  getEvBand,
  getLaBand,
  MEASUREMENT_EV_BANDS,
  MEASUREMENT_LA_BANDS,
} from "./measurementAdvancedService.js";
import {
  createMeasurementHistogram,
  finalizeMeasurementHistogram,
  mergeMeasurementHistogram,
  recordMeasurementHistogram,
} from "./measurementHistogramService.js";

const LEGACY_OUTCOMES = Object.freeze([
  "out",
  "single",
  "double",
  "triple",
  "homeRun",
]);
const ENDPOINT_TOLERANCE =
  AIR_TRAJECTORY_PATH_CONFIG.endpointTolerance;

function zeroMap(keys) {
  return Object.fromEntries(keys.map((key) => [key, 0]));
}

function safeDivide(numerator, denominator) {
  return denominator > 0 ? numerator / denominator : 0;
}

function createBreakdownLine() {
  return {
    evaluations: 0,
    air: 0,
    ground: 0,
    wallContext: zeroMap(FENCE_WALL_CONTEXTS),
  };
}

function createBreakdown(keys) {
  return Object.fromEntries(
    keys.map((key) => [key, createBreakdownLine()])
  );
}

function createLegacyLine() {
  return {
    count: 0,
    wallContext: zeroMap(FENCE_WALL_CONTEXTS),
  };
}

function createDefenseWallLine() {
  return {
    eligible: 0,
    caught: 0,
    notCaught: 0,
  };
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function valuesAreFinite(values) {
  return values.every(isFiniteNumber);
}

function nearlyEqual(left, right, tolerance = ENDPOINT_TOLERANCE) {
  return (
    isFiniteNumber(left) &&
    isFiniteNumber(right) &&
    Math.abs(left - right) <= tolerance
  );
}

function mergeMap(target, source) {
  for (const key of Object.keys(target)) {
    target[key] += Number(source?.[key]) || 0;
  }
}

function mergeBreakdownLine(target, source) {
  target.evaluations += source.evaluations;
  target.air += source.air;
  target.ground += source.ground;
  mergeMap(target.wallContext, source.wallContext);
}

function mergeBreakdown(target, source) {
  for (const key of Object.keys(target)) {
    mergeBreakdownLine(target[key], source[key]);
  }
}

function recordBreakdownLine(line, event) {
  line.evaluations += 1;
  line[event.trajectoryKind] += 1;
  if (event.wallContext) {
    line.wallContext[event.wallContext] += 1;
  }
}

function finalizeCounter(map, denominator) {
  return Object.fromEntries(
    Object.entries(map).map(([key, count]) => [
      key,
      { count, pct: safeDivide(count, denominator) },
    ])
  );
}

function finalizeBreakdownLine(line) {
  return {
    evaluations: line.evaluations,
    air: line.air,
    ground: line.ground,
    wallContext: finalizeCounter(
      line.wallContext,
      line.air
    ),
  };
}

function finalizeBreakdown(breakdown) {
  return Object.fromEntries(
    Object.entries(breakdown).map(([key, line]) => [
      key,
      finalizeBreakdownLine(line),
    ])
  );
}

function validateGroundEvent(event) {
  return (
    event.airPath === null &&
    event.fence === null &&
    event.wallContext === null &&
    event.wallIntersection === null &&
    event.isOverFence === null
  );
}

function validateAirEvent(event, accumulator) {
  const airPath = event.airPath;
  const fence = event.fence;
  const wall = event.wallIntersection;
  const wallContextValid =
    FENCE_WALL_CONTEXTS.includes(event.wallContext);
  const wallRequired =
    event.wallContext === "wall_contact" ||
    event.wallContext === "over_fence";
  const wallShapeValid =
    wallRequired
      ? valuesAreFinite([
          wall?.timeSec,
          wall?.x,
          wall?.y,
          wall?.z,
          wall?.radialDistanceFt,
          wall?.wallHeightFt,
          wall?.clearanceFt,
        ])
      : wall === null;
  const finite =
    valuesAreFinite([
      event.hangTimeSec,
      event.landingX,
      event.landingY,
      airPath?.contactHeightFt,
      airPath?.verticalSpeedFtPerSec,
      airPath?.effectiveGravityFtPerSec2,
      airPath?.radialSpeedFtPerSec,
      airPath?.apexTimeSec,
      airPath?.apexHeightFt,
      airPath?.apexRadialDistanceFt,
      airPath?.apexPoint?.timeSec,
      airPath?.apexPoint?.x,
      airPath?.apexPoint?.y,
      airPath?.apexPoint?.z,
      airPath?.apexPoint?.radialDistanceFt,
      fence?.fenceDistanceFt,
      fence?.wallHeightFt,
      fence?.landingDistanceToFenceFt,
      fence?.nearWallDistanceFt,
    ]) && wallShapeValid;
  if (!finite) accumulator.nonFiniteValueCount += 1;
  if (
    !finite ||
    !wallContextValid ||
    typeof event.isOverFence !== "boolean" ||
    event.isOverFence !==
      (event.wallContext === "over_fence")
  ) {
    return false;
  }

  const expectedFenceDistance =
    getNeutralFenceDistanceFt(event.sprayAngle);
  if (
    !nearlyEqual(
      fence.fenceDistanceFt,
      expectedFenceDistance
    ) ||
    !nearlyEqual(
      fence.wallHeightFt,
      NEUTRAL_FENCE_CONFIG.wallHeightFt
    ) ||
    !nearlyEqual(
      fence.nearWallDistanceFt,
      NEUTRAL_FENCE_CONFIG.nearWallDistanceFt
    )
  ) {
    return false;
  }

  const trajectory = {
    trajectoryKind: "air",
    hangTimeSec: event.hangTimeSec,
    radialDistanceFt: event.radialDistanceFt,
    verticalSpeedFtPerSec:
      airPath.verticalSpeedFtPerSec,
    sprayAngle: event.sprayAngle,
    landingPoint: {
      x: event.landingX,
      y: event.landingY,
    },
  };
  accumulator.endpointIdentityChecks += 2;
  try {
    const contact = evaluateAirTrajectoryAtTime(
      trajectory,
      0
    );
    const landing = evaluateAirTrajectoryAtTime(
      trajectory,
      event.hangTimeSec
    );
    if (
      !nearlyEqual(contact.x, 0) ||
      !nearlyEqual(contact.y, 0) ||
      !nearlyEqual(
        contact.z,
        TRAJECTORY_MODEL_CONFIG.contactHeightFt
      ) ||
      !nearlyEqual(landing.x, event.landingX) ||
      !nearlyEqual(landing.y, event.landingY) ||
      !nearlyEqual(landing.z, 0)
    ) {
      accumulator.endpointIdentityViolationCount += 1;
    }
  } catch {
    accumulator.endpointIdentityViolationCount += 1;
    return false;
  }

  accumulator.symmetryChecks += 1;
  if (
    !nearlyEqual(
      expectedFenceDistance,
      getNeutralFenceDistanceFt(-event.sprayAngle),
      NEUTRAL_FENCE_CONFIG.symmetryTolerance
    )
  ) {
    accumulator.symmetryViolationCount += 1;
  }
  return true;
}

export function createFenceGeometryMeasurementAccumulator() {
  return {
    evaluations: 0,
    validEvents: 0,
    invalidEvents: 0,
    airEvaluations: 0,
    groundEvaluations: 0,
    trajectoryClass: createBreakdown(
      GEOMETRY_TRAJECTORY_CLASSES
    ),
    fieldSector: createBreakdown(
      BATTED_BALL_FIELD_SECTORS
    ),
    evBand: createBreakdown(MEASUREMENT_EV_BANDS),
    laBand: createBreakdown(MEASUREMENT_LA_BANDS),
    wallContext: zeroMap(FENCE_WALL_CONTEXTS),
    fenceDistance: createMeasurementHistogram(1),
    landingDistanceToFence: createMeasurementHistogram(1),
    fenceTime: createMeasurementHistogram(0.05),
    heightAtFence: createMeasurementHistogram(0.5),
    clearance: createMeasurementHistogram(0.5),
    apexTime: createMeasurementHistogram(0.05),
    apexHeight: createMeasurementHistogram(0.5),
    apexDistance: createMeasurementHistogram(1),
    legacyOutcome: Object.fromEntries(
      LEGACY_OUTCOMES.map((outcome) => [
        outcome,
        createLegacyLine(),
      ])
    ),
    defenseByWallContext: Object.fromEntries(
      FENCE_WALL_CONTEXTS.map((context) => [
        context,
        createDefenseWallLine(),
      ])
    ),
    overFenceLegacyOutcome: zeroMap(LEGACY_OUTCOMES),
    overFenceShadowCaught: 0,
    overFenceLegacyOut: 0,
    responsibleTargetOutsideFence: 0,
    candidateTargetsOutsideFence: 0,
    candidateTargetChecks: 0,
    nonFiniteValueCount: 0,
    endpointIdentityChecks: 0,
    endpointIdentityViolationCount: 0,
    symmetryChecks: 0,
    symmetryViolationCount: 0,
    geometryRngCalls: 0,
    fallbackCount: 0,
  };
}

export function recordFenceGeometryMeasurement(
  accumulator,
  event
) {
  if (event?.geometryMode !== FIELD_GEOMETRY_CONFIG.shadowMode) {
    return event?.geometryMode ===
      FIELD_GEOMETRY_CONFIG.defaultMode;
  }
  accumulator.evaluations += 1;
  const geometryRngCalls = Number(event.geometryRngCalls);
  if (
    Number.isInteger(geometryRngCalls) &&
    geometryRngCalls >= 0
  ) {
    accumulator.geometryRngCalls += geometryRngCalls;
  }
  if (event.geometryFallbackUsed) {
    accumulator.fallbackCount += 1;
  }

  const commonValid =
    event.geometryModel === FIELD_GEOMETRY_CONFIG.model &&
    event.geometryEventSchemaVersion ===
      FIELD_GEOMETRY_CONFIG.geometryEventSchemaVersion &&
    event.geometrySource === TRAJECTORY_MODEL_CONFIG.source &&
    event.airPathModel ===
      AIR_TRAJECTORY_PATH_CONFIG.model &&
    event.fenceModel === NEUTRAL_FENCE_CONFIG.model &&
    event.fenceSource === NEUTRAL_FENCE_CONFIG.source &&
    event.parkId === NEUTRAL_FENCE_CONFIG.parkId &&
    GEOMETRY_TRAJECTORY_CLASSES.includes(
      event.trajectoryClass
    ) &&
    ["air", "ground"].includes(event.trajectoryKind) &&
    BATTED_BALL_FIELD_SECTORS.includes(event.fieldSector) &&
    isFiniteNumber(event.exitVelocity) &&
    isFiniteNumber(event.launchAngle) &&
    isFiniteNumber(event.sprayAngle) &&
    isFiniteNumber(event.radialDistanceFt) &&
    event.radialDistanceFt >= 0 &&
    LEGACY_OUTCOMES.includes(event.outcome) &&
    typeof event.defenseEligible === "boolean" &&
    (event.defenseEligible
      ? typeof event.shadowCaught === "boolean"
      : event.shadowCaught === null) &&
    Array.isArray(event.fielderGeometryCandidates) &&
    event.fielderGeometryCandidates.length ===
      FIELD_GEOMETRY_CONFIG.fielderPositionOrder.length &&
    geometryRngCalls === 0;
  let detailValid = false;
  try {
    detailValid =
      event.trajectoryKind === "air"
        ? validateAirEvent(event, accumulator)
        : validateGroundEvent(event);
  } catch {
    accumulator.nonFiniteValueCount += 1;
  }
  if (!commonValid || !detailValid) {
    accumulator.invalidEvents += 1;
    return false;
  }

  accumulator.validEvents += 1;
  accumulator[`${event.trajectoryKind}Evaluations`] += 1;
  recordBreakdownLine(
    accumulator.trajectoryClass[event.trajectoryClass],
    event
  );
  recordBreakdownLine(
    accumulator.fieldSector[event.fieldSector],
    event
  );
  recordBreakdownLine(
    accumulator.evBand[getEvBand(event.exitVelocity)],
    event
  );
  recordBreakdownLine(
    accumulator.laBand[getLaBand(event.launchAngle)],
    event
  );

  if (event.trajectoryKind === "ground") return true;

  accumulator.wallContext[event.wallContext] += 1;
  recordMeasurementHistogram(
    accumulator.fenceDistance,
    event.fence.fenceDistanceFt
  );
  recordMeasurementHistogram(
    accumulator.landingDistanceToFence,
    event.fence.landingDistanceToFenceFt
  );
  recordMeasurementHistogram(
    accumulator.apexTime,
    event.airPath.apexTimeSec
  );
  recordMeasurementHistogram(
    accumulator.apexHeight,
    event.airPath.apexHeightFt
  );
  recordMeasurementHistogram(
    accumulator.apexDistance,
    event.airPath.apexRadialDistanceFt
  );
  if (event.wallIntersection) {
    recordMeasurementHistogram(
      accumulator.fenceTime,
      event.wallIntersection.timeSec
    );
    recordMeasurementHistogram(
      accumulator.heightAtFence,
      event.wallIntersection.z
    );
    recordMeasurementHistogram(
      accumulator.clearance,
      event.wallIntersection.clearanceFt
    );
  }

  const legacyLine = accumulator.legacyOutcome[event.outcome];
  if (legacyLine) {
    legacyLine.count += 1;
    legacyLine.wallContext[event.wallContext] += 1;
  }
  if (event.defenseEligible) {
    const defenseLine =
      accumulator.defenseByWallContext[event.wallContext];
    defenseLine.eligible += 1;
    if (event.shadowCaught) defenseLine.caught += 1;
    else defenseLine.notCaught += 1;
  }

  if (event.isOverFence) {
    if (legacyLine) {
      accumulator.overFenceLegacyOutcome[
        event.outcome
      ] += 1;
    }
    if (event.outcome === "out") {
      accumulator.overFenceLegacyOut += 1;
    }
    if (event.shadowCaught) {
      accumulator.overFenceShadowCaught += 1;
    }
  }

  const candidates = Array.isArray(
    event.fielderGeometryCandidates
  )
    ? event.fielderGeometryCandidates
    : [];
  for (const candidate of candidates) {
    accumulator.candidateTargetChecks += 1;
    const targetDistance = Math.hypot(
      candidate?.targetPoint?.x,
      candidate?.targetPoint?.y
    );
    if (
      isFiniteNumber(targetDistance) &&
      targetDistance >
        event.fence.fenceDistanceFt + ENDPOINT_TOLERANCE
    ) {
      accumulator.candidateTargetsOutsideFence += 1;
      if (
        candidate.position ===
        event.responsibleFielderPosition
      ) {
        accumulator.responsibleTargetOutsideFence += 1;
      }
    }
  }
  return true;
}

export function mergeFenceGeometryMeasurement(
  target,
  source
) {
  for (const key of [
    "evaluations",
    "validEvents",
    "invalidEvents",
    "airEvaluations",
    "groundEvaluations",
    "overFenceShadowCaught",
    "overFenceLegacyOut",
    "responsibleTargetOutsideFence",
    "candidateTargetsOutsideFence",
    "candidateTargetChecks",
    "nonFiniteValueCount",
    "endpointIdentityChecks",
    "endpointIdentityViolationCount",
    "symmetryChecks",
    "symmetryViolationCount",
    "geometryRngCalls",
    "fallbackCount",
  ]) {
    target[key] += source[key];
  }
  mergeBreakdown(target.trajectoryClass, source.trajectoryClass);
  mergeBreakdown(target.fieldSector, source.fieldSector);
  mergeBreakdown(target.evBand, source.evBand);
  mergeBreakdown(target.laBand, source.laBand);
  mergeMap(target.wallContext, source.wallContext);
  for (const histogram of [
    "fenceDistance",
    "landingDistanceToFence",
    "fenceTime",
    "heightAtFence",
    "clearance",
    "apexTime",
    "apexHeight",
    "apexDistance",
  ]) {
    mergeMeasurementHistogram(
      target[histogram],
      source[histogram]
    );
  }
  for (const outcome of LEGACY_OUTCOMES) {
    target.legacyOutcome[outcome].count +=
      source.legacyOutcome[outcome].count;
    mergeMap(
      target.legacyOutcome[outcome].wallContext,
      source.legacyOutcome[outcome].wallContext
    );
  }
  for (const context of FENCE_WALL_CONTEXTS) {
    for (const key of ["eligible", "caught", "notCaught"]) {
      target.defenseByWallContext[context][key] +=
        source.defenseByWallContext[context][key];
    }
  }
  mergeMap(
    target.overFenceLegacyOutcome,
    source.overFenceLegacyOutcome
  );
  return target;
}

export function finalizeFenceGeometryMeasurement(
  accumulator,
  { mode }
) {
  return {
    mode,
    model: AIR_TRAJECTORY_PATH_CONFIG.model,
    source: NEUTRAL_FENCE_CONFIG.source,
    airPathModel: AIR_TRAJECTORY_PATH_CONFIG.model,
    fenceModel: NEUTRAL_FENCE_CONFIG.model,
    fenceSource: NEUTRAL_FENCE_CONFIG.source,
    parkId: NEUTRAL_FENCE_CONFIG.parkId,
    geometryEventSchemaVersion:
      FIELD_GEOMETRY_CONFIG.geometryEventSchemaVersion,
    evaluations: accumulator.evaluations,
    validEvents: accumulator.validEvents,
    invalidEvents: accumulator.invalidEvents,
    airEvaluations: accumulator.airEvaluations,
    groundEvaluations: accumulator.groundEvaluations,
    wallContext: finalizeCounter(
      accumulator.wallContext,
      accumulator.airEvaluations
    ),
    breakdowns: {
      trajectoryClass: finalizeBreakdown(
        accumulator.trajectoryClass
      ),
      fieldSector: finalizeBreakdown(
        accumulator.fieldSector
      ),
      evBand: finalizeBreakdown(accumulator.evBand),
      laBand: finalizeBreakdown(accumulator.laBand),
    },
    metrics: {
      fenceDistance:
        finalizeMeasurementHistogram(
          accumulator.fenceDistance
        ),
      landingDistanceToFence:
        finalizeMeasurementHistogram(
          accumulator.landingDistanceToFence
        ),
      fenceTime:
        finalizeMeasurementHistogram(accumulator.fenceTime),
      heightAtFence:
        finalizeMeasurementHistogram(
          accumulator.heightAtFence
        ),
      clearance:
        finalizeMeasurementHistogram(accumulator.clearance),
      apexTime:
        finalizeMeasurementHistogram(accumulator.apexTime),
      apexHeight:
        finalizeMeasurementHistogram(accumulator.apexHeight),
      apexDistance:
        finalizeMeasurementHistogram(accumulator.apexDistance),
    },
    legacyOutcome: Object.fromEntries(
      LEGACY_OUTCOMES.map((outcome) => {
        const line = accumulator.legacyOutcome[outcome];
        return [
          outcome,
          {
            count: line.count,
            wallContext: finalizeCounter(
              line.wallContext,
              line.count
            ),
          },
        ];
      })
    ),
    defenseByWallContext: structuredClone(
      accumulator.defenseByWallContext
    ),
    inconsistencies: {
      overFenceShadowCaught:
        accumulator.overFenceShadowCaught,
      overFenceLegacyOut: accumulator.overFenceLegacyOut,
      overFenceLegacyOutcome: structuredClone(
        accumulator.overFenceLegacyOutcome
      ),
      responsibleTargetOutsideFence:
        accumulator.responsibleTargetOutsideFence,
      candidateTargetsOutsideFence:
        accumulator.candidateTargetsOutsideFence,
      candidateTargetChecks:
        accumulator.candidateTargetChecks,
    },
    diagnostics: {
      nonFiniteValueCount: accumulator.nonFiniteValueCount,
      endpointIdentityChecks:
        accumulator.endpointIdentityChecks,
      endpointIdentityViolationCount:
        accumulator.endpointIdentityViolationCount,
      symmetryChecks: accumulator.symmetryChecks,
      symmetryViolationCount:
        accumulator.symmetryViolationCount,
      geometryRngCalls: accumulator.geometryRngCalls,
      fallbackCount: accumulator.fallbackCount,
    },
    performance: {
      rawEventsStored: false,
      rawTrajectoryArraysStored: false,
      timeTickScans: 0,
      monteCarloEvaluations: 0,
      geometryRegenerations: 0,
      defenseRegenerations: 0,
    },
    authority: RESOLUTION_AUTHORITY_CONFIG,
  };
}
