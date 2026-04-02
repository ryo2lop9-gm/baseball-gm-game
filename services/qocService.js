function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function weightedChoiceObject(weights) {
  const entries = Object.entries(weights).filter(([, value]) => value > 0);

  if (!entries.length) {
    return "Weak";
  }

  const total = entries.reduce((sum, [, value]) => sum + value, 0);
  let roll = Math.random() * total;

  for (const [key, value] of entries) {
    roll -= value;
    if (roll <= 0) {
      return key;
    }
  }

  return entries[entries.length - 1][0];
}

function normalizeWeights(weights) {
  const safe = {};
  let total = 0;

  for (const [key, value] of Object.entries(weights)) {
    const safeValue = Math.max(0.0001, value);
    safe[key] = safeValue;
    total += safeValue;
  }

  const normalized = {};
  for (const [key, value] of Object.entries(safe)) {
    normalized[key] = value / total;
  }

  return normalized;
}

function getBatterRatings(batter) {
  return {
    contact: Number(batter?.ratings?.contact ?? batter?.meet ?? 50),
    power: Number(batter?.ratings?.power ?? batter?.power ?? 50),
    eye: Number(batter?.ratings?.eye ?? batter?.eye ?? 50),
  };
}

function getBaseQocWeights() {
  return {
    Weak: 0.045,
    Topped: 0.335,
    Under: 0.250,
    Flare: 0.235,
    Solid: 0.065,
    Barrel: 0.070,
  };
}

function applyCourseAdjustment(weights, course) {
  if (course === "A") {
    weights.Weak *= 1.18;
    weights.Topped *= 1.08;
    weights.Under *= 1.05;
    weights.Flare *= 0.95;
    weights.Solid *= 0.90;
    weights.Barrel *= 0.78;
    return;
  }

  if (course === "C") {
    weights.Weak *= 0.88;
    weights.Topped *= 0.94;
    weights.Under *= 0.95;
    weights.Flare *= 1.04;
    weights.Solid *= 1.16;
    weights.Barrel *= 1.26;
    return;
  }

  weights.Weak *= 1.0;
  weights.Topped *= 1.0;
  weights.Under *= 1.0;
  weights.Flare *= 1.0;
  weights.Solid *= 1.0;
  weights.Barrel *= 1.0;
}

function applyPitchTypeAdjustment(weights, pitchType) {
  switch (pitchType) {
    case "fourSeam":
      weights.Under *= 0.98;
      weights.Flare *= 1.02;
      weights.Solid *= 1.05;
      weights.Barrel *= 1.06;
      break;

    case "slider":
      weights.Weak *= 1.05;
      weights.Topped *= 1.05;
      weights.Under *= 1.02;
      weights.Solid *= 0.96;
      weights.Barrel *= 0.93;
      break;

    case "curve":
      weights.Under *= 1.08;
      weights.Flare *= 0.98;
      weights.Solid *= 0.96;
      weights.Barrel *= 0.92;
      break;

    case "fork":
      weights.Weak *= 1.06;
      weights.Topped *= 1.03;
      weights.Under *= 1.10;
      weights.Flare *= 0.96;
      weights.Solid *= 0.92;
      weights.Barrel *= 0.88;
      break;

    default:
      break;
  }
}

function applyBatterAdjustment(weights, ratings) {
  const contactScore = clamp((ratings.contact - 50) / 50, -1, 1);
  const powerScore = clamp((ratings.power - 50) / 50, -1, 1);
  const eyeScore = clamp((ratings.eye - 50) / 50, -1, 1);

  weights.Weak *= 1 - contactScore * 0.10 - powerScore * 0.05;
  weights.Topped *= 1 - contactScore * 0.08 - powerScore * 0.04;
  weights.Under *= 1 - contactScore * 0.04 + powerScore * 0.02;

  weights.Flare *= 1 + contactScore * 0.08 + eyeScore * 0.03;
  weights.Solid *= 1 + contactScore * 0.12 + powerScore * 0.12 + eyeScore * 0.03;
  weights.Barrel *= 1 + powerScore * 0.30 + contactScore * 0.05 + eyeScore * 0.02;

  if (ratings.power >= 70) {
    weights.Barrel *= 1.06;
    weights.Solid *= 1.02;
  }

  if (ratings.contact >= 70) {
    weights.Weak *= 0.96;
    weights.Topped *= 0.97;
    weights.Flare *= 1.03;
  }
}

function applyFinalSafetyShape(weights) {
  weights.Weak = clamp(weights.Weak, 0.01, 0.12);
  weights.Topped = clamp(weights.Topped, 0.18, 0.48);
  weights.Under = clamp(weights.Under, 0.12, 0.38);
  weights.Flare = clamp(weights.Flare, 0.10, 0.34);
  weights.Solid = clamp(weights.Solid, 0.025, 0.16);
  weights.Barrel = clamp(weights.Barrel, 0.02, 0.18);
}

export function chooseQoC(batter, course, pitchType) {
  const ratings = getBatterRatings(batter);
  const weights = getBaseQocWeights();

  applyCourseAdjustment(weights, course);
  applyPitchTypeAdjustment(weights, pitchType);
  applyBatterAdjustment(weights, ratings);
  applyFinalSafetyShape(weights);

  const normalized = normalizeWeights(weights);
  return weightedChoiceObject(normalized);
}