import {
  FIELD_GEOMETRY_CONFIG,
  FIELD_GEOMETRY_MODES,
} from "../../config/fieldGeometryConfig.js";
import {
  AIR_TRAJECTORY_PATH_CONFIG,
  NEUTRAL_FENCE_CONFIG,
} from "../../config/neutralFenceConfig.js";
import { RESOLUTION_AUTHORITY_CONFIG } from "../../config/resolutionAuthorityConfig.js";
import { TRAJECTORY_MODEL_CONFIG } from "../../config/trajectoryModelConfig.js";
import { getMeasurementClass } from "../measurement/measurementClassService.js";
import { buildAirPathSummary } from "./airTrajectoryPathService.js";
import { evaluateFenceGeometry } from "./fenceGeometryService.js";

const EPSILON = 1e-9;

function geometryError(code, message, context = {}) {
  const error = new Error(message);
  error.code = code;
  error.context = context;
  return error;
}

function assertFinite(field, value, { min = -Infinity, max = Infinity } = {}) {
  if (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= min &&
    value <= max
  ) {
    return value;
  }
  throw geometryError(
    "BATTED_BALL_GEOMETRY_INPUT_INVALID",
    `Geometry input ${field} is invalid.`,
    { field, value, min, max }
  );
}

function assertPoint(field, value) {
  return {
    x: assertFinite(`${field}.x`, value?.x),
    y: assertFinite(`${field}.y`, value?.y),
  };
}

function distanceBetween(left, right) {
  return Math.hypot(right.x - left.x, right.y - left.y);
}

function interpolateAnchors(anchors, value) {
  if (value <= anchors[0][0]) return anchors[0][1];
  const last = anchors.at(-1);
  if (value >= last[0]) return last[1];
  for (let index = 1; index < anchors.length; index += 1) {
    const [rightX, rightY] = anchors[index];
    const [leftX, leftY] = anchors[index - 1];
    if (value <= rightX) {
      const ratio = (value - leftX) / (rightX - leftX);
      return leftY + (rightY - leftY) * ratio;
    }
  }
  return last[1];
}

function buildKinematics(exitVelocity, launchAngle) {
  const safeExitVelocity = assertFinite("exitVelocity", exitVelocity, {
    min: 0,
  });
  const safeLaunchAngle = assertFinite("launchAngle", launchAngle, {
    min: -90,
    max: 90,
  });
  const speed =
    safeExitVelocity * TRAJECTORY_MODEL_CONFIG.mphToFtPerSec;
  const theta = (safeLaunchAngle * Math.PI) / 180;
  const horizontalSpeed = Math.max(0, speed * Math.cos(theta));
  const verticalSpeed = speed * Math.sin(theta);
  const gravity = TRAJECTORY_MODEL_CONFIG.gravityFtPerSec2;
  const contactHeight = TRAJECTORY_MODEL_CONFIG.contactHeightFt;
  const rawFlightTime =
    (verticalSpeed +
      Math.sqrt(
        verticalSpeed ** 2 + 2 * gravity * contactHeight
      )) /
    gravity;
  if (
    !Number.isFinite(speed) ||
    !Number.isFinite(horizontalSpeed) ||
    !Number.isFinite(verticalSpeed) ||
    !Number.isFinite(rawFlightTime)
  ) {
    throwInvalidGeometryOutput("geometry.kinematics");
  }
  return {
    exitVelocity: safeExitVelocity,
    launchAngle: safeLaunchAngle,
    speedFtPerSec: speed,
    horizontalSpeedFtPerSec: horizontalSpeed,
    verticalSpeedFtPerSec: verticalSpeed,
    rawFlightTimeSec: rawFlightTime,
  };
}

function throwInvalidGeometryOutput(path) {
  throw geometryError(
    "BATTED_BALL_GEOMETRY_OUTPUT_INVALID",
    "Geometry produced a non-finite value.",
    { path }
  );
}

