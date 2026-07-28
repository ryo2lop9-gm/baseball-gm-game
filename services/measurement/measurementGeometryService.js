import { BATTED_BALL_FIELD_SECTORS } from "../../config/battedBallDirectionConfig.js";
import {
  FIELD_GEOMETRY_CONFIG,
} from "../../config/fieldGeometryConfig.js";
import { RESOLUTION_AUTHORITY_CONFIG } from "../../config/resolutionAuthorityConfig.js";
import { TRAJECTORY_MODEL_CONFIG } from "../../config/trajectoryModelConfig.js";
import {
  classifyTrajectoryClass,
} from "../defense/battedBallGeometryService.js";
import {
  getEvBand,
  getLaBand,
  MEASUREMENT_EV_BANDS,
  MEASUREMENT_LA_BANDS,
} from "./measurementAdvancedService.js";
import { getMeasurementClass } from "./measurementClassService.js";
import {
  createMeasurementHistogram,
  finalizeMeasurementHistogram,
} from "./measurementHistogramService.js";

export const GEOMETRY_TRAJECTORY_CLASSES = Object.freeze([
  "ground",
  "low_liner",
  "air_liner",
  "fly",
  "popup",
]);
export const GEOMETRY_TRAJECTORY_KINDS = Object.freeze(["ground", "air"]);
export const GEOMETRY_CANDIDATE_KINDS = Object.freeze([
  "air_landing",
  "ground_intercept",
  "post_stop_recovery",
]);
const MEASUREMENT_CLASSES = Object.freeze(["GB", "LD", "FB", "PU"]);
const FIELDER_POSITION_BITS = Object.freeze(
  Object.fromEntries(
    FIELD_GEOMETRY_CONFIG.fielderPositionOrder.map((position, index) => [
      position,
      1 << index,
    ])
  )
);
const ALL_FIELDER_POSITION_BITS =
  (1 << FIELD_GEOMETRY_CONFIG.fielderPositionOrder.length) - 1;

function zeroMap(keys) {
  return Object.fromEntries(keys.map((key) => [key, 0]));
}

function safeDivide(numerator, denominator) {
  return denominator > 0 ? numerator / denominator : 0;
}

function createDistributionLine() {
  return {
    opportunities: 0,
    trajectoryClass: zeroMap(GEOMETRY_TRAJECTORY_CLASSES),
    radialDistance: createMeasurementHistogram(1),
  };
}

function createBreakdown(keys) {
  return Object.fromEntries(
    keys.map((key) => [key, createDistributionLine()])
  );
}

function createFielderLine() {
  return {
    candidates: 0,
    pathDistance: createMeasurementHistogram(1),
    eta: createMeasurementHistogram(0.05),
    margin: createMeasurementHistogram(0.05),
    candidateKind: zeroMap(GEOMETRY_CANDIDATE_KINDS),
  };
}

function mergeMap(target, source) {
  for (const key of Object.keys(target)) {
    target[key] += Number(source?.[key]) || 0;
  }
}

function mergeDistributionLine(target, source) {
  target.opportunities += source.opportunities;
  mergeMap(target.trajectoryClass, source.trajectoryClass);
  mergeKnownFiniteHistogram(
    target.radialDistance,
    source.radialDistance
  );
}

function mergeBreakdown(target, source) {
  for (const key of Object.keys(target)) {
    if (!source[key].opportunities) continue;
    mergeDistributionLine(target[key], source[key]);
  }
}

function mergeFielderLine(target, source) {
  target.candidates += source.candidates;
  mergeKnownFiniteHistogram(target.pathDistance, source.pathDistance);
  mergeKnownFiniteHistogram(target.eta, source.eta);
  mergeKnownFiniteHistogram(target.margin, source.margin);
  mergeMap(target.candidateKind, source.candidateKind);
}

function finalizeCounter(map, denominator) {
  return Object.fromEntries(
    Object.entries(map).map(([key, count]) => [
      key,
      { count, pct: safeDivide(count, denominator) },
    ])
  );
}

