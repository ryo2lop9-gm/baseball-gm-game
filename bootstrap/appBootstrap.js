import { createRouteDom, applyRouteVisibility } from "./appRouter.js";
import { createPageRouter } from "./router.js";
import { createRootStatePersistence } from "./persistence.js";

import { createGMDeskPageController } from "../pages/gmDeskPage.js";
import { createStatsPageController } from "../pages/statsPage.js";
import { createTuningPageController } from "../pages/tuningPage.js";

import {
  createInitialAppState,
  createGMDeskFactory,
} from "./gmBootstrap.js";
import { createTuningBootstrap } from "./tuningBootstrap.js";

import {
  setCurrentPage,
  setGMState,
  setTuningState,
  setTuningSeasonSummary,
} from "../state/appState.js";

export function bootstrapApp() {
  const routeDom = createRouteDom();

  let statsIndex = createInitialAppState().statsIndex;
  let tuningRosterBundle = null;
  let appState = null;

  const gmFactory = createGMDeskFactory();
  const tuningBootstrap = createTuningBootstrap();

  function safeClone(value) {
    return structuredClone(value);
  }

  function createFreshRootState() {
    const initial = createInitialAppState();
    const freshStatsIndex = initial.statsIndex;
    const freshTuningRosterBundle = tuningBootstrap.createDefaultRosterBundle();

    const freshAppState = initial.appStateFactory({
      gmState: gmFactory.createFreshGMDesk(),
      tuningState: tuningBootstrap.createFreshTuningGame(
        freshTuningRosterBundle
      ),
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

  const persistence = createRootStatePersistence({
    createFreshRootState,
    normalizeRootState,
    getRootState,
    setRootState,
  });

  persistence.initializeRootState();

  const gmDeskPageController = createGMDeskPageController({
    getAppState: () => appState,
    setAppGMState(nextGMState) {
      appState = setGMState(appState, nextGMState);
      persistence.saveRootState();
    },
    getStatsIndex: () => statsIndex,
    setStatsIndex(nextStatsIndex) {
      statsIndex = nextStatsIndex;
      persistence.saveRootState();
    },
    createFreshGMDesk: () => gmFactory.createFreshGMDesk(),
  });

  const statsPageController = createStatsPageController({
    getAppState: () => appState,
    getStatsIndex: () => statsIndex,
  });

  const tuningPageController = createTuningPageController({
    getAppState: () => appState,
    setAppTuningState(nextTuningState) {
      appState = setTuningState(appState, nextTuningState);
      persistence.saveRootState();
    },
    setAppTuningSeasonSummary(nextSummary) {
      appState = setTuningSeasonSummary(appState, nextSummary);
      persistence.saveRootState();
    },
    getTuningRosterBundle: () => tuningRosterBundle,
    setTuningRosterBundle(nextBundle) {
      tuningRosterBundle = nextBundle;
      persistence.saveRootState();
    },
    createDefaultRosterBundle: () => tuningBootstrap.createDefaultRosterBundle(),
    createFreshTuningGame: () =>
      tuningBootstrap.createFreshTuningGame(tuningRosterBundle),
  });

  function renderCurrentPage() {
    if (appState.currentPage === "gm") gmDeskPageController.render();
    if (appState.currentPage === "stats") statsPageController.render();
    if (appState.currentPage === "tuning") tuningPageController.render();
  }

  function renderAllPages() {
    gmDeskPageController.render();
    statsPageController.render();
    tuningPageController.render();
  }

  function setCurrentPageState(pageName) {
    appState = setCurrentPage(appState, pageName);
  }

  function resetToFreshState() {
    const fresh = createFreshRootState();

    appState = setCurrentPage(fresh.appState, "gm");
    statsIndex = fresh.statsIndex;
    tuningRosterBundle = fresh.tuningRosterBundle;

    renderAllPages();
    applyRouteVisibility(routeDom, "gm");
    renderCurrentPage();
    persistence.saveRootState();
  }

  const router = createPageRouter({
    routeDom,
    getCurrentPage: () => appState.currentPage,
    setCurrentPageState,
    renderCurrentPage,
    saveRootState: persistence.saveRootState,
    gmDeskPageController,
    statsPageController,
    tuningPageController,
  });

  function bootstrap() {
    persistence.ensureSaveControls({
      routeDom,
      onResetConfirmed: resetToFreshState,
    });

    router.wireEvents();
    renderAllPages();
    router.applyInitialPage();
    persistence.updateSaveStatusLabel();
  }

  bootstrap();
}