import {
  QOC_KEYS,
  getQoCWeightsByCourse,
  getQoCTuning,
} from "../config/qocConfig.js";
import { getPitchTypeAdjustments } from "../config/pitchConfig.js";

function random() {
  return Math.random();
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function calcContactFactor(contact) {
  return clamp((contact - 50) / 50, -1, 1);
}

function calcPowerFactor(power) {
  return clamp((power - 50) / 50, -1, 1);
}

export function normalizeWeights(weights) {
  const total =
    Object.values(weights).reduce((sum, value) => sum + value, 0) || 1;

  const out = {};
  for (const key of Object.keys(weights)) {
    out[key] = weights[key] / total;
  }
  return out;
}

export function buildQoCWeights(batter, course, pitchType) {
  const powerFactor = calcPowerFactor(batter?.ratings?.power || 50);
  const contactFactor = calcContactFactor(batter?.ratings?.contact || 50);
  const pitchAdj = getPitchTypeAdjustments(pitchType);
  const base = getQoCWeightsByCourse(course);
  const tuning = getQoCTuning();

  const weights = {};

  for (const key of QOC_KEYS) {
    const baseValue = base[key] ?? 0;
    const pitchValue = pitchAdj[key.toLowerCase()] || 0;
    const contactValue = (tuning.contactEffects[key] || 0) * contactFactor;
    const powerValue = (tuning.powerEffects[key] || 0) * powerFactor;

    weights[key] = Math.max(
      tuning.minWeight,
      baseValue + pitchValue + contactValue + powerValue
    );
  }

  return weights;
}

export function chooseQoC(batter, course, pitchType) {
  const normalized = normalizeWeights(
    buildQoCWeights(batter, course, pitchType)
  );

  const roll = random();
  let cumulative = 0;

  for (const key of QOC_KEYS) {
    cumulative += normalized[key];
    if (roll <= cumulative) {
      return key;
    }
  }

  return "Topped";
}