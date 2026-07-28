import { BATTED_BALL_FIELD_SECTORS } from "../../config/battedBallDirectionConfig.js";
import { BATTED_BALL_DEFENSE_CONFIG } from "../../config/defenseProbabilityConfig.js";
import { DEFENSE_POSITIONS } from "../../config/defenseConfig.js";
import { RESOLUTION_AUTHORITY_CONFIG } from "../../config/resolutionAuthorityConfig.js";
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

const TRAJECTORY_CLASSES = Object.freeze([
  "ground",
  "low_liner",
  "air_liner",
  "fly",
  "popup",
]);
const MOVEMENT_DIRECTIONS = Object.freeze([
  "stationary",
  "toward_home",
  "lateral",
  "back",
]);
const EXCLUSION_REASONS = Object.freeze([
  "trajectory_ground",
  "trajectory_low_liner",
  "trajectory_air_liner",
  "trajectory_not_simple_catch",
]);
const RATING_BANDS = Object.freeze(["0-39", "40-59", "60-100"]);
const DIFFICULTY_BANDS = Object.freeze([
  "<0.25",
  "0.25-0.499",
  "0.5-0.749",
  "0.75+",
]);
const PROBABILITY_FIELDS = Object.freeze([
  "pReachAverage",
  "pSecureAverage",
  "pStandardAlignmentOut",
  "pAlignedAverageOut",
  "pReachActual",
  "pSecureActual",
  "pActualOut",
]);

function zeroMap(keys) {
  return Object.fromEntries(keys.map((key) => [key, 0]));
}

function createOaaLine() {
  return { evaluations: 0, simCatchOAASum: 0 };
}

function createOaaBreakdown(keys) {
  return Object.fromEntries(keys.map((key) => [key, createOaaLine()]));
}

function createProbabilityHistograms() {
  return Object.fromEntries(
    PROBABILITY_FIELDS.map((key) => [
      key,
      createMeasurementHistogram(0.005),
    ])
  );
}

function getRatingBand(value) {
  if (value < 40) return "0-39";
  if (value < 60) return "40-59";
  return "60-100";
}

function getDifficultyBand(value) {
  if (value < 0.25) return "<0.25";
  if (value < 0.5) return "0.25-0.499";
  if (value < 0.75) return "0.5-0.749";
  return "0.75+";
}

