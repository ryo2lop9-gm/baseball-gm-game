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

/**
 * engineCore.js の責務
 * - 1球進行 / 試合進行
 * - state mutation
 *
 * 走者進塁・得点・イニング遷移は services に退避。
 * 打席結果分岐は services に退避。
 * 打球結果分岐は services に退避。
 * 確率テーブルや計算式は config / services に退避済み。
 */

function random() {
  return Math.random();
}

function currentSide(state) {
  return state.half === "top" ? "away" : "home";
}

function defenseSide(state) {
  return currentSide(state) === "away" ? "home" : "away";
}

function offenseTeam(state) {
  return currentSide(state) === "away" ? state.awayTeam : state.homeTeam;
}

function defensePitcher(state) {
  const side = defenseSide(state);
  return (
    state.activePitchers?.[side] ||
    (side === "away" ? state.awayTeam.startingPitcher : state.homeTeam.startingPitcher)
  );
}

function defensePitcherUsage(state) {
  const side = defenseSide(state);
  return state.pitcherUsage?.[side] || null;
}

function pickBatter(state) {
  const side = currentSide(state);
  const team = offenseTeam(state);
  const index = state.battingIndex[side] % team.lineup.length;
  return team.lineup[index];
}

function moveToNextBatter(state) {
  const side = currentSide(state);
  state.battingIndex[side] = (state.battingIndex[side] + 1) % 9;
}

function resetCount(state) {
  state.balls = 0;
  state.strikes = 0;
}

function clearBases(state) {
  state.bases.first = null;
  state.bases.second = null;
  state.bases.third = null;
}

function createPitcherUsageEntry(pitcher, inning) {
  return {
    pitcherName: pitcher?.name || "-",
    pitches: 0,
    battersFaced: 0,
    outsRecorded: 0,
    enteredInning: inning || 1,
  };
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

function choosePitchType(pitcher) {
  const mix = pitcher?.pitchMix || {
    fourSeam: 0.45,
    slider: 0.25,
    curve: 0.12,
    fork: 0.18,
  };

  const roll = random();
  let cumulative = 0;

  for (const key of ["fourSeam", "slider", "curve", "fork"]) {
    cumulative += mix[key] || 0;
    if (roll <= cumulative) return key;
  }

  return "fourSeam";
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
  maybeAutoChangePitcher(state, options, false);
}

function changePitcher(state, side, options, reasonText = "") {
  const team = side === "away" ? state.awayTeam : state.homeTeam;
  if (!team?.bullpen || team.bullpen.length === 0) return false;

  const nextPitcher = structuredClone(team.bullpen.shift());
  const previousPitcher = state.activePitchers?.[side] || team.startingPitcher;

  if (!state.activePitchers) {
    state.activePitchers = {
      away: state.awayTeam.startingPitcher,
      home: state.homeTeam.startingPitcher,
    };
  }

  state.activePitchers[side] = nextPitcher;

  if (!state.pitcherUsage) {
    state.pitcherUsage = {
      away: createPitcherUsageEntry(state.activePitchers.away, state.inning),
      home: createPitcherUsageEntry(state.activePitchers.home, state.inning),
    };
  }

  state.pitcherUsage[side] = createPitcherUsageEntry(nextPitcher, state.inning);

  const teamLabel = side === "away" ? state.awayTeam.name : state.homeTeam.name;
  emitLog(
    options,
    `${teamLabel}: 投手交代 ${previousPitcher?.name || "-"} → ${nextPitcher?.name || "-"}${reasonText ? `（${reasonText}）` : ""}`
  );

  return true;
}

function maybeAutoChangePitcher(state, options, betweenInnings = false) {
  const side = defenseSide(state);
  const usage = state.pitcherUsage?.[side];
  const team = side === "away" ? state.awayTeam : state.homeTeam;

  if (!usage || (team?.bullpen || []).length === 0) return false;

  const shouldChange =
    usage.pitches >= (betweenInnings ? 75 : 95) ||
    usage.battersFaced >= (betweenInnings ? 21 : 27);

  if (!shouldChange) return false;
  return changePitcher(state, side, options, `${usage.pitches}球`);
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

  const pitchType = choosePitchType(pitcher);
  const course = chooseCourse(pitcher, random);
  const probs = calcPitchOutcomeProbabilities(
    batter,
    pitcher,
    course,
    pitchType,
    state.balls,
    state.strikes
  );

  const isStrike = random() < probs.strikeRate;
  const swingRate = isStrike ? probs.zSwingRate : probs.oSwingRate;
  const swung = random() < swingRate;

  const [zoneRow, zoneCol] =
    typeof options.onLastPitchPatch === "function"
      ? chooseZoneSpot(course, isStrike)
      : [null, null];

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
      maybeAutoChangePitcher(state, options, betweenInnings),
  });

  return state;
}

export function simulateGameMutable(state, options = createFastSimulationOptions()) {
  while (!state.isComplete) {
    stepPitchMutable(state, options);
  }
  return state;
}