export function createAppState({ gmState, tuningState, tuningSeasonSummary = null }) {
  return {
    currentPage: "gm",
    gm: gmState,
    tuning: tuningState,
    tuningSeasonSummary,
  };
}

export function setCurrentPage(appState, pageName) {
  return {
    ...appState,
    currentPage: pageName,
  };
}

export function setGMState(appState, gmState) {
  return {
    ...appState,
    gm: gmState,
  };
}

export function setTuningState(appState, tuningState) {
  return {
    ...appState,
    tuning: tuningState,
  };
}

export function setTuningSeasonSummary(appState, tuningSeasonSummary) {
  return {
    ...appState,
    tuningSeasonSummary,
  };
}