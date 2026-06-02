import {
  classifyStrikeType,
  classifyBallType,
  controlToMistakeRate,
  determineDrift,
  applyDriftToCourse,
} from "./pitchQualityService.js";

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

const DEFAULT_PITCH_VELOCITIES = {
  fourSeam: 94.5,
  slider: 85.5,
  curve: 79.0,
  fork: 86.2,
};

function getPitchMixEntry(pitcher, pitchType) {
  const entry = pitcher?.pitchMix?.[pitchType];
  if (typeof entry === "number") {
    return {
      usage: entry,
      velocity: DEFAULT_PITCH_VELOCITIES[pitchType],
    };
  }
  if (entry && typeof entry === "object") {
    return {
      usage: Number.isFinite(Number(entry.usage)) ? Number(entry.usage) : 0,
      velocity: Number.isFinite(Number(entry.velocity))
        ? Number(entry.velocity)
        : DEFAULT_PITCH_VELOCITIES[pitchType],
    };
  }
  return {
    usage: 0,
    velocity: DEFAULT_PITCH_VELOCITIES[pitchType],
  };
}

export function getPitchVelocity(pitcher, pitchType) {
  return getPitchMixEntry(pitcher, pitchType).velocity;
}

export function choosePitchType(pitcher, random = Math.random) {
  const fallbackMix = {
    fourSeam: 0.45,
    slider: 0.25,
    curve: 0.12,
    fork: 0.18,
  };

  const sourceMix = pitcher?.pitchMix || fallbackMix;
  const roll = random();
  let cumulative = 0;

  for (const key of ["fourSeam", "slider", "curve", "fork"]) {
    const entry = sourceMix[key];
    const usage = typeof entry === "number" ? entry : Number(entry?.usage || fallbackMix[key] || 0);
    cumulative += usage;
    if (roll <= cumulative) {
      return key;
    }
  }

  return "fourSeam";
}

function getEmptyStrikeInfo() {
  return {
    strikeType: null,
    strikeTypeLabel: "",
    strikeJudgeDifficulty: 0,
    borderLikelihood: 0,
  };
}

function getEmptyBallInfo() {
  return {
    ballType: null,
    ballTypeLabel: "",
    obviousBall: false,
    edgeBall: false,
    chaseableBall: false,
    targetObviousBallRate: null,
    targetEdgeBallRate: null,
    targetChaseableBallRate: null,
    targetEdgeHighRate: null,
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
    case "edge_side":
      adjustment += 0.03;
      adjustment -= Math.max(0, eyeScore) * 0.015;
      break;

    default:
      break;
  }

  return adjustment;
}

function resolveCountState(balls, strikes) {
  if (strikes >= 2) return "twoStrike";
  if (balls > strikes) return "batterAhead";
  if (strikes > balls) return "pitcherAhead";
  return "neutral";
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
  const pitchVelocity = getPitchVelocity(pitcher, pitchType);
  const baseCourse = chooseCourse(pitcher, random);

  const controlValue = Number(pitcher?.ratings?.control || 50);
  const mistakeRate = controlToMistakeRate(controlValue, pitchType);
  const isMistake = random() < mistakeRate;
  const drift = determineDrift({
    pitchName: pitchType,
    controlValue,
    isMistake,
    random,
  });

  const course = applyDriftToCourse(baseCourse, drift, isMistake, random);

  const probs = calcPitchOutcomeProbabilities(
    batter,
    pitcher,
    course,
    pitchType,
    balls,
    strikes
  );

  const isStrike = random() < probs.strikeRate;
  const [resolvedZoneRow, resolvedZoneCol] = chooseZoneSpot(course, isStrike, random);

  const strikeInfo = isStrike
    ? classifyStrikeType(
        resolvedZoneRow,
        resolvedZoneCol,
        pitchType,
        controlValue,
        drift,
        isMistake
      )
    : getEmptyStrikeInfo();

  const ballInfo = !isStrike
    ? classifyBallType(
        resolvedZoneRow,
        resolvedZoneCol,
        { countState: resolveCountState(balls, strikes) },
        pitchType,
        controlValue,
        drift,
        isMistake
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
    pitchVelocity,
    baseCourse,
    course,
    probs: {
      ...probs,
      rawOSwingRate: probs.oSwingRate,
      adjustedOSwingRate: effectiveOSwingRate,
      mistakeRate,
      isMistake,
      drift,
      baseCourse,
      course,
      pitchVelocity,
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

    rawOSwingRate: probs.oSwingRate,
    adjustedOSwingRate: effectiveOSwingRate,

    mistakeRate,
    isMistake,
    drift,
  };
}
