export function createRootStateFactory({
  createInitialAppState,
  gmFactory,
  tuningBootstrap,
}) {
  function safeClone(value) {
    return structuredClone(value);
  }

  function createFreshRootState() {
    const initial = createInitialAppState();
    const freshStatsIndex = initial.statsIndex;
    const freshTuningRosterBundle = tuningBootstrap.createDefaultRosterBundle();

    const freshAppState = initial.appStateFactory({
      gmState: gmFactory.createFreshGMDesk(),
      tuningState: tuningBootstrap.createFreshTuningGame(freshTuningRosterBundle),
    });

    return {
      appState: freshAppState,
      statsIndex: freshStatsIndex,
      tuningRosterBundle: freshTuningRosterBundle,
    };
  }

  function normalizeRootState(rootState) {
    const fresh = createFreshRootState();

    const nextAppState = safeClone(rootState?.appState || fresh.appState);
    const nextStatsIndex = safeClone(rootState?.statsIndex || fresh.statsIndex);
    const nextTuningRosterBundle = safeClone(
      rootState?.tuningRosterBundle || fresh.tuningRosterBundle
    );

    if (
      nextAppState.currentPage !== "gm" &&
      nextAppState.currentPage !== "stats" &&
      nextAppState.currentPage !== "tuning"
    ) {
      nextAppState.currentPage = "gm";
    }

    if (!nextAppState.gm || typeof nextAppState.gm !== "object") {
      nextAppState.gm = fresh.appState.gm;
    }

    if (!nextAppState.tuning || typeof nextAppState.tuning !== "object") {
      nextAppState.tuning = fresh.appState.tuning;
    }

    if (!("tuningSeasonSummary" in nextAppState)) {
      nextAppState.tuningSeasonSummary = null;
    }

    if (!nextTuningRosterBundle.awayRoster || !nextTuningRosterBundle.homeRoster) {
      return fresh;
    }

    return {
      appState: nextAppState,
      statsIndex: nextStatsIndex,
      tuningRosterBundle: nextTuningRosterBundle,
    };
  }

  return {
    createFreshRootState,
    normalizeRootState,
  };
}