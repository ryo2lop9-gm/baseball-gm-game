import {
  BATTER_BATS_VALUES,
  BATTER_DIRECTION_TYPES,
  BATTED_BALL_DIRECTIONS,
  BATTED_BALL_DIRECTION_CONFIG,
  BATTED_BALL_DIRECTION_MODES,
  PITCHER_THROWS_VALUES,
} from "../config/battedBallDirectionConfig.js";
import { getMeasurementClass } from "./measurement/measurementClassService.js";

function createDirectionError(code, message, context) {
  const error = new Error(message);
  error.code = code;
  error.context = context;
  return error;
}

function assertAllowedValue(field, value, allowedValues) {
  if (allowedValues.includes(value)) return value;
  throw createDirectionError(
    "BATTED_BALL_DIRECTION_INPUT_INVALID",
    `Direction input ${field} is invalid.`,
    { field, value, allowedValues: [...allowedValues] }
  );
}

function assertFiniteCoordinate(field, value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  throw createDirectionError(
    "BATTED_BALL_DIRECTION_INPUT_INVALID",
    `Direction input ${field} must be a finite number.`,
    { field, value }
  );
}

function assertRoll(roll) {
  if (
    typeof roll === "number" &&
    Number.isFinite(roll) &&
    roll >= 0 &&
    roll < 1
  ) {
    return roll;
  }
  throw createDirectionError(
    "BATTED_BALL_DIRECTION_ROLL_INVALID",
    "Direction roll must be in the half-open interval [0, 1).",
    { roll }
  );
}

function addAdjustment(weights, adjustment) {
  if (!adjustment) return;
  for (const direction of BATTED_BALL_DIRECTIONS) {
    weights[direction] += adjustment[direction];
  }
}

function resolveHorizontalLocation(normalizedX, resolvedBattingSide) {
  const boundary = BATTED_BALL_DIRECTION_CONFIG.normalizedLocationBoundary;
  const insideScore =
    resolvedBattingSide === "R" ? -normalizedX : normalizedX;
  if (insideScore > boundary) return "inside";
  if (insideScore < -boundary) return "outside";
  return "middle";
}

function resolveVerticalLocation(normalizedZ) {
  const boundary = BATTED_BALL_DIRECTION_CONFIG.normalizedLocationBoundary;
  if (normalizedZ > boundary) return "high";
  if (normalizedZ < -boundary) return "low";
  return "middle";
}

export function resolveBattingSide(batter, pitcher) {
  const batterBats = assertAllowedValue(
    "bats",
    batter?.profile?.bats,
    BATTER_BATS_VALUES
  );
  const pitcherThrows = assertAllowedValue(
    "throws",
    pitcher?.profile?.throws,
    PITCHER_THROWS_VALUES
  );
  if (batterBats === "S") {
    return pitcherThrows === "R" ? "L" : "R";
  }
  return batterBats;
}

export function buildDirectionProbabilities({
  batter,
  pitcher,
  pitchType,
  launchAngle,
  normalizedX,
  normalizedZ,
}) {
  const batterBats = assertAllowedValue(
    "bats",
    batter?.profile?.bats,
    BATTER_BATS_VALUES
  );
  const pitcherThrows = assertAllowedValue(
    "throws",
    pitcher?.profile?.throws,
    PITCHER_THROWS_VALUES
  );
  const directionType = assertAllowedValue(
    "directionType",
    batter?.profile?.directionType,
    BATTER_DIRECTION_TYPES
  );
  const resolvedBattingSide = resolveBattingSide(batter, pitcher);
  const measurementClass = getMeasurementClass(launchAngle);
  const safeNormalizedX = assertFiniteCoordinate("normalizedX", normalizedX);
  const safeNormalizedZ = assertFiniteCoordinate("normalizedZ", normalizedZ);
  const horizontalLocation = resolveHorizontalLocation(
    safeNormalizedX,
    resolvedBattingSide
  );
  const verticalLocation = resolveVerticalLocation(safeNormalizedZ);
  const classRatios =
    BATTED_BALL_DIRECTION_CONFIG.measurementClassRatios[measurementClass];
  const profileRatios =
    BATTED_BALL_DIRECTION_CONFIG.directionTypeRatios[directionType];
  const weights = Object.fromEntries(
    BATTED_BALL_DIRECTIONS.map((direction) => {
      const combination =
        BATTED_BALL_DIRECTION_CONFIG.combinationWeights[direction];
      return [
        direction,
        classRatios[direction] * combination.measurementClass +
          profileRatios[direction] * combination.directionType,
      ];
    })
  );

  addAdjustment(
    weights,
    BATTED_BALL_DIRECTION_CONFIG.pitchTypeAdjustments[pitchType]
  );
  if (horizontalLocation !== "middle") {
    addAdjustment(
      weights,
      BATTED_BALL_DIRECTION_CONFIG.locationAdjustments[horizontalLocation]
    );
  }
  if (verticalLocation !== "middle") {
    addAdjustment(
      weights,
      BATTED_BALL_DIRECTION_CONFIG.locationAdjustments[verticalLocation]
    );
  }

  const minimum = BATTED_BALL_DIRECTION_CONFIG.minimumDirectionWeight;
  for (const direction of BATTED_BALL_DIRECTIONS) {
    weights[direction] = Math.max(minimum, weights[direction]);
  }
  const total = BATTED_BALL_DIRECTIONS.reduce(
    (sum, direction) => sum + weights[direction],
    0
  );

  return {
    batterBats,
    pitcherThrows,
    resolvedBattingSide,
    directionType,
    measurementClass,
    probabilities: Object.fromEntries(
      BATTED_BALL_DIRECTIONS.map((direction) => [
        direction,
        weights[direction] / total,
      ])
    ),
    horizontalLocation,
    verticalLocation,
  };
}

