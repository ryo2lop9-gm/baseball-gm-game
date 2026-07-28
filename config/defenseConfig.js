export const DEFENSE_POSITIONS = Object.freeze([
  "P",
  "C",
  "1B",
  "2B",
  "3B",
  "SS",
  "LF",
  "CF",
  "RF",
]);

export const DEFENSIVE_LINEUP_POSITIONS = Object.freeze([
  "C",
  "1B",
  "2B",
  "3B",
  "SS",
  "LF",
  "CF",
  "RF",
]);

export const DESIGNATED_HITTER_POSITION = "DH";

export const PLAYER_DEFENSE_POSITIONS = Object.freeze([
  ...DEFENSE_POSITIONS,
  DESIGNATED_HITTER_POSITION,
]);

export const NEUTRAL_DEFENSE_RATING = 50;
export const MIN_DEFENSE_RATING = 0;
export const MAX_DEFENSE_RATING = 100;

export function isPlayerDefensePosition(position) {
  return PLAYER_DEFENSE_POSITIONS.includes(position);
}

export function isDefensiveLineupPosition(position) {
  return DEFENSIVE_LINEUP_POSITIONS.includes(position);
}
