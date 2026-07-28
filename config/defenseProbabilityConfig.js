export const BATTED_BALL_DEFENSE_MODES = Object.freeze(["off", "shadow"]);

export const BATTED_BALL_DEFENSE_CONFIG = Object.freeze({
  defaultMode: "off",
  shadowMode: "shadow",
  model: "provisional_simple_catch_shadow_v1",
  source: "provisional_simple_catch_model",
  defenseEventSchemaVersion: 1,
  alignmentModel: "standard_alignment_v1",
  shadowAuthority: "diagnostic_only",
  ratingCenter: 50,
  ratingScale: 10,
  probabilityEpsilon: 0.001,
  stationaryPathEpsilonFt: 1e-9,
  reachUncertaintySec: Object.freeze({
    fly: 0.65,
    popup: 0.55,
  }),
  directionMarginAdjustmentSec: Object.freeze({
    stationary: 0,
    toward_home: 0,
    lateral: -0.06,
    back: -0.18,
  }),
  baseSecureProbability: Object.freeze({
    fly: 0.985,
    popup: 0.995,
  }),
  secureEvReferenceMph: Object.freeze({
    fly: 90,
    popup: 80,
  }),
  secureEvLogitPenaltyPer10Mph: Object.freeze({
    fly: 0.18,
    popup: 0.08,
  }),
  secureMarginLogitPerSec: 0.2,
  actualAbility: Object.freeze({
    speedMultiplierPerStandardizedPoint: 0.03,
    routeMultiplierPerStandardizedPoint: 0.015,
    reactionTimeAdjustmentSecPerStandardizedPoint: 0.01,
    secureFieldingLogitPerStandardizedPoint: 0.2,
  }),
  limits: Object.freeze({
    speedMultiplier: Object.freeze([0.85, 1.15]),
    routeMultiplier: Object.freeze([0.925, 1.075]),
    reactionTimeSec: Object.freeze([0.2, 0.3]),
    secureMarginSec: Object.freeze([-1.5, 1.5]),
  }),
  rngNamespaces: Object.freeze({
    reach: "defense_reach_v1",
    secure: "defense_secure_v1",
  }),
});

// These are provisional game-model values, not calibrated or official
// Statcast Catch Probability / Outs Above Average parameters.
