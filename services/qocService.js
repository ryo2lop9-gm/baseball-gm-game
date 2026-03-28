import { QOC_KEYS, getQoCWeightsByCourse } from "../config/qocConfig.js";
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

  return {
    Weak: Math.max(0.001, base.Weak + (pitchAdj.weak || 0) - contactFactor * 0.015),
    Topped: Math.max(0.001, base.Topped + (pitchAdj.topped || 0) - powerFactor * 0.01),
    Under: Math.max(0.001, base.Under + (pitchAdj.under || 0) - contactFactor * 0.01),
    Flare: Math.max(0.001, base.Flare + (pitchAdj.flare || 0) + contactFactor * 0.01),
    Solid: Math.max(
      0.001,
      base.Solid + (pitchAdj.solid || 0) + contactFactor * 0.012 + powerFactor * 0.008
    ),
    Barrel: Math.max(0.001, base.Barrel + (pitchAdj.barrel || 0) + powerFactor * 0.02),
  };
}

export function chooseQoC(batter, course, pitchType) {
  const normalized = normalizeWeights(buildQoCWeights(batter, course, pitchType));
  const roll = random();

  let cumulative = 0;
  for (const key of QOC_KEYS) {
    cumulative += normalized[key];
    if (roll <= cumulative) return key;
  }

  return "Topped";
}