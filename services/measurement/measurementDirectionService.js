import {
  BATTER_BATS_VALUES,
  BATTER_DIRECTION_TYPES,
  BATTED_BALL_DIRECTIONS,
  BATTED_BALL_DIRECTION_CONFIG,
  BATTED_BALL_FIELD_SECTORS,
  BATTED_BALL_MEASUREMENT_CLASSES,
  PITCHER_THROWS_VALUES,
} from "../../config/battedBallDirectionConfig.js";
import {
  classifyBatterRelativeDirection,
  classifyFieldSector,
} from "../battedBallDirectionService.js";
import { getMeasurementClass } from "./measurementClassService.js";
import {
  createMeasurementHistogram,
  finalizeMeasurementHistogram,
  mergeMeasurementHistogram,
  recordMeasurementHistogram,
} from "./measurementHistogramService.js";

const RESOLVED_BATTING_SIDES = Object.freeze(["R", "L"]);
const PITCH_TYPES = Object.freeze([
  "fourSeam",
  "slider",
  "curve",
  "fork",
  "unknown",
]);
const HORIZONTAL_LOCATIONS = Object.freeze([
  "inside",
  "middle",
  "outside",
  "unknown",
]);

function zeroMap(keys) {
  return Object.fromEntries(keys.map((key) => [key, 0]));
}

function createBreakdown(keys) {
  return Object.fromEntries(
    keys.map((key) => [
      key,
      {
        opportunities: 0,
        direction: zeroMap(BATTED_BALL_DIRECTIONS),
      },
    ])
  );
}

function safeDivide(numerator, denominator) {
  return denominator > 0 ? numerator / denominator : 0;
}

function includes(keys, value) {
  return keys.includes(value);
}

function recordBreakdown(line, direction) {
  line.opportunities += 1;
  line.direction[direction] += 1;
}

function mergeMap(target, source) {
  for (const [key, value] of Object.entries(source)) {
    target[key] += Number(value) || 0;
  }
}