function assertGeometryOutput(result) {
  const trajectory = result.trajectory;
  if (
    !Number.isFinite(result.exitVelocity) ||
    !Number.isFinite(result.launchAngle) ||
    !Number.isFinite(result.sprayAngle) ||
    !Number.isFinite(trajectory.speedFtPerSec) ||
    !Number.isFinite(trajectory.horizontalSpeedFtPerSec) ||
    !Number.isFinite(trajectory.verticalSpeedFtPerSec) ||
    !Number.isFinite(trajectory.rawFlightTimeSec) ||
    !Number.isFinite(trajectory.radialDistanceFt) ||
    !Number.isFinite(trajectory.maxTravelDistanceFt) ||
    !Number.isFinite(trajectory.landingPoint.x) ||
    !Number.isFinite(trajectory.landingPoint.y)
  ) {
    throwInvalidGeometryOutput("geometry.trajectory");
  }
  if (trajectory.trajectoryKind === "air") {
    if (
      !Number.isFinite(trajectory.carryScale) ||
      !Number.isFinite(trajectory.hangTimeScale) ||
      !Number.isFinite(trajectory.hangTimeSec) ||
      !result.airPath ||
      !Number.isFinite(
        result.airPath.effectiveGravityFtPerSec2
      ) ||
      !Number.isFinite(result.airPath.radialSpeedFtPerSec) ||
      !Number.isFinite(result.airPath.apexTimeSec) ||
      !Number.isFinite(result.airPath.apexHeightFt) ||
      !Number.isFinite(result.airPath.apexRadialDistanceFt) ||
      !Number.isFinite(result.airPath.apexPoint?.x) ||
      !Number.isFinite(result.airPath.apexPoint?.y) ||
      !Number.isFinite(result.airPath.apexPoint?.z) ||
      !result.fence ||
      !Number.isFinite(result.fence.fenceDistanceFt) ||
      !Number.isFinite(result.fence.wallHeightFt) ||
      !Number.isFinite(
        result.fence.landingDistanceToFenceFt
      ) ||
      !Number.isFinite(result.fence.nearWallDistanceFt) ||
      typeof result.isOverFence !== "boolean"
    ) {
      throwInvalidGeometryOutput("geometry.trajectory.air");
    }
    if (
      result.wallIntersection &&
      [
        result.wallIntersection.timeSec,
        result.wallIntersection.x,
        result.wallIntersection.y,
        result.wallIntersection.z,
        result.wallIntersection.radialDistanceFt,
        result.wallIntersection.wallHeightFt,
        result.wallIntersection.clearanceFt,
      ].some((value) => !Number.isFinite(value))
    ) {
      throwInvalidGeometryOutput("geometry.wallIntersection");
    }
  } else if (
    !Number.isFinite(trajectory.firstGroundPoint.x) ||
    !Number.isFinite(trajectory.firstGroundPoint.y) ||
    !Number.isFinite(trajectory.firstGroundTimeSec) ||
    !Number.isFinite(trajectory.firstGroundDistanceFt) ||
    !Number.isFinite(trajectory.groundInitialSpeedFtPerSec) ||
    !Number.isFinite(trajectory.groundDecelerationFtPerSec2) ||
    !Number.isFinite(trajectory.groundRollTimeSec) ||
    !Number.isFinite(trajectory.groundRollDistanceFt) ||
    !Number.isFinite(trajectory.stopPoint.x) ||
    !Number.isFinite(trajectory.stopPoint.y) ||
    !Number.isFinite(trajectory.stopTimeSec) ||
    !Number.isFinite(trajectory.stopDistanceFt) ||
    trajectory.motionSegments.some(
      (segment) =>
        !Number.isFinite(segment.startTimeSec) ||
        !Number.isFinite(segment.endTimeSec) ||
        !Number.isFinite(segment.startPoint.x) ||
        !Number.isFinite(segment.startPoint.y) ||
        !Number.isFinite(segment.endPoint.x) ||
        !Number.isFinite(segment.endPoint.y)
    )
  ) {
    throwInvalidGeometryOutput("geometry.trajectory.ground");
  }
  for (const candidate of result.fielderCandidates) {
    if (
      !Number.isFinite(candidate.startPoint.x) ||
      !Number.isFinite(candidate.startPoint.y) ||
      !Number.isFinite(candidate.targetPoint.x) ||
      !Number.isFinite(candidate.targetPoint.y) ||
      !Number.isFinite(candidate.pathDistanceFt) ||
      !Number.isFinite(candidate.reactionTimeSec) ||
      !Number.isFinite(candidate.moveSpeedFtPerSec) ||
      !Number.isFinite(candidate.fielderEtaSec) ||
      !Number.isFinite(candidate.ballTimeSec) ||
      !Number.isFinite(candidate.arrivalMarginSec) ||
      (candidate.interceptPoint &&
        (!Number.isFinite(candidate.interceptPoint.x) ||
          !Number.isFinite(candidate.interceptPoint.y)))
    ) {
      throwInvalidGeometryOutput(
        `geometry.fielderCandidates.${candidate.position}`
      );
    }
  }
}

