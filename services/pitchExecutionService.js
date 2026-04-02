import {
  classifyStrikeType,
  classifyBallType,
} from "./pitchQualityService.js";

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function choosePitchType(pitcher, random = Math.random) {
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
    if (roll <= cumulative) {
      return key;
    }
  }

  return "fourSeam";
}

function getEmptyStrikeInfo() {
  return {
    strikeType: null,
    strikeTypeLabel: null,
    strikeJudgeDifficulty: 0,
    borderLikelihood: 0,
  };
}

function getEmptyBallInfo() {
  return {
    ballType: null,
    ballTypeLabel: null,
    obviousBall: false,
    edgeBall: false,
    chaseableBall: false,
    targetObviousBallRate: 0,
    targetEdgeBallRate: 0,
    targetChaseableBallRate: 0,
    targetEdgeHighRate: 0,
  };
}

function calcBallTypeOSwingAdjustment(ballInfo, batter) {
  const eye = Number(batter?.ratings?.eye || batter?.eye || 50);
  const eyeScore = clamp((eye - 50) / 50, -1, 1);

  let adjustment = 0;

  switch (ballInfo?.ballType) {
    case "obvious":
      adjustment -= 0.10;
      adjustment -= Math.max(0, eyeScore) * 0.03;
      break;

    case "chaseable":
      adjustment += 0.08;
      adjustment -= Math.max(0, eyeScore) * 0.02;
      adjustment += Math.max(0, -eyeScore) * 0.02;
      break;

    case "edge_high":
    case "edge_low":
      adjustment += 0.03;
      adjustment -= Math.max(0, eyeScore) * 0.015;
      break;

    default:
      break;
  }

  return adjustment;
}

export function buildPitchExecutionContext({
  batter,
  pitcher,
  balls,
  strikes,
  random,
  chooseCourse,
  calcPitchOutcomeProbabilities,
  chooseZoneSpot,
  shouldPatchLastPitch,
}) {
  const pitchType = choosePitchType(pitcher, random);
  const course = chooseCourse(pitcher, random);

  const probs = calcPitchOutcomeProbabilities(
    batter,
    pitcher,
    course,
    pitchType,
    balls,
    strikes
  );

  const isStrike = random() < probs.strikeRate;

  const [resolvedZoneRow, resolvedZoneCol] = chooseZoneSpot(course, isStrike);

  const strikeInfo =
    isStrike
      ? classifyStrikeType(
          resolvedZoneRow,
          resolvedZoneCol,
          pitchType,
          pitcher?.ratings?.control || 50,
          0,
          false,
          random
        )
      : getEmptyStrikeInfo();

  const ballInfo =
    !isStrike
      ? classifyBallType(
          resolvedZoneRow,
          resolvedZoneCol,
          pitchType,
          balls,
          strikes,
          0,
          false,
          random
        )
      : getEmptyBallInfo();

  const effectiveOSwingRate = clamp(
    probs.oSwingRate + calcBallTypeOSwingAdjustment(ballInfo, batter),
    0.01,
    0.95
  );

  const swingRate = isStrike ? probs.zSwingRate : effectiveOSwingRate;
  const swung = random() < swingRate;

  const zoneRow = shouldPatchLastPitch ? resolvedZoneRow : null;
  const zoneCol = shouldPatchLastPitch ? resolvedZoneCol : null;

  return {
    pitchType,
    course,
    probs: {
      ...probs,
      rawOSwingRate: probs.oSwingRate,
      adjustedOSwingRate: effectiveOSwingRate,
    },
    isStrike,
    swung,
    zoneRow,
    zoneCol,

    strikeType: strikeInfo.strikeType,
    strikeTypeLabel: strikeInfo.strikeTypeLabel,
    strikeJudgeDifficulty: strikeInfo.strikeJudgeDifficulty,
    borderLikelihood: strikeInfo.borderLikelihood,

    ballType: ballInfo.ballType,
    ballTypeLabel: ballInfo.ballTypeLabel,
    obviousBall: ballInfo.obviousBall,
    edgeBall: ballInfo.edgeBall,
    chaseableBall: ballInfo.chaseableBall,
    targetObviousBallRate: ballInfo.targetObviousBallRate,
    targetEdgeBallRate: ballInfo.targetEdgeBallRate,
    targetChaseableBallRate: ballInfo.targetChaseableBallRate,
    targetEdgeHighRate: ballInfo.targetEdgeHighRate,
  };
}