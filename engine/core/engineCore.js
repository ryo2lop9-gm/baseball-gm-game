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

function emitPitchMeasurement(options, event) {
  if (typeof options?.onPitchMeasurement !== "function") return;
  options.onPitchMeasurement(event);
}

function getEntityKey(entity, fallback) {
  return entity?.profile?.id || entity?.id || fallback;
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

  return resolveContactResult({
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
  if (typeof runtime.onPitchMeasurement === "function") {
    options.onPitchMeasurement = runtime.onPitchMeasurement;
  }
  if (runtime.directionMode === "off" || runtime.directionMode === "shadow") {
    options.directionMode = runtime.directionMode;
  }
  if (typeof runtime.directionRandom === "function") {
    options.directionRandom = runtime.directionRandom;
  }
  if (typeof runtime.gameKey === "string" && runtime.gameKey.length > 0) {
    options.gameKey = runtime.gameKey;
  }

  return options;
}

export function stepPitchMutable(state, rawOptions = {}) {
  const options = { ...rawOptions };
  const random =
    typeof options.random === "function" ? options.random : Math.random;
  if (state.isComplete) return state;
  if (state.pitchSequence === undefined) {
    state.pitchSequence = 0;
  }
  if (!Number.isInteger(state.pitchSequence) || state.pitchSequence < 0) {
    const error = new Error("Pitch sequence must be a nonnegative integer.");
    error.code = "PITCH_SEQUENCE_INVALID";
    error.context = { pitchSequence: state.pitchSequence };
    throw error;
  }
  state.pitchSequence += 1;

  beginPlateAppearanceIfNeeded(state, {
    pickBatter,
    addPlateAppearanceStat,
  });

  const batter = pickBatter(state);
  const pitcher = defensePitcher(state);
  const pitcherUsage = defensePitcherUsage(state);
  const side = currentSide(state);
  const fieldingSide = defenseSide(state);
  const lineup = side === "away" ? state.awayTeam.lineup : state.homeTeam.lineup;
  const lineupIndex = state.battingIndex[side] % lineup.length;
  const ballsBefore = state.balls;
  const strikesBefore = state.strikes;
  const scoreBefore = Number(state.score?.[side]) || 0;
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
    actualPoint,
    normalizedX,
    normalizedZ,
    normalizedRadius,
    normalizedZoneEdgeDistance,
    actualIsZone,
    attackRegion,
    attackRegionDetail,
    shadowSide,
    isMeatball,
    zoneRow,
    zoneCol,
    locationCourse,
    locationModel,
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
  });

  options.pitchVelocity = pitchVelocity;
  const defenseTeam = fieldingSide === "away" ? state.awayTeam : state.homeTeam;
  const startingPitcher = defenseTeam?.startingPitcher;
  const isStartingPitcher =
    getEntityKey(pitcher, pitcher?.name) ===
    getEntityKey(startingPitcher, startingPitcher?.name);
  const shouldMeasurePitch =
    typeof options.onPitchMeasurement === "function" ||
    typeof options.onBattedBallMeasurement === "function";
  options.pitchMeasurementContext = shouldMeasurePitch
    ? {
        battingSide: side,
        defenseSide: fieldingSide,
        batterKey: getEntityKey(batter, `${side}:lineup:${lineupIndex}`),
        batterName: batter?.name || "-",
        batterRatings: batter?.ratings || {},
        lineupIndex,
        pitcherKey: getEntityKey(
          pitcher,
          `${fieldingSide}:pitcher:${pitcher?.name || "unknown"}`
        ),
        pitcherName: pitcher?.name || "-",
        pitcherRole: isStartingPitcher ? "starter" : "reliever",
        pitcherRatings: pitcher?.ratings || {},
        pitchMix: pitcher?.pitchMix || {},
        ballsBefore,
        strikesBefore,
        inning: state.inning,
        half: state.half,
        outsBefore,
        pitchType,
        pitchVelocity,
        baseCourse,
        course,
        isStrike,
        swung,
        actualPoint,
        normalizedX,
        normalizedZ,
        normalizedRadius,
        normalizedZoneEdgeDistance,
        actualIsZone,
        attackRegion,
        attackRegionDetail,
        shadowSide,
        isMeatball,
        zoneRow,
        zoneCol,
        locationCourse,
        locationModel,
        strikeType,
        ballType,
        obviousBall,
        edgeBall,
        chaseableBall,
        isMistake,
        drift,
      }
    : null;

  emitLastPitchPatch(options, {
    pitchType,
    pitchVelocity,
    baseCourse,
    course,
    isStrike,
    swung,
    madeContact: false,
    resultText: "",
    actualPoint,
    normalizedX,
    normalizedZ,
    normalizedRadius,
    normalizedZoneEdgeDistance,
    actualIsZone,
    attackRegion,
    attackRegionDetail,
    shadowSide,
    isMeatball,
    zoneRow,
    zoneCol,
    locationCourse,
    locationModel,

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

  const pitchResolution = resolvePlateAppearanceResult({
    state,
    batter,
    pitcher,
    side,
    pitchType,
    course,
    probs,
    isStrike,
    swung,
    normalizedX,
    normalizedZ,
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

  if (typeof options.onPitchMeasurement === "function") {
    emitPitchMeasurement(options, {
      ...options.pitchMeasurementContext,
      madeContact: Boolean(pitchResolution?.madeContact),
      pitchResult: pitchResolution?.pitchResult || "unknown",
      paResult: pitchResolution?.paResult || null,
      strikeoutType: pitchResolution?.strikeoutType || null,
      runsScored: Math.max(0, (Number(state.score?.[side]) || 0) - scoreBefore),
    });
  }

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