export function selectDirectionFromProbabilities(probabilities, roll) {
  const safeRoll = assertRoll(roll);
  const pullCut = probabilities.pull;
  const centerCut = pullCut + probabilities.center;
  return safeRoll < pullCut
    ? "pull"
    : safeRoll < centerCut
      ? "center"
      : "oppo";
}

export function sampleBatterRelativeSprayAngle(direction, roll) {
  assertAllowedValue("direction", direction, BATTED_BALL_DIRECTIONS);
  const safeRoll = assertRoll(roll);
  const { boundary, maximum } = BATTED_BALL_DIRECTION_CONFIG.sector;
  const sectorWidth = maximum - boundary;
  if (direction === "pull") return maximum - safeRoll * sectorWidth;
  if (direction === "center") return -boundary + safeRoll * boundary * 2;
  return -maximum + safeRoll * sectorWidth;
}

export function classifyBatterRelativeDirection(angle) {
  const value = assertFiniteCoordinate("batterRelativeSprayAngle", angle);
  const { boundary, maximum } = BATTED_BALL_DIRECTION_CONFIG.sector;
  if (value < -maximum || value > maximum) {
    throw createDirectionError(
      "BATTED_BALL_DIRECTION_ANGLE_INVALID",
      "Batter-relative spray angle is outside the fair range.",
      { angle: value }
    );
  }
  if (value > boundary) return "pull";
  if (value >= -boundary && value < boundary) return "center";
  return "oppo";
}

export function convertToFieldSprayAngle(angle, resolvedBattingSide) {
  const value = assertFiniteCoordinate("batterRelativeSprayAngle", angle);
  assertAllowedValue(
    "resolvedBattingSide",
    resolvedBattingSide,
    PITCHER_THROWS_VALUES
  );
  return resolvedBattingSide === "R" ? -value : value;
}

export function classifyFieldSector(sprayAngle) {
  const value = assertFiniteCoordinate("sprayAngle", sprayAngle);
  const { min, max } = BATTED_BALL_DIRECTION_CONFIG.fairAngle;
  const { boundary } = BATTED_BALL_DIRECTION_CONFIG.sector;
  if (value < min || value > max) {
    throw createDirectionError(
      "BATTED_BALL_DIRECTION_ANGLE_INVALID",
      "Field spray angle is outside the fair range.",
      { sprayAngle: value }
    );
  }
  if (value < -boundary) return "left";
  if (value < boundary) return "center";
  return "right";
}

export function generateDirectionShadow({
  mode = BATTED_BALL_DIRECTION_CONFIG.defaultMode,
  batter,
  pitcher,
  pitchType,
  launchAngle,
  normalizedX,
  normalizedZ,
  directionRandom,
}) {
  assertAllowedValue("mode", mode, BATTED_BALL_DIRECTION_MODES);
  if (mode === "off") {
    return {
      mode,
      model: BATTED_BALL_DIRECTION_CONFIG.model,
      batterBats: batter?.profile?.bats ?? null,
      pitcherThrows: pitcher?.profile?.throws ?? null,
      resolvedBattingSide: null,
      directionType: batter?.profile?.directionType ?? null,
      measurementClass: null,
      direction: null,
      fieldSector: null,
      batterRelativeSprayAngle: null,
      sprayAngle: null,
      probabilities: null,
      horizontalLocation: null,
      verticalLocation: null,
      directionRngCalls: 0,
    };
  }

  if (typeof directionRandom !== "function") {
    throw createDirectionError(
      "BATTED_BALL_DIRECTION_RANDOM_MISSING",
      "Direction Shadow requires an independent direction random source.",
      { mode }
    );
  }

  const built = buildDirectionProbabilities({
    batter,
    pitcher,
    pitchType,
    launchAngle,
    normalizedX,
    normalizedZ,
  });
  const direction = selectDirectionFromProbabilities(
    built.probabilities,
    directionRandom()
  );
  const batterRelativeSprayAngle = sampleBatterRelativeSprayAngle(
    direction,
    directionRandom()
  );
  const sprayAngle = convertToFieldSprayAngle(
    batterRelativeSprayAngle,
    built.resolvedBattingSide
  );

  return {
    mode,
    model: BATTED_BALL_DIRECTION_CONFIG.model,
    batterBats: built.batterBats,
    pitcherThrows: built.pitcherThrows,
    resolvedBattingSide: built.resolvedBattingSide,
    directionType: built.directionType,
    measurementClass: built.measurementClass,
    direction,
    fieldSector: classifyFieldSector(sprayAngle),
    batterRelativeSprayAngle,
    sprayAngle,
    probabilities: built.probabilities,
    horizontalLocation: built.horizontalLocation,
    verticalLocation: built.verticalLocation,
    directionRngCalls: 2,
  };
}