export function classifyTrajectoryClass(launchAngle) {
  const value = assertFinite("launchAngle", launchAngle, {
    min: -90,
    max: 90,
  });
  if (value < 5) return "ground";
  if (value < 10) return "low_liner";
  if (value < 25) return "air_liner";
  if (value < 50) return "fly";
  return "popup";
}

export function convertPolarToFieldPoint(radialDistance, sprayAngle) {
  const distance = assertFinite("radialDistance", radialDistance, { min: 0 });
  const angle = assertFinite("sprayAngle", sprayAngle, {
    min: FIELD_GEOMETRY_CONFIG.fairAngle.min,
    max: FIELD_GEOMETRY_CONFIG.fairAngle.max,
  });
  const angleRad = (angle * Math.PI) / 180;
  return {
    x: Math.sin(angleRad) * distance,
    y: Math.cos(angleRad) * distance,
  };
}

export function buildAirTrajectory({
  exitVelocity,
  launchAngle,
  sprayAngle,
}) {
  const kinematics = buildKinematics(exitVelocity, launchAngle);
  const carryScale = interpolateAnchors(
    TRAJECTORY_MODEL_CONFIG.carryScale,
    kinematics.launchAngle
  );
  const hangTimeScale = interpolateAnchors(
    TRAJECTORY_MODEL_CONFIG.hangTimeScale,
    kinematics.launchAngle
  );
  const radialDistanceFt =
    kinematics.horizontalSpeedFtPerSec *
    kinematics.rawFlightTimeSec *
    carryScale;
  const hangTimeSec =
    kinematics.rawFlightTimeSec * hangTimeScale;
  if (
    !Number.isFinite(radialDistanceFt) ||
    !Number.isFinite(hangTimeSec)
  ) {
    throwInvalidGeometryOutput("geometry.trajectory.air");
  }
  const landingPoint = convertPolarToFieldPoint(
    radialDistanceFt,
    sprayAngle
  );
  return {
    trajectoryKind: "air",
    ...kinematics,
    carryScale,
    hangTimeScale,
    radialDistanceFt,
    maxTravelDistanceFt: radialDistanceFt,
    hangTimeSec,
    landingPoint,
    firstGroundPoint: null,
    firstGroundTimeSec: null,
    firstGroundDistanceFt: null,
    groundInitialSpeedFtPerSec: null,
    groundDecelerationFtPerSec2: null,
    stopPoint: null,
    stopTimeSec: null,
    stopDistanceFt: null,
    motionSegments: null,
  };
}

