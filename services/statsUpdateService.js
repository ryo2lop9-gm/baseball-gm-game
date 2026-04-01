export function addPlateAppearanceStat(batter) {
  if (!batter?.gameStats) return;
  batter.gameStats.PA += 1;
}

export function addStrikeoutStat(batter) {
  if (!batter?.gameStats) return;
  batter.gameStats.K += 1;
}

export function addWalkStat(batter, rbi = 0) {
  if (!batter?.gameStats) return;
  batter.gameStats.BB += 1;
  batter.gameStats.RBI += rbi;
}

export function addHitStat(batter, hitType, rbi = 0) {
  if (!batter?.gameStats) return;

  batter.gameStats.AB += 1;
  batter.gameStats.H += 1;
  batter.gameStats.RBI += rbi;

  if (hitType === "2B") batter.gameStats.doubles += 1;
  if (hitType === "3B") batter.gameStats.triples += 1;
  if (hitType === "HR") batter.gameStats.HR += 1;
}

export function addOutInPlayStat(batter) {
  if (!batter?.gameStats) return;
  batter.gameStats.AB += 1;
}