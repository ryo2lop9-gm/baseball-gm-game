import { BATTED_BALL_FIELD_SECTORS } from "../../config/battedBallDirectionConfig.js";
import { DEFENSE_CALIBRATION_CONFIG } from "../../config/defenseCalibrationConfig.js";
import { BATTED_BALL_DEFENSE_CONFIG } from "../../config/defenseProbabilityConfig.js";
import { calculateDefenseAbilityProbabilities } from "../defense/defenseAbilityProbabilityService.js";

const ELIGIBLE_TRAJECTORY_CLASSES = Object.freeze(["fly", "popup"]);

function createCalibrationInputError(message, context = {}) {
  const error = new Error(message);
  error.code = "BATTED_BALL_DEFENSE_CALIBRATION_INPUT_INVALID";
  error.context = context;
  return error;
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function assertProbability(name, value) {
  if (!isFiniteNumber(value) || value < 0 || value > 1) {
    throw createCalibrationInputError(
      `${name} must be a finite probability.`,
      { [name]: value }
    );
  }
  return value;
}

function assertBoolean(name, value) {
  if (typeof value !== "boolean") {
    throw createCalibrationInputError(`${name} must be boolean.`, {
      [name]: value,
    });
  }
  return value;
}

export function getDefenseCalibrationProbabilityBinIndex(probability) {
  const value = assertProbability("probability", probability);
  if (value === 1) {
    return DEFENSE_CALIBRATION_CONFIG.probabilityBinCount - 1;
  }
  return Math.floor(
    value * DEFENSE_CALIBRATION_CONFIG.probabilityBinCount
  );
}

function createProbabilityBin(index) {
  const lowerBound = Number(
    (
      index * DEFENSE_CALIBRATION_CONFIG.probabilityBinWidth
    ).toFixed(2)
  );
  const upperBound = Number(
    (
      (index + 1) *
      DEFENSE_CALIBRATION_CONFIG.probabilityBinWidth
    ).toFixed(2)
  );
  return {
    index,
    lowerBound,
    upperBound,
    upperInclusive:
      index === DEFENSE_CALIBRATION_CONFIG.probabilityBinCount - 1,
    count: 0,
    predictedSum: 0,
    observedSum: 0,
    brierSum: 0,
  };
}

export function createDefenseCalibrationSeriesAccumulator() {
  return {
    count: 0,
    predictedSum: 0,
    observedSum: 0,
    varianceSum: 0,
    brierSum: 0,
    logLossSum: 0,
    bins: Array.from(
      { length: DEFENSE_CALIBRATION_CONFIG.probabilityBinCount },
      (_, index) => createProbabilityBin(index)
    ),
  };
}

export function recordDefenseCalibrationSeries(
  accumulator,
  prediction,
  observed
) {
  const probability = assertProbability("prediction", prediction);
  const result = assertBoolean("observed", observed) ? 1 : 0;
  const difference = result - probability;
  const epsilon = DEFENSE_CALIBRATION_CONFIG.logLossEpsilon;
  const safeProbability = Math.min(
    1 - epsilon,
    Math.max(epsilon, probability)
  );
  accumulator.count += 1;
  accumulator.predictedSum += probability;
  accumulator.observedSum += result;
  accumulator.varianceSum += probability * (1 - probability);
  accumulator.brierSum += difference * difference;
  accumulator.logLossSum +=
    -(result * Math.log(safeProbability) +
      (1 - result) * Math.log(1 - safeProbability));
  const bin =
    accumulator.bins[
      getDefenseCalibrationProbabilityBinIndex(probability)
    ];
  bin.count += 1;
  bin.predictedSum += probability;
  bin.observedSum += result;
  bin.brierSum += difference * difference;
  return accumulator;
}

function getCalibrationDiagnosticStatus(count, standardizedResidual) {
  if (count < DEFENSE_CALIBRATION_CONFIG.minimumDiagnosticCount) {
    return "insufficient";
  }
  const absolute = Math.abs(standardizedResidual ?? Infinity);
  if (absolute <= DEFENSE_CALIBRATION_CONFIG.standardizedResidualPassLimit) {
    return "pass";
  }
  if (
    absolute <=
    DEFENSE_CALIBRATION_CONFIG.standardizedResidualWarningLimit
  ) {
    return "warning";
  }
  return "investigate";
}

export function finalizeDefenseCalibrationSeries(accumulator) {
  const count = accumulator.count;
  const predictedRate =
    count > 0 ? accumulator.predictedSum / count : 0;
  const observedRate =
    count > 0 ? accumulator.observedSum / count : 0;
  const residual =
    accumulator.observedSum - accumulator.predictedSum;
  const standardizedResidual =
    accumulator.varianceSum > 0
      ? residual / Math.sqrt(accumulator.varianceSum)
      : null;
  const bins = accumulator.bins.map((bin) => {
    const binPredicted =
      bin.count > 0 ? bin.predictedSum / bin.count : 0;
    const binObserved =
      bin.count > 0 ? bin.observedSum / bin.count : 0;
    return {
      index: bin.index,
      lowerBound: bin.lowerBound,
      upperBound: bin.upperBound,
      upperInclusive: bin.upperInclusive,
      count: bin.count,
      predicted: binPredicted,
      observed: binObserved,
      gap: binObserved - binPredicted,
      brier: bin.count > 0 ? bin.brierSum / bin.count : 0,
    };
  });
  const ece =
    count > 0
      ? bins.reduce(
          (sum, bin) => sum + bin.count * Math.abs(bin.gap),
          0
        ) / count
      : 0;
  const maximumBinGap = bins.reduce(
    (maximum, bin) =>
      bin.count > 0
        ? Math.max(maximum, Math.abs(bin.gap))
        : maximum,
    0
  );
  return {
    count,
    predictedSum: accumulator.predictedSum,
    observedSum: accumulator.observedSum,
    predictedRate,
    observedRate,
    residual,
    varianceSum: accumulator.varianceSum,
    standardizedResidual,
    brierScore: count > 0 ? accumulator.brierSum / count : 0,
    logLoss: count > 0 ? accumulator.logLossSum / count : 0,
    ece,
    maximumBinGap,
    diagnosticStatus: getCalibrationDiagnosticStatus(
      count,
      standardizedResidual
    ),
    bins,
  };
}

function mergeCalibrationSeries(target, source) {
  for (const key of [
    "count",
    "predictedSum",
    "observedSum",
    "varianceSum",
    "brierSum",
    "logLossSum",
  ]) {
    target[key] += source[key];
  }
  for (let index = 0; index < target.bins.length; index += 1) {
    for (const key of [
      "count",
      "predictedSum",
      "observedSum",
      "brierSum",
    ]) {
      target.bins[index][key] += source.bins[index][key];
    }
  }
}

function counterfactualCellKey(speed, fielding) {
  return `spd${speed}_fld${fielding}`;
}

function createCounterfactualGridAccumulator() {
  const cells = {};
  for (const speed of DEFENSE_CALIBRATION_CONFIG.speedRatings) {
    for (const fielding of DEFENSE_CALIBRATION_CONFIG.fieldingRatings) {
      cells[counterfactualCellKey(speed, fielding)] = {
        speed,
        fielding,
        count: 0,
        expectedOuts: 0,
        neutralDifferenceSum: 0,
        expectedSkillOutsSum: 0,
      };
    }
  }
  return {
    cells,
    evaluations: 0,
    neutralIdentityChecks: 0,
    neutralIdentityViolationCount: 0,
    speedMonotonicChecks: 0,
    speedMonotonicViolationCount: 0,
    fieldingMonotonicChecks: 0,
    fieldingMonotonicViolationCount: 0,
  };
}

function assertCounterfactualEvent(event) {
  if (
    !ELIGIBLE_TRAJECTORY_CLASSES.includes(event.trajectoryClass) ||
    !BATTED_BALL_FIELD_SECTORS.includes(event.fieldSector) ||
    typeof event.responsibleFielderPosition !== "string" ||
    event.responsibleFielderPosition.length === 0
  ) {
    throw createCalibrationInputError(
      "Counterfactual event categories are invalid."
    );
  }
  for (const field of [
    "exitVelocity",
    "defensePathDistanceFt",
    "defenseBallTimeSec",
  ]) {
    if (!isFiniteNumber(event[field])) {
      throw createCalibrationInputError(
        `Counterfactual ${field} must be finite.`,
        { [field]: event[field] }
      );
    }
  }
  assertProbability(
    "pAlignedAverageOut",
    event.pAlignedAverageOut
  );
}

export function createDefenseCounterfactualGrid(event) {
  assertCounterfactualEvent(event);
  const cells = [];
  for (const speed of DEFENSE_CALIBRATION_CONFIG.speedRatings) {
    for (const fielding of DEFENSE_CALIBRATION_CONFIG.fieldingRatings) {
      const probabilities = calculateDefenseAbilityProbabilities({
        trajectoryClass: event.trajectoryClass,
        exitVelocity: event.exitVelocity,
        pathDistanceFt: event.defensePathDistanceFt,
        ballTimeSec: event.defenseBallTimeSec,
        movementDirection: event.movementDirection,
        speed,
        fielding,
      });
      cells.push({
        speed,
        fielding,
        responsibleFielderPosition:
          event.responsibleFielderPosition,
        pActualOut: probabilities.pActualOut,
        differenceFromNeutral:
          probabilities.pActualOut - event.pAlignedAverageOut,
      });
    }
  }
  return {
    responsibleFielderPosition: event.responsibleFielderPosition,
    cells,
  };
}

function checkCounterfactualGrid(grid, alignedProbability) {
  const byKey = new Map(
    grid.cells.map((cell) => [
      counterfactualCellKey(cell.speed, cell.fielding),
      cell,
    ])
  );
  const tolerance = DEFENSE_CALIBRATION_CONFIG.monotonicTolerance;
  let speedChecks = 0;
  let speedViolations = 0;
  let fieldingChecks = 0;
  let fieldingViolations = 0;
  for (const fielding of DEFENSE_CALIBRATION_CONFIG.fieldingRatings) {
    for (
      let index = 1;
      index < DEFENSE_CALIBRATION_CONFIG.speedRatings.length;
      index += 1
    ) {
      const previous = byKey.get(
        counterfactualCellKey(
          DEFENSE_CALIBRATION_CONFIG.speedRatings[index - 1],
          fielding
        )
      );
      const current = byKey.get(
        counterfactualCellKey(
          DEFENSE_CALIBRATION_CONFIG.speedRatings[index],
          fielding
        )
      );
      speedChecks += 1;
      if (current.pActualOut + tolerance < previous.pActualOut) {
        speedViolations += 1;
      }
    }
  }
  for (const speed of DEFENSE_CALIBRATION_CONFIG.speedRatings) {
    for (
      let index = 1;
      index < DEFENSE_CALIBRATION_CONFIG.fieldingRatings.length;
      index += 1
    ) {
      const previous = byKey.get(
        counterfactualCellKey(
          speed,
          DEFENSE_CALIBRATION_CONFIG.fieldingRatings[index - 1]
        )
      );
      const current = byKey.get(
        counterfactualCellKey(
          speed,
          DEFENSE_CALIBRATION_CONFIG.fieldingRatings[index]
        )
      );
      fieldingChecks += 1;
      if (current.pActualOut + tolerance < previous.pActualOut) {
        fieldingViolations += 1;
      }
    }
  }
  const neutral = byKey.get(counterfactualCellKey(50, 50));
  return {
    speedChecks,
    speedViolations,
    fieldingChecks,
    fieldingViolations,
    neutralDifference: neutral.pActualOut - alignedProbability,
  };
}

function createLegacyLine() {
  return {
    count: 0,
    outCount: 0,
    safeCount: 0,
    pAlignedAverageOutSum: 0,
    pActualOutSum: 0,
    matrix: {
      out: { caught: 0, notCaught: 0 },
      safe: { caught: 0, notCaught: 0 },
    },
  };
}

function createLegacyComparisonAccumulator() {
  return {
    overall: createLegacyLine(),
    trajectoryClass: Object.fromEntries(
      ELIGIBLE_TRAJECTORY_CLASSES.map((key) => [
        key,
        createLegacyLine(),
      ])
    ),
    fieldSector: Object.fromEntries(
      BATTED_BALL_FIELD_SECTORS.map((key) => [
        key,
        createLegacyLine(),
      ])
    ),
    probabilityBins: Array.from(
      { length: DEFENSE_CALIBRATION_CONFIG.probabilityBinCount },
      (_, index) => ({
        index,
        lowerBound: Number(
          (
            index *
            DEFENSE_CALIBRATION_CONFIG.probabilityBinWidth
          ).toFixed(2)
        ),
        upperBound: Number(
          (
            (index + 1) *
            DEFENSE_CALIBRATION_CONFIG.probabilityBinWidth
          ).toFixed(2)
        ),
        upperInclusive:
          index ===
          DEFENSE_CALIBRATION_CONFIG.probabilityBinCount - 1,
        ...createLegacyLine(),
      })
    ),
  };
}

function recordLegacyLine(line, event) {
  const legacyOut = event.outcome === "out";
  const caught = event.shadowCaught === true;
  const legacyKey = legacyOut ? "out" : "safe";
  const shadowKey = caught ? "caught" : "notCaught";
  line.count += 1;
  line.outCount += legacyOut ? 1 : 0;
  line.safeCount += legacyOut ? 0 : 1;
  line.pAlignedAverageOutSum += event.pAlignedAverageOut;
  line.pActualOutSum += event.pActualOut;
  line.matrix[legacyKey][shadowKey] += 1;
}

export function recordDefenseLegacyComparison(accumulator, event) {
  if (
    typeof event.outcome !== "string" ||
    typeof event.shadowCaught !== "boolean"
  ) {
    throw createCalibrationInputError(
      "Legacy comparison inputs are invalid."
    );
  }
  recordLegacyLine(accumulator.overall, event);
  recordLegacyLine(
    accumulator.trajectoryClass[event.trajectoryClass],
    event
  );
  recordLegacyLine(accumulator.fieldSector[event.fieldSector], event);
  recordLegacyLine(
    accumulator.probabilityBins[
      getDefenseCalibrationProbabilityBinIndex(event.pActualOut)
    ],
    event
  );
}

function mergeLegacyLine(target, source) {
  for (const key of [
    "count",
    "outCount",
    "safeCount",
    "pAlignedAverageOutSum",
    "pActualOutSum",
  ]) {
    target[key] += source[key];
  }
  for (const legacyKey of ["out", "safe"]) {
    for (const shadowKey of ["caught", "notCaught"]) {
      target.matrix[legacyKey][shadowKey] +=
        source.matrix[legacyKey][shadowKey];
    }
  }
}

function finalizeLegacyLine(line) {
  const legacyOutRate = line.count > 0 ? line.outCount / line.count : 0;
  const legacySafeRate =
    line.count > 0 ? line.safeCount / line.count : 0;
  const pAlignedAverageOut =
    line.count > 0
      ? line.pAlignedAverageOutSum / line.count
      : 0;
  const pActualOut =
    line.count > 0 ? line.pActualOutSum / line.count : 0;
  return {
    count: line.count,
    legacyOutCount: line.outCount,
    legacyOutRate,
    legacySafeCount: line.safeCount,
    legacySafeRate,
    pAlignedAverageOut,
    pActualOut,
    alignedMinusLegacyOutRate:
      pAlignedAverageOut - legacyOutRate,
    actualMinusLegacyOutRate: pActualOut - legacyOutRate,
    matrix: structuredClone(line.matrix),
  };
}

function finalizeLegacyComparison(accumulator) {
  return {
    overall: finalizeLegacyLine(accumulator.overall),
    trajectoryClass: Object.fromEntries(
      Object.entries(accumulator.trajectoryClass).map(([key, line]) => [
        key,
        finalizeLegacyLine(line),
      ])
    ),
    fieldSector: Object.fromEntries(
      Object.entries(accumulator.fieldSector).map(([key, line]) => [
        key,
        finalizeLegacyLine(line),
      ])
    ),
    probabilityBins: accumulator.probabilityBins.map((line) => ({
      index: line.index,
      lowerBound: line.lowerBound,
      upperBound: line.upperBound,
      upperInclusive: line.upperInclusive,
      ...finalizeLegacyLine(line),
    })),
  };
}

export function createDefenseCalibrationAccumulator() {
  return {
    evaluations: 0,
    validEvents: 0,
    invalidEvents: 0,
    eligible: 0,
    ineligible: 0,
    catch: createDefenseCalibrationSeriesAccumulator(),
    reach: createDefenseCalibrationSeriesAccumulator(),
    secure: createDefenseCalibrationSeriesAccumulator(),
    counterfactual: createCounterfactualGridAccumulator(),
    legacy: createLegacyComparisonAccumulator(),
    fallbackCount: 0,
    nonFiniteInputCount: 0,
    probabilityRangeViolationCount: 0,
    observationInvalidCount: 0,
  };
}

function validateCalibrationEventContract(event) {
  if (
    event.defenseModel !== BATTED_BALL_DEFENSE_CONFIG.model ||
    event.defenseSource !== BATTED_BALL_DEFENSE_CONFIG.source ||
    event.defenseEventSchemaVersion !==
      BATTED_BALL_DEFENSE_CONFIG.defenseEventSchemaVersion ||
    event.defenseFallbackUsed !== false
  ) {
    throw createCalibrationInputError(
      "Defense event contract is invalid for Calibration."
    );
  }
}

function validateEligibleCalibrationEvent(event) {
  for (const field of [
    "pReachActual",
    "pSecureActual",
    "pActualOut",
    "pAlignedAverageOut",
  ]) {
    assertProbability(field, event[field]);
  }
  assertBoolean("reachSuccess", event.reachSuccess);
  assertBoolean("secureAttempted", event.secureAttempted);
  assertBoolean("shadowCaught", event.shadowCaught);
  if (
    event.secureAttempted &&
    typeof event.secureSuccess !== "boolean"
  ) {
    throw createCalibrationInputError(
      "Attempted secure result must be boolean."
    );
  }
  if (
    !event.secureAttempted &&
    event.secureSuccess !== null
  ) {
    throw createCalibrationInputError(
      "Unattempted secure result must be null."
    );
  }
  if (
    event.secureAttempted !== event.reachSuccess ||
    event.shadowCaught !==
      (event.reachSuccess && event.secureSuccess === true)
  ) {
    throw createCalibrationInputError(
      "Defense reach, secure, and catch observations are inconsistent."
    );
  }
}

export function recordDefenseCalibrationMeasurement(
  accumulator,
  event
) {
  accumulator.evaluations += 1;
  if (event?.defenseFallbackUsed) accumulator.fallbackCount += 1;
  if (
    event?.defenseMode !== BATTED_BALL_DEFENSE_CONFIG.shadowMode
  ) {
    accumulator.invalidEvents += 1;
    return false;
  }
  try {
    validateCalibrationEventContract(event);
  } catch {
    accumulator.invalidEvents += 1;
    accumulator.nonFiniteInputCount += 1;
    return false;
  }
  if (!event.defenseEligible) {
    accumulator.ineligible += 1;
    const valid =
      event.defenseFallbackUsed === false &&
      event.defenseRngCalls === 0;
    if (valid) accumulator.validEvents += 1;
    else accumulator.invalidEvents += 1;
    return valid;
  }

  let grid;
  try {
    validateEligibleCalibrationEvent(event);
    grid = createDefenseCounterfactualGrid(event);
  } catch (error) {
    accumulator.invalidEvents += 1;
    if (
      String(error?.message || "").includes("probability")
    ) {
      accumulator.probabilityRangeViolationCount += 1;
    } else {
      accumulator.nonFiniteInputCount += 1;
    }
    return false;
  }

  accumulator.eligible += 1;
  accumulator.validEvents += 1;
  recordDefenseCalibrationSeries(
    accumulator.catch,
    event.pActualOut,
    event.shadowCaught
  );
  recordDefenseCalibrationSeries(
    accumulator.reach,
    event.pReachActual,
    event.reachSuccess
  );
  if (event.secureAttempted) {
    recordDefenseCalibrationSeries(
      accumulator.secure,
      event.pSecureActual,
      event.secureSuccess
    );
  }

  const checks = checkCounterfactualGrid(
    grid,
    event.pAlignedAverageOut
  );
  accumulator.counterfactual.evaluations += grid.cells.length;
  accumulator.counterfactual.neutralIdentityChecks += 1;
  if (
    Math.abs(checks.neutralDifference) >
    DEFENSE_CALIBRATION_CONFIG.identityTolerance
  ) {
    accumulator.counterfactual.neutralIdentityViolationCount += 1;
  }
  accumulator.counterfactual.speedMonotonicChecks +=
    checks.speedChecks;
  accumulator.counterfactual.speedMonotonicViolationCount +=
    checks.speedViolations;
  accumulator.counterfactual.fieldingMonotonicChecks +=
    checks.fieldingChecks;
  accumulator.counterfactual.fieldingMonotonicViolationCount +=
    checks.fieldingViolations;
  for (const cell of grid.cells) {
    const target =
      accumulator.counterfactual.cells[
        counterfactualCellKey(cell.speed, cell.fielding)
      ];
    target.count += 1;
    target.expectedOuts += cell.pActualOut;
    target.neutralDifferenceSum += cell.differenceFromNeutral;
    target.expectedSkillOutsSum +=
      cell.pActualOut - event.pAlignedAverageOut;
  }
  recordDefenseLegacyComparison(accumulator.legacy, event);
  return true;
}

export function mergeDefenseCalibrationMeasurement(target, source) {
  for (const key of [
    "evaluations",
    "validEvents",
    "invalidEvents",
    "eligible",
    "ineligible",
    "fallbackCount",
    "nonFiniteInputCount",
    "probabilityRangeViolationCount",
    "observationInvalidCount",
  ]) {
    target[key] += source[key];
  }
  for (const key of ["catch", "reach", "secure"]) {
    mergeCalibrationSeries(target[key], source[key]);
  }
  for (const key of Object.keys(target.counterfactual.cells)) {
    for (const field of [
      "count",
      "expectedOuts",
      "neutralDifferenceSum",
      "expectedSkillOutsSum",
    ]) {
      target.counterfactual.cells[key][field] +=
        source.counterfactual.cells[key][field];
    }
  }
  for (const key of [
    "evaluations",
    "neutralIdentityChecks",
    "neutralIdentityViolationCount",
    "speedMonotonicChecks",
    "speedMonotonicViolationCount",
    "fieldingMonotonicChecks",
    "fieldingMonotonicViolationCount",
  ]) {
    target.counterfactual[key] += source.counterfactual[key];
  }
  mergeLegacyLine(target.legacy.overall, source.legacy.overall);
  for (const key of Object.keys(target.legacy.trajectoryClass)) {
    mergeLegacyLine(
      target.legacy.trajectoryClass[key],
      source.legacy.trajectoryClass[key]
    );
  }
  for (const key of Object.keys(target.legacy.fieldSector)) {
    mergeLegacyLine(
      target.legacy.fieldSector[key],
      source.legacy.fieldSector[key]
    );
  }
  for (
    let index = 0;
    index < target.legacy.probabilityBins.length;
    index += 1
  ) {
    mergeLegacyLine(
      target.legacy.probabilityBins[index],
      source.legacy.probabilityBins[index]
    );
  }
  return target;
}

function finalizeCounterfactualGrid(counterfactual) {
  return {
    speedRatings: [...DEFENSE_CALIBRATION_CONFIG.speedRatings],
    fieldingRatings: [
      ...DEFENSE_CALIBRATION_CONFIG.fieldingRatings,
    ],
    evaluations: counterfactual.evaluations,
    cells: Object.fromEntries(
      Object.entries(counterfactual.cells).map(([key, cell]) => [
        key,
        {
          speed: cell.speed,
          fielding: cell.fielding,
          count: cell.count,
          expectedOuts: cell.expectedOuts,
          expectedOutRate:
            cell.count > 0 ? cell.expectedOuts / cell.count : 0,
          neutralDifferenceSum: cell.neutralDifferenceSum,
          neutralDifferenceAverage:
            cell.count > 0
              ? cell.neutralDifferenceSum / cell.count
              : 0,
          expectedSkillOuts: cell.expectedSkillOutsSum,
        },
      ])
    ),
    neutralIdentityChecks: counterfactual.neutralIdentityChecks,
    neutralIdentityViolationCount:
      counterfactual.neutralIdentityViolationCount,
    speedMonotonicChecks: counterfactual.speedMonotonicChecks,
    speedMonotonicViolationCount:
      counterfactual.speedMonotonicViolationCount,
    fieldingMonotonicChecks:
      counterfactual.fieldingMonotonicChecks,
    fieldingMonotonicViolationCount:
      counterfactual.fieldingMonotonicViolationCount,
  };
}

export function finalizeDefenseCalibrationMeasurement(
  accumulator,
  { mode }
) {
  const catchCalibration = finalizeDefenseCalibrationSeries(
    accumulator.catch
  );
  const reachCalibration = finalizeDefenseCalibrationSeries(
    accumulator.reach
  );
  const secureCalibration = finalizeDefenseCalibrationSeries(
    accumulator.secure
  );
  const counterfactual = finalizeCounterfactualGrid(
    accumulator.counterfactual
  );
  const legacyComparison = finalizeLegacyComparison(
    accumulator.legacy
  );
  const diagnostic =
    mode === DEFENSE_CALIBRATION_CONFIG.diagnosticMode;
  const selfConsistencyAvailable =
    diagnostic &&
    catchCalibration.count > 0 &&
    reachCalibration.count > 0 &&
    secureCalibration.count > 0;
  const neutralIdentityValid =
    diagnostic &&
    counterfactual.neutralIdentityChecks > 0 &&
    counterfactual.neutralIdentityViolationCount === 0;
  const sensitivityMonotonic =
    diagnostic &&
    counterfactual.speedMonotonicChecks > 0 &&
    counterfactual.fieldingMonotonicChecks > 0 &&
    counterfactual.speedMonotonicViolationCount === 0 &&
    counterfactual.fieldingMonotonicViolationCount === 0;
  const legacyComparisonAvailable =
    diagnostic && legacyComparison.overall.count > 0;
  const blockers = [
    "alignment_comparison_unavailable",
    "wall_model_unavailable",
    "liner_catch_model_unavailable",
    "legacy_authority_retained",
  ];
  if (!selfConsistencyAvailable) {
    blockers.unshift("self_consistency_unavailable");
  }
  if (!neutralIdentityValid) {
    blockers.unshift("neutral_identity_invalid_or_unavailable");
  }
  if (!sensitivityMonotonic) {
    blockers.unshift("sensitivity_not_monotonic_or_unavailable");
  }
  if (!legacyComparisonAvailable) {
    blockers.unshift("legacy_comparison_unavailable");
  }

  return {
    mode,
    model: DEFENSE_CALIBRATION_CONFIG.model,
    source: DEFENSE_CALIBRATION_CONFIG.source,
    evaluations: accumulator.evaluations,
    validEvents: accumulator.validEvents,
    invalidEvents: accumulator.invalidEvents,
    eligible: accumulator.eligible,
    ineligible: accumulator.ineligible,
    calibration: {
      catch: catchCalibration,
      reach: reachCalibration,
      secure: secureCalibration,
    },
    counterfactualGrid: counterfactual,
    neutralIdentity: {
      valid: neutralIdentityValid,
      checks: counterfactual.neutralIdentityChecks,
      violationCount:
        counterfactual.neutralIdentityViolationCount,
    },
    legacyComparison,
    readinessGate: {
      selfConsistencyAvailable,
      neutralIdentityValid,
      sensitivityMonotonic,
      legacyComparisonAvailable,
      alignmentComparisonAvailable: false,
      wallGeometryAvailable: true,
      wallModelAvailable: false,
      linerCatchModelAvailable: false,
      authoritySwitchReady: false,
      blockers,
    },
    diagnostics: {
      fallbackCount: accumulator.fallbackCount,
      nonFiniteInputCount: accumulator.nonFiniteInputCount,
      probabilityRangeViolationCount:
        accumulator.probabilityRangeViolationCount,
      observationInvalidCount: accumulator.observationInvalidCount,
      emptyCatchBinCount: catchCalibration.bins.filter(
        (bin) => bin.count === 0
      ).length,
      emptyReachBinCount: reachCalibration.bins.filter(
        (bin) => bin.count === 0
      ).length,
      emptySecureBinCount: secureCalibration.bins.filter(
        (bin) => bin.count === 0
      ).length,
      neutralIdentityViolationCount:
        counterfactual.neutralIdentityViolationCount,
      speedMonotonicViolationCount:
        counterfactual.speedMonotonicViolationCount,
      fieldingMonotonicViolationCount:
        counterfactual.fieldingMonotonicViolationCount,
    },
    performance: {
      calibrationEligibleEvaluations: accumulator.eligible,
      counterfactualEvaluations: counterfactual.evaluations,
      counterfactualEvaluationsPerEligible:
        accumulator.eligible > 0
          ? counterfactual.evaluations / accumulator.eligible
          : 0,
      rawEventsStored: false,
      rawProbabilitiesStored: false,
    },
  };
}
