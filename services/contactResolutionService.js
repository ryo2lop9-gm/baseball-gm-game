import { getHitTypeProbabilities } from "../config/hitOutcomeConfig.js";
import { getPitchTypeLabel } from "../config/pitchConfig.js";

export function resolveContactResult({
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
}) {
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
    emitLog(
      options,
      `${batter.name}: ${getPitchTypeLabel(pitchType)}を${qoc}で凡打。`
    );
    moveToNextBatter(state);
    finishPlateAppearanceState(state, options);
    return;
  }

  if (roll < singleCut) {
    state.box[side].hits += 1;
    const runs = advanceRunnersOnHit(state, batter, 1);
    addHitStat(batter, "1B", runs);
    emitLastPitchPatch(options, { resultText: `${qoc} / 安打` });
    emitLog(
      options,
      `${batter.name}: ${getPitchTypeLabel(pitchType)}を${qoc}で安打。${
        runs > 0 ? `${runs}点` : ""
      }`
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
    emitLastPitchPatch(options, { resultText: `${qoc} / 二塁打` });
    emitLog(
      options,
      `${batter.name}: ${getPitchTypeLabel(pitchType)}を${qoc}で二塁打。${
        runs > 0 ? `${runs}点` : ""
      }`
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
    emitLastPitchPatch(options, { resultText: `${qoc} / 三塁打` });
    emitLog(
      options,
      `${batter.name}: ${getPitchTypeLabel(pitchType)}を${qoc}で三塁打。${
        runs > 0 ? `${runs}点` : ""
      }`
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
  emitLastPitchPatch(options, { resultText: `${qoc} / 本塁打` });
  emitLog(
    options,
    `${batter.name}: ${getPitchTypeLabel(pitchType)}を${qoc}で本塁打。${runs}点`
  );
  moveToNextBatter(state);
  finishPlateAppearanceState(state, options);
  maybeEndGameMidInning(state, {
    emitLog: (text) => emitLog(options, text),
  });
}