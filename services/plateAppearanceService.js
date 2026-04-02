import { chooseQoC } from "./qocService.js";

function buildTakeStrikeLogText(batter, state, strikeTypeLabel) {
  const suffix = strikeTypeLabel ? `・${strikeTypeLabel}` : "";
  return `${batter.name}: 見逃しストライク${suffix} (${state.balls}-${state.strikes})`;
}

function buildBallLogText(batter, state, ballTypeLabel) {
  const suffix = ballTypeLabel ? `・${ballTypeLabel}` : "";
  return `${batter.name}: ボール${suffix} (${state.balls}-${state.strikes})`;
}

export function resolvePlateAppearanceResult({
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
  finishPlateAppearanceState,
  resolveQoCResult,
}) {
  emitLastPitchPatch(options, {
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
  });

  if (!swung) {
    if (isStrike) {
      state.strikes += 1;

      emitLog(
        options,
        buildTakeStrikeLogText(batter, state, strikeTypeLabel)
      );

      if (state.strikes >= 3) {
        state.box[side].strikeouts += 1;
        addStrikeoutStat(batter);
        batter.gameStats.AB += 1;
        state.outs += 1;

        emitLastPitchPatch(options, {
          resultText: "見逃し三振",
        });

        emitLog(options, `${batter.name}: 三振`);

        moveToNextBatter(state);
        finishPlateAppearanceState(state, options);
      }
      return;
    }

    state.balls += 1;

    emitLog(
      options,
      buildBallLogText(batter, state, ballTypeLabel)
    );

    if (state.balls >= 4) {
      state.box[side].walks += 1;
      const runs = applyWalkAdvance(state, batter);
      addWalkStat(batter, runs);

      emitLastPitchPatch(options, {
        resultText: "四球",
      });

      emitLog(options, `${batter.name}: 四球${runs > 0 ? `。${runs}点` : ""}`);

      moveToNextBatter(state);
      finishPlateAppearanceState(state, options);

      maybeEndGameMidInning(state, {
        emitLog: (text) => emitLog(options, text),
      });
    }
    return;
  }

  const contactRate = isStrike ? probs.zContactRate : probs.oContactRate;
  const madeContact = random() < contactRate;

  emitLastPitchPatch(options, {
    madeContact,
  });

  if (!madeContact) {
    state.strikes += 1;

    emitLog(options, `${batter.name}: 空振り (${state.balls}-${state.strikes})`);

    if (state.strikes >= 3) {
      state.box[side].strikeouts += 1;
      addStrikeoutStat(batter);
      batter.gameStats.AB += 1;
      state.outs += 1;

      emitLastPitchPatch(options, {
        resultText: "空振り三振",
      });

      emitLog(options, `${batter.name}: 三振`);

      moveToNextBatter(state);
      finishPlateAppearanceState(state, options);
    }
    return;
  }

  const isFoul = random() < (isStrike ? 0.26 : 0.18);

  if (isFoul) {
    if (state.strikes < 2) state.strikes += 1;

    emitLastPitchPatch(options, {
      resultText: "ファウル",
    });

    emitLog(options, `${batter.name}: ファウル (${state.balls}-${state.strikes})`);
    return;
  }

  const qoc = chooseQoC(batter, course, pitchType);
  resolveQoCResult(state, batter, course, pitchType, qoc, options);
}