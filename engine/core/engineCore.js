import { chooseZoneSpot } from "../../services/zoneService.js";
import {
  chooseCourse,
  calcPitchOutcomeProbabilities,
} from "../../services/pitchOutcomeService.js";
import {
  applyWalkAdvance,
  advanceRunnersOnHit,
} from "../../services/baseRunningService.js";
import {
  maybeEndGameMidInning,
  maybeChangeSides,
} from "../../services/inningStateService.js";
import { resolvePlateAppearanceResult } from "../../services/plateAppearanceService.js";
import { resolveContactResult } from "../../services/contactResolutionService.js";
import { maybeAutoChangePitcher } from "../../services/pitchingChangeService.js";
import {
  currentSide,
  defenseSide,
  defensePitcher,
  defensePitcherUsage,
  pickBatter,
  moveToNextBatter,
  resetCount,
  clearBases,
} from "../../services/gameStateHelperService.js";
import { buildPitchExecutionContext } from "../../services/pitchExecutionService.js";
import {
  beginPlateAppearanceIfNeeded,
  finishPlateAppearanceState,
} from "../../services/plateAppearanceStateService.js";
import { addQoCToBox } from "../../services/boxScoreService.js";
import {
  addPlateAppearanceStat,
  addStrikeoutStat,
  addWalkStat,
  addHitStat,
  addOutInPlayStat,
} from "../../services/statsUpdateService.js";

function emitLog(options, text) {
  if (typeof options?.onLog !== "function") return;
  options.onLog(text);
}

function emitLastPitchPatch(options, patch) {
  if (typeof options?.onLastPitchPatch !== "function") return;
  options.onLastPitchPatch(patch);
}

// qoc is a derived label carried into logs/analysis only.
// The contact resolver always chooses outcomes from the generated EV/LA.
function resolveBattedBallResult(
  state,
  batter,
  course,
  pitchType,
  qoc,
  options,
  battedBall = null
) {
  const side = currentSide(state);
  const pitchVelocity = options?.pitchVelocity ?? null;

  resolveContactResult({
    state,
    batter,
    side,
    pitchType,
    course,
    pitchVelocity,
    qoc,
    battedBall,
    options,
    random:
      typeof options?.random === "function" ? options.random : Math.random,
    addQoCToBox: (runtimeState, runtimeQoc) =>
      addQoCToBox(runtimeState, runtimeQoc, { currentSide }),
    addOutInPlayStat,
    addHitStat,
    advanceRunnersOnHit,
    maybeEndGameMidInning,
    moveToNextBatter,
    finishPlateAppearanceState: (runtimeState, runtimeOptions) =>
      finishPlateAppearanceState(runtimeState, {
        defenseSide,
        resetCount,
        maybeAutoChangePitcher,
        emitLog,
        options: runtimeOptions,
      }),
    emitLog,
    emitLastPitchPatch,
  });
}

export function createFastSimulationOptions(runtime = {}) {
  const options = {};

  if (typeof runtime.random === "function") {
    options.random = runtime.random;
  }
  if (typeof runtime.onBattedBallMeasurement === "function") {
    options.onBattedBallMeasurement = runtime.onBattedBallMeasurement;
  }

  return options;
}

export function stepPitchMutable(state, rawOptions = {}) {
  const options = { ...rawOptions };
  const random =
    typeof options.random === "function" ? options.random : Math.random;
  if (state.isComplete) return state;

  beginPlateAppearanceIfNeeded(state, {
    pickBatter,
    addPlateAppearanceStat,
  });

  const batter = pickBatter(state);
  const pitcher = defensePitcher(state);
  const pitcherUsage = defensePitcherUsage(state);
  const side = currentSide(state);
  const outsBefore = state.outs;

  if (pitcherUsage) pitcherUsage.pitches += 1;

  const {
    pitchType,
    pitchVelocity,
    baseCourse,
    course,
    probs,
    isStrike,
    swung,
    zoneRow,
    zoneCol,
    strikeType,
    strikeTypeLabel,
    strikeJudgeDifficulty,
    borderLikelihood,
    ballType,
    ballTypeLabel,
    obviousBall,
    edgeBall,
    chaseableBall,
    targetObviousBallRate,
    targetEdgeBallRate,
    targetChaseableBallRate,
    targetEdgeHighRate,
    rawOSwingRate,
    adjustedOSwingRate,
    mistakeRate,
    isMistake,
    drift,
  } = buildPitchExecutionContext({
    batter,
    pitcher,
    balls: state.balls,
    strikes: state.strikes,
    random,
    chooseCourse,
    calcPitchOutcomeProbabilities,
    chooseZoneSpot,
    shouldPatchLastPitch: typeof options.onLastPitchPatch === "function",
  });

  options.pitchVelocity = pitchVelocity;

  emitLastPitchPatch(options, {
    pitchType,
    pitchVelocity,
    baseCourse,
    course,
    isStrike,
    swung,
    madeContact: false,
    resultText: "",
    zoneRow,
    zoneCol,

    strikeType,
    strikeTypeLabel,
    strikeJudgeDifficulty,
    borderLikelihood,

    ballType,
    ballTypeLabel,
    obviousBall,
    edgeBall,
    chaseableBall,
    targetObviousBallRate,
    targetEdgeBallRate,
    targetChaseableBallRate,
    targetEdgeHighRate,

    rawOSwingRate: rawOSwingRate ?? probs?.rawOSwingRate ?? null,
    adjustedOSwingRate:
      adjustedOSwingRate ?? probs?.adjustedOSwingRate ?? null,

    mistakeRate: mistakeRate ?? null,
    isMistake: isMistake ?? false,
    drift: drift ?? 0,
  });

  resolvePlateAppearanceResult({
    state,
    batter,
    side,
    pitchType,
    course,
    probs,
    isStrike,
    swung,
    strikeType,
    strikeTypeLabel,
    strikeJudgeDifficulty,
    borderLikelihood,
    ballType,
    ballTypeLabel,
    obviousBall,
    edgeBall,
    chaseableBall,
    targetObviousBallRate,
    targetEdgeBallRate,
    targetChaseableBallRate,
    targetEdgeHighRate,
    options,
    random,
    emitLog,
    emitLastPitchPatch,
    addStrikeoutStat,
    addWalkStat,
    applyWalkAdvance,
    maybeEndGameMidInning,
    moveToNextBatter,
    finishPlateAppearanceState: (runtimeState, runtimeOptions) =>
      finishPlateAppearanceState(runtimeState, {
        defenseSide,
        resetCount,
        maybeAutoChangePitcher,
        emitLog,
        options: runtimeOptions,
      }),
    resolveBattedBallResult,
  });

  const deltaOuts = Math.max(0, state.outs - outsBefore);
  if (pitcherUsage) pitcherUsage.outsRecorded += deltaOuts;

  maybeChangeSides(state, {
    emitLog: (text) => emitLog(options, text),
    resetCount: () => resetCount(state),
    clearBases: () => clearBases(state),
    maybeAutoChangePitcher: (betweenInnings) =>
      maybeAutoChangePitcher(state, {
        defenseSide,
        emitLog: (text) => emitLog(options, text),
        betweenInnings,
      }),
  });

  return state;
}

export function simulateGameMutable(
  state,
  options = createFastSimulationOptions()
) {
  while (!state.isComplete) {
    stepPitchMutable(state, options);
  }
  return state;
}
