import { BATTED_BALL_DEFENSE_CONFIG } from "../../config/defenseProbabilityConfig.js";
import { FIELD_GEOMETRY_CONFIG } from "../../config/fieldGeometryConfig.js";

const ELIGIBLE_TRAJECTORY_CLASSES = new Set(["fly", "popup"]);

function defenseInputError(message, context = {}) {
  const error = new Error(message);
  error.code = "BATTED_BALL_DEFENSE_INPUT_INVALID";
  error.context = context;
  return error;
}

function assertFinite(name, value) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw defenseInputError(`${name} must be finite.`, { [name]: value });
  }
  return value;
}

export function clampDefenseValue(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function sigmoidDefenseValue(value) {
  const finite = assertFinite("sigmoidInput", value);
  if (finite >= 0) {
    const exponential = Math.exp(-finite);
    return 1 / (1 + exponential);
  }
  const exponential = Math.exp(finite);
  return exponential / (1 + exponential);
}

export function logitDefenseProbability(probability) {
  const finite = assertFinite("probability", probability);
  if (finite < 0 || finite > 1) {
    throw defenseInputError("Probability must be between zero and one.", {
      probability,
    });
  }
  const epsilon = BATTED_BALL_DEFENSE_CONFIG.probabilityEpsilon;
  const safeProbability = clampDefenseValue(
    finite,
    epsilon,
    1 - epsilon
  );
  return Math.log(safeProbability / (1 - safeProbability));
}

export function classifyFielderMovementDirection({
  startPoint,
  targetPoint,
  pathDistanceFt,
}) {
  const startX = assertFinite("startX", startPoint?.x);
  const startY = assertFinite("startY", startPoint?.y);
  const targetX = assertFinite("targetX", targetPoint?.x);
  const targetY = assertFinite("targetY", targetPoint?.y);
  const distance = assertFinite("pathDistanceFt", pathDistanceFt);
  if (distance < 0) {
    throw defenseInputError("Path distance must not be negative.", {
      pathDistanceFt,
    });
  }
  if (distance <= BATTED_BALL_DEFENSE_CONFIG.stationaryPathEpsilonFt) {
    return "stationary";
  }

  const movementX = targetX - startX;
  const movementY = targetY - startY;
  const homeX = -startX;
  const homeY = -startY;
  const movementLength = Math.hypot(movementX, movementY);
  const homeLength = Math.hypot(homeX, homeY);
  if (
    movementLength <=
      BATTED_BALL_DEFENSE_CONFIG.stationaryPathEpsilonFt ||
    homeLength <= BATTED_BALL_DEFENSE_CONFIG.stationaryPathEpsilonFt
  ) {
    return "stationary";
  }
  const cosine =
    (movementX * homeX + movementY * homeY) /
    (movementLength * homeLength);
  if (cosine >= 0.5) return "toward_home";
  if (cosine <= -0.5) return "back";
  return "lateral";
}

function getExclusionReason(trajectoryClass) {
  switch (trajectoryClass) {
    case "ground":
      return "trajectory_ground";
    case "low_liner":
      return "trajectory_low_liner";
    case "air_liner":
      return "trajectory_air_liner";
    default:
      return "trajectory_not_simple_catch";
  }
}

function validateCandidate(candidate, expectedPosition) {
  if (
    !FIELD_GEOMETRY_CONFIG.fielderPositionOrder.includes(expectedPosition) ||
    !candidate ||
    typeof candidate !== "object" ||
    candidate.position !== expectedPosition
  ) {
    throw defenseInputError("Geometry fielder candidate is invalid.", {
      expectedPosition,
      candidatePosition: candidate?.position ?? null,
    });
  }
  for (const field of [
    "pathDistanceFt",
    "fielderEtaSec",
    "ballTimeSec",
    "arrivalMarginSec",
  ]) {
    assertFinite(field, candidate[field]);
  }
  if (candidate.pathDistanceFt < 0 || candidate.ballTimeSec < 0) {
    throw defenseInputError("Geometry candidate timing is invalid.", {
      position: expectedPosition,
    });
  }
  classifyFielderMovementDirection(candidate);
  return candidate;
}

export function calculateSecureLogit({
  trajectoryClass,
  exitVelocity,
  adjustedMarginSec,
}) {
  if (!ELIGIBLE_TRAJECTORY_CLASSES.has(trajectoryClass)) {
    throw defenseInputError("Secure probability trajectory is invalid.", {
      trajectoryClass,
    });
  }
  const velocity = assertFinite("exitVelocity", exitVelocity);
  const margin = assertFinite("adjustedMarginSec", adjustedMarginSec);
  if (velocity < 0) {
    throw defenseInputError("Exit velocity must not be negative.", {
      exitVelocity,
    });
  }
  const config = BATTED_BALL_DEFENSE_CONFIG;
  const evExcess10 = Math.max(
    0,
    (velocity - config.secureEvReferenceMph[trajectoryClass]) / 10
  );
  return (
    logitDefenseProbability(
      config.baseSecureProbability[trajectoryClass]
    ) +
    config.secureMarginLogitPerSec *
      clampDefenseValue(
        margin,
        config.limits.secureMarginSec[0],
        config.limits.secureMarginSec[1]
      ) -
    config.secureEvLogitPenaltyPer10Mph[trajectoryClass] * evExcess10
  );
}

export function calculateAverageSecureProbability(input) {
  return sigmoidDefenseValue(calculateSecureLogit(input));
}

export function evaluateAverageDefenseCandidate({
  candidate,
  trajectoryClass,
  exitVelocity,
}) {
  validateCandidate(candidate, candidate?.position);
  if (!ELIGIBLE_TRAJECTORY_CLASSES.has(trajectoryClass)) {
    throw defenseInputError("Defense candidate trajectory is not eligible.", {
      trajectoryClass,
    });
  }
  const movementDirection = classifyFielderMovementDirection(candidate);
  const directionMarginAdjustmentSec =
    BATTED_BALL_DEFENSE_CONFIG.directionMarginAdjustmentSec[
      movementDirection
    ];
  const adjustedAverageMargin =
    candidate.arrivalMarginSec + directionMarginAdjustmentSec;
  const pReachAverage = sigmoidDefenseValue(
    adjustedAverageMargin /
      BATTED_BALL_DEFENSE_CONFIG.reachUncertaintySec[trajectoryClass]
  );
  const pSecureAverage = calculateAverageSecureProbability({
    trajectoryClass,
    exitVelocity,
    adjustedMarginSec: adjustedAverageMargin,
  });
  return {
    position: candidate.position,
    movementDirection,
    directionMarginAdjustmentSec,
    pathDistanceFt: candidate.pathDistanceFt,
    ballTimeSec: candidate.ballTimeSec,
    fielderEtaAverage: candidate.fielderEtaSec,
    adjustedAverageMargin,
    pReachAverage,
    pSecureAverage,
    pCatchAverage: pReachAverage * pSecureAverage,
  };
}

export function buildDefenseOpportunity({
  geometryShadow,
  directionShadow,
}) {
  if (
    !geometryShadow ||
    geometryShadow.mode !== FIELD_GEOMETRY_CONFIG.shadowMode
  ) {
    const error = new Error("Defense Shadow requires Geometry Shadow.");
    error.code = "BATTED_BALL_DEFENSE_GEOMETRY_REQUIRED";
    error.context = { geometryMode: geometryShadow?.mode ?? null };
    throw error;
  }
  if (
    !directionShadow ||
    directionShadow.mode !== "shadow" ||
    geometryShadow.directionModel !== directionShadow.model
  ) {
    throw defenseInputError("Defense Shadow requires Direction Shadow.", {
      directionMode: directionShadow?.mode ?? null,
      directionModel: directionShadow?.model ?? null,
      geometryDirectionModel: geometryShadow.directionModel ?? null,
    });
  }
  if (
    typeof geometryShadow.battedBallEventId !== "string" ||
    geometryShadow.battedBallEventId.length === 0
  ) {
    throw defenseInputError(
      "Defense Shadow requires a stable batted-ball event ID.",
      { battedBallEventId: geometryShadow.battedBallEventId }
    );
  }
  const trajectoryClass = geometryShadow.trajectoryClass;
  const trajectoryKind = geometryShadow.trajectoryKind;
  const exitVelocity = assertFinite(
    "exitVelocity",
    geometryShadow.exitVelocity
  );
  if (
    !ELIGIBLE_TRAJECTORY_CLASSES.has(trajectoryClass) ||
    trajectoryKind !== "air"
  ) {
    return {
      eligible: false,
      exclusionReason: getExclusionReason(trajectoryClass),
      trajectoryClass,
      fieldSector: directionShadow.fieldSector ?? null,
      candidateEvaluations: null,
      responsibleCandidate: null,
    };
  }
  const candidates = geometryShadow.fielderCandidates;
  if (
    !Array.isArray(candidates) ||
    candidates.length !== FIELD_GEOMETRY_CONFIG.fielderPositionOrder.length
  ) {
    throw defenseInputError(
      "Defense Shadow requires all geometry fielder candidates.",
      { candidateCount: candidates?.length ?? null }
    );
  }
  const byPosition = new Map(
    candidates.map((candidate) => [candidate?.position, candidate])
  );
  const candidateEvaluations =
    FIELD_GEOMETRY_CONFIG.fielderPositionOrder.map((position) => {
      const candidate = validateCandidate(byPosition.get(position), position);
      return evaluateAverageDefenseCandidate({
        candidate,
        trajectoryClass,
        exitVelocity,
      });
    });
  let responsibleCandidate = candidateEvaluations[0];
  for (const candidate of candidateEvaluations.slice(1)) {
    if (candidate.pCatchAverage > responsibleCandidate.pCatchAverage) {
      responsibleCandidate = candidate;
    }
  }
  return {
    eligible: true,
    exclusionReason: null,
    trajectoryClass,
    fieldSector: directionShadow.fieldSector ?? null,
    candidateEvaluations,
    responsibleCandidate,
  };
}
