import { getPitchTypeAdjustments, getPitchTypeLabel } from "../../config/pitchConfig.js";
import { getHitTypeProbabilities } from "../../config/hitOutcomeConfig.js";
import { chooseQoC } from "../../services/qocService.js";
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

/**
 * engineCore.js の責務
 * - 1球進行 / 試合進行
 * - state mutation
 * - 走者進塁・得点・イニング遷移
 *
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
  const probs = getHitTypeProbabilities(qoc);
  const roll = random();

  addQoCToBox(state, qoc);

  const outCut = probs.out;
  const singleCut = outCut + probs.single;
  const doubleCut = singleCut + probs.double;
  const tripleCut = doubleCut + probs.triple;

  if (roll < outCut) {
    state.outs += 1;
    state.box[side].outsInPlay += 1;
    addOutInPlayStat(batter);
    emitLastPitchPatch(options, { resultText: `${qoc} / 凡打` });
    emitLog(options, `${batter.name}: ${getPitchTypeLabel(pitchType)}を${qoc}で凡打。`);
    moveToNextBatter(state);
    finishPlateAppearanceState(state, options);
  } else if (roll < singleCut) {
    state.box[side].hits += 1;
    const runs = advanceRunnersOnHit(state, batter, 1);
    addHitStat(batter, "1B", runs);
    emitLastPitchPatch(options, { resultText: `${qoc} / 安打` });
    emitLog(
      options,
      `${batter.name}: ${getPitchTypeLabel(pitchType)}を${qoc}で安打。${runs > 0 ? `${runs}点` : ""}`
    );
    moveToNextBatter(state);
    finishPlateAppearanceState(state, options);
    maybeEndGameMidInning(state, {
      emitLog: (text) => emitLog(options, text),
    });
  } else if (roll < doubleCut) {
    state.box[side].hits += 1;
    state.box[side].doubles += 1;
    const runs = advanceRunnersOnHit(state, batter, 2);
    addHitStat(batter, "2B", runs);
    emitLastPitchPatch(options, { resultText: `${qoc} / 二塁打` });
    emitLog(
      options,
      `${batter.name}: ${getPitchTypeLabel(pitchType)}を${qoc}で二塁打。${runs > 0 ? `${runs}点` : ""}`
    );
    moveToNextBatter(state);
    finishPlateAppearanceState(state, options);
    maybeEndGameMidInning(state, {
      emitLog: (text) => emitLog(options, text),
    });
  } else if (roll < tripleCut) {
    state.box[side].hits += 1;
    state.box[side].triples += 1;
    const runs = advanceRunnersOnHit(state, batter, 3);
    addHitStat(batter, "3B", runs);
    emitLastPitchPatch(options, { resultText: `${qoc} / 三塁打` });
    emitLog(
      options,
      `${batter.name}: ${getPitchTypeLabel(pitchType)}を${qoc}で三塁打。${runs > 0 ? `${runs}点` : ""}`
    );
    moveToNextBatter(state);
    finishPlateAppearanceState(state, options);
    maybeEndGameMidInning(state, {
      emitLog: (text) => emitLog(options, text),
    });
  } else {
    state.box[side].hits += 1;
    state.box[side].hr += 1;
    const runs = advanceRunnersOnHit(state, batter, 4);
    addHitStat(batter, "HR", runs);
    emitLastPitchPatch(options, { resultText: `${qoc} / 本塁打` });
    emitLog(options, `${batter.name}: ${getPitchTypeLabel(pitchType)}を${qoc}で本塁打。${runs}点`);
    moveToNextBatter(state);
    finishPlateAppearanceState(state, options);
    maybeEndGameMidInning(state, {
      emitLog: (text) => emitLog(options, text),
    });
  }
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

  if (!swung) {
    if (isStrike) {
      state.strikes += 1;
      emitLog(options, `${batter.name}: 見逃しストライク (${state.balls}-${state.strikes})`);

      if (state.strikes >= 3) {
        state.box[side].strikeouts += 1;
        addStrikeoutStat(batter);
        batter.gameStats.AB += 1;
        state.outs += 1;
        emitLastPitchPatch(options, { resultText: "見逃し三振" });
        emitLog(options, `${batter.name}: 三振`);
        moveToNextBatter(state);
        finishPlateAppearanceState(state, options);
      }
    } else {
      state.balls += 1;
      emitLog(options, `${batter.name}: ボール (${state.balls}-${state.strikes})`);

      if (state.balls >= 4) {
        state.box[side].walks += 1;
        const runs = applyWalkAdvance(state, batter);
        addWalkStat(batter, runs);
        emitLastPitchPatch(options, { resultText: "四球" });
        emitLog(options, `${batter.name}: 四球${runs > 0 ? `。${runs}点` : ""}`);
        moveToNextBatter(state);
        finishPlateAppearanceState(state, options);
        maybeEndGameMidInning(state, {
          emitLog: (text) => emitLog(options, text),
        });
      }
    }
  } else {
    const contactRate = isStrike ? probs.zContactRate : probs.oContactRate;
    const madeContact = random() < contactRate;
    emitLastPitchPatch(options, { madeContact });

    if (!madeContact) {
      state.strikes += 1;
      emitLog(options, `${batter.name}: 空振り (${state.balls}-${state.strikes})`);

      if (state.strikes >= 3) {
        state.box[side].strikeouts += 1;
        addStrikeoutStat(batter);
        batter.gameStats.AB += 1;
        state.outs += 1;
        emitLastPitchPatch(options, { resultText: "空振り三振" });
        emitLog(options, `${batter.name}: 三振`);
        moveToNextBatter(state);
        finishPlateAppearanceState(state, options);
      }
    } else {
      const isFoul = random() < (isStrike ? 0.26 : 0.18);

      if (isFoul) {
        if (state.strikes < 2) state.strikes += 1;
        emitLastPitchPatch(options, { resultText: "ファウル" });
        emitLog(options, `${batter.name}: ファウル (${state.balls}-${state.strikes})`);
      } else {
        const qoc = chooseQoC(batter, course, pitchType);
        resolveQoCResult(state, batter, course, pitchType, qoc, options);
      }
    }
  }

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