export function buildGroundMotionSegments(trajectory) {
  const firstGroundPoint = assertPoint(
    "firstGroundPoint",
    trajectory?.firstGroundPoint
  );
  const stopPoint = assertPoint("stopPoint", trajectory?.stopPoint);
  const firstGroundTimeSec = assertFinite(
    "firstGroundTimeSec",
    trajectory?.firstGroundTimeSec,
    { min: 0 }
  );
  const stopTimeSec = assertFinite(
    "stopTimeSec",
    trajectory?.stopTimeSec,
    { min: firstGroundTimeSec }
  );
  const firstGroundDistanceFt = assertFinite(
    "firstGroundDistanceFt",
    trajectory?.firstGroundDistanceFt,
    { min: 0 }
  );
  const groundInitialSpeedFtPerSec = assertFinite(
    "groundInitialSpeedFtPerSec",
    trajectory?.groundInitialSpeedFtPerSec,
    { min: 0 }
  );
  const deceleration = assertFinite(
    "groundDecelerationFtPerSec2",
    trajectory?.groundDecelerationFtPerSec2,
    { min: EPSILON }
  );
  const rollTimeSec = stopTimeSec - firstGroundTimeSec;
  const halfRollTimeSec = rollTimeSec / 2;
  const midpointDistanceFt =
    firstGroundDistanceFt +
    groundInitialSpeedFtPerSec * halfRollTimeSec -
    0.5 * deceleration * halfRollTimeSec ** 2;
  const sprayAngle = assertFinite("sprayAngle", trajectory?.sprayAngle, {
    min: FIELD_GEOMETRY_CONFIG.fairAngle.min,
    max: FIELD_GEOMETRY_CONFIG.fairAngle.max,
  });
  const midpoint = convertPolarToFieldPoint(
    midpointDistanceFt,
    sprayAngle
  );
  const home = FIELD_GEOMETRY_CONFIG.bases.home;
  return [
    {
      index: 0,
      startTimeSec: 0,
      endTimeSec: firstGroundTimeSec,
      startPoint: { ...home },
      endPoint: firstGroundPoint,
    },
    {
      index: 1,
      startTimeSec: firstGroundTimeSec,
      endTimeSec: firstGroundTimeSec + halfRollTimeSec,
      startPoint: firstGroundPoint,
      endPoint: midpoint,
    },
    {
      index: 2,
      startTimeSec: firstGroundTimeSec + halfRollTimeSec,
      endTimeSec: stopTimeSec,
      startPoint: midpoint,
      endPoint: stopPoint,
    },
  ];
}

export function buildGroundTrajectory({
  exitVelocity,
  launchAngle,
  sprayAngle,
}) {
  const kinematics = buildKinematics(exitVelocity, launchAngle);
  const ground = TRAJECTORY_MODEL_CONFIG.ground;
  const firstGroundTimeSec =
    kinematics.rawFlightTimeSec * ground.firstGroundTimeScale;
  const firstGroundDistanceFt =
    kinematics.horizontalSpeedFtPerSec *
    firstGroundTimeSec *
    ground.firstGroundDistanceScale;
  const groundInitialSpeedFtPerSec =
    kinematics.horizontalSpeedFtPerSec * ground.initialSpeedScale;
  const groundDecelerationFtPerSec2 =
    ground.decelerationFtPerSec2;
  const groundRollTimeSec =
    groundInitialSpeedFtPerSec / groundDecelerationFtPerSec2;
  const groundRollDistanceFt =
    groundInitialSpeedFtPerSec ** 2 /
    (2 * groundDecelerationFtPerSec2);
  const stopTimeSec = firstGroundTimeSec + groundRollTimeSec;
  const stopDistanceFt =
    firstGroundDistanceFt + groundRollDistanceFt;
  if (
    !Number.isFinite(firstGroundTimeSec) ||
    !Number.isFinite(firstGroundDistanceFt) ||
    !Number.isFinite(groundInitialSpeedFtPerSec) ||
    !Number.isFinite(groundRollTimeSec) ||
    !Number.isFinite(groundRollDistanceFt) ||
    !Number.isFinite(stopTimeSec) ||
    !Number.isFinite(stopDistanceFt)
  ) {
    throwInvalidGeometryOutput("geometry.trajectory.ground");
  }
  const firstGroundPoint = convertPolarToFieldPoint(
    firstGroundDistanceFt,
    sprayAngle
  );
  const stopPoint = convertPolarToFieldPoint(
    stopDistanceFt,
    sprayAngle
  );
  const trajectory = {
    trajectoryKind: "ground",
    ...kinematics,
    sprayAngle,
    radialDistanceFt: stopDistanceFt,
    maxTravelDistanceFt: stopDistanceFt,
    hangTimeSec: null,
    landingPoint: firstGroundPoint,
    firstGroundPoint,
    firstGroundTimeSec,
    firstGroundDistanceFt,
    groundInitialSpeedFtPerSec,
    groundDecelerationFtPerSec2,
    groundRollTimeSec,
    groundRollDistanceFt,
    stopPoint,
    stopTimeSec,
    stopDistanceFt,
  };
  return {
    ...trajectory,
    motionSegments: buildGroundMotionSegments(trajectory),
  };
}

