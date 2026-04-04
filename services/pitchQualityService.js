function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function getCourseGrade(row, col) {
  const inStrikeZone = row >= 1 && row <= 3 && col >= 1 && col <= 3;
  if (!inStrikeZone) return "Ball";

  if (row === 2 && col === 2) return "C";

  const isCorner =
    (row === 1 || row === 3) &&
    (col === 1 || col === 3);

  if (isCorner) return "A";
  return "B";
}

export function getPitchTypeBallQualityProfile(pitchName) {
  return {
    fourSeam: { obvious: 0.42, edge: 0.28, chaseable: 0.30 },
    slider: { obvious: 0.24, edge: 0.32, chaseable: 0.44 },
    curve: { obvious: 0.28, edge: 0.34, chaseable: 0.38 },
    fork: { obvious: 0.18, edge: 0.27, chaseable: 0.55 },
  }[pitchName] || { obvious: 0.30, edge: 0.30, chaseable: 0.40 };
}

export function getBallDistributionByCount(pitchName, countState) {
  const base = getPitchTypeBallQualityProfile(pitchName);
  let { obvious, edge, chaseable } = base;

  switch (countState) {
    case "twoStrike":
      chaseable += 0.10;
      edge += 0.02;
      obvious -= 0.12;
      break;
    case "pitcherAhead":
      chaseable += 0.06;
      edge += 0.01;
      obvious -= 0.07;
      break;
    case "batterAhead":
      obvious += 0.08;
      edge += 0.02;
      chaseable -= 0.10;
      break;
    default:
      break;
  }

  obvious = Math.max(0.03, obvious);
  edge = Math.max(0.03, edge);
  chaseable = Math.max(0.03, chaseable);

  const total = obvious + edge + chaseable;

  return {
    obvious: obvious / total,
    edge: edge / total,
    chaseable: chaseable / total,
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

function getHeightLabel(row) {
  if (row <= 1) return "高め";
  if (row >= 3) return "低め";
  return "中";
}

function getSideLabel(col) {
  if (col <= 1) return "外";
  if (col >= 3) return "内";
  return "中央";
}

export function classifyStrikeType(
  row,
  col,
  pitchName,
  controlValue,
  drift = 0,
  isMistake = false
) {
  const grade = getCourseGrade(row, col);

  if (grade === "Ball") {
    return {
      strikeType: null,
      strikeTypeLabel: "",
      strikeJudgeDifficulty: 0,
      borderLikelihood: 0,
    };
  }

  if (row === 2 && col === 2) {
    return {
      strikeType: "meat",
      strikeTypeLabel: "あからさまなストライク",
      strikeJudgeDifficulty: 0.02,
      borderLikelihood: 0.00,
    };
  }

  const isCorner =
    (row === 1 || row === 3) &&
    (col === 1 || col === 3);

  if (isCorner) {
    return {
      strikeType: "razor",
      strikeTypeLabel: `ギリギリのストライク（${getHeightLabel(row)}・${getSideLabel(col)}）`,
      strikeJudgeDifficulty: 0.54,
      borderLikelihood: 0.55,
    };
  }

  return {
    strikeType: "borderline",
    strikeTypeLabel: `きわどいストライク（${getHeightLabel(row)}・${getSideLabel(col)}）`,
    strikeJudgeDifficulty: 0.30,
    borderLikelihood: 0.32,
  };
}

export function classifyBallType(
  row,
  col,
  target,
  pitchName,
  controlValue,
  drift = 0,
  isMistake = false
) {
  const grade = getCourseGrade(row, col);

  if (grade !== "Ball") {
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

  const countState = target?.countState || "neutral";
  const dist = getBallDistributionByCount(pitchName, countState);

  const isTopEdge = row === 0 && col >= 1 && col <= 3;
  const isBottomEdge = row === 4 && col >= 1 && col <= 3;
  const isSideEdge = col === 0 && row >= 1 && row <= 3;
  const isCornerFar =
    (row === 0 || row === 4) &&
    (col === 0 || col === 4);

  let ballType = "obvious";
  let ballTypeLabel = "明確なボール";
  let obviousBall = true;
  let edgeBall = false;
  let chaseableBall = false;

  if (isTopEdge) {
    ballType = "edge_high";
    ballTypeLabel = "際どいボール（高め）";
    obviousBall = false;
    edgeBall = true;
  } else if (isBottomEdge) {
    ballType = "edge_low";
    ballTypeLabel = "際どいボール（低め）";
    obviousBall = false;
    edgeBall = true;
  } else if (isSideEdge) {
    ballType = "edge_side";
    ballTypeLabel = "際どいボール（横）";
    obviousBall = false;
    edgeBall = true;
  } else if (isCornerFar) {
    ballType = "obvious";
    ballTypeLabel = "明確なボール";
    obviousBall = true;
  } else {
    ballType = "chaseable";
    ballTypeLabel = "誘い球";
    obviousBall = false;
    chaseableBall = true;
  }

  return {
    ballType,
    ballTypeLabel,
    obviousBall,
    edgeBall,
    chaseableBall,
    targetObviousBallRate: dist.obvious,
    targetEdgeBallRate: dist.edge,
    targetChaseableBallRate: dist.chaseable,
    targetEdgeHighRate: null,
  };
}