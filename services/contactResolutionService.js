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

function formatBattedBallSuffix(battedBall, outcomeSource, sampleQuality, evLaKey) {
  if (!battedBall) return "";

  const parts = [
    `${battedBall.exitVelocity}mph, ${battedBall.launchAngle}°`,
    sampleQuality || "unknown",
    outcomeSource || "-",
    evLaKey || "-",
  ];

  return ` (${parts.join(" / ")})`;
}

function createResolutionError(code, message, context) {
  const error = new Error(message);
  error.code = code;
  error.context = context;
  return error;
}

function buildResolutionContext({ state, batter, pitchType, course }) {
  return {
    batter: batter?.name || batter?.id || "unknown",
    pitchType: pitchType || "unknown",
    course: course || "unknown",
    inning: Number(state?.inning) || null,
    half: state?.half || null,
    balls: Number.isFinite(Number(state?.balls)) ? Number(state.balls) : null,
    strikes: Number.isFinite(Number(state?.strikes))
      ? Number(state.strikes)
      : null,
  };
}

function emitBattedBallMeasurement(options, event) {
  if (typeof options?.onBattedBallMeasurement !== "function") return;
  options.onBattedBallMeasurement(event);
}

function resolveOutcomeModel({ state, batter, pitchType, course, battedBall }) {
  const context = buildResolutionContext({ state, batter, pitchType, course });
  const hasValidBattedBall =
    battedBall &&
    Number.isFinite(Number(battedBall.exitVelocity)) &&
    Number.isFinite(Number(battedBall.launchAngle));

  if (!hasValidBattedBall) {
    throw createResolutionError(
      "BATTED_BALL_MISSING",
      `Fair-ball EV/LA is missing for ${context.batter}.`,
      context
    );
  }

  const lookup = getLoadedEvLaLookup();
  if (!lookup) {
    throw createResolutionError(
      "EV_LA_LOOKUP_NOT_READY",
      `EV/LA lookup is not ready for ${context.batter}.`,
      context
    );
  }

  return getEvLaOutcomeProbabilities({
    exitVelocity: battedBall.exitVelocity,
    launchAngle: battedBall.launchAngle,
    lookup,
  });
}

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
  const outcomeModel = resolveOutcomeModel({
    state,
    batter,
    pitchType,
    course,
    battedBall,
  });
  const probs = outcomeModel.probabilities;
  const roll = random();
  const battedBallSuffix = formatBattedBallSuffix(
    battedBall,
    outcomeModel.source,
    outcomeModel.sampleQuality,
    outcomeModel.key
  );

  // qoc is recorded for analysis/logging only.
  // Outcomes above come only from EV/LA target and neighbor Statcast data.
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
  const outcome =
    roll < outCut
      ? "out"
      : roll < singleCut
        ? "single"
        : roll < doubleCut
          ? "double"
          : roll < tripleCut
            ? "triple"
            : "homeRun";

  emitBattedBallMeasurement(options, {
    side,
    exitVelocity: battedBall.exitVelocity,
    launchAngle: battedBall.launchAngle,
    qoc,
    evLaKey: outcomeModel.key,
    source: outcomeModel.source,
    sampleQuality: outcomeModel.sampleQuality,
    neighborMode: outcomeModel.smoothing?.neighborMode ?? null,
    expansionLevel: outcomeModel.smoothing?.expansionLevel ?? null,
    targetBattedBalls: outcomeModel.smoothing?.targetBattedBalls ?? 0,
    targetWeight: outcomeModel.smoothing?.targetWeight ?? 0,
    neighborEffectiveSampleSize:
      outcomeModel.smoothing?.neighborEffectiveSampleSize ?? 0,
    physicalConstraints: [
      ...(outcomeModel.smoothing?.physicalConstraints || []),
    ],
    outcome,
  });

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
