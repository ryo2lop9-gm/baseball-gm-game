function createPitcherUsageEntry(pitcher, inning) {
  return {
    pitcherName: pitcher?.name || "-",
    pitches: 0,
    battersFaced: 0,
    outsRecorded: 0,
    enteredInning: inning || 1,
  };
}

export function changePitcher(state, side, options, reasonText = "") {
  const team = side === "away" ? state.awayTeam : state.homeTeam;
  if (!team?.bullpen || team.bullpen.length === 0) return false;

  const nextPitcher = structuredClone(team.bullpen.shift());
  const previousPitcher = state.activePitchers?.[side] || team.startingPitcher;

  if (!state.activePitchers) {
    state.activePitchers = {
      away: state.awayTeam.startingPitcher,
      home: state.homeTeam.startingPitcher,
    };
  }

  state.activePitchers[side] = nextPitcher;

  if (!state.pitcherUsage) {
    state.pitcherUsage = {
      away: createPitcherUsageEntry(state.activePitchers.away, state.inning),
      home: createPitcherUsageEntry(state.activePitchers.home, state.inning),
    };
  }

  state.pitcherUsage[side] = createPitcherUsageEntry(nextPitcher, state.inning);

  if (typeof options?.emitLog === "function") {
    const teamLabel = side === "away" ? state.awayTeam.name : state.homeTeam.name;
    options.emitLog(
      `${teamLabel}: 投手交代 ${previousPitcher?.name || "-"} → ${nextPitcher?.name || "-"}${
        reasonText ? `（${reasonText}）` : ""
      }`
    );
  }

  return true;
}

export function maybeAutoChangePitcher(
  state,
  {
    defenseSide,
    emitLog,
    betweenInnings = false,
  } = {}
) {
  if (typeof defenseSide !== "function") return false;

  const side = defenseSide(state);
  const usage = state.pitcherUsage?.[side];
  const team = side === "away" ? state.awayTeam : state.homeTeam;

  if (!usage || (team?.bullpen || []).length === 0) return false;

  const shouldChange =
    usage.pitches >= (betweenInnings ? 75 : 95) ||
    usage.battersFaced >= (betweenInnings ? 21 : 27);

  if (!shouldChange) return false;

  return changePitcher(
    state,
    side,
    {
      emitLog,
    },
    `${usage.pitches}球`
  );
}