function pointOnSegment(segment, timeSec) {
  const duration = segment.endTimeSec - segment.startTimeSec;
  const ratio =
    duration <= EPSILON
      ? 1
      : (timeSec - segment.startTimeSec) / duration;
  return {
    x:
      segment.startPoint.x +
      (segment.endPoint.x - segment.startPoint.x) * ratio,
    y:
      segment.startPoint.y +
      (segment.endPoint.y - segment.startPoint.y) * ratio,
  };
}

export function solveLinearSegmentIntercept({
  segment,
  fielderStartPoint,
  reactionTimeSec = FIELD_GEOMETRY_CONFIG.fielderAssumptions
    .reactionTimeSec,
  moveSpeedFtPerSec = FIELD_GEOMETRY_CONFIG.fielderAssumptions
    .moveSpeedFtPerSec,
}) {
  const startPoint = assertPoint("segment.startPoint", segment?.startPoint);
  const endPoint = assertPoint("segment.endPoint", segment?.endPoint);
  const fielder = assertPoint("fielderStartPoint", fielderStartPoint);
  const startTimeSec = assertFinite(
    "segment.startTimeSec",
    segment?.startTimeSec,
    { min: 0 }
  );
  const endTimeSec = assertFinite(
    "segment.endTimeSec",
    segment?.endTimeSec,
    { min: startTimeSec }
  );
  const reaction = assertFinite("reactionTimeSec", reactionTimeSec, {
    min: 0,
  });
  const moveSpeed = assertFinite("moveSpeedFtPerSec", moveSpeedFtPerSec, {
    min: EPSILON,
  });
  const lower = Math.max(startTimeSec, reaction);
  if (lower > endTimeSec + EPSILON) return null;
  const checkedSegment = {
    startPoint,
    endPoint,
    startTimeSec,
    endTimeSec,
  };
  const lowerPoint = pointOnSegment(checkedSegment, lower);
  if (
    distanceBetween(fielder, lowerPoint) <=
    moveSpeed * (lower - reaction) + EPSILON
  ) {
    return { interceptPoint: lowerPoint, ballTimeSec: lower };
  }
  const duration = endTimeSec - startTimeSec;
  if (duration <= EPSILON) return null;
  const velocity = {
    x: (endPoint.x - startPoint.x) / duration,
    y: (endPoint.y - startPoint.y) / duration,
  };
  const origin = {
    x: startPoint.x - velocity.x * startTimeSec - fielder.x,
    y: startPoint.y - velocity.y * startTimeSec - fielder.y,
  };
  const a =
    velocity.x ** 2 + velocity.y ** 2 - moveSpeed ** 2;
  const b =
    2 *
    (origin.x * velocity.x +
      origin.y * velocity.y +
      moveSpeed ** 2 * reaction);
  const c =
    origin.x ** 2 +
    origin.y ** 2 -
    moveSpeed ** 2 * reaction ** 2;
  const roots = [];
  if (Math.abs(a) <= EPSILON) {
    if (Math.abs(b) > EPSILON) roots.push(-c / b);
  } else {
    const discriminant = b ** 2 - 4 * a * c;
    if (discriminant >= -EPSILON) {
      const root = Math.sqrt(Math.max(0, discriminant));
      roots.push((-b - root) / (2 * a), (-b + root) / (2 * a));
    }
  }
  const interceptTime = roots
    .filter(
      (time) =>
        Number.isFinite(time) &&
        time >= lower - EPSILON &&
        time <= endTimeSec + EPSILON
    )
    .sort((left, right) => left - right)[0];
  if (interceptTime === undefined) return null;
  return {
    interceptPoint: pointOnSegment(checkedSegment, interceptTime),
    ballTimeSec: interceptTime,
  };
}

