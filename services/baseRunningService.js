function resolveCurrentSide(state) {
  return state.half === "top" ? "away" : "home";
}

function createRunnerRef(state, batter, currentSide = resolveCurrentSide(state)) {
  return {
    side: currentSide,
    name: batter?.name || "Runner",
    batterName: batter?.name || "Runner",
  };
}

function creditRunToRunner(state, runner) {
  if (!runner?.side || !runner?.name) return;

  const team = runner.side === "away" ? state.awayTeam : state.homeTeam;
  const player = team.lineup.find((p) => p.name === runner.name);

  if (player?.gameStats) {
    player.gameStats.R += 1;
  }
}

function addRuns(state, runs, currentSide = resolveCurrentSide(state)) {
  if (runs <= 0) return;

  state.score[currentSide] += runs;
  state.box[currentSide].runs += runs;
}

function scoreRunnerGroup(state, runners, currentSide = resolveCurrentSide(state)) {
  if (!Array.isArray(runners) || runners.length === 0) return 0;

  runners.forEach((runner) => creditRunToRunner(state, runner));
  addRuns(state, runners.length, currentSide);

  return runners.length;
}

export function applyWalkAdvance(
  state,
  batter,
  currentSide = resolveCurrentSide(state)
) {
  const current = { ...state.bases };

  const next = {
    first: createRunnerRef(state, batter, currentSide),
    second: null,
    third: current.third,
  };

  const scoring = [];

  if (current.first) {
    next.second = current.first;

    if (current.second) {
      next.third = current.second;

      if (current.third) scoring.push(current.third);
    }
  } else {
    next.second = current.second;
  }

  state.bases = next;

  return scoreRunnerGroup(state, scoring, currentSide);
}

export function advanceRunnersOnHit(
  state,
  batter,
  basesTaken,
  currentSide = resolveCurrentSide(state)
) {
  const current = [state.bases.first, state.bases.second, state.bases.third];
  const next = { first: null, second: null, third: null };
  const scoring = [];
  const batterRunner = createRunnerRef(state, batter, currentSide);

  for (let i = 2; i >= 0; i -= 1) {
    const runner = current[i];
    if (!runner) continue;

    const dest = i + basesTaken;

    if (dest >= 3) {
      scoring.push(runner);
    } else if (dest === 0) {
      next.first = runner;
    } else if (dest === 1) {
      next.second = runner;
    } else {
      next.third = runner;
    }
  }

  if (basesTaken >= 4) {
    scoring.push(batterRunner);
  } else if (basesTaken === 1) {
    next.first = batterRunner;
  } else if (basesTaken === 2) {
    next.second = batterRunner;
  } else if (basesTaken === 3) {
    next.third = batterRunner;
  }

  state.bases = next;

  return scoreRunnerGroup(state, scoring, currentSide);
}