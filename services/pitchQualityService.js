function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function weightedChoiceObject(weights, random = Math.random) {
  const entries = Object.entries(weights).filter(([, value]) => value > 0);

  if (!entries.length) {
    return Object.keys(weights)[0] || null;
  }

  const total = entries.reduce((sum, [, value]) => sum + value, 0);
  let roll = random() * total;

  for (const [key, value] of entries) {
    roll -= value;
    if (roll <= 0) {
      return key;
    }
  }

  return entries[entries.length - 1][0];
}

export function getCourseGrade(row, col) {
  const inStrikeZone = row >= 1 && row <= 3 && col >= 1 && col <= 3;
  if (!inStrikeZone) return "C";

  const isCenter = row === 2 && col === 2;
  if (isCenter) return "C";

  const isCorner =
    (row === 1 || row === 3) &&
    (col === 1 || col === 3);

  if (isCorner) return "A";
  return "B";
}

export function getPitchTypeBallQualityProfile(pitchName) {
  return {
    fourSeam: { obvious: 0.45, edge: 0.25, chaseable: 0.30, edgeHighBase: 0.50 },
    slider: { obvious: 0.30, edge: 0.30, chaseable: 0.40, edgeHighBase: 0.45 },
    curve: { obvious: 0.35, edge: 0.30, chaseable: 0.35, edgeHighBase: 0.36 },
    fork: { obvious: 0.20, edge: 0.25, chaseable: 0.55, edgeHighBase: 0.24 },
  }[pitchName] || { obvious: 0.40, edge: 0.30, chaseable: 0.30, edgeHighBase: 0.40 };
}

export function getBallDistributionByCount(pitchName, countState) {
  const base = getPitchTypeBallQualityProfile(pitchName);
  let { obvious, chaseable, edge } = base;

  switch (countState) {
    case "twoStrike":
      chaseable += 0.10;
      edge -= 0.06;
      obvious -= 0.04;
      break;
    case "pitcherAhead":
      chaseable += 0.06;
      edge -= 0.03;
      obvious -= 0.03;
      break;
    case "batterAhead":
      edge += 0.06;
      chaseable -= 0.06;
      break;
    default:
      break;
  }

  obvious = Math.max(0.03, obvious);
  chaseable = Math.max(0.03, chaseable);
  edge = Math.max(0.03, edge);

  const total = obvious + chaseable + edge;

  return {
    obvious: obvious / total,
    chaseable: chaseable / total,
    edge: edge / total,
    edgeHighBase: base.edgeHighBase,
  };
}

export function controlToMistakeRate(controlValue, pitchName = null) {
  const control = clamp(Number(controlValue) || 1, 1, 100);
  const x = (control - 50) / 50;

  const pitchAdj = {
    fourSeam: -0.18,
    curve: -0.05,
    slider: 0.10,
    fork: 0.24,
  }[pitchName] || 0;

  const adjustedX = clamp(x - pitchAdj, -1.3, 1.3);
  return clamp(0.03 * Math.exp(-1.5 * adjustedX), 0.005, 0.15);
}

export function determineDrift({
  pitchName,
  controlValue,
  isMistake,
  random = Math.random,
}) {
  const control = clamp(Number(controlValue) || 50, 1, 100);
  const controlScore = (control - 50) / 50;

  let p2 = 0.04;
  let p1 = 0.18;

  const pitchAdj = {
    fourSeam: { p2: -0.01, p1: -0.03 },
    curve: { p2: 0.00, p1: 0.01 },
    slider: { p2: 0.01, p1: 0.03 },
    fork: { p2: 0.03, p1: 0.06 },
  }[pitchName] || { p2: 0, p1: 0 };

  p2 += pitchAdj.p2;
  p1 += pitchAdj.p1;

  p2 += (-controlScore) * 0.04;
  p1 += (-controlScore) * 0.08;

  if (isMistake) {
    p2 += 0.22;
    p1 += 0.20;
  }

  p2 = clamp(p2, 0.01, 0.50);
  p1 = clamp(p1, 0.05, 0.70);

  const roll = random();
  if (roll < p2) return 2;
  if (roll < p2 + p1) return 1;
  return 0;
}

export function applyDriftToCourse(course, drift, isMistake, random = Math.random) {
  let effectiveDrift = drift;
  if (isMistake) effectiveDrift += 1;

  if (effectiveDrift <= 0) return course;

  if (course === "A") {
    if (effectiveDrift >= 2) return random() < 0.75 ? "C" : "B";
    return "B";
  }

  if (course === "B") {
    if (effectiveDrift >= 2) return "C";
    return random() < 0.65 ? "C" : "B";
  }

  return "C";
}

