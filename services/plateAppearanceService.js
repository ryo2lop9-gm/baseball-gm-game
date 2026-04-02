import { chooseQoC } from "./qocService.js";

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function buildTakeStrikeLogText(batter, state, strikeTypeLabel) {
  const suffix = strikeTypeLabel ? `・${strikeTypeLabel}` : "";
  return `${batter.name}: 見逃しストライク${suffix} (${state.balls}-${state.strikes})`;
}

function buildBallLogText(batter, state, ballTypeLabel) {
  const suffix = ballTypeLabel ? `・${ballTypeLabel}` : "";
  return `${batter.name}: ボール${suffix} (${state.balls}-${state.strikes})`;
}

function calcTakeStrikeChance({
  batter,
  isStrike,
  strikeJudgeDifficulty,
  borderLikelihood,
}) {
  if (!isStrike) {
    return 1;
  }

  const eye = Number(batter?.ratings?.eye || batter?.eye || 50);
  const eyeScore = clamp((eye - 50) / 50, -1, 1);

  let chance = 1.0;
  chance -= strikeJudgeDifficulty * 0.18;
  chance -= borderLikelihood * 0.08;
  chance -= eyeScore * strikeJudgeDifficulty * 0.10;
  chance -= eyeScore * borderLikelihood * 0.05;

  return clamp(chance, 0.82, 1.0);
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
    rawOSwingRate: probs?.rawOSwingRate,
    adjustedOSwingRate: probs?.adjustedOSwingRate,
  });

  if (!swung) {
    if (isStrike) {
      const calledStrikeChance = calcTakeStrikeChance({
        batter,
        isStrike,
        strikeJudgeDifficulty,
        borderLikelihood,
      });

      const calledStrike = random() < calledStrikeChance;

      if (calledStrike) {
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

      emitLastPitchPatch(options, {
        resultText: "ボール判定",
      });

      emitLog(
        options,
        `${batter.name}: ボール判定に外れる・${strikeTypeLabel || "際どい球"} (${state.balls}-${state.strikes})`
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

    state.balls += 1;

    emitLog(options, buildBallLogText(batter, state, ballTypeLabel));

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

  emitLastPitchPatch(options, { madeContact });

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