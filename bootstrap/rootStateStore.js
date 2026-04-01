export function createRootStateStore() {
  let appState = null;
  let statsIndex = null;
  let tuningRosterBundle = null;

  function getRootState() {
    return {
      appState,
      statsIndex,
      tuningRosterBundle,
    };
  }

  function setRootState(rootState) {
    appState = rootState.appState;
    statsIndex = rootState.statsIndex;
    tuningRosterBundle = rootState.tuningRosterBundle;
  }

  function getAppState() {
    return appState;
  }

  function getStatsIndex() {
    return statsIndex;
  }

  function getTuningRosterBundle() {
    return tuningRosterBundle;
  }

  function setAppState(nextAppState) {
    appState = nextAppState;
  }

  function setStatsIndex(nextStatsIndex) {
    statsIndex = nextStatsIndex;
  }

  function setTuningRosterBundle(nextBundle) {
    tuningRosterBundle = nextBundle;
  }

  return {
    getRootState,
    setRootState,
    getAppState,
    getStatsIndex,
    getTuningRosterBundle,
    setAppState,
    setStatsIndex,
    setTuningRosterBundle,
  };
}