export function currentSide(state) {
  return state.half === "top" ? "away" : "home";
}

export function defenseSide(state) {
  return currentSide(state) === "away" ? "home" : "away";
}

export function offenseTeam(state) {
  return currentSide(state) === "away" ? state.awayTeam : state.homeTeam;
}

export function defensePitcher(state) {
  const side = defenseSide(state);
  return (
    state.activePitchers?.[side] ||
    (side === "away"
      ? state.awayTeam.startingPitcher
      : state.homeTeam.startingPitcher)
  );
}

export function defensePitcherUsage(state) {
  const side = defenseSide(state);
  return state.pitcherUsage?.[side] || null;
}

export function pickBatter(state) {
  const side = currentSide(state);
  const team = offenseTeam(state);
  const index = state.battingIndex[side] % team.lineup.length;
  return team.lineup[index];
}

export function moveToNextBatter(state) {
  const side = currentSide(state);
  state.battingIndex[side] = (state.battingIndex[side] + 1) % 9;
}

export function resetCount(state) {
  state.balls = 0;
  state.strikes = 0;
}

export function clearBases(state) {
  state.bases.first = null;
  state.bases.second = null;
  state.bases.third = null;
}