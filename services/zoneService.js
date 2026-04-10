function pickOne(items, random = Math.random) {
  if (!Array.isArray(items) || items.length === 0) {
    return [2, 2];
  }
  const index = Math.floor(random() * items.length);
  return items[index];
}

const STRIKE_SPOT_POOLS = {
  A: [
    [1, 1], [1, 3], [3, 1], [3, 3],
    [1, 1], [1, 3], [3, 1], [3, 3],
    [1, 2], [2, 1], [2, 3], [3, 2],
    [2, 2],
  ],
  B: [
    [1, 2], [2, 1], [2, 3], [3, 2],
    [1, 2], [2, 1], [2, 3], [3, 2],
    [1, 1], [1, 3], [3, 1], [3, 3],
    [2, 2],
  ],
  C: [
    [2, 2], [2, 2], [2, 2], [2, 2],
    [1, 2], [2, 1], [2, 3], [3, 2],
    [1, 1], [1, 3], [3, 1], [3, 3],
  ],
};

const BALL_SPOT_POOLS = {
  A: [
    [0, 0], [0, 4], [4, 0], [4, 4],
    [0, 0], [0, 4], [4, 0], [4, 4],
    [0, 1], [1, 0], [0, 3], [1, 4], [3, 0], [4, 1], [3, 4], [4, 3],
    [0, 2], [2, 0], [2, 4], [4, 2],
  ],
  B: [
    [0, 1], [1, 0], [0, 3], [1, 4], [3, 0], [4, 1], [3, 4], [4, 3],
    [0, 1], [1, 0], [0, 3], [1, 4], [3, 0], [4, 1], [3, 4], [4, 3],
    [0, 2], [2, 0], [2, 4], [4, 2],
    [0, 0], [0, 4], [4, 0], [4, 4],
  ],
  C: [
    [0, 2], [2, 0], [2, 4], [4, 2],
    [0, 2], [2, 0], [2, 4], [4, 2],
    [0, 1], [1, 0], [0, 3], [1, 4], [3, 0], [4, 1], [3, 4], [4, 3],
    [0, 0], [0, 4], [4, 0], [4, 4],
  ],
};

export function chooseZoneSpot(course, isStrike, random = Math.random) {
  const safeCourse = ["A", "B", "C"].includes(course) ? course : "B";
  const pool = isStrike ? STRIKE_SPOT_POOLS[safeCourse] : BALL_SPOT_POOLS[safeCourse];
  return pickOne(pool, random);
}