function buildCandidateBase(position, startPoint, targetPoint, ballTimeSec) {
  const pathDistanceFt = distanceBetween(startPoint, targetPoint);
  const { reactionTimeSec, moveSpeedFtPerSec } =
    FIELD_GEOMETRY_CONFIG.fielderAssumptions;
  const fielderEtaSec =
    reactionTimeSec + pathDistanceFt / moveSpeedFtPerSec;
  return {
    position,
    alignmentModel: FIELD_GEOMETRY_CONFIG.alignmentModel,
    startPoint: { ...startPoint },
    targetPoint: { ...targetPoint },
    pathDistanceFt,
    reactionTimeSec,
    moveSpeedFtPerSec,
    fielderEtaSec,
    ballTimeSec,
    arrivalMarginSec: ballTimeSec - fielderEtaSec,
  };
}

export function buildFielderGeometryCandidates(trajectory) {
  const isGround = trajectory?.trajectoryKind === "ground";
  const isAir = trajectory?.trajectoryKind === "air";
  if (!isGround && !isAir) {
    throw geometryError(
      "BATTED_BALL_GEOMETRY_INPUT_INVALID",
      "Geometry trajectory kind is invalid.",
      { trajectoryKind: trajectory?.trajectoryKind }
    );
  }
  return FIELD_GEOMETRY_CONFIG.fielderPositionOrder.map((position) => {
    const startPoint =
      FIELD_GEOMETRY_CONFIG.fielderStartPoints[position];
    if (isAir) {
      return {
        ...buildCandidateBase(
          position,
          startPoint,
          trajectory.landingPoint,
          trajectory.hangTimeSec
        ),
        candidateKind: "air_landing",
        interceptPoint: null,
      };
    }
    let intercept = null;
    for (const segment of trajectory.motionSegments) {
      intercept = solveLinearSegmentIntercept({
        segment,
        fielderStartPoint: startPoint,
      });
      if (intercept) break;
    }
    if (intercept) {
      return {
        ...buildCandidateBase(
          position,
          startPoint,
          intercept.interceptPoint,
          intercept.ballTimeSec
        ),
        candidateKind: "ground_intercept",
        interceptPoint: { ...intercept.interceptPoint },
      };
    }
    return {
      ...buildCandidateBase(
        position,
        startPoint,
        trajectory.stopPoint,
        trajectory.stopTimeSec
      ),
      candidateKind: "post_stop_recovery",
      interceptPoint: null,
    };
  });
}

