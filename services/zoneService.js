import { ZONE_CONFIG } from "../config/zoneConfig.js";

function random() {
  return Math.random();
}

function pickRandom(cells) {
  if (!Array.isArray(cells) || cells.length === 0) {
    return [2, 2];
  }
  return cells[Math.floor(random() * cells.length)];
}

function pickWeightedStrikeSpot(group) {
  if (!group) {
    return pickRandom(ZONE_CONFIG.strike.Default);
  }

  const primary = Array.isArray(group.primary) ? group.primary : [];
  const secondary = Array.isArray(group.secondary) ? group.secondary : [];
  const primaryShare =
    typeof group.primaryShare === "number" ? group.primaryShare : 0.7;

  if (primary.length === 0 && secondary.length === 0) {
    return pickRandom(ZONE_CONFIG.strike.Default);
  }

  if (primary.length === 0) {
    return pickRandom(secondary);
  }

  if (secondary.length === 0) {
    return pickRandom(primary);
  }

  return random() < primaryShare ? pickRandom(primary) : pickRandom(secondary);
}

export function chooseZoneSpot(course, isStrike) {
  if (!isStrike) {
    return random() < ZONE_CONFIG.ball.outerShare
      ? pickRandom(ZONE_CONFIG.ball.outerCells)
      : pickRandom(ZONE_CONFIG.ball.borderCells);
  }

  if (course === "A") {
    return pickWeightedStrikeSpot(ZONE_CONFIG.strike.A);
  }

  if (course === "B") {
    return pickWeightedStrikeSpot(ZONE_CONFIG.strike.B);
  }

  if (course === "C") {
    return pickWeightedStrikeSpot(ZONE_CONFIG.strike.C);
  }

  return pickRandom(ZONE_CONFIG.strike.Default);
}