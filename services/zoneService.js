import { ZONE_CONFIG } from "../config/zoneConfig.js";

function random() {
  return Math.random();
}

function pickRandom(cells) {
  return cells[Math.floor(random() * cells.length)];
}

export function chooseZoneSpot(course, isStrike) {
  if (!isStrike) {
    return random() < ZONE_CONFIG.ball.outerShare
      ? pickRandom(ZONE_CONFIG.ball.outerCells)
      : pickRandom(ZONE_CONFIG.ball.borderCells);
  }

  if (course === "A") return pickRandom(ZONE_CONFIG.strike.A);
  if (course === "B") return pickRandom(ZONE_CONFIG.strike.B);
  if (course === "C") return pickRandom(ZONE_CONFIG.strike.C);
  return pickRandom(ZONE_CONFIG.strike.Default);
}