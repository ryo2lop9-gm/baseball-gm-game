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

/**
 * engineCore.js の責務
 * - 1球進行 / 試合進行
 * - state mutation
 *
 * 走者進塁・得点・イニング遷移は services に退避。
 * 打席結果分岐は services に退避。
 * 打球結果分岐は services に退避。
 * 投手交代判定は services に退避。
 * state helper / pitch helper も services に退避。
 * 確率テーブルや計算式は config / services に退避済み。
 */

function random() {
  return Math.random();
}

function emitLog(options, text) {
  if (typeof options?.onLog !== "function") return;
  options.onLog(text);
}

function emitLastPitchPatch(options, patch) {
  if (typeof options?.onLastPitchPatch !== "function") return;
  options.onLastPitchPatch(patch);
}

function addPlateAppearanceStat(batter) {
  batter.gameStats.PA += 1;
}

function addStrikeoutStat(batter) {
  batter.gameStats.K += 1;
}

function addWalkStat(batter, rbi = 0) {
  batter.gameStats.BB += 1;
  batter.gameStats.RBI += rbi;
}

function addHitStat(batter, hitType, rbi = 0) {
  batter.gameStats.AB += 1;
  batter.gameStats.H += 1;
  batter.gameStats.RBI += rbi;

  if (hitType === "2B") batter.gameStats.doubles += 1;
  if (hitType === "3B") batter.gameStats.triples += 1;
  if (hitType === "HR") batter.gameStats.HR += 1;
}

function addOutInPlayStat(batter) {
  batter.gameStats.AB += 1;
}

function addQoCToBox(state, qoc) {
  const side = currentSide(state);
  if (!state.box?.[side]?.qoc) return;
  state.box[side].qoc[qoc] = (state.box[side].qoc[qoc] || 0) + 1;
}

function resolveQoCResult(state, batter, course, pitchType, qoc, options) {
  const side = currentSide(state);

  resolveContactResult({
    state,
    batter,
    side,
    pitchType,
    qoc,
    options,
    random,
    addQoCToBox,
    addOutInPlayStat,
    addHitStat,
    advanceRunnersOnHit,
    maybeEndGameMidInning,
    moveToNextBatter,
    finishPlateAppearanceState,
    emitLog,
    emitLastPitchPatch,
  });
}

function beginPlateAppearanceIfNeeded(state) {
  if (state.plateAppearanceActive) return;
  const batter = pickBatter(state);
  addPlateAppearanceStat(batter);
  state.plateAppearanceActive = true;
}

function finishPlateAppearanceState(state, options) {
  const side = defenseSide(state);
  if (state.pitcherUsage?.[side]) state.pitcherUsage[side].battersFaced += 1;
  state.plateAppearanceActive = false;
  resetCount(state);
  maybeAutoChangePitcher(state, {
    defenseSide,
    emitLog: (text) => emitLog(options, text),
    betweenInnings: false,
  });
}

export function createFastSimulationOptions() {
  return {};
}

export function stepPitchMutable(state, rawOptions = {}) {
  const options = { ...rawOptions };
  if (state.isComplete) return state;

  beginPlateAppearanceIfNeeded(state);

  const batter = pickBatter(state);
  const pitcher = defensePitcher(state);
  const pitcherUsage = defensePitcherUsage(state);
  const side = currentSide(state);
  const outsBefore = state.outs;

  if (pitcherUsage) pitcherUsage.pitches += 1;

  const {
    pitchType,
    course,
    probs,
    isStrike,
    swung,
    zoneRow,
    zoneCol,
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

  emitLastPitchPatch(options, {
    pitchType,
    course,
    isStrike,
    swung,
    madeContact: false,
    resultText: "",
    zoneRow,
    zoneCol,
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
    options,
    random,
    emitLog,
    emitLastPitchPatch,
    addStrikeoutStat,
    addWalkStat,
    applyWalkAdvance,
    maybeEndGameMidInning,
    moveToNextBatter,
    finishPlateAppearanceState,
    resolveQoCResult,
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

export function simulateGameMutable(state, options = createFastSimulationOptions()) {
  while (!state.isComplete) {
    stepPitchMutable(state, options);
  }
  return state;
}