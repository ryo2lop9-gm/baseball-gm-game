import { BATTED_BALL_DEFENSE_CONFIG } from "../../config/defenseProbabilityConfig.js";
import { FIELD_GEOMETRY_CONFIG } from "../../config/fieldGeometryConfig.js";
import {
  calculateSecureLogit,
  clampDefenseValue,
  sigmoidDefenseValue,
} from "./defenseOpportunityService.js";

function defenseAbilityInputError(message, context = {}) {
  const error = new Error(message);
  error.code = "BATTED_BALL_DEFENSE_INPUT_INVALID";
  error.context = context;
  return error;
}

function assertFinite(name, value) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw defenseAbilityInputError(`${name} must be finite.`, {
      [name]: value,
    });
  }
  return value;
}

function assertRating(name, value) {
  const rating = assertFinite(name, value);
  if (rating < 0 || rating > 100) {
    throw defenseAbilityInputError(`${name} must be between 0 and 100.`, {
      [name]: value,
    });
  }
  return rating;
}

export function calculateDefenseAbilityProbabilities({
  trajectoryClass,
  exitVelocity,
  pathDistanceFt,
  ballTimeSec,
  movementDirection,
  speed,
  fielding,
}) {
  const config = BATTED_BALL_DEFENSE_CONFIG;
  if (
    trajectoryClass !== "fly" &&
    trajectoryClass !== "popup"
  ) {
    throw defenseAbilityInputError(
      "Defense ability probability requires fly or popup.",
      { trajectoryClass }
    );
  }
  if (
    !Object.hasOwn(
      config.directionMarginAdjustmentSec,
      movementDirection
    )
  ) {
    throw defenseAbilityInputError("Movement direction is invalid.", {
      movementDirection,
    });
  }
  const velocity = assertFinite("exitVelocity", exitVelocity);
  const distance = assertFinite("pathDistanceFt", pathDistanceFt);
  const availableTime = assertFinite("ballTimeSec", ballTimeSec);
  const safeSpeed = assertRating("speed", speed);
  const safeFielding = assertRating("fielding", fielding);
  if (velocity < 0 || distance < 0 || availableTime < 0) {
    throw defenseAbilityInputError(
      "Defense ability timing inputs must not be negative.",
      { exitVelocity, pathDistanceFt, ballTimeSec }
    );
  }

  const standardizedSpeed =
    (safeSpeed - config.ratingCenter) / config.ratingScale;
  const standardizedFielding =
    (safeFielding - config.ratingCenter) / config.ratingScale;
  const speedMultiplier = clampDefenseValue(
    1 +
      config.actualAbility.speedMultiplierPerStandardizedPoint *
        standardizedSpeed,
    config.limits.speedMultiplier[0],
    config.limits.speedMultiplier[1]
  );
  const routeMultiplier = clampDefenseValue(
    1 +
      config.actualAbility.routeMultiplierPerStandardizedPoint *
        standardizedFielding,
    config.limits.routeMultiplier[0],
    config.limits.routeMultiplier[1]
  );
  const reactionTimeActual = clampDefenseValue(
    FIELD_GEOMETRY_CONFIG.fielderAssumptions.reactionTimeSec -
      config.actualAbility.reactionTimeAdjustmentSecPerStandardizedPoint *
        standardizedFielding,
    config.limits.reactionTimeSec[0],
    config.limits.reactionTimeSec[1]
  );
  const moveSpeedActual =
    FIELD_GEOMETRY_CONFIG.fielderAssumptions.moveSpeedFtPerSec *
    speedMultiplier *
    routeMultiplier;
  const fielderEtaActual =
    reactionTimeActual + distance / moveSpeedActual;
  const adjustedActualMargin =
    availableTime -
    fielderEtaActual +
    config.directionMarginAdjustmentSec[movementDirection];
  const pReachActual = sigmoidDefenseValue(
    adjustedActualMargin /
      config.reachUncertaintySec[trajectoryClass]
  );
  const pSecureActual = sigmoidDefenseValue(
    calculateSecureLogit({
      trajectoryClass,
      exitVelocity: velocity,
      adjustedMarginSec: adjustedActualMargin,
    }) +
      config.actualAbility.secureFieldingLogitPerStandardizedPoint *
        standardizedFielding
  );
  const pActualOut = pReachActual * pSecureActual;

  return {
    standardizedSpeed,
    standardizedFielding,
    speedMultiplier,
    routeMultiplier,
    reactionTimeActual,
    moveSpeedActual,
    fielderEtaActual,
    adjustedActualMargin,
    pReachActual,
    pSecureActual,
    pActualOut,
  };
}
