export function choosePitchType(pitcher, random = Math.random) {
  const mix = pitcher?.pitchMix || {
    fourSeam: 0.45,
    slider: 0.25,
    curve: 0.12,
    fork: 0.18,
  };

  const roll = random();
  let cumulative = 0;

  for (const key of ["fourSeam", "slider", "curve", "fork"]) {
    cumulative += mix[key] || 0;
    if (roll <= cumulative) return key;
  }

  return "fourSeam";
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
  const course = chooseCourse(pitcher, random);

  const probs = calcPitchOutcomeProbabilities(
    batter,
    pitcher,
    course,
    pitchType,
    balls,
    strikes
  );

  const isStrike = random() < probs.strikeRate;
  const swingRate = isStrike ? probs.zSwingRate : probs.oSwingRate;
  const swung = random() < swingRate;

  const [zoneRow, zoneCol] = shouldPatchLastPitch
    ? chooseZoneSpot(course, isStrike)
    : [null, null];

  return {
    pitchType,
    course,
    probs,
    isStrike,
    swung,
    zoneRow,
    zoneCol,
  };
}