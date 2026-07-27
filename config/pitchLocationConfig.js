const DEFAULT_STRIKE_ZONE = Object.freeze({
  xMin: -10 / 12,
  xMax: 10 / 12,
  zMin: 1.5,
  zMax: 3.5,
});

const NORMALIZED_RADIUS_LIMITS = Object.freeze({
  meatballMax: 1 / 3,
  heartMax: 2 / 3,
  zoneMax: 1,
  shadowOuterMax: 4 / 3,
  chaseMax: 2,
});

const LEGACY_GRID = Object.freeze({
  centerHalfExtent: 1 / 3,
  firstOutside: 0,
  firstInside: 1,
  center: 2,
  lastInside: 3,
  lastOutside: 4,
});

// Rectangular attack-region boundaries are based on these public zone references:
// https://baseballsavant.mlb.com/visuals/swing-take
// https://tangotiger.net/strikezone/zone%20chart.png
// https://baseballsavant.mlb.com/leaderboard/catcher-framing
export const PITCH_LOCATION_CONFIG = Object.freeze({
  defaultStrikeZone: DEFAULT_STRIKE_ZONE,
  normalizedRadiusLimits: NORMALIZED_RADIUS_LIMITS,
  legacyGrid: LEGACY_GRID,
});

export { DEFAULT_STRIKE_ZONE };
