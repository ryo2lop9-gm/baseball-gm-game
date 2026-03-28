import { getPitchTypeAdjustments } from "../config/pitchConfig.js";

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
  if (control >= 90) return "S";
  if (control >= 80) return "A";
  if (control >= 70) return "B";
  if (control >= 60) return "C";
  if (control >= 50) return "D";
  if (control >= 40) return "E";
  if (control >= 30) return "F";
  return "G";
}

export function calcBaseStrikeRateByControl(control) {
  const normalized = clamp((control - 50) / 50, -1, 1);
  return clamp(0.48 + normalized * 0.03, 0.45, 0.51);
}

export function chooseCourse(pitcher, random = Math.random) {
  const control = pitcher?.ratings?.control || 50;
  const baseStrikeRate = calcBaseStrikeRateByControl(control);

  const courseWeightsByRank = {
    S: { A: 0.54, B: 0.41, C: 0.05 },
    A: { A: 0.49, B: 0.44, C: 0.07 },
    B: { A: 0.42, B: 0.48, C: 0.10 },
    C: { A: 0.35, B: 0.51, C: 0.14 },
    D: { A: 0.29, B: 0.52, C: 0.19 },
    E: { A: 0.22, B: 0.53, C: 0.25 },
    F: { A: 0.16, B: 0.53, C: 0.31 },
    G: { A: 0.10, B: 0.52, C: 0.38 },
  };

  const rank = calcControlRank(control);
  const strikeWeights = courseWeightsByRank[rank] || courseWeightsByRank.C;

  if (random() < baseStrikeRate) {
    const roll = random();
    if (roll < strikeWeights.A) return "A";
    if (roll < strikeWeights.A + strikeWeights.B) return "B";
    return "C";
  }

  return "Ball";
}

export function getCountSwingAdjustments(balls, strikes) {
  const key = `${balls}-${strikes}`;
  const map = {
    "0-0": { z: 0.02, o: -0.01 },
    "1-0": { z: 0.01, o: 0.015 },
    "2-0": { z: -0.01, o: 0.04 },
    "3-0": { z: -0.05, o: -0.02 },
    "0-1": { z: 0.005, o: 0.015 },
    "1-1": { z: 0.005, o: 0.015 },
    "2-1": { z: -0.005, o: 0.035 },
    "3-1": { z: -0.015, o: 0.03 },
    "0-2": { z: 0.02, o: 0.02 },
    "1-2": { z: 0.02, o: 0.02 },
    "2-2": { z: 0.01, o: 0.02 },
    "3-2": { z: -0.01, o: 0.01 },
  };

  return map[key] || { z: 0, o: 0 };
}

export function calcPitchOutcomeProbabilities(
  batter,
  pitcher,
  course,
  pitchType,
  balls,
  strikes
) {
  const contactFactor = calcContactFactor(batter?.ratings?.contact || 50);
  const approachFactor = calcApproachFactor(batter?.ratings?.eye || 50);
  const stuffFactor = clamp(((pitcher?.ratings?.stuff || 50) - 50) / 50, -1, 1);
  const pitchAdj = getPitchTypeAdjustments(pitchType);
  const countAdj = getCountSwingAdjustments(balls, strikes);

  let strikeRate;
  if (course === "Ball") strikeRate = 0.08 + (pitchAdj.strikeRate || 0) * 0.15;
  else if (course === "A") strikeRate = 0.82 + (pitchAdj.strikeRate || 0);
  else if (course === "B") strikeRate = 0.63 + (pitchAdj.strikeRate || 0);
  else strikeRate = 0.48 + (pitchAdj.strikeRate || 0);

  const baseZSwing =
    course === "A" ? 0.72 : course === "B" ? 0.68 : course === "C" ? 0.63 : 0.24;
  const baseOSwing = course === "Ball" ? 0.26 : 0.19;

  const zSwingRate = clamp(
    baseZSwing + approachFactor * 0.02 + countAdj.z + stuffFactor * -0.01,
    0.35,
    0.90
  );

  const oSwingRate = clamp(
    baseOSwing + approachFactor * -0.06 + countAdj.o + pitchAdj.oSwing + stuffFactor * 0.015,
    0.05,
    0.60
  );

  const zContactBase = course === "A" ? 0.79 : course === "B" ? 0.84 : 0.87;
  const oContactBase = course === "Ball" ? 0.56 : 0.63;

  const zContactRate = clamp(
    zContactBase + contactFactor * 0.09 - stuffFactor * 0.06 + pitchAdj.zContact,
    0.52,
    0.97
  );

  const oContactRate = clamp(
    oContactBase + contactFactor * 0.08 - stuffFactor * 0.07 + pitchAdj.oContact,
    0.30,
    0.90
  );

  return {
    strikeRate: clamp(strikeRate, 0.02, 0.98),
    zSwingRate,
    oSwingRate,
    zContactRate,
    oContactRate,
  };
}