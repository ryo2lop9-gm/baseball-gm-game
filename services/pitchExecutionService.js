import {
  classifyStrikeType,
  classifyBallType,
} from "./pitchQualityService.js";

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
  const swingRate = isStrike ? probs.zSwingRate : probs.oSwingRate;
  const swung = random() < swingRate;

  const [zoneRow, zoneCol] = shouldPatchLastPitch
    ? chooseZoneSpot(course, isStrike)
    : [null, null];

  const strikeInfo =
    isStrike && zoneRow !== null && zoneCol !== null
      ? classifyStrikeType(
          zoneRow,
          zoneCol,
          pitchType,
          pitcher?.ratings?.control || 50,
          0,
          false,
          random
        )
      : getEmptyStrikeInfo();

  const ballInfo =
    !isStrike && zoneRow !== null && zoneCol !== null
      ? classifyBallType(
          zoneRow,
          zoneCol,
          pitchType,
          balls,
          strikes,
          0,
          false,
          random
        )
      : getEmptyBallInfo();

  return {
    pitchType,
    course,
    probs,
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