function mergeBreakdown(target, source) {
  for (const key of Object.keys(target)) {
    target[key].opportunities += source[key].opportunities;
    mergeMap(target[key].direction, source[key].direction);
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

function finalizeBreakdown(raw) {
  return Object.fromEntries(
    Object.entries(raw).map(([key, line]) => [
      key,
      {
        opportunities: line.opportunities,
        direction: finalizeCounter(line.direction, line.opportunities),
      },
    ])
  );
}

export function createDirectionMeasurementAccumulator() {
  return {
    opportunities: 0,
    validEvents: 0,
    invalidEvents: 0,
    direction: zeroMap(BATTED_BALL_DIRECTIONS),
    fieldSector: zeroMap(BATTED_BALL_FIELD_SECTORS),
    sprayAngle: createMeasurementHistogram(0.1),
    resolvedBattingSide: createBreakdown(RESOLVED_BATTING_SIDES),
    measurementClass: createBreakdown(BATTED_BALL_MEASUREMENT_CLASSES),
    pitchType: createBreakdown(PITCH_TYPES),
    horizontalLocation: createBreakdown(HORIZONTAL_LOCATIONS),
    categoryAngleMismatchCount: 0,
    directionRngCalls: 0,
  };
}

export function recordDirectionMeasurement(accumulator, event) {
  if (event?.directionMode !== BATTED_BALL_DIRECTION_CONFIG.shadowMode) {
    return event?.directionMode === BATTED_BALL_DIRECTION_CONFIG.defaultMode;
  }

  accumulator.opportunities += 1;
  const directionRngCalls = Number(event.directionRngCalls);
  if (Number.isInteger(directionRngCalls) && directionRngCalls >= 0) {
    accumulator.directionRngCalls += directionRngCalls;
  }
  const relativeAngle = Number(event.batterRelativeSprayAngle);
  const sprayAngle = Number(event.sprayAngle);
  let relativeDirection = null;
  let fieldSector = null;
  try {
    relativeDirection = classifyBatterRelativeDirection(relativeAngle);
    fieldSector = classifyFieldSector(sprayAngle);
  } catch {
    // Invalid angles are counted below without preserving the raw event.
  }
  const categoryMatches =
    relativeDirection === event.direction && fieldSector === event.fieldSector;
  if (!categoryMatches) {
    accumulator.categoryAngleMismatchCount += 1;
  }

  let expectedClass = null;
  try {
    expectedClass = getMeasurementClass(event.launchAngle);
  } catch {
    // The parent measurement service diagnoses the EV/LA event separately.
  }
  const valid =
    typeof event.battedBallEventId === "string" &&
    event.battedBallEventId.length > 0 &&
    event.directionModel === BATTED_BALL_DIRECTION_CONFIG.model &&
    includes(BATTER_BATS_VALUES, event.batterBats) &&
    includes(PITCHER_THROWS_VALUES, event.pitcherThrows) &&
    includes(RESOLVED_BATTING_SIDES, event.resolvedBattingSide) &&
    includes(BATTER_DIRECTION_TYPES, event.directionType) &&
    includes(BATTED_BALL_MEASUREMENT_CLASSES, event.measurementClass) &&
    event.measurementClass === expectedClass &&
    includes(BATTED_BALL_DIRECTIONS, event.direction) &&
    includes(BATTED_BALL_FIELD_SECTORS, event.fieldSector) &&
    Number.isFinite(relativeAngle) &&
    Number.isFinite(sprayAngle) &&
    includes(HORIZONTAL_LOCATIONS.slice(0, -1), event.horizontalLocation) &&
    (event.verticalLocation === "high" ||
      event.verticalLocation === "middle" ||
      event.verticalLocation === "low") &&
    directionRngCalls === 2 &&
    categoryMatches;

  if (!valid) {
    accumulator.invalidEvents += 1;
    return false;
  }

  accumulator.validEvents += 1;
  accumulator.direction[event.direction] += 1;
  accumulator.fieldSector[event.fieldSector] += 1;
  recordMeasurementHistogram(accumulator.sprayAngle, sprayAngle);
  recordBreakdown(
    accumulator.resolvedBattingSide[event.resolvedBattingSide],
    event.direction
  );
  recordBreakdown(
    accumulator.measurementClass[event.measurementClass],
    event.direction
  );
  const pitchType = includes(PITCH_TYPES.slice(0, -1), event.pitchType)
    ? event.pitchType
    : "unknown";
  recordBreakdown(accumulator.pitchType[pitchType], event.direction);
  const horizontal = includes(
    HORIZONTAL_LOCATIONS.slice(0, -1),
    event.horizontalLocation
  )
    ? event.horizontalLocation
    : "unknown";
  recordBreakdown(
    accumulator.horizontalLocation[horizontal],
    event.direction
  );
  return true;
}

export function mergeDirectionMeasurement(target, source) {
  target.opportunities += source.opportunities;
  target.validEvents += source.validEvents;
  target.invalidEvents += source.invalidEvents;
  target.categoryAngleMismatchCount += source.categoryAngleMismatchCount;
  target.directionRngCalls += source.directionRngCalls;
  mergeMap(target.direction, source.direction);
  mergeMap(target.fieldSector, source.fieldSector);
  mergeMeasurementHistogram(target.sprayAngle, source.sprayAngle);
  mergeBreakdown(target.resolvedBattingSide, source.resolvedBattingSide);
  mergeBreakdown(target.measurementClass, source.measurementClass);
  mergeBreakdown(target.pitchType, source.pitchType);
  mergeBreakdown(target.horizontalLocation, source.horizontalLocation);
  return target;
}

export function finalizeDirectionMeasurement(
  accumulator,
  { fairBattedBalls, mode, directionSeed }
) {
  const shadowEnabled = mode === BATTED_BALL_DIRECTION_CONFIG.shadowMode;
  return {
    mode,
    model: BATTED_BALL_DIRECTION_CONFIG.model,
    directionSeed: shadowEnabled ? directionSeed : null,
    opportunities: accumulator.opportunities,
    validEvents: accumulator.validEvents,
    invalidEvents: accumulator.invalidEvents,
    direction: finalizeCounter(
      accumulator.direction,
      accumulator.validEvents
    ),
    fieldSector: finalizeCounter(
      accumulator.fieldSector,
      accumulator.validEvents
    ),
    sprayAngle: finalizeMeasurementHistogram(accumulator.sprayAngle),
    breakdowns: {
      resolvedBattingSide: finalizeBreakdown(
        accumulator.resolvedBattingSide
      ),
      measurementClass: finalizeBreakdown(accumulator.measurementClass),
      pitchType: finalizeBreakdown(accumulator.pitchType),
      horizontalLocation: finalizeBreakdown(
        accumulator.horizontalLocation
      ),
    },
    diagnostics: {
      categoryAngleMismatchCount:
        accumulator.categoryAngleMismatchCount,
      opportunityFairBattedBallMismatchCount:
        shadowEnabled && accumulator.opportunities !== fairBattedBalls ? 1 : 0,
      directionRngCalls: accumulator.directionRngCalls,
    },
  };
}
