function pickOne(items, random = Math.random) {
  if (!Array.isArray(items) || items.length === 0) {
    return [2, 2];
  }
  const index = Math.floor(random() * items.length);
  return items[index];
}

const STRIKE_SPOTS = {
  A: [
    [1, 1],
    [1, 3],
    [3, 1],
    [3, 3],
  ],
  B: [
    [1, 2],
    [2, 1],
    [2, 3],
    [3, 2],
  ],
  C: [
    [2, 2],
  ],
};

const BALL_SPOTS = {
  A: [
    [0, 1],
    [1, 0],
    [0, 3],
    [1, 4],
    [3, 0],
    [4, 1],
    [3, 4],
    [4, 3],
  ],
  B: [
    [0, 2],
    [2, 0],
    [2, 4],
    [4, 2],
  ],
  C: [
    [0, 0],
    [0, 4],
    [4, 0],
    [4, 4],
  ],
};

export function chooseZoneSpot(course, isStrike, random = Math.random) {
  const safeCourse = ["A", "B", "C"].includes(course) ? course : "B";

  if (isStrike) {
    return pickOne(STRIKE_SPOTS[safeCourse], random);
  }

  return pickOne(BALL_SPOTS[safeCourse], random);
}