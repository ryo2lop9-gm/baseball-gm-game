export const BATTED_BALL_DIRECTION_MODES = Object.freeze(["off", "shadow"]);
export const BATTER_BATS_VALUES = Object.freeze(["R", "L", "S"]);
export const PITCHER_THROWS_VALUES = Object.freeze(["R", "L"]);
export const BATTER_DIRECTION_TYPES = Object.freeze([
  "pullHeavy",
  "balanced",
  "oppoLean",
]);
export const BATTED_BALL_DIRECTIONS = Object.freeze([
  "pull",
  "center",
  "oppo",
]);
export const BATTED_BALL_FIELD_SECTORS = Object.freeze([
  "left",
  "center",
  "right",
]);
export const BATTED_BALL_MEASUREMENT_CLASSES = Object.freeze([
  "GB",
  "LD",
  "FB",
  "PU",
]);

const CLASS_BASE_RATIOS = Object.freeze({
  GB: Object.freeze({ pull: 0.43, center: 0.34, oppo: 0.23 }),
  LD: Object.freeze({ pull: 0.38, center: 0.37, oppo: 0.25 }),
  FB: Object.freeze({ pull: 0.4, center: 0.35, oppo: 0.25 }),
  PU: Object.freeze({ pull: 0.36, center: 0.42, oppo: 0.22 }),
});

const DIRECTION_TYPE_RATIOS = Object.freeze({
  pullHeavy: Object.freeze({ pull: 0.44, center: 0.34, oppo: 0.22 }),
  balanced: Object.freeze({ pull: 0.35, center: 0.33, oppo: 0.32 }),
  oppoLean: Object.freeze({ pull: 0.23, center: 0.35, oppo: 0.42 }),
});

const COMBINATION_WEIGHTS = Object.freeze({
  pull: Object.freeze({ measurementClass: 0.4, directionType: 1.3 }),
  center: Object.freeze({ measurementClass: 0.46, directionType: 1.1 }),
  oppo: Object.freeze({ measurementClass: 0.4, directionType: 1.35 }),
});

const PITCH_TYPE_ADJUSTMENTS = Object.freeze({
  fourSeam: Object.freeze({ pull: -0.02, center: 0.05, oppo: -0.03 }),
  slider: Object.freeze({ pull: 0.08, center: -0.01, oppo: -0.07 }),
  curve: Object.freeze({ pull: 0.04, center: 0.03, oppo: -0.07 }),
  fork: Object.freeze({ pull: 0.09, center: -0.02, oppo: -0.07 }),
});

const LOCATION_ADJUSTMENTS = Object.freeze({
  inside: Object.freeze({ pull: 0.1, center: -0.02, oppo: -0.08 }),
  outside: Object.freeze({ pull: -0.11, center: -0.01, oppo: 0.12 }),
  high: Object.freeze({ pull: 0.04, center: 0.02, oppo: -0.06 }),
  low: Object.freeze({ pull: -0.05, center: -0.01, oppo: 0.06 }),
});

export const BATTED_BALL_DIRECTION_CONFIG = Object.freeze({
  defaultMode: "off",
  shadowMode: "shadow",
  model: "gm_basic_direction_shadow_v1",
  directions: BATTED_BALL_DIRECTIONS,
  fieldSectors: BATTED_BALL_FIELD_SECTORS,
  fairAngle: Object.freeze({ min: -45, max: 45 }),
  sector: Object.freeze({
    boundary: 15,
    maximum: 45,
  }),
  measurementClassRatios: CLASS_BASE_RATIOS,
  directionTypeRatios: DIRECTION_TYPE_RATIOS,
  combinationWeights: COMBINATION_WEIGHTS,
  minimumDirectionWeight: 0.05,
  pitchTypeAdjustments: PITCH_TYPE_ADJUSTMENTS,
  normalizedLocationBoundary: 1 / 3,
  locationAdjustments: LOCATION_ADJUSTMENTS,
});