export function generateGeometryShadow({
  mode = FIELD_GEOMETRY_CONFIG.defaultMode,
  battedBallEventId,
  exitVelocity,
  launchAngle,
  directionShadow,
}) {
  if (!FIELD_GEOMETRY_MODES.includes(mode)) {
    throw geometryError(
      "BATTED_BALL_GEOMETRY_INPUT_INVALID",
      "Geometry mode is invalid.",
      { mode }
    );
  }
  const base = {
    mode,
    model: FIELD_GEOMETRY_CONFIG.model,
    geometryEventSchemaVersion:
      FIELD_GEOMETRY_CONFIG.geometryEventSchemaVersion,
    coordinateSystem: FIELD_GEOMETRY_CONFIG.coordinateSystem,
    units: FIELD_GEOMETRY_CONFIG.units,
    source: TRAJECTORY_MODEL_CONFIG.source,
    confidence: TRAJECTORY_MODEL_CONFIG.confidence,
    authority: RESOLUTION_AUTHORITY_CONFIG,
    parkId: FIELD_GEOMETRY_CONFIG.parkId,
    airPathModel: AIR_TRAJECTORY_PATH_CONFIG.model,
    fenceModel: NEUTRAL_FENCE_CONFIG.model,
    fenceSource: NEUTRAL_FENCE_CONFIG.source,
    airPath: null,
    fence: null,
    wallContext: null,
    wallIntersection: null,
    isOverFence: null,
    fallbackUsed: false,
    geometryRngCalls: 0,
  };
  if (mode === FIELD_GEOMETRY_CONFIG.defaultMode) {
    return {
      ...base,
      battedBallEventId: battedBallEventId ?? null,
      measurementClass: null,
      trajectoryClass: null,
      trajectoryKind: null,
      exitVelocity: null,
      launchAngle: null,
      sprayAngle: null,
      directionModel: null,
      trajectory: null,
      fielderCandidates: null,
    };
  }
  if (
    directionShadow?.mode !== "shadow" ||
    !Number.isFinite(directionShadow?.sprayAngle)
  ) {
    throw geometryError(
      "BATTED_BALL_GEOMETRY_DIRECTION_REQUIRED",
      "Geometry Shadow requires a valid Direction Shadow.",
      {
        directionMode: directionShadow?.mode ?? null,
        sprayAngle: directionShadow?.sprayAngle ?? null,
      }
    );
  }
  if (
    typeof battedBallEventId !== "string" ||
    battedBallEventId.length === 0
  ) {
    throw geometryError(
      "BATTED_BALL_GEOMETRY_INPUT_INVALID",
      "Geometry requires a stable batted-ball event ID.",
      { battedBallEventId }
    );
  }
  const safeExitVelocity = assertFinite("exitVelocity", exitVelocity, {
    min: 0,
  });
  const safeLaunchAngle = assertFinite("launchAngle", launchAngle, {
    min: -90,
    max: 90,
  });
  const sprayAngle = assertFinite(
    "sprayAngle",
    directionShadow.sprayAngle,
    {
      min: FIELD_GEOMETRY_CONFIG.fairAngle.min,
      max: FIELD_GEOMETRY_CONFIG.fairAngle.max,
    }
  );
  const trajectoryClass = classifyTrajectoryClass(safeLaunchAngle);
  const trajectory =
    trajectoryClass === "ground"
      ? buildGroundTrajectory({
          exitVelocity: safeExitVelocity,
          launchAngle: safeLaunchAngle,
          sprayAngle,
        })
      : buildAirTrajectory({
          exitVelocity: safeExitVelocity,
          launchAngle: safeLaunchAngle,
          sprayAngle,
        });
  const trajectoryWithSprayAngle = {
    ...trajectory,
    sprayAngle,
  };
  const airPath =
    trajectory.trajectoryKind === "air"
      ? buildAirPathSummary(trajectoryWithSprayAngle)
      : null;
  const fenceGeometry = evaluateFenceGeometry(
    trajectoryWithSprayAngle,
    airPath
  );
  const result = {
    ...base,
    mode: FIELD_GEOMETRY_CONFIG.shadowMode,
    battedBallEventId,
    measurementClass: getMeasurementClass(safeLaunchAngle),
    trajectoryClass,
    trajectoryKind: trajectory.trajectoryKind,
    exitVelocity: safeExitVelocity,
    launchAngle: safeLaunchAngle,
    sprayAngle,
    directionModel: directionShadow.model ?? null,
    trajectory,
    fielderCandidates: buildFielderGeometryCandidates(trajectory),
    airPath: fenceGeometry.airPath,
    fence: fenceGeometry.fence,
    wallContext: fenceGeometry.wallContext,
    wallIntersection: fenceGeometry.wallIntersection,
    isOverFence: fenceGeometry.isOverFence,
  };
  assertGeometryOutput(result);
  return result;
}