function hasExactAuthorityMap(authority) {
  return (
    authority &&
    Object.keys(authority).length ===
      Object.keys(RESOLUTION_AUTHORITY_CONFIG).length &&
    Object.entries(RESOLUTION_AUTHORITY_CONFIG).every(
      ([key, value]) => authority[key] === value
    )
  );
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function isProbability(value) {
  return isFiniteNumber(value) && value >= 0 && value <= 1;
}

function recordOaa(line, simCatchOAA) {
  line.evaluations += 1;
  line.simCatchOAASum += simCatchOAA;
}

function mergeMap(target, source) {
  for (const key of Object.keys(target)) {
    target[key] += Number(source?.[key]) || 0;
  }
}

function mergeOaaBreakdown(target, source) {
  for (const key of Object.keys(target)) {
    target[key].evaluations += source[key].evaluations;
    target[key].simCatchOAASum += source[key].simCatchOAASum;
  }
}

function finalizeCounter(map, denominator) {
  return Object.fromEntries(
    Object.entries(map).map(([key, count]) => [
      key,
      { count, pct: denominator > 0 ? count / denominator : 0 },
    ])
  );
}

function finalizeOaaBreakdown(breakdown) {
  return Object.fromEntries(
    Object.entries(breakdown).map(([key, line]) => [
      key,
      {
        evaluations: line.evaluations,
        simCatchOAASum: line.simCatchOAASum,
        simCatchOAAAverage:
          line.evaluations > 0
            ? line.simCatchOAASum / line.evaluations
            : 0,
      },
    ])
  );
}

export function createDefenseMeasurementAccumulator() {
  return {
    evaluations: 0,
    validEvents: 0,
    invalidEvents: 0,
    eligible: 0,
    ineligible: 0,
    exclusions: zeroMap(EXCLUSION_REASONS),
    trajectoryClass: zeroMap(TRAJECTORY_CLASSES),
    responsibleFielderPosition: zeroMap(DEFENSE_POSITIONS),
    movementDirection: zeroMap(MOVEMENT_DIRECTIONS),
    fieldSector: zeroMap(BATTED_BALL_FIELD_SECTORS),
    evBand: zeroMap(MEASUREMENT_EV_BANDS),
    laBand: zeroMap(MEASUREMENT_LA_BANDS),
    timing: {
      distance: createMeasurementHistogram(1),
      ballTime: createMeasurementHistogram(0.05),
      averageMargin: createMeasurementHistogram(0.05),
      actualMargin: createMeasurementHistogram(0.05),
    },
    probabilities: createProbabilityHistograms(),
    shadowCaught: 0,
    expectedCatches: 0,
    simCatchOAASum: 0,
    expectedSkillOutsSum: 0,
    executionResidualSum: 0,
    positionOaa: createOaaBreakdown(DEFENSE_POSITIONS),
    directionOaa: createOaaBreakdown(MOVEMENT_DIRECTIONS),
    difficultyOaa: createOaaBreakdown(DIFFICULTY_BANDS),
    fieldingBand: zeroMap(RATING_BANDS),
    speedBand: zeroMap(RATING_BANDS),
    legacyShadowMatrix: {
      out: { caught: 0, notCaught: 0 },
      safe: { caught: 0, notCaught: 0 },
    },
    defenseRngCalls: 0,
    fallbackCount: 0,
    nonFiniteValueCount: 0,
    probabilityRangeViolationCount: 0,
    identityViolationCount: 0,
  };
}

export function recordDefenseMeasurement(accumulator, event) {
  if (
    event?.defenseMode !== BATTED_BALL_DEFENSE_CONFIG.shadowMode
  ) {
    return event?.defenseMode ===
      BATTED_BALL_DEFENSE_CONFIG.defaultMode;
  }
  accumulator.evaluations += 1;
  const trajectoryClass = event.trajectoryClass;
  if (Object.hasOwn(accumulator.trajectoryClass, trajectoryClass)) {
    accumulator.trajectoryClass[trajectoryClass] += 1;
  }
  const defenseRngCalls = Number(event.defenseRngCalls);
  if (Number.isInteger(defenseRngCalls) && defenseRngCalls >= 0) {
    accumulator.defenseRngCalls += defenseRngCalls;
  }
  if (event.defenseFallbackUsed) accumulator.fallbackCount += 1;

  const commonValid =
    typeof event.battedBallEventId === "string" &&
    event.battedBallEventId.length > 0 &&
    event.defenseModel === BATTED_BALL_DEFENSE_CONFIG.model &&
    event.defenseSource === BATTED_BALL_DEFENSE_CONFIG.source &&
    event.defenseEventSchemaVersion ===
      BATTED_BALL_DEFENSE_CONFIG.defenseEventSchemaVersion &&
    event.shadowAuthority ===
      BATTED_BALL_DEFENSE_CONFIG.shadowAuthority &&
    hasExactAuthorityMap(event.resolutionAuthority) &&
    event.defenseFallbackUsed === false;

  if (!event.defenseEligible) {
    accumulator.ineligible += 1;
    if (Object.hasOwn(accumulator.exclusions, event.defenseExclusionReason)) {
      accumulator.exclusions[event.defenseExclusionReason] += 1;
    }
    const valid =
      commonValid &&
      Object.hasOwn(accumulator.exclusions, event.defenseExclusionReason) &&
      event.responsibleFielderPosition === null &&
      event.movementDirection === null &&
      PROBABILITY_FIELDS.every((key) => event[key] === null) &&
      event.shadowCaught === null &&
      defenseRngCalls === 0;
    if (valid) accumulator.validEvents += 1;
    else accumulator.invalidEvents += 1;
    return valid;
  }

  accumulator.eligible += 1;
  const numericValues = [
    event.exitVelocity,
    event.launchAngle,
    event.defenseFieldingRating,
    event.defenseSpeedRating,
    event.defensePathDistanceFt,
    event.defenseBallTimeSec,
    event.defenseAverageMarginSec,
    event.defenseActualMarginSec,
    event.simCatchOAA,
    event.expectedSkillOuts,
    event.executionResidual,
    event.teamOAA_vsStandard,
    event.teamExecutionOAA,
    event.positioningExpectedOuts,
    ...PROBABILITY_FIELDS.map((key) => event[key]),
  ];
  const nonFiniteCount = numericValues.reduce(
    (count, value) => count + (isFiniteNumber(value) ? 0 : 1),
    0
  );
  accumulator.nonFiniteValueCount += nonFiniteCount;
  const probabilityRangeViolations = PROBABILITY_FIELDS.reduce(
    (count, key) => count + (isProbability(event[key]) ? 0 : 1),
    0
  );
  accumulator.probabilityRangeViolationCount +=
    probabilityRangeViolations;
  const identityTolerance = 1e-12;
  const identityValid =
    isFiniteNumber(event.pActualOut) &&
    Math.abs(
      event.pActualOut - event.pReachActual * event.pSecureActual
    ) <= identityTolerance &&
    Math.abs(
      event.simCatchOAA -
        (event.expectedSkillOuts + event.executionResidual)
    ) <= identityTolerance &&
    Math.abs(
      event.teamOAA_vsStandard -
        (event.teamExecutionOAA + event.positioningExpectedOuts)
    ) <= identityTolerance &&
    event.pStandardAlignmentOut === event.pAlignedAverageOut &&
    event.positioningExpectedOuts === 0;
  if (!identityValid) accumulator.identityViolationCount += 1;

  const positionValid = Object.hasOwn(
    accumulator.responsibleFielderPosition,
    event.responsibleFielderPosition
  );
  const movementValid = Object.hasOwn(
    accumulator.movementDirection,
    event.movementDirection
  );
  const fieldSectorValid = Object.hasOwn(
    accumulator.fieldSector,
    event.fieldSector
  );
  const resultValid =
    typeof event.reachSuccess === "boolean" &&
    typeof event.secureAttempted === "boolean" &&
    (typeof event.secureSuccess === "boolean" ||
      event.secureSuccess === null) &&
    typeof event.shadowCaught === "boolean" &&
    event.secureAttempted === event.reachSuccess &&
    (event.reachSuccess ||
      (event.secureSuccess === null && event.shadowCaught === false));
  const valid =
    commonValid &&
    trajectoryClass !== "ground" &&
    trajectoryClass !== "low_liner" &&
    trajectoryClass !== "air_liner" &&
    positionValid &&
    typeof event.responsibleFielderPlayerId === "string" &&
    event.responsibleFielderPlayerId.length > 0 &&
    movementValid &&
    fieldSectorValid &&
    nonFiniteCount === 0 &&
    probabilityRangeViolations === 0 &&
    identityValid &&
    resultValid &&
    defenseRngCalls === 2;
  if (!valid) {
    accumulator.invalidEvents += 1;
    return false;
  }

  accumulator.validEvents += 1;
  accumulator.responsibleFielderPosition[
    event.responsibleFielderPosition
  ] += 1;
  accumulator.movementDirection[event.movementDirection] += 1;
  accumulator.fieldSector[event.fieldSector] += 1;
  accumulator.evBand[getEvBand(event.exitVelocity)] += 1;
  accumulator.laBand[getLaBand(event.launchAngle)] += 1;
  recordMeasurementHistogram(
    accumulator.timing.distance,
    event.defensePathDistanceFt
  );
  recordMeasurementHistogram(
    accumulator.timing.ballTime,
    event.defenseBallTimeSec
  );
  recordMeasurementHistogram(
    accumulator.timing.averageMargin,
    event.defenseAverageMarginSec
  );
  recordMeasurementHistogram(
    accumulator.timing.actualMargin,
    event.defenseActualMarginSec
  );
  for (const key of PROBABILITY_FIELDS) {
    recordMeasurementHistogram(accumulator.probabilities[key], event[key]);
  }
  const caught = event.shadowCaught ? 1 : 0;
  accumulator.shadowCaught += caught;
  accumulator.expectedCatches += event.pActualOut;
  accumulator.simCatchOAASum += event.simCatchOAA;
  accumulator.expectedSkillOutsSum += event.expectedSkillOuts;
  accumulator.executionResidualSum += event.executionResidual;
  recordOaa(
    accumulator.positionOaa[event.responsibleFielderPosition],
    event.simCatchOAA
  );
  recordOaa(
    accumulator.directionOaa[event.movementDirection],
    event.simCatchOAA
  );
  recordOaa(
    accumulator.difficultyOaa[
      getDifficultyBand(event.pAlignedAverageOut)
    ],
    event.simCatchOAA
  );
  accumulator.fieldingBand[
    getRatingBand(event.defenseFieldingRating)
  ] += 1;
  accumulator.speedBand[getRatingBand(event.defenseSpeedRating)] += 1;
  const legacyKey = event.outcome === "out" ? "out" : "safe";
  const shadowKey = event.shadowCaught ? "caught" : "notCaught";
  accumulator.legacyShadowMatrix[legacyKey][shadowKey] += 1;
  return true;
}

export function mergeDefenseMeasurement(target, source) {
  for (const key of [
    "evaluations",
    "validEvents",
    "invalidEvents",
    "eligible",
    "ineligible",
    "shadowCaught",
    "expectedCatches",
    "simCatchOAASum",
    "expectedSkillOutsSum",
    "executionResidualSum",
    "defenseRngCalls",
    "fallbackCount",
    "nonFiniteValueCount",
    "probabilityRangeViolationCount",
    "identityViolationCount",
  ]) {
    target[key] += source[key];
  }
  for (const key of [
    "exclusions",
    "trajectoryClass",
    "responsibleFielderPosition",
    "movementDirection",
    "fieldSector",
    "evBand",
    "laBand",
    "fieldingBand",
    "speedBand",
  ]) {
    mergeMap(target[key], source[key]);
  }
  for (const key of Object.keys(target.timing)) {
    mergeMeasurementHistogram(target.timing[key], source.timing[key]);
  }
  for (const key of PROBABILITY_FIELDS) {
    mergeMeasurementHistogram(
      target.probabilities[key],
      source.probabilities[key]
    );
  }
  mergeOaaBreakdown(target.positionOaa, source.positionOaa);
  mergeOaaBreakdown(target.directionOaa, source.directionOaa);
  mergeOaaBreakdown(target.difficultyOaa, source.difficultyOaa);
  for (const legacyKey of ["out", "safe"]) {
    mergeMap(
      target.legacyShadowMatrix[legacyKey],
      source.legacyShadowMatrix[legacyKey]
    );
  }
  return target;
}

export function finalizeDefenseMeasurement(
  accumulator,
  { mode, geometryEvaluations }
) {
  const shadowEnabled =
    mode === BATTED_BALL_DEFENSE_CONFIG.shadowMode;
  return {
    mode,
    model: BATTED_BALL_DEFENSE_CONFIG.model,
    source: BATTED_BALL_DEFENSE_CONFIG.source,
    defenseEventSchemaVersion:
      BATTED_BALL_DEFENSE_CONFIG.defenseEventSchemaVersion,
    shadowAuthority: BATTED_BALL_DEFENSE_CONFIG.shadowAuthority,
    evaluations: accumulator.evaluations,
    validEvents: accumulator.validEvents,
    invalidEvents: accumulator.invalidEvents,
    eligible: accumulator.eligible,
    ineligible: accumulator.ineligible,
    exclusions: finalizeCounter(
      accumulator.exclusions,
      accumulator.ineligible
    ),
    trajectoryClass: finalizeCounter(
      accumulator.trajectoryClass,
      accumulator.evaluations
    ),
    responsibleFielderPosition: finalizeCounter(
      accumulator.responsibleFielderPosition,
      accumulator.eligible
    ),
    movementDirection: finalizeCounter(
      accumulator.movementDirection,
      accumulator.eligible
    ),
    fieldSector: finalizeCounter(
      accumulator.fieldSector,
      accumulator.eligible
    ),
    evBand: finalizeCounter(accumulator.evBand, accumulator.eligible),
    laBand: finalizeCounter(accumulator.laBand, accumulator.eligible),
    timing: Object.fromEntries(
      Object.entries(accumulator.timing).map(([key, histogram]) => [
        key,
        finalizeMeasurementHistogram(histogram),
      ])
    ),
    probabilities: Object.fromEntries(
      PROBABILITY_FIELDS.map((key) => [
        key,
        finalizeMeasurementHistogram(accumulator.probabilities[key]),
      ])
    ),
    shadowCaught: accumulator.shadowCaught,
    shadowCatchRate:
      accumulator.eligible > 0
        ? accumulator.shadowCaught / accumulator.eligible
        : 0,
    expectedCatches: accumulator.expectedCatches,
    simCatchOAA: {
      sum: accumulator.simCatchOAASum,
      average:
        accumulator.eligible > 0
          ? accumulator.simCatchOAASum / accumulator.eligible
          : 0,
    },
    expectedSkillOutsSum: accumulator.expectedSkillOutsSum,
    executionResidualSum: accumulator.executionResidualSum,
    breakdowns: {
      position: finalizeOaaBreakdown(accumulator.positionOaa),
      movementDirection: finalizeOaaBreakdown(
        accumulator.directionOaa
      ),
      difficulty: finalizeOaaBreakdown(accumulator.difficultyOaa),
      fieldingBand: finalizeCounter(
        accumulator.fieldingBand,
        accumulator.eligible
      ),
      speedBand: finalizeCounter(
        accumulator.speedBand,
        accumulator.eligible
      ),
    },
    legacyShadowMatrix: structuredClone(
      accumulator.legacyShadowMatrix
    ),
    authority: RESOLUTION_AUTHORITY_CONFIG,
    diagnostics: {
      nonFiniteValueCount: accumulator.nonFiniteValueCount,
      probabilityRangeViolationCount:
        accumulator.probabilityRangeViolationCount,
      identityViolationCount: accumulator.identityViolationCount,
      geometryEvaluationMismatchCount:
        shadowEnabled &&
        accumulator.evaluations !== geometryEvaluations
          ? 1
          : 0,
      defenseRngCalls: accumulator.defenseRngCalls,
      eligibleRngMismatchCount:
        shadowEnabled &&
        accumulator.defenseRngCalls !== accumulator.eligible * 2
          ? 1
          : 0,
      fallbackCount: accumulator.fallbackCount,
    },
  };
}
