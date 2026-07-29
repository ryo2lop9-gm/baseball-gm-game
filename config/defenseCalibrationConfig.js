export const DEFENSE_CALIBRATION_MODES = Object.freeze([
  "off",
  "diagnostic",
]);

export const DEFENSE_CALIBRATION_CONFIG = Object.freeze({
  defaultMode: "off",
  diagnosticMode: "diagnostic",
  model: "provisional_simple_catch_calibration_v1",
  source: "internal_shadow_self_consistency",
  logLossEpsilon: 1e-15,
  probabilityBinWidth: 0.05,
  probabilityBinCount: 20,
  minimumDiagnosticCount: 100,
  standardizedResidualPassLimit: 3,
  standardizedResidualWarningLimit: 5,
  identityTolerance: 1e-12,
  monotonicTolerance: 1e-12,
  speedRatings: Object.freeze([25, 50, 75]),
  fieldingRatings: Object.freeze([25, 50, 75]),
});
