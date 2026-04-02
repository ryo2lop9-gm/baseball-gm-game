function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function weightedChoiceObject(weights, random = Math.random) {
  const entries = Object.entries(weights || {}).filter(
    ([, value]) => Number.isFinite(value) && value > 0
  );

  if (entries.length === 0) {
    return null;
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

export function isStrikeCell(row, col) {
  return row >= 1 && row <= 3 && col >= 1 && col <= 3;
}

export function getCourseGrade(row, col) {
  if (!isStrikeCell(row, col)) {
    return "Ball";
  }

  if (row === 2 && col === 2) {
    return "C";
  }

  if (
    (row === 1 && col === 2) ||
    (row === 2 && col === 1) ||
    (row === 2 && col === 3) ||
    (row === 3 && col === 2)
  ) {
    return "B";
  }

  return "A";
}

export function classifyStrikeType(
  row,
  col,
  pitchType,
  controlValue,
  drift = 0,
  isMistake = false,
  random = Math.random
) {
  const course = getCourseGrade(row, col);

  if (course === "Ball") {
    return {
      strikeType: null,
      strikeTypeLabel: null,
      strikeJudgeDifficulty: 0,
      borderLikelihood: 0,
    };
  }

  if (course === "C") {
    return {
      strikeType: "meat",
      strikeTypeLabel: "あからさまなストライク",
      strikeJudgeDifficulty: 0.02,
      borderLikelihood: 0.0,
    };
  }

  const controlN = clamp(((Number(controlValue) || 50) - 50) / 50, -1, 1);

  const pitchEdgeAdj =
    {
      fourSeam: -0.02,
      curve: 0.02,
      slider: 0.03,
      fork: 0.05,
    }[pitchType] || 0;

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

  probs.meat = Math.max(0.001, probs.meat);
  probs.normal = Math.max(0.001, probs.normal);
  probs.borderline = Math.max(0.001, probs.borderline);
  probs.razor = Math.max(0.001, probs.razor);

  const strikeType = weightedChoiceObject(probs, random) || "normal";

  const typeMap = {
    meat: {
      label: "あからさまなストライク",
      judge: 0.02,
      borderLikelihood: 0.0,
    },
    normal: {
      label: "普通のストライク",
      judge: 0.18,
      borderLikelihood: 0.12,
    },
    borderline: {
      label: "きわどいストライク",
      judge: 0.30,
      borderLikelihood: 0.30,
    },
    razor: {
      label: "ギリギリのストライク",
      judge: 0.52,
      borderLikelihood: 0.50,
    },
  };

  return {
    strikeType,
    strikeTypeLabel: typeMap[strikeType].label,
    strikeJudgeDifficulty: typeMap[strikeType].judge,
    borderLikelihood: typeMap[strikeType].borderLikelihood,
  };
}

export function getPitchTypeBallQualityProfile(pitchType) {
  return (
    {
      fourSeam: {
        obvious: 0.45,
        edge: 0.25,
        chaseable: 0.30,
        edgeHighBase: 0.50,
      },
      slider: {
        obvious: 0.30,
        edge: 0.30,
        chaseable: 0.40,
        edgeHighBase: 0.45,
      },
      curve: {
        obvious: 0.35,
        edge: 0.30,
        chaseable: 0.35,
        edgeHighBase: 0.36,
      },
      fork: {
        obvious: 0.20,
        edge: 0.25,
        chaseable: 0.55,
        edgeHighBase: 0.24,
      },
    }[pitchType] || {
      obvious: 0.50,
      edge: 0.30,
      chaseable: 0.20,
      edgeHighBase: 0.40,
    }
  );
}

export function getBallDistributionByCount(pitchType, countState) {
  const base = getPitchTypeBallQualityProfile(pitchType);
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

export function getCountState(balls, strikes) {
  if (strikes >= 2) return "twoStrike";
  if (balls > strikes) return "batterAhead";
  if (strikes > balls) return "pitcherAhead";
  return "neutral";
}

export function classifyBallType(
  row,
  col,
  pitchType,
  balls,
  strikes,
  drift = 0,
  isMistake = false,
  random = Math.random
) {
  if (row === null || col === null) {
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

  const countState = getCountState(balls, strikes);
  const dist = getBallDistributionByCount(pitchType, countState);

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

  if (pitchType === "fork") {
    chaseable += 0.05;
    obvious -= 0.02;
    edge -= 0.03;
  }

  if (pitchType === "fourSeam") {
    edge += 0.04;
    chaseable -= 0.02;
    obvious -= 0.02;
  }

  if (pitchType === "slider") {
    chaseable += 0.03;
    obvious -= 0.01;
    edge -= 0.02;
  }

  if (pitchType === "curve") {
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
  let ballTypeLabel = "際どいボール（低め）";

  let edgeHighChance = dist.edgeHighBase;

  if (r < obvious) {
    ballType = "obvious";
    ballTypeLabel = "明確なボール";
    obviousBall = true;
  } else if (r < obvious + chaseable) {
    ballType = "chaseable";
    ballTypeLabel = "誘い球";
  } else {
    if (isNearZoneRing) edgeHighChance += 0.08;
    if (pitchType === "fourSeam") edgeHighChance += 0.06;
    if (pitchType === "fork") edgeHighChance -= 0.05;
    edgeHighChance = clamp(edgeHighChance, 0.20, 0.72);
    ballType = random() < edgeHighChance ? "edge_high" : "edge_low";
    ballTypeLabel =
      ballType === "edge_high" ? "際どいボール（高め）" : "際どいボール（低め）";
  }

  return {
    ballType,
    ballTypeLabel,
    obviousBall,
    edgeBall: !obviousBall && ballType !== "chaseable",
    chaseableBall: ballType === "chaseable",
    targetObviousBallRate: obvious,
    targetEdgeBallRate: edge,
    targetChaseableBallRate: chaseable,
    targetEdgeHighRate: dist.edgeHighBase,
  };
}