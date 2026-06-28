function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function gaussian(random) {
  const u1 = Math.max(random(), Number.EPSILON);
  const u2 = Math.max(random(), Number.EPSILON);
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function getBatterRatings(batter) {
  return {
    contact: Number(batter?.ratings?.contact ?? batter?.meet ?? 50),
    power: Number(batter?.ratings?.power ?? batter?.power ?? 50),
    eye: Number(batter?.ratings?.eye ?? batter?.eye ?? 50),
  };
}

function pitchTypeEvAdjustment(pitchType) {
  switch (pitchType) {
    case "fourSeam":
      return 0.8;
    case "slider":
      return -0.8;
    case "curve":
      return -1.3;
    case "fork":
      return -1.8;
    default:
      return 0;
  }
}

function pitchTypeLaAdjustment(pitchType) {
  switch (pitchType) {
    case "fourSeam":
      return 1.2;
    case "slider":
      return -0.8;
    case "curve":
      return 2.0;
    case "fork":
      return -2.4;
    default:
      return 0;
  }
}

function courseEvAdjustment(course) {
  if (course === "C") return 3.5;
  if (course === "A") return -4.0;
  return 0;
}

function courseLaAdjustment(course) {
  if (course === "C") return 1.5;
  if (course === "A") return -2.5;
  return 0;
}

// QoC is a derived analysis label from EV/LA.
// It must not drive the actual batted-ball outcome.
export function classifyQoCFromEvLa(exitVelocity, launchAngle) {
  const ev = Number(exitVelocity);
  const la = Number(launchAngle);

  if (!Number.isFinite(ev) || !Number.isFinite(la)) return "Weak";
  if (ev >= 98 && la >= 8 && la <= 32) return "Barrel";
  if (ev >= 92 && la >= 5 && la <= 35) return "Solid";
  if (ev < 70) return "Weak";
  if (la < -10) return "Topped";
  if (la > 45) return "Under";
  if (ev < 86 && la >= 10 && la <= 35) return "Flare";
  if (la >= 32) return "Under";
  if (la <= 5) return "Topped";
  return "Flare";
}

export function generateFairBattedBall({
  batter,
  course,
  pitchType,
  pitchVelocity,
  isStrike,
  random = Math.random,
}) {
  const ratings = getBatterRatings(batter);
  const contactScore = clamp((ratings.contact - 50) / 50, -1, 1);
  const powerScore = clamp((ratings.power - 50) / 50, -1, 1);
  const eyeScore = clamp((ratings.eye - 50) / 50, -1, 1);
  const velocity = Number(pitchVelocity);
  const pitchSpeedScore = Number.isFinite(velocity) ? (velocity - 92) / 10 : 0;

  const evMean =
    87 +
    powerScore * 8 +
    contactScore * 3 +
    eyeScore * 1.2 +
    pitchSpeedScore * 1.6 +
    courseEvAdjustment(course) +
    pitchTypeEvAdjustment(pitchType) +
    (isStrike ? 0.8 : -2.0);

  const laMean =
    12 +
    powerScore * 4 +
    contactScore * 1.5 -
    Math.max(0, -contactScore) * 3 +
    courseLaAdjustment(course) +
    pitchTypeLaAdjustment(pitchType) +
    (isStrike ? 0 : -4);

  const evSpread = 8.5 - Math.max(0, contactScore) * 1.5 + Math.max(0, powerScore) * 0.8;
  const laSpread = 18 - Math.max(0, contactScore) * 3 + Math.max(0, -contactScore) * 3;

  const exitVelocity = clamp(evMean + gaussian(random) * evSpread, 50, 120);
  const launchAngle = clamp(laMean + gaussian(random) * laSpread, -90, 90);
  // Keep QoC for logs, debug displays, and future analysis such as Barrel%.
  const qoc = classifyQoCFromEvLa(exitVelocity, launchAngle);

  return {
    exitVelocity: Number(exitVelocity.toFixed(1)),
    launchAngle: Number(launchAngle.toFixed(1)),
    qoc,
  };
}
