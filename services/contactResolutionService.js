import { applySelectedBattedBallOutcome } from "./battedBallOutcomeApplicationService.js";
import { selectBattedBallOutcome } from "./battedBallOutcomeSelectionService.js";

export function resolveContactResult({
  state,
  batter,
  side,
  pitchType,
  course,
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
  const selection = selectBattedBallOutcome({
    state,
    batter,
    pitchType,
    course,
    battedBall,
    random,
  });

  return applySelectedBattedBallOutcome({
    selectedOutcome: selection.selectedOutcome,
    source: selection.source,
    evLaKey: selection.key,
    sampleQuality: selection.sampleQuality,
    smoothing: selection.smoothing,
    state,
    batter,
    side,
    pitchType,
    course,
    pitchVelocity,
    qoc,
    battedBall,
    options,
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