function finalizeDistributionLine(line) {
  return {
    opportunities: line.opportunities,
    trajectoryClass: finalizeCounter(
      line.trajectoryClass,
      line.opportunities
    ),
    radialDistance: finalizeMeasurementHistogram(line.radialDistance),
  };
}

function finalizeBreakdown(breakdown) {
  return Object.fromEntries(
    Object.entries(breakdown).map(([key, line]) => [
      key,
      finalizeDistributionLine(line),
    ])
  );
}

function finalizeFielderLine(line) {
  return {
    candidates: line.candidates,
    pathDistance: finalizeMeasurementHistogram(line.pathDistance),
    eta: finalizeMeasurementHistogram(line.eta),
    margin: finalizeMeasurementHistogram(line.margin),
    candidateKind: finalizeCounter(
      line.candidateKind,
      line.candidates
    ),
  };
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function isAllowed(values, value) {
  return values.includes(value);
}

function countNonFinite(values) {
  return values.reduce(
    (count, value) => count + (isFiniteNumber(value) ? 0 : 1),
    0
  );
}

function recordKnownFiniteHistogram(histogram, value) {
  const bin = Math.round(value / histogram.binWidth);
  histogram.bins[bin] = (histogram.bins[bin] || 0) + 1;
  histogram.count += 1;
  histogram.sum += value;
  histogram.sumSquares += value * value;
  histogram.min =
    histogram.min === null ? value : Math.min(histogram.min, value);
  histogram.max =
    histogram.max === null ? value : Math.max(histogram.max, value);
}

function mergeKnownFiniteHistogram(target, source) {
  if (!source.count) return;
  for (const bin in source.bins) {
    target.bins[bin] = (target.bins[bin] || 0) + source.bins[bin];
  }
  target.count += source.count;
  target.sum += source.sum;
  target.sumSquares += source.sumSquares;
  target.min =
    target.min === null ? source.min : Math.min(target.min, source.min);
  target.max =
    target.max === null ? source.max : Math.max(target.max, source.max);
}

function recordDistributionLine(line, event) {
  line.opportunities += 1;
  line.trajectoryClass[event.trajectoryClass] += 1;
  recordKnownFiniteHistogram(
    line.radialDistance,
    event.radialDistanceFt
  );
}

function hasExactAuthorityMap(authority) {
  if (
    !authority ||
    Object.keys(authority).length !==
      Object.keys(RESOLUTION_AUTHORITY_CONFIG).length
  ) {
    return false;
  }
  return Object.entries(RESOLUTION_AUTHORITY_CONFIG).every(
    ([key, value]) => authority[key] === value
  );
}

export function createGeometryMeasurementAccumulator() {
  return {
    opportunities: 0,
    validEvents: 0,
    invalidEvents: 0,
    trajectoryClass: zeroMap(GEOMETRY_TRAJECTORY_CLASSES),
    trajectoryKind: zeroMap(GEOMETRY_TRAJECTORY_KINDS),
    measurementClassByTrajectoryClass: Object.fromEntries(
      MEASUREMENT_CLASSES.map((measurementClass) => [
        measurementClass,
        zeroMap(GEOMETRY_TRAJECTORY_CLASSES),
      ])
    ),
    radialDistance: createMeasurementHistogram(1),
    hangTime: createMeasurementHistogram(0.05),
    firstGroundDistance: createMeasurementHistogram(1),
    stopDistance: createMeasurementHistogram(1),
    stopTime: createMeasurementHistogram(0.05),
    evBand: createBreakdown(MEASUREMENT_EV_BANDS),
    laBand: createBreakdown(MEASUREMENT_LA_BANDS),
    fieldSector: createBreakdown(BATTED_BALL_FIELD_SECTORS),
    fielders: Object.fromEntries(
      FIELD_GEOMETRY_CONFIG.fielderPositionOrder.map((position) => [
        position,
        createFielderLine(),
      ])
    ),
    candidateKind: zeroMap(GEOMETRY_CANDIDATE_KINDS),
    nonFiniteValueCount: 0,
    fairRangeViolationCount: 0,
    geometryRngCalls: 0,
    fallbackCount: 0,
  };
}

export function recordGeometryMeasurement(accumulator, event) {
  if (event?.geometryMode !== FIELD_GEOMETRY_CONFIG.shadowMode) {
    return event?.geometryMode === FIELD_GEOMETRY_CONFIG.defaultMode;
  }
  accumulator.opportunities += 1;
  const geometryRngCalls = Number(event.geometryRngCalls);
  if (Number.isInteger(geometryRngCalls) && geometryRngCalls >= 0) {
    accumulator.geometryRngCalls += geometryRngCalls;
  }
  if (event.geometryFallbackUsed) accumulator.fallbackCount += 1;
  const candidates = Array.isArray(event.fielderGeometryCandidates)
    ? event.fielderGeometryCandidates
    : [];
  let candidateNonFiniteCount = 0;
  let candidatePositions = 0;
  let candidatesValid =
    candidates.length === FIELD_GEOMETRY_CONFIG.fielderPositionOrder.length;
  for (const candidate of candidates) {
    const bit = FIELDER_POSITION_BITS[candidate?.position] || 0;
    if (!bit || (candidatePositions & bit) !== 0) {
      candidatesValid = false;
    }
    candidatePositions |= bit;
    const nonFiniteCount = countNonFinite([
      candidate?.startPoint?.x,
      candidate?.startPoint?.y,
      candidate?.targetPoint?.x,
      candidate?.targetPoint?.y,
      candidate?.pathDistanceFt,
      candidate?.fielderEtaSec,
      candidate?.ballTimeSec,
      candidate?.arrivalMarginSec,
    ]);
    candidateNonFiniteCount += nonFiniteCount;
    if (
      nonFiniteCount !== 0 ||
      !isAllowed(GEOMETRY_CANDIDATE_KINDS, candidate?.candidateKind)
    ) {
      candidatesValid = false;
    }
  }
  candidatesValid =
    candidatesValid &&
    candidatePositions === ALL_FIELDER_POSITION_BITS;
  accumulator.nonFiniteValueCount +=
    candidateNonFiniteCount +
    countNonFinite([
      event.exitVelocity,
      event.launchAngle,
      event.sprayAngle,
      event.radialDistanceFt,
      event.trajectoryKind === "air" ? event.hangTimeSec : 0,
      event.trajectoryKind === "ground" ? event.firstGroundTimeSec : 0,
      event.trajectoryKind === "ground"
        ? event.firstGroundDistanceFt
        : 0,
      event.trajectoryKind === "ground" ? event.stopTimeSec : 0,
      event.trajectoryKind === "ground" ? event.stopDistanceFt : 0,
    ]);
  const fairAngleValid =
    isFiniteNumber(event.sprayAngle) &&
    event.sprayAngle >= FIELD_GEOMETRY_CONFIG.fairAngle.min &&
    event.sprayAngle <= FIELD_GEOMETRY_CONFIG.fairAngle.max;
  if (!fairAngleValid) accumulator.fairRangeViolationCount += 1;

  let expectedMeasurementClass = null;
  let expectedTrajectoryClass = null;
  try {
    expectedMeasurementClass = getMeasurementClass(event.launchAngle);
    expectedTrajectoryClass = classifyTrajectoryClass(event.launchAngle);
  } catch {
    // Invalid values are diagnosed without retaining the raw event.
  }
  const groundValuesValid =
    event.trajectoryKind !== "ground" ||
    [
      event.firstGroundTimeSec,
      event.firstGroundDistanceFt,
      event.stopTimeSec,
      event.stopDistanceFt,
      event.stopX,
      event.stopY,
    ].every(isFiniteNumber);
  const airValuesValid =
    event.trajectoryKind !== "air" ||
    [event.hangTimeSec, event.landingX, event.landingY].every(
      isFiniteNumber
    );
  const valid =
    typeof event.battedBallEventId === "string" &&
    event.battedBallEventId.length > 0 &&
    event.geometryModel === FIELD_GEOMETRY_CONFIG.model &&
    event.geometryEventSchemaVersion ===
      FIELD_GEOMETRY_CONFIG.geometryEventSchemaVersion &&
    event.geometrySource === TRAJECTORY_MODEL_CONFIG.source &&
    event.coordinateSystem === FIELD_GEOMETRY_CONFIG.coordinateSystem &&
    event.measurementClass === expectedMeasurementClass &&
    event.trajectoryClass === expectedTrajectoryClass &&
    isAllowed(GEOMETRY_TRAJECTORY_KINDS, event.trajectoryKind) &&
    isAllowed(BATTED_BALL_FIELD_SECTORS, event.fieldSector) &&
    isFiniteNumber(event.radialDistanceFt) &&
    event.radialDistanceFt >= 0 &&
    fairAngleValid &&
    groundValuesValid &&
    airValuesValid &&
    candidatesValid &&
    geometryRngCalls === 0 &&
    hasExactAuthorityMap(event.resolutionAuthority);
  if (!valid) {
    accumulator.invalidEvents += 1;
    return false;
  }

  accumulator.validEvents += 1;
  accumulator.trajectoryClass[event.trajectoryClass] += 1;
  accumulator.trajectoryKind[event.trajectoryKind] += 1;
  accumulator.measurementClassByTrajectoryClass[event.measurementClass][
    event.trajectoryClass
  ] += 1;
  recordKnownFiniteHistogram(
    accumulator.radialDistance,
    event.radialDistanceFt
  );
  if (event.trajectoryKind === "air") {
    recordKnownFiniteHistogram(accumulator.hangTime, event.hangTimeSec);
  } else {
    recordKnownFiniteHistogram(
      accumulator.firstGroundDistance,
      event.firstGroundDistanceFt
    );
    recordKnownFiniteHistogram(
      accumulator.stopDistance,
      event.stopDistanceFt
    );
    recordKnownFiniteHistogram(accumulator.stopTime, event.stopTimeSec);
  }
  recordDistributionLine(
    accumulator.evBand[getEvBand(event.exitVelocity)],
    event
  );
  recordDistributionLine(
    accumulator.laBand[getLaBand(event.launchAngle)],
    event
  );
  recordDistributionLine(
    accumulator.fieldSector[event.fieldSector],
    event
  );
  for (const candidate of candidates) {
    const line = accumulator.fielders[candidate.position];
    line.candidates += 1;
    line.candidateKind[candidate.candidateKind] += 1;
    accumulator.candidateKind[candidate.candidateKind] += 1;
    recordKnownFiniteHistogram(
      line.pathDistance,
      candidate.pathDistanceFt
    );
    recordKnownFiniteHistogram(line.eta, candidate.fielderEtaSec);
    recordKnownFiniteHistogram(line.margin, candidate.arrivalMarginSec);
  }
  return true;
}

export function mergeGeometryMeasurement(target, source) {
  target.opportunities += source.opportunities;
  target.validEvents += source.validEvents;
  target.invalidEvents += source.invalidEvents;
  mergeMap(target.trajectoryClass, source.trajectoryClass);
  mergeMap(target.trajectoryKind, source.trajectoryKind);
  for (const measurementClass of MEASUREMENT_CLASSES) {
    mergeMap(
      target.measurementClassByTrajectoryClass[measurementClass],
      source.measurementClassByTrajectoryClass[measurementClass]
    );
  }
  mergeKnownFiniteHistogram(target.radialDistance, source.radialDistance);
  mergeKnownFiniteHistogram(target.hangTime, source.hangTime);
  mergeKnownFiniteHistogram(
    target.firstGroundDistance,
    source.firstGroundDistance
  );
  mergeKnownFiniteHistogram(target.stopDistance, source.stopDistance);
  mergeKnownFiniteHistogram(target.stopTime, source.stopTime);
  mergeBreakdown(target.evBand, source.evBand);
  mergeBreakdown(target.laBand, source.laBand);
  mergeBreakdown(target.fieldSector, source.fieldSector);
  for (const position of FIELD_GEOMETRY_CONFIG.fielderPositionOrder) {
    mergeFielderLine(target.fielders[position], source.fielders[position]);
  }
  mergeMap(target.candidateKind, source.candidateKind);
  target.nonFiniteValueCount += source.nonFiniteValueCount;
  target.fairRangeViolationCount += source.fairRangeViolationCount;
  target.geometryRngCalls += source.geometryRngCalls;
  target.fallbackCount += source.fallbackCount;
  return target;
}

export function finalizeGeometryMeasurement(
  accumulator,
  {
    fairBattedBalls,
    directionOpportunities,
    mode,
  }
) {
  const shadowEnabled = mode === FIELD_GEOMETRY_CONFIG.shadowMode;
  return {
    mode,
    model: FIELD_GEOMETRY_CONFIG.model,
    geometryEventSchemaVersion:
      FIELD_GEOMETRY_CONFIG.geometryEventSchemaVersion,
    source: TRAJECTORY_MODEL_CONFIG.source,
    coordinateSystem: FIELD_GEOMETRY_CONFIG.coordinateSystem,
    opportunities: accumulator.opportunities,
    validEvents: accumulator.validEvents,
    invalidEvents: accumulator.invalidEvents,
    trajectoryClass: finalizeCounter(
      accumulator.trajectoryClass,
      accumulator.validEvents
    ),
    trajectoryKind: finalizeCounter(
      accumulator.trajectoryKind,
      accumulator.validEvents
    ),
    measurementClassByTrajectoryClass: Object.fromEntries(
      MEASUREMENT_CLASSES.map((measurementClass) => [
        measurementClass,
        finalizeCounter(
          accumulator.measurementClassByTrajectoryClass[measurementClass],
          Object.values(
            accumulator.measurementClassByTrajectoryClass[measurementClass]
          ).reduce((sum, count) => sum + count, 0)
        ),
      ])
    ),
    radialDistance: finalizeMeasurementHistogram(
      accumulator.radialDistance
    ),
    hangTime: finalizeMeasurementHistogram(accumulator.hangTime),
    ground: {
      firstGroundDistance: finalizeMeasurementHistogram(
        accumulator.firstGroundDistance
      ),
      stopDistance: finalizeMeasurementHistogram(
        accumulator.stopDistance
      ),
      stopTime: finalizeMeasurementHistogram(accumulator.stopTime),
    },
    breakdowns: {
      evBand: finalizeBreakdown(accumulator.evBand),
      laBand: finalizeBreakdown(accumulator.laBand),
      fieldSector: finalizeBreakdown(accumulator.fieldSector),
    },
    fielders: Object.fromEntries(
      Object.entries(accumulator.fielders).map(([position, line]) => [
        position,
        finalizeFielderLine(line),
      ])
    ),
    candidateKind: finalizeCounter(
      accumulator.candidateKind,
      accumulator.validEvents * FIELD_GEOMETRY_CONFIG.fielderPositionOrder.length
    ),
    authority: RESOLUTION_AUTHORITY_CONFIG,
    diagnostics: {
      nonFiniteValueCount: accumulator.nonFiniteValueCount,
      fairRangeViolationCount: accumulator.fairRangeViolationCount,
      opportunityFairBattedBallMismatchCount:
        shadowEnabled && accumulator.opportunities !== fairBattedBalls ? 1 : 0,
      opportunityDirectionMismatchCount:
        shadowEnabled &&
        accumulator.opportunities !== directionOpportunities
          ? 1
          : 0,
      geometryRngCalls: accumulator.geometryRngCalls,
      fallbackCount: accumulator.fallbackCount,
    },
  };
}
