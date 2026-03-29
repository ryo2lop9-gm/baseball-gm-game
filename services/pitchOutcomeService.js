import {
  PITCH_CONFIG,
  getPitchTypeAdjustments,
  getCountSwingAdjustment,
} from "../config/pitchConfig.js";

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function calcApproachFactor(eye) {
  return clamp((eye - 50) / 50, -1, 1);
}

function calcContactFactor(contact) {
  return clamp((contact - 50) / 50, -1, 1);
}

export function calcControlRank(control) {
  const ranks = PITCH_CONFIG.controlRanks;

  if (control >= ranks.S.min) return "S";
  if (control >= ranks.A.min) return "A";
  if (control >= ranks.B.min) return "B";
  if (control >= ranks.C.min) return "C";
  if (control >= ranks.D.min) return "D";
  if (control >= ranks.E.min) return "E";
  if (control >= ranks.F.min) return "F";
  return "G";
}

export function calcBaseStrikeRateByControl(control) {
  const cfg = PITCH_CONFIG.baseStrikeRateByControl;
  const normalized = clamp((control - 50) / 50, -1, 1);

  return clamp(
    cfg.base + normalized * cfg.spread,
    cfg.min,
    cfg.max
  );
}

export function chooseCourse(pitcher, random = Math.random) {
  const control = pitcher?.ratings?.control || 50;
  const baseStrikeRate = calcBaseStrikeRateByControl(control);
  const rank = calcControlRank(control);
  const strikeWeights =
    PITCH_CONFIG.courseWeightsByRank[rank] ||
    PITCH_CONFIG.courseWeightsByRank.C;

  if (random() < baseStrikeRate) {
    const roll = random();
    if (roll < strikeWeights.A) return "A";
    if (roll < strikeWeights.A + strikeWeights.B) return "B";
    return "C";
  }

  return "Ball";
}

export function getCountSwingAdjustments(balls, strikes) {
  return getCountSwingAdjustment(`${balls}-${strikes}`);
}

export function calcPitchOutcomeProbabilities(
  batter,
  pitcher,
  course,
  pitchType,
  balls,
  strikes
) {
  const outcomeCfg = PITCH_CONFIG.outcomeRates;
  const tuning = outcomeCfg.tuning;

  const contactFactor = calcContactFactor(batter?.ratings?.contact || 50);
  const approachFactor = calcApproachFactor(batter?.ratings?.eye || 50);
  const stuffFactor = clamp(((pitcher?.ratings?.stuff || 50) - 50) / 50, -1, 1);

  const pitchAdj = getPitchTypeAdjustments(pitchType);
  const countAdj = getCountSwingAdjustments(balls, strikes);

  let strikeRate;
  if (course === "Ball") {
    strikeRate =
      outcomeCfg.strikeRateByCourse.Ball +
      (pitchAdj.strikeRate || 0) * tuning.strikeRate.ballPitchTypeScale;
  } else if (course === "A") {
    strikeRate = outcomeCfg.strikeRateByCourse.A + (pitchAdj.strikeRate || 0);
  } else if (course === "B") {
    strikeRate = outcomeCfg.strikeRateByCourse.B + (pitchAdj.strikeRate || 0);
  } else {
    strikeRate = outcomeCfg.strikeRateByCourse.C + (pitchAdj.strikeRate || 0);
  }

  const baseZSwing =
    outcomeCfg.baseZSwingByCourse[course] ?? outcomeCfg.baseZSwingByCourse.Ball;

  const baseOSwing =
    course === "Ball"
      ? outcomeCfg.baseOSwingByCourse.Ball
      : outcomeCfg.baseOSwingByCourse.default;

  const zSwingRate = clamp(
    baseZSwing +
      approachFactor * tuning.zSwing.approach +
      countAdj.z +
      stuffFactor * tuning.zSwing.stuff,
    tuning.zSwing.min,
    tuning.zSwing.max
  );

  const oSwingRate = clamp(
    baseOSwing +
      approachFactor * tuning.oSwing.approach +
      countAdj.o +
      (pitchAdj.oSwing || 0) +
      stuffFactor * tuning.oSwing.stuff,
    tuning.oSwing.min,
    tuning.oSwing.max
  );

  const zContactBase =
    outcomeCfg.baseZContactByCourse[course] ?? outcomeCfg.baseZContactByCourse.C;

  const oContactBase =
    course === "Ball"
      ? outcomeCfg.baseOContactByCourse.Ball
      : outcomeCfg.baseOContactByCourse.default;

  const zContactRate = clamp(
    zContactBase +
      contactFactor * tuning.zContact.contact +
      stuffFactor * tuning.zContact.stuff +
      (pitchAdj.zContact || 0),
    tuning.zContact.min,
    tuning.zContact.max
  );

  const oContactRate = clamp(
    oContactBase +
      contactFactor * tuning.oContact.contact +
      stuffFactor * tuning.oContact.stuff +
      (pitchAdj.oContact || 0),
    tuning.oContact.min,
    tuning.oContact.max
  );

  return {
    strikeRate: clamp(
      strikeRate,
      tuning.strikeRate.min,
      tuning.strikeRate.max
    ),
    zSwingRate,
    oSwingRate,
    zContactRate,
    oContactRate,
  };
}