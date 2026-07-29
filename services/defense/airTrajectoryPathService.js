import { AIR_TRAJECTORY_PATH_CONFIG } from "../../config/neutralFenceConfig.js";
import { TRAJECTORY_MODEL_CONFIG } from "../../config/trajectoryModelConfig.js";

function airPathError(message, context = {}) {
  const error = new Error(message);
  error.code = "BATTED_BALL_AIR_PATH_INPUT_INVALID";
  error.context = context;
  return error;
}

function assertFinite(field, value, { min = -Infinity } = {}) {
  if (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= min
  ) {
    return value;
  }
  throw airPathError(`Air Path input ${field} is invalid.`, {
    field,
    value,
    min,
  });
}

function assertAirTrajectory(trajectory) {
  if (trajectory?.trajectoryKind !== "air") {
    throw airPathError("Air Path requires an air trajectory.", {
      trajectoryKind: trajectory?.trajectoryKind ?? null,
    });
  }
  const hangTimeSec = assertFinite(
    "hangTimeSec",
    trajectory.hangTimeSec,
    { min: Number.EPSILON }
  );
  const radialDistanceFt = assertFinite(
    "radialDistanceFt",
    trajectory.radialDistanceFt,
    { min: 0 }
  );
  const verticalSpeedFtPerSec = assertFinite(
    "verticalSpeedFtPerSec",
    trajectory.verticalSpeedFtPerSec
  );
  const sprayAngle = assertFinite(
    "sprayAngle",
    trajectory.sprayAngle
  );
  const landingX = assertFinite(
    "landingPoint.x",
    trajectory.landingPoint?.x
  );
  const landingY = assertFinite(
    "landingPoint.y",
    trajectory.landingPoint?.y
  );
  return {
    hangTimeSec,
    radialDistanceFt,
    verticalSpeedFtPerSec,
    sprayAngle,
    landingPoint: { x: landingX, y: landingY },
  };
}

function evaluateWithSummary(
  normalized,
  summary,
  timeSec
) {
  const time = assertFinite("timeSec", timeSec, { min: 0 });
  if (time > normalized.hangTimeSec) {
    throw airPathError(
      "Air Path time must not exceed hangTimeSec.",
      { timeSec: time, hangTimeSec: normalized.hangTimeSec }
    );
  }
  if (time === 0) {
    return {
      timeSec: 0,
      x: 0,
      y: 0,
      z: TRAJECTORY_MODEL_CONFIG.contactHeightFt,
      radialDistanceFt: 0,
    };
  }
  if (time === normalized.hangTimeSec) {
    return {
      timeSec: time,
      x: normalized.landingPoint.x,
      y: normalized.landingPoint.y,
      z: 0,
      radialDistanceFt: normalized.radialDistanceFt,
    };
  }
  const radialDistanceFt =
    summary.radialSpeedFtPerSec * time;
  const angleRad = (normalized.sprayAngle * Math.PI) / 180;
  const heightFt =
    TRAJECTORY_MODEL_CONFIG.contactHeightFt +
    normalized.verticalSpeedFtPerSec * time -
    0.5 * summary.effectiveGravityFtPerSec2 * time ** 2;
  if (
    !Number.isFinite(radialDistanceFt) ||
    !Number.isFinite(heightFt)
  ) {
    throw airPathError("Air Path produced a non-finite point.", {
      timeSec: time,
    });
  }
  return {
    timeSec: time,
    x: Math.sin(angleRad) * radialDistanceFt,
    y: Math.cos(angleRad) * radialDistanceFt,
    z:
      Math.abs(heightFt) <=
      AIR_TRAJECTORY_PATH_CONFIG.endpointTolerance
        ? 0
        : heightFt,
    radialDistanceFt,
  };
}

export function buildAirPathSummary(trajectory) {
  const normalized = assertAirTrajectory(trajectory);
  const contactHeightFt =
    TRAJECTORY_MODEL_CONFIG.contactHeightFt;
  const effectiveGravityFtPerSec2 =
    (2 *
      (contactHeightFt +
        normalized.verticalSpeedFtPerSec *
          normalized.hangTimeSec)) /
    normalized.hangTimeSec ** 2;
  const radialSpeedFtPerSec =
    normalized.radialDistanceFt / normalized.hangTimeSec;
  const apexTimeSec =
    normalized.verticalSpeedFtPerSec /
    effectiveGravityFtPerSec2;
  if (
    !Number.isFinite(effectiveGravityFtPerSec2) ||
    effectiveGravityFtPerSec2 <= 0 ||
    !Number.isFinite(radialSpeedFtPerSec) ||
    !Number.isFinite(apexTimeSec) ||
    apexTimeSec < 0 ||
    apexTimeSec > normalized.hangTimeSec
  ) {
    throw airPathError(
      "Air Path summary is outside the supported trajectory interval.",
      {
        effectiveGravityFtPerSec2,
        radialSpeedFtPerSec,
        apexTimeSec,
        hangTimeSec: normalized.hangTimeSec,
      }
    );
  }
  const coreSummary = {
    contactHeightFt,
    verticalSpeedFtPerSec:
      normalized.verticalSpeedFtPerSec,
    effectiveGravityFtPerSec2,
    radialSpeedFtPerSec,
    apexTimeSec,
  };
  const apexPoint = evaluateWithSummary(
    normalized,
    coreSummary,
    apexTimeSec
  );
  return {
    ...coreSummary,
    apexHeightFt: apexPoint.z,
    apexRadialDistanceFt: apexPoint.radialDistanceFt,
    apexPoint,
  };
}

export function evaluateAirTrajectoryAtTime(
  trajectory,
  timeSec
) {
  const normalized = assertAirTrajectory(trajectory);
  const summary = buildAirPathSummary(trajectory);
  return evaluateWithSummary(normalized, summary, timeSec);
}
