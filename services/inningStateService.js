function defaultEmitLog() {}

function finishGame(state, finalHalf, message, emitLog = defaultEmitLog) {
  state.isComplete = true;
  state.finalInning = state.inning;
  state.finalHalf = finalHalf;
  emitLog(message);
  return true;
}

export function maybeEndGameMidInning(
  state,
  { emitLog = defaultEmitLog } = {}
) {
  if (
    state.inning >= 9 &&
    state.half === "bottom" &&
    state.score.home > state.score.away
  ) {
    return finishGame(
      state,
      "bottom",
      `サヨナラ！試合終了: ${state.awayTeam.name} ${state.score.away} - ${state.score.home} ${state.homeTeam.name}`,
      emitLog
    );
  }

  return false;
}

export function maybeChangeSides(
  state,
  {
    emitLog = defaultEmitLog,
    resetCount,
    clearBases,
    maybeAutoChangePitcher,
  } = {}
) {
  if (state.outs < 3 || state.isComplete) return false;

  if (state.half === "top") {
    if (state.inning >= 9 && state.score.home > state.score.away) {
      return finishGame(
        state,
        "top",
        `試合終了: ${state.awayTeam.name} ${state.score.away} - ${state.score.home} ${state.homeTeam.name}`,
        emitLog
      );
    }

    if (typeof maybeAutoChangePitcher === "function") {
      maybeAutoChangePitcher(true);
    }

    state.half = "bottom";
    state.outs = 0;

    if (typeof resetCount === "function") resetCount();
    if (typeof clearBases === "function") clearBases();

    state.plateAppearanceActive = false;
    emitLog(`${state.inning}回裏へ`);
    return true;
  }

  if (state.inning >= 9 && state.score.home !== state.score.away) {
    return finishGame(
      state,
      "bottom",
      `試合終了: ${state.awayTeam.name} ${state.score.away} - ${state.score.home} ${state.homeTeam.name}`,
      emitLog
    );
  }

  if (typeof maybeAutoChangePitcher === "function") {
    maybeAutoChangePitcher(true);
  }

  state.inning += 1;
  state.half = "top";
  state.outs = 0;

  if (typeof resetCount === "function") resetCount();
  if (typeof clearBases === "function") clearBases();

  state.plateAppearanceActive = false;
  emitLog(`${state.inning}回表へ`);
  return true;
}