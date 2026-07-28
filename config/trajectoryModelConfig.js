function freezeAnchors(anchors) {
  return Object.freeze(
    anchors.map(([launchAngle, scale]) =>
      Object.freeze([launchAngle, scale])
    )
  );
}

export const TRAJECTORY_MODEL_CONFIG = Object.freeze({
  source: "provisional_ev_la_model",
  confidence: null,
  mphToFtPerSec: 22 / 15,
  gravityFtPerSec2: 32.174,
  contactHeightFt: 3,
  carryScale: freezeAnchors([
    [5, 0.78],
    [10, 0.82],
    [20, 0.78],
    [30, 0.68],
    [40, 0.56],
    [50, 0.45],
    [60, 0.34],
    [75, 0.2],
    [90, 0],
  ]),
  hangTimeScale: freezeAnchors([
    [5, 0.9],
    [10, 0.95],
    [20, 1],
    [30, 1],
    [40, 0.96],
    [50, 0.9],
    [60, 0.82],
    [75, 0.72],
    [90, 0.65],
  ]),
  ground: Object.freeze({
    firstGroundTimeScale: 0.65,
    firstGroundDistanceScale: 0.72,
    initialSpeedScale: 0.32,
    decelerationFtPerSec2: 22,
    segmentCount: 3,
  }),
});
