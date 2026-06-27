import { getHitTypeProbabilities } from "../config/hitOutcomeConfig.js";
import { getPitchTypeLabel } from "../config/pitchConfig.js";
import { getEvLaOutcomeProbabilities } from "./evLaOutcomeService.js";
import { getLoadedEvLaLookup } from "./evLaLookupStore.js";
import { recordVelocityBandPlateAppearance } from "./velocityBandStatsService.js";

function recordVelocityResult(state, side, pitchVelocity, result) {
  const teamBox = state?.box?.[side];
  if (!teamBox) return;

  teamBox.velocityBandStats = recordVelocityBandPlateAppearance(
    teamBox.velocityBandStats,
    pitchVelocity,
    result
  );
}

function formatBattedBallSuffix(battedBall, outcomeSource, sampleQuality) {
  if (!battedBall) return "";

  const sourceText =
    outcomeSource === "ev_la_lookup" ? ` / ${sampleQuality || "unknown"}` : "";

  return ` (${battedBall.exitVelocity}mph, ${battedBall.launchAngle}°${sourceText})`;
}

function resolveOutcomeModel(qoc, battedBall) {
  const lookup = getLoadedEvLaLookup();

  if (lookup && battedBall) {
    return getEvLaOutcomeProbabilities({
      exitVelocity: battedBall.exitVelocity,
      launchAngle: battedBall.launchAngle,
      lookup,
    });
  }

  return {
    key: null,
    source: "qoc_fallback",
    sampleQuality: "legacy",
    probabilities: getHitTypeProbabilities(qoc),
  };
}

export function resolveContactResult({
  state,
  batter,
  side,
  pitchType,
  pitchVelocity,
  qoc,
  battedBall,
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
}) {
  const outcomeModel = resolveOutcomeModel(qoc, battedBall);
  const probs = outcomeModel.probabilities;
  const roll = random();
  const battedBallSuffix = formatBattedBallSuffix(
    battedBall,
    outcomeModel.source,
    outcomeModel.sampleQuality
  );

  addQoCToBox(state, qoc);
  emitLastPitchPatch(options, {
    outcomeSource: outcomeModel.source,
    evLaKey: outcomeModel.key,
    sampleQuality: outcomeModel.sampleQuality,
  });

  const outCut = probs.out;
  const singleCut = outCut + probs.single;
  const doubleCut = singleCut + probs.double;
  const tripleCut = doubleCut + probs.triple;

  if (roll < outCut) {
    state.outs += 1;
    state.box[side].outsInPlay += 1;
    addOutInPlayStat(batter);
    recordVelocityResult(state, side, pitchVelocity, {
      PA: 1,
      AB: 1,
      H: 0,
    });
    emitLastPitchPatch(options, { resultText: `${qoc} / 凡打${battedBallSuffix}` });
    emitLog(
      options,
      `${batter.name}: ${getPitchTypeLabel(
        pitchType
      )}を${qoc}で凡打。${battedBallSuffix}`
    );
    moveToNextBatter(state);
    finishPlateAppearanceState(state, options);
    return;
  }

  if (roll < singleCut) {
    state.box[side].hits += 1;
    const runs = advanceRunnersOnHit(state, batter, 1);
    addHitStat(batter, "1B", runs);
    recordVelocityResult(state, side, pitchVelocity, {
      PA: 1,
      AB: 1,
      H: 1,
      totalBases: 1,
    });
    emitLastPitchPatch(options, { resultText: `${qoc} / 安打${battedBallSuffix}` });
    emitLog(
      options,
      `${batter.name}: ${getPitchTypeLabel(pitchType)}を${qoc}で安打。${
        runs > 0 ? `${runs}点` : ""
      }${battedBallSuffix}`
    );
    moveToNextBatter(state);
    finishPlateAppearanceState(state, options);
    maybeEndGameMidInning(state, {
      emitLog: (text) => emitLog(options, text),
    });
    return;
  }

  if (roll < doubleCut) {
    state.box[side].hits += 1;
    state.box[side].doubles += 1;
    const runs = advanceRunnersOnHit(state, batter, 2);
    addHitStat(batter, "2B", runs);
    recordVelocityResult(state, side, pitchVelocity, {
      PA: 1,
      AB: 1,
      H: 1,
      doubles: 1,
      totalBases: 2,
    });
    emitLastPitchPatch(options, { resultText: `${qoc} / 二塁打${battedBallSuffix}` });
    emitLog(
      options,
      `${batter.name}: ${getPitchTypeLabel(pitchType)}を${qoc}で二塁打。${
        runs > 0 ? `${runs}点` : ""
      }${battedBallSuffix}`
    );
    moveToNextBatter(state);
    finishPlateAppearanceState(state, options);
    maybeEndGameMidInning(state, {
      emitLog: (text) => emitLog(options, text),
    });
    return;
  }

  if (roll < tripleCut) {
    state.box[side].hits += 1;
    state.box[side].triples += 1;
    const runs = advanceRunnersOnHit(state, batter, 3);
    addHitStat(batter, "3B", runs);
    recordVelocityResult(state, side, pitchVelocity, {
      PA: 1,
      AB: 1,
      H: 1,
      triples: 1,
      totalBases: 3,
    });
    emitLastPitchPatch(options, { resultText: `${qoc} / 三塁打${battedBallSuffix}` });
    emitLog(
      options,
      `${batter.name}: ${getPitchTypeLabel(pitchType)}を${qoc}で三塁打。${
        runs > 0 ? `${runs}点` : ""
      }${battedBallSuffix}`
    );
    moveToNextBatter(state);
    finishPlateAppearanceState(state, options);
    maybeEndGameMidInning(state, {
      emitLog: (text) => emitLog(options, text),
    });
    return;
  }

  state.box[side].hits += 1;
  state.box[side].hr += 1;
  const runs = advanceRunnersOnHit(state, batter, 4);
  addHitStat(batter, "HR", runs);
  recordVelocityResult(state, side, pitchVelocity, {
    PA: 1,
    AB: 1,
    H: 1,
    HR: 1,
    totalBases: 4,
  });
  emitLastPitchPatch(options, { resultText: `${qoc} / 本塁打${battedBallSuffix}` });
  emitLog(
    options,
    `${batter.name}: ${getPitchTypeLabel(
      pitchType
    )}を${qoc}で本塁打。${runs}点${battedBallSuffix}`
  );
  moveToNextBatter(state);
  finishPlateAppearanceState(state, options);
  maybeEndGameMidInning(state, {
    emitLog: (text) => emitLog(options, text),
  });
}
