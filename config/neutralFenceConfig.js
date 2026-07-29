function freezeAnchors(anchors) {
  return Object.freeze(
    anchors.map(([angleDegrees, distanceFt]) =>
      Object.freeze([angleDegrees, distanceFt])
    )
  );
}

const fenceDistanceAnchors = freezeAnchors([
  [-45, 330],
  [-30, 350],
  [-15, 375],
  [0, 400],
  [15, 375],
  [30, 350],
  [45, 330],
]);

export const AIR_TRAJECTORY_PATH_CONFIG = Object.freeze({
  model: "provisional_air_path_shadow_v1",
  endpointTolerance: 1e-9,
});

export const NEUTRAL_FENCE_CONFIG = Object.freeze({
  model: "provisional_neutral_fence_geometry_shadow_v1",
  source: "provisional_neutral_park_config",
  parkId: "neutral_mlb_shadow",
  fenceDistanceAnchors,
  fairAngle: Object.freeze({
    min: fenceDistanceAnchors[0][0],
    max: fenceDistanceAnchors.at(-1)[0],
  }),
  wallHeightFt: 8,
  nearWallDistanceFt: 8,
  symmetryTolerance: 1e-9,
});
