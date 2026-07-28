import { getEvLaOutcomeProbabilities } from "./evLaOutcomeService.js";
import { getLoadedEvLaLookup } from "./evLaLookupStore.js";

function createSelectionError(code, message, context) {
  const error = new Error(message);
  error.code = code;
  error.context = context;
  return error;
}

function buildSelectionContext({ state, batter, pitchType, course }) {
  return {
    batter: batter?.name || batter?.id || "unknown",
    pitchType: pitchType || "unknown",
    course: course || "unknown",
    inning: Number(state?.inning) || null,
    half: state?.half || null,
    balls: Number.isFinite(Number(state?.balls)) ? Number(state.balls) : null,
    strikes: Number.isFinite(Number(state?.strikes))
      ? Number(state.strikes)
      : null,
  };
}

export function selectOutcomeFromProbabilities(probabilities, roll) {
  const outCut = probabilities.out;
  const singleCut = outCut + probabilities.single;
  const doubleCut = singleCut + probabilities.double;
  const tripleCut = doubleCut + probabilities.triple;

  return roll < outCut
    ? "out"
    : roll < singleCut
      ? "single"
      : roll < doubleCut
        ? "double"
        : roll < tripleCut
          ? "triple"
          : "homeRun";
}

export function selectBattedBallOutcome({
  state,
  batter,
  pitchType,
  course,
  battedBall,
  random,
}) {
  const context = buildSelectionContext({
    state,
    batter,
    pitchType,
    course,
  });
  const hasValidBattedBall =
    battedBall &&
    Number.isFinite(Number(battedBall.exitVelocity)) &&
    Number.isFinite(Number(battedBall.launchAngle));

  if (!hasValidBattedBall) {
    throw createSelectionError(
      "BATTED_BALL_MISSING",
      `Fair-ball EV/LA is missing for ${context.batter}.`,
      context
    );
  }

  const lookup = getLoadedEvLaLookup();
  if (!lookup) {
    throw createSelectionError(
      "EV_LA_LOOKUP_NOT_READY",
      `EV/LA lookup is not ready for ${context.batter}.`,
      context
    );
  }

  const outcomeModel = getEvLaOutcomeProbabilities({
    exitVelocity: battedBall.exitVelocity,
    launchAngle: battedBall.launchAngle,
    lookup,
  });
  const outcomeRoll = random();

  return {
    selectedOutcome: selectOutcomeFromProbabilities(
      outcomeModel.probabilities,
      outcomeRoll
    ),
    probabilities: outcomeModel.probabilities,
    outcomeRoll,
    source: outcomeModel.source,
    key: outcomeModel.key,
    sampleQuality: outcomeModel.sampleQuality,
    smoothing: outcomeModel.smoothing,
  };
}
