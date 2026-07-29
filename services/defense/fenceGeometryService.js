import {
  NEUTRAL_FENCE_CONFIG,
} from "../../config/neutralFenceConfig.js";
import {
  buildAirPathSummary,
  evaluateAirTrajectoryAtTime,
} from "./airTrajectoryPathService.js";

export const FENCE_WALL_CONTEXTS = Object.freeze([
  "none",
  "near_wall_inside",
  "wall_contact",
  "over_fence",
]);

function fenceError(message, context = {}) {
  const error = new Error(message);
  error.code = "BATTED_BALL_FENCE_GEOMETRY_INPUT_INVALID";
  error.context = context;
  return error;
}

function assertFinite(
  field,
  value,
  { min = -Infinity, max = Infinity } = {}
) {
  if (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= min &&
    value <= max
  ) {
    return value;
  }
  throw fenceError(`Fence Geometry input ${field} is invalid.`, {
    field,
    value,
    min,
    max,
  });
}

export function getNeutralFenceDistanceFt(sprayAngle) {
  const angle = assertFinite("sprayAngle", sprayAngle, {
    min: NEUTRAL_FENCE_CONFIG.fairAngle.min,
    max: NEUTRAL_FENCE_CONFIG.fairAngle.max,
  });
  const anchors = NEUTRAL_FENCE_CONFIG.fenceDistanceAnchors;
  for (const [anchorAngle, distanceFt] of anchors) {
    if (angle === anchorAngle) return distanceFt;
  }
  for (let index = 1; index < anchors.length; index += 1) {
    const [rightAngle, rightDistance] = anchors[index];
    const [leftAngle, leftDistance] = anchors[index - 1];
    if (angle < rightAngle) {
      const ratio =
        (angle - leftAngle) / (rightAngle - leftAngle);
      return (
        leftDistance +
        (rightDistance - leftDistance) * ratio
      );
    }
  }
  throw fenceError("Fence Geometry could not interpolate angle.", {
    sprayAngle: angle,
  });
}

export function evaluateFenceGeometry(
  trajectory,
  providedAirPath = null
) {
  if (trajectory?.trajectoryKind === "ground") {
    return {
      airPath: null,
      fence: null,
      wallContext: null,
      wallIntersection: null,
      isOverFence: null,
    };
  }
  if (trajectory?.trajectoryKind !== "air") {
    throw fenceError(
      "Fence Geometry requires an air or ground trajectory.",
      { trajectoryKind: trajectory?.trajectoryKind ?? null }
    );
  }
  const radialDistanceFt = assertFinite(
    "radialDistanceFt",
    trajectory.radialDistanceFt,
    { min: 0 }
  );
  const hangTimeSec = assertFinite(
    "hangTimeSec",
    trajectory.hangTimeSec,
    { min: Number.EPSILON }
  );
  const sprayAngle = assertFinite(
    "sprayAngle",
    trajectory.sprayAngle,
    {
      min: NEUTRAL_FENCE_CONFIG.fairAngle.min,
      max: NEUTRAL_FENCE_CONFIG.fairAngle.max,
    }
  );
  const airPath =
    providedAirPath || buildAirPathSummary(trajectory);
  const fenceDistanceFt =
    getNeutralFenceDistanceFt(sprayAngle);
  const landingDistanceToFenceFt =
    radialDistanceFt - fenceDistanceFt;
  const fence = {
    fenceDistanceFt,
    wallHeightFt: NEUTRAL_FENCE_CONFIG.wallHeightFt,
    landingDistanceToFenceFt,
    nearWallDistanceFt:
      NEUTRAL_FENCE_CONFIG.nearWallDistanceFt,
  };

  if (radialDistanceFt < fenceDistanceFt) {
    return {
      airPath,
      fence,
      wallContext:
        radialDistanceFt <
        fenceDistanceFt -
          NEUTRAL_FENCE_CONFIG.nearWallDistanceFt
          ? "none"
          : "near_wall_inside",
      wallIntersection: null,
      isOverFence: false,
    };
  }

  const fenceTimeSec =
    radialDistanceFt === 0
      ? 0
      : (hangTimeSec * fenceDistanceFt) /
        radialDistanceFt;
  const point = evaluateAirTrajectoryAtTime(
    trajectory,
    fenceTimeSec
  );
  const clearanceFt =
    point.z - NEUTRAL_FENCE_CONFIG.wallHeightFt;
  const wallContext =
    clearanceFt > 0 ? "over_fence" : "wall_contact";
  return {
    airPath,
    fence,
    wallContext,
    wallIntersection: {
      timeSec: fenceTimeSec,
      x: point.x,
      y: point.y,
      z: point.z,
      radialDistanceFt: point.radialDistanceFt,
      wallHeightFt: NEUTRAL_FENCE_CONFIG.wallHeightFt,
      clearanceFt,
    },
    isOverFence: wallContext === "over_fence",
  };
}
