export function beginPlateAppearanceIfNeeded(state, { pickBatter, addPlateAppearanceStat }) {
  if (state.plateAppearanceActive) return;

  const batter = pickBatter(state);
  addPlateAppearanceStat(batter);
  state.plateAppearanceActive = true;
}

export function finishPlateAppearanceState(
  state,
  {
    defenseSide,
    resetCount,
    maybeAutoChangePitcher,
    emitLog,
    options,
  }
) {
  const side = defenseSide(state);

  if (state.pitcherUsage?.[side]) {
    state.pitcherUsage[side].battersFaced += 1;
  }

  state.plateAppearanceActive = false;
  resetCount(state);

  if (typeof maybeAutoChangePitcher === "function") {
    maybeAutoChangePitcher(state, {
      defenseSide,
      emitLog: (text) => {
        if (typeof emitLog === "function") emitLog(options, text);
      },
      betweenInnings: false,
    });
  }
}