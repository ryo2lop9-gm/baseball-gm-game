import {
  BATTED_BALL_DEFENSE_CONFIG,
  BATTED_BALL_DEFENSE_MODES,
} from "../../config/defenseProbabilityConfig.js";
import { DEFENSE_POSITIONS } from "../../config/defenseConfig.js";
import { RESOLUTION_AUTHORITY_CONFIG } from "../../config/resolutionAuthorityConfig.js";
import {
  buildDefenseOpportunity,
} from "./defenseOpportunityService.js";
import { calculateDefenseAbilityProbabilities } from "./defenseAbilityProbabilityService.js";
import {
  createSeededRandom,
  deriveNamespacedSeed,
} from "../seededRandomService.js";

function defenseError(code, message, context = {}) {
  const error = new Error(message);
  error.code = code;
  error.context = context;
  return error;
}

function getPlayerId(player) {
  return player?.profile?.id || player?.id || null;
}

function assertRating(field, value) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 100
  ) {
    throw defenseError(
      "BATTED_BALL_DEFENSE_INPUT_INVALID",
      `Defense ${field} rating is invalid.`,
      { field, value }
    );
  }
  return value;
}

function validateActiveDefense(activeDefense) {
  if (
    !activeDefense ||
    typeof activeDefense !== "object" ||
    Array.isArray(activeDefense)
  ) {
    throw defenseError(
      "BATTED_BALL_DEFENSE_ACTIVE_DEFENSE_REQUIRED",
      "Defense Shadow requires an Active Defense.",
      { activeDefense }
    );
  }
  const positions = Object.keys(activeDefense);
  if (
    positions.length !== DEFENSE_POSITIONS.length ||
    DEFENSE_POSITIONS.some(
      (position) => !Object.hasOwn(activeDefense, position)
    )
  ) {
    throw defenseError(
      "BATTED_BALL_DEFENSE_ACTIVE_DEFENSE_REQUIRED",
      "Defense Shadow requires all nine Active Defense positions.",
      { positions }
    );
  }
  const playerIds = new Set();
  for (const position of DEFENSE_POSITIONS) {
    const player = activeDefense[position];
    const playerId = getPlayerId(player);
    if (
      !player ||
      typeof playerId !== "string" ||
      playerId.length === 0 ||
      playerIds.has(playerId)
    ) {
      throw defenseError(
        "BATTED_BALL_DEFENSE_ACTIVE_DEFENSE_REQUIRED",
        "Active Defense player identity is invalid.",
        { position, playerId }
      );
    }
    playerIds.add(playerId);
    assertRating("speed", player?.ratings?.speed);
    assertRating("fielding", player?.defense?.fielding);
    assertRating("arm", player?.defense?.arm);
  }
  return activeDefense;
}

function validateDefenseSeed(defenseSeed) {
  if (
    typeof defenseSeed !== "number" ||
    !Number.isFinite(defenseSeed) ||
    !Number.isInteger(defenseSeed) ||
    defenseSeed < 0 ||
    defenseSeed > 0xffffffff
  ) {
    throw defenseError(
      "BATTED_BALL_DEFENSE_SEED_REQUIRED",
      "Defense Shadow requires a valid independent seed.",
      { defenseSeed }
    );
  }
  return defenseSeed >>> 0;
}

function drawDefenseRoll(defenseSeed, battedBallEventId, stageNamespace) {
  const stageSeed = deriveNamespacedSeed(
    defenseSeed,
    `${battedBallEventId}:${stageNamespace}`
  );
  return createSeededRandom(stageSeed)();
}

function assertProbability(name, value) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 1
  ) {
    throw defenseError(
      "BATTED_BALL_DEFENSE_OUTPUT_INVALID",
      `Defense output probability ${name} is invalid.`,
      { name, value }
    );
  }
}

function assertEligibleOutput(event) {
  for (const [name, value] of Object.entries(event.probabilities)) {
    assertProbability(name, value);
  }
  for (const [name, value] of Object.entries(event.metrics)) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw defenseError(
        "BATTED_BALL_DEFENSE_OUTPUT_INVALID",
        `Defense output metric ${name} is invalid.`,
        { name, value }
      );
    }
  }
  const epsilon = 1e-12;
  if (
    Math.abs(
      event.probabilities.pActualOut -
        event.probabilities.pReachActual *
          event.probabilities.pSecureActual
    ) > epsilon ||
    Math.abs(
      event.metrics.simCatchOAA -
        (event.metrics.expectedSkillOuts +
          event.metrics.executionResidual)
    ) > epsilon ||
    Math.abs(
      event.metrics.teamOAA_vsStandard -
        (event.metrics.teamExecutionOAA +
          event.metrics.positioningExpectedOuts)
    ) > epsilon
  ) {
    throw defenseError(
      "BATTED_BALL_DEFENSE_OUTPUT_INVALID",
      "Defense output identity validation failed."
    );
  }
  return event;
}

function createBaseEvent({ mode, battedBallEventId, geometryShadow, directionShadow }) {
  return {
    mode,
    model: BATTED_BALL_DEFENSE_CONFIG.model,
    source: BATTED_BALL_DEFENSE_CONFIG.source,
    confidence: null,
    defenseEventSchemaVersion:
      BATTED_BALL_DEFENSE_CONFIG.defenseEventSchemaVersion,
    battedBallEventId: battedBallEventId ?? null,
    eligible: false,
    exclusionReason: mode === "off" ? "mode_off" : null,
    playType: null,
    trajectoryClass: geometryShadow?.trajectoryClass ?? null,
    fieldSector: directionShadow?.fieldSector ?? null,
    alignmentModel: BATTED_BALL_DEFENSE_CONFIG.alignmentModel,
    alignmentComparisonAvailable: false,
    responsibleFielder: null,
    movementDirection: null,
    ratings: null,
    timing: null,
    probabilities: null,
    shadowCatchResult: null,
    metrics: null,
    authority: RESOLUTION_AUTHORITY_CONFIG,
    shadowAuthority: BATTED_BALL_DEFENSE_CONFIG.shadowAuthority,
    defenseRngCalls: 0,
    fallbackUsed: false,
  };
}

export function generateDefenseShadow({
  mode = BATTED_BALL_DEFENSE_CONFIG.defaultMode,
  battedBallEventId,
  geometryShadow,
  directionShadow,
  activeDefense,
  defenseSeed,
}) {
  if (!BATTED_BALL_DEFENSE_MODES.includes(mode)) {
    throw defenseError(
      "BATTED_BALL_DEFENSE_INPUT_INVALID",
      "Defense mode is invalid.",
      { mode }
    );
  }
  const base = createBaseEvent({
    mode,
    battedBallEventId,
    geometryShadow,
    directionShadow,
  });
  if (mode === BATTED_BALL_DEFENSE_CONFIG.defaultMode) return base;

  const opportunity = buildDefenseOpportunity({
    geometryShadow,
    directionShadow,
  });
  if (battedBallEventId !== geometryShadow.battedBallEventId) {
    throw defenseError(
      "BATTED_BALL_DEFENSE_INPUT_INVALID",
      "Defense and Geometry event IDs must match.",
      {
        battedBallEventId,
        geometryEventId: geometryShadow.battedBallEventId,
      }
    );
  }
  const safeDefense = validateActiveDefense(activeDefense);
  const safeDefenseSeed = validateDefenseSeed(defenseSeed);
  if (opportunity.eligible === false) {
    return {
      ...base,
      mode: BATTED_BALL_DEFENSE_CONFIG.shadowMode,
      trajectoryClass: opportunity.trajectoryClass,
      fieldSector: opportunity.fieldSector,
      exclusionReason: opportunity.exclusionReason,
    };
  }

  const average = opportunity.responsibleCandidate;
  const player = safeDefense[average.position];
  const playerId = getPlayerId(player);
  const speed = assertRating("speed", player.ratings.speed);
  const fielding = assertRating("fielding", player.defense.fielding);
  const arm = assertRating("arm", player.defense.arm);
  const ability = calculateDefenseAbilityProbabilities({
    trajectoryClass: opportunity.trajectoryClass,
    exitVelocity: geometryShadow.exitVelocity,
    pathDistanceFt: average.pathDistanceFt,
    ballTimeSec: average.ballTimeSec,
    movementDirection: average.movementDirection,
    speed,
    fielding,
  });
  const {
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
  } = ability;
  const config = BATTED_BALL_DEFENSE_CONFIG;
  const pAlignedAverageOut = average.pCatchAverage;
  const pStandardAlignmentOut = pAlignedAverageOut;

  const reachRoll = drawDefenseRoll(
    safeDefenseSeed,
    battedBallEventId,
    config.rngNamespaces.reach
  );
  const secureRoll = drawDefenseRoll(
    safeDefenseSeed,
    battedBallEventId,
    config.rngNamespaces.secure
  );
  const reachSuccess = reachRoll < pReachActual;
  const secureAttempted = reachSuccess;
  const secureSuccess = reachSuccess
    ? secureRoll < pSecureActual
    : null;
  const caught = reachSuccess && secureSuccess === true;
  const caughtValue = caught ? 1 : 0;
  const simCatchOAA = caughtValue - pAlignedAverageOut;
  const expectedSkillOuts = pActualOut - pAlignedAverageOut;
  const executionResidual = caughtValue - pActualOut;
  const teamOAA_vsStandard = caughtValue - pStandardAlignmentOut;
  const teamExecutionOAA = caughtValue - pAlignedAverageOut;
  const positioningExpectedOuts =
    pAlignedAverageOut - pStandardAlignmentOut;

  return assertEligibleOutput({
    ...base,
    mode: BATTED_BALL_DEFENSE_CONFIG.shadowMode,
    eligible: true,
    exclusionReason: null,
    playType: "simple_catch",
    trajectoryClass: opportunity.trajectoryClass,
    fieldSector: opportunity.fieldSector,
    responsibleFielder: {
      position: average.position,
      playerId,
      playerName: player.name ?? player.profile?.name ?? null,
    },
    movementDirection: average.movementDirection,
    ratings: {
      speed,
      fielding,
      arm,
      standardizedSpeed,
      standardizedFielding,
    },
    timing: {
      pathDistanceFt: average.pathDistanceFt,
      ballTimeSec: average.ballTimeSec,
      fielderEtaAverage: average.fielderEtaAverage,
      adjustedAverageMargin: average.adjustedAverageMargin,
      directionMarginAdjustmentSec:
        average.directionMarginAdjustmentSec,
      speedMultiplier,
      routeMultiplier,
      reactionTimeActual,
      moveSpeedActual,
      fielderEtaActual,
      adjustedActualMargin,
    },
    probabilities: {
      pReachAverage: average.pReachAverage,
      pSecureAverage: average.pSecureAverage,
      pStandardAlignmentOut,
      pAlignedAverageOut,
      pReachActual,
      pSecureActual,
      pActualOut,
    },
    shadowCatchResult: {
      reachRoll,
      secureRoll,
      reachSuccess,
      secureAttempted,
      secureSuccess,
      caught,
    },
    metrics: {
      simCatchOAA,
      expectedSkillOuts,
      executionResidual,
      teamOAA_vsStandard,
      teamExecutionOAA,
      positioningExpectedOuts,
    },
    defenseRngCalls: 2,
  });
}
