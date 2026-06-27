function createEmptyLastPitch() {
  return {
    pitchType: "",
    pitchVelocity: null,
    baseCourse: "",
    course: "",
    isStrike: null,
    swung: null,
    madeContact: null,
    resultText: "",
    zoneRow: null,
    zoneCol: null,
    row: null,
    col: null,

    strikeType: null,
    strikeTypeLabel: "",
    strikeJudgeDifficulty: null,
    borderLikelihood: null,

    ballType: null,
    ballTypeLabel: "",
    obviousBall: null,
    edgeBall: null,
    chaseableBall: null,

    targetObviousBallRate: null,
    targetEdgeBallRate: null,
    targetChaseableBallRate: null,
    targetEdgeHighRate: null,

    rawOSwingRate: null,
    adjustedOSwingRate: null,
    rawOContactRate: null,
    adjustedOContactRate: null,

    mistakeRate: null,
    isMistake: null,
    drift: null,

    outcomeSource: "",
    evLaKey: "",
    sampleQuality: "",
  };
}

function createEmptyPresentation() {
  return {
    logLines: [],
    currentBatterName: "",
    currentPitcherName: "",
    lastPitch: createEmptyLastPitch(),
  };
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function mergeLastPitchPatch(prev, patch) {
  const base = isPlainObject(prev) ? prev : createEmptyLastPitch();
  const next = { ...base };

  if (!isPlainObject(patch)) {
    return next;
  }

  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) {
      next[key] = value;
    }
  }

  return next;
}

export function ensurePresentationState(state) {
  if (!state.presentation || typeof state.presentation !== "object") {
    state.presentation = createEmptyPresentation();
    return state.presentation;
  }

  if (!Array.isArray(state.presentation.logLines)) {
    state.presentation.logLines = [];
  }

  if (!isPlainObject(state.presentation.lastPitch)) {
    state.presentation.lastPitch = createEmptyLastPitch();
  } else {
    state.presentation.lastPitch = mergeLastPitchPatch(
      createEmptyLastPitch(),
      state.presentation.lastPitch
    );
  }

  if (typeof state.presentation.currentBatterName !== "string") {
    state.presentation.currentBatterName = "";
  }

  if (typeof state.presentation.currentPitcherName !== "string") {
    state.presentation.currentPitcherName = "";
  }

  return state.presentation;
}

export function clearPresentationLog(state) {
  const presentation = ensurePresentationState(state);
  presentation.logLines = [];
}

export function appendPresentationLog(state, text) {
  const presentation = ensurePresentationState(state);
  presentation.logLines.push(String(text ?? ""));
}

export function setPresentationNames(state, { batterName, pitcherName }) {
  const presentation = ensurePresentationState(state);

  if (typeof batterName === "string") {
    presentation.currentBatterName = batterName;
  }
  if (typeof pitcherName === "string") {
    presentation.currentPitcherName = pitcherName;
  }
}

export function resetLastPitch(state) {
  const presentation = ensurePresentationState(state);
  presentation.lastPitch = createEmptyLastPitch();
}

export function patchLastPitch(state, patch) {
  const presentation = ensurePresentationState(state);
  presentation.lastPitch = mergeLastPitchPatch(presentation.lastPitch, patch);
  return presentation.lastPitch;
}

export function syncPresentationFromRuntime(state) {
  const presentation = ensurePresentationState(state);

  const currentSide = state?.half === "top" ? "away" : "home";
  const defenseSide = currentSide === "away" ? "home" : "away";

  const batterIndex =
    currentSide === "away"
      ? state?.awayTeam?.batterIndex ?? 0
      : state?.homeTeam?.batterIndex ?? 0;

  const batter =
    currentSide === "away"
      ? state?.awayTeam?.lineup?.[batterIndex] || null
      : state?.homeTeam?.lineup?.[batterIndex] || null;

  const pitcher = state?.activePitchers?.[defenseSide] || null;

  presentation.currentBatterName = batter?.name || "";
  presentation.currentPitcherName = pitcher?.name || "";

  return presentation;
}

export function createPresentationCallbacks(state) {
  ensurePresentationState(state);

  return {
    onLog(text) {
      appendPresentationLog(state, text);
    },

    onLastPitchPatch(patch) {
      patchLastPitch(state, patch);
    },

    onResetLastPitch() {
      resetLastPitch(state);
    },
  };
}
