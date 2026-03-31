function createEmptyLastPitch() {
  return {
    pitchType: "",
    course: "",
    isStrike: false,
    swung: false,
    madeContact: false,
    resultText: "",
    zoneRow: null,
    zoneCol: null,
  };
}

function currentSide(state) {
  return state.half === "top" ? "away" : "home";
}

function defenseSide(state) {
  return currentSide(state) === "away" ? "home" : "away";
}

function pickCurrentBatterName(state) {
  const side = currentSide(state);
  const team = side === "away" ? state.awayTeam : state.homeTeam;
  const index = state.battingIndex?.[side] ?? 0;
  return team?.lineup?.[index % (team?.lineup?.length || 1)]?.name || "-";
}

function pickCurrentPitcherName(state) {
  const side = defenseSide(state);
  return (
    state?.activePitchers?.[side]?.name ||
    (side === "away" ? state?.awayTeam?.startingPitcher?.name : state?.homeTeam?.startingPitcher?.name) ||
    "-"
  );
}

export function ensurePresentationState(state) {
  if (!state) return null;

  if (!state.presentation) {
    state.presentation = {
      currentBatterName: "-",
      currentPitcherName: "-",
      log: [],
      lastPitch: createEmptyLastPitch(),
    };
  }

  if (!Array.isArray(state.presentation.log)) {
    state.presentation.log = [];
  }

  if (!state.presentation.lastPitch) {
    state.presentation.lastPitch = createEmptyLastPitch();
  }

  return state.presentation;
}

export function syncPresentationFromRuntime(state) {
  const presentation = ensurePresentationState(state);
  if (!presentation) return state;

  presentation.currentBatterName = pickCurrentBatterName(state);
  presentation.currentPitcherName = pickCurrentPitcherName(state);

  return state;
}

export function pushPresentationLog(state, text) {
  const presentation = ensurePresentationState(state);
  if (!presentation) return;
  presentation.log.push(text);
}

export function applyLastPitchPatch(state, patch) {
  const presentation = ensurePresentationState(state);
  if (!presentation) return;

  presentation.lastPitch = {
    ...createEmptyLastPitch(),
    ...presentation.lastPitch,
    ...(patch || {}),
  };
}

export function createPresentationCallbacks(state) {
  return {
    onLog(text) {
      pushPresentationLog(state, text);
    },
    onLastPitchPatch(patch) {
      applyLastPitchPatch(state, patch);
    },
  };
}