import { calcSimplePlayerValue, getPlayerExpectedValue } from "./playerValueService.js";

export function pickWeakestLineupPlayer(rosterState) {
  const lineup = rosterState?.lineup || [];
  if (!lineup.length) return null;

  let weakest = lineup[0];
  let weakestValue = calcSimplePlayerValue(weakest);

  for (let i = 1; i < lineup.length; i += 1) {
    const player = lineup[i];
    const value = calcSimplePlayerValue(player);
    if (value < weakestValue) {
      weakest = player;
      weakestValue = value;
    }
  }

  return weakest;
}

export function pickBestBenchBatter(rosterState) {
  const bench = (rosterState?.bench || []).filter(
    (player) => player?.type !== "pitcher"
  );
  if (!bench.length) return null;

  let best = bench[0];
  let bestValue = calcSimplePlayerValue(best);

  for (let i = 1; i < bench.length; i += 1) {
    const player = bench[i];
    const value = calcSimplePlayerValue(player);
    if (value > bestValue) {
      best = player;
      bestValue = value;
    }
  }

  return best;
}

export function pickBestFreeAgent(freeAgents, predicate = () => true) {
  let best = null;
  let bestValue = -Infinity;

  for (const player of freeAgents || []) {
    if (!predicate(player)) continue;

    const value = getPlayerExpectedValue(player);
    if (value > bestValue) {
      best = player;
      bestValue = value;
    }
  }

  return best;
}