export function classifyStrikeType(
  row,
  col,
  pitchName,
  controlValue,
  drift = 0,
  isMistake = false,
  random = Math.random
) {
  const course = getCourseGrade(row, col);

  if (course === "C") {
    return {
      strikeType: "meat",
      strikeTypeLabel: "あからさまなストライク",
      strikeJudgeDifficulty: 0.02,
      borderLikelihood: 0.0,
    };
  }

  const controlN = clamp((controlValue - 50) / 50, -1, 1);
  const pitchEdgeAdj = {
    fourSeam: -0.02,
    curve: 0.02,
    slider: 0.03,
    fork: 0.05,
  }[pitchName] || 0;

  let probs;
  if (course === "B") {
    probs = {
      meat: 0.24 - controlN * 0.04,
      normal: 0.51 - controlN * 0.03,
      borderline: 0.21 + controlN * 0.03 + pitchEdgeAdj * 0.42,
      razor: 0.04 + controlN * 0.01 + pitchEdgeAdj * 0.28,
    };
  } else {
    probs = {
      meat: 0.09 - controlN * 0.03,
      normal: 0.40 - controlN * 0.03,
      borderline: 0.35 + controlN * 0.04 + pitchEdgeAdj * 0.46,
      razor: 0.10 + controlN * 0.01 + pitchEdgeAdj * 0.24,
    };
  }

  if (course === "A") {
    probs.meat -= 0.02;
    probs.normal += 0.14;
    probs.borderline -= 0.08;
    probs.razor -= 0.04;
  }

  if (drift >= 1) {
    probs.meat -= 0.02;
    probs.normal -= 0.01;
    probs.borderline += 0.02;
    probs.razor += 0.01;
  }

  if (isMistake) {
    probs.meat += 0.10;
    probs.normal += 0.04;
    probs.borderline -= 0.08;
    probs.razor -= 0.06;
  }

  const strikeType = weightedChoiceObject(probs, random);

  const map = {
    meat: { label: "あからさまなストライク", judge: 0.02, borderLikelihood: 0.00 },
    normal: { label: "普通のストライク", judge: 0.18, borderLikelihood: 0.12 },
    borderline: { label: "きわどいストライク", judge: 0.30, borderLikelihood: 0.30 },
    razor: { label: "ギリギリのストライク", judge: 0.52, borderLikelihood: 0.50 },
  };

  return {
    strikeType,
    strikeTypeLabel: map[strikeType].label,
    strikeJudgeDifficulty: map[strikeType].judge,
    borderLikelihood: map[strikeType].borderLikelihood,
  };
}

export function classifyBallType(
  row,
  col,
  target,
  pitchName,
  controlValue,
  drift = 0,
  isMistake = false,
  random = Math.random
) {
  const countState = target?.countState || "neutral";
  const dist = getBallDistributionByCount(pitchName, countState);

  const isNearZoneRing =
    ((row >= 1 && row <= 3) && (col === 0 || col === 4)) ||
    ((col >= 1 && col <= 3) && (row === 0 || row === 4));

  const isFarBall = !isNearZoneRing;

  let obvious = dist.obvious;
  let chaseable = dist.chaseable;
  let edge = dist.edge;

  if (isNearZoneRing) {
    edge += 0.10;
    obvious -= 0.06;
    chaseable -= 0.04;
  }

  if (isFarBall) {
    obvious += 0.08;
    edge -= 0.04;
    chaseable -= 0.04;
  }

  if (drift >= 2) {
    obvious += 0.05;
    edge -= 0.02;
    chaseable -= 0.03;
  }

  if (pitchName === "fork") {
    chaseable += 0.05;
    obvious -= 0.02;
    edge -= 0.03;
  }

  if (pitchName === "fourSeam") {
    edge += 0.04;
    chaseable -= 0.02;
    obvious -= 0.02;
  }

  if (pitchName === "slider") {
    chaseable += 0.03;
    obvious -= 0.01;
    edge -= 0.02;
  }

  if (pitchName === "curve") {
    obvious += 0.02;
    edge -= 0.01;
    chaseable -= 0.01;
  }

  if (isMistake) {
    edge += 0.06;
    obvious -= 0.04;
    chaseable -= 0.02;
  }

  obvious = Math.max(0.03, obvious);
  chaseable = Math.max(0.03, chaseable);
  edge = Math.max(0.03, edge);

  const total = obvious + chaseable + edge;
  obvious /= total;
  chaseable /= total;
  edge /= total;

  const r = random();
  let ballType = "edge_low";
  let obviousBall = false;
  let edgeHighChance = dist.edgeHighBase;

  if (r < obvious) {
    ballType = "obvious";
    obviousBall = true;
  } else if (r < obvious + chaseable) {
    ballType = "chaseable";
  } else {
    if (isNearZoneRing) edgeHighChance += 0.08;
    if (pitchName === "fourSeam") edgeHighChance += 0.06;
    if (pitchName === "fork") edgeHighChance -= 0.05;
    edgeHighChance = clamp(edgeHighChance, 0.20, 0.72);
    ballType = random() < edgeHighChance ? "edge_high" : "edge_low";
  }

  const labelMap = {
    obvious: "明確なボール",
    chaseable: "誘い球",
    edge_high: "際どいボール（高め）",
    edge_low: "際どいボール（低め）",
  };

  return {
    ballType,
    ballTypeLabel: labelMap[ballType] || ballType,
    obviousBall,
    edgeBall: !obviousBall,
    chaseableBall: ballType === "chaseable",
    obviousBallShare: obvious,
    targetObviousBallRate: dist.obvious,
    targetEdgeBallRate: dist.edge,
    targetChaseableBallRate: dist.chaseable,
    targetEdgeHighRate: dist.edgeHighBase,
  };
}