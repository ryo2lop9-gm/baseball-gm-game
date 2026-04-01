import { createRouteDom, applyRouteVisibility } from "./appRouter.js";
import { createPageRouter } from "./router.js";
import { createRootStatePersistence } from "./persistence.js";
import { createSaveControls } from "./saveControls.js";
import { createRootStateFactory } from "./rootStateFactory.js";
import { createRootStateStore } from "./rootStateStore.js";

import { createGMDeskPageController } from "../pages/gmDeskPage.js";
import { createStatsPageController } from "../pages/statsPage.js";
import { createTuningPageController } from "../pages/tuningPage.js";

import { createInitialAppState, createGMDeskFactory } from "./gmBootstrap.js";
import { createTuningBootstrap } from "./tuningBootstrap.js";

import {
  setCurrentPage,
  setGMState,
  setTuningState,
  setTuningSeasonSummary,
} from "../state/appState.js";

export function bootstrapApp() {
  const routeDom = createRouteDom();
  const gmFactory = createGMDeskFactory();
  const tuningBootstrap = createTuningBootstrap();
  const rootStateStore = createRootStateStore();

  const rootStateFactory = createRootStateFactory({
    createInitialAppState,
    gmFactory,
    tuningBootstrap,
  });

  const persistence = createRootStatePersistence({
    createFreshRootState: rootStateFactory.createFreshRootState,
    normalizeRootState: rootStateFactory.normalizeRootState,
    getRootState: rootStateStore.getRootState,
    setRootState: rootStateStore.setRootState,
  });

  function saveRootState() {
    persistence.saveRootState();
    saveControls.updateSaveStatusLabel();
  }

  function renderCurrentPage() {
    const currentPage = rootStateStore.getAppState().currentPage;

    if (currentPage === "gm") gmDeskPageController.render();
    if (currentPage === "stats") statsPageController.render();
    if (currentPage === "tuning") tuningPageController.render();
  }

  function renderAllPages() {
    gmDeskPageController.render();
    statsPageController.render();
    tuningPageController.render();
  }

  function setCurrentPageState(pageName) {
    rootStateStore.setAppState(
      setCurrentPage(rootStateStore.getAppState(), pageName)
    );
  }

  function resetToFreshState() {
    const fresh = rootStateFactory.createFreshRootState();

    rootStateStore.setRootState({
      appState: setCurrentPage(fresh.appState, "gm"),
      statsIndex: fresh.statsIndex,
      tuningRosterBundle: fresh.tuningRosterBundle,
    });

    renderAllPages();
    applyRouteVisibility(routeDom, "gm");
    renderCurrentPage();
    saveRootState();
  }

  const saveControls = createSaveControls({
    routeDom,
    getLastSavedAt: persistence.getLastSavedAt,
    clearPersistedState: persistence.clearPersistedState,
    onResetConfirmed: resetToFreshState,
  });

  persistence.initializeRootState();

  const gmDeskPageController = createGMDeskPageController({
    getAppState: rootStateStore.getAppState,
    setAppGMState(nextGMState) {
      rootStateStore.setAppState(
        setGMState(rootStateStore.getAppState(), nextGMState)
      );
      saveRootState();
    },
    getStatsIndex: rootStateStore.getStatsIndex,
    setStatsIndex(nextStatsIndex) {
      rootStateStore.setStatsIndex(nextStatsIndex);
      saveRootState();
    },
    createFreshGMDesk: () => gmFactory.createFreshGMDesk(),
  });

  const statsPageController = createStatsPageController({
    getAppState: rootStateStore.getAppState,
    getStatsIndex: rootStateStore.getStatsIndex,
  });

  const tuningPageController = createTuningPageController({
    getAppState: rootStateStore.getAppState,
    setAppTuningState(nextTuningState) {
      rootStateStore.setAppState(
        setTuningState(rootStateStore.getAppState(), nextTuningState)
      );
      saveRootState();
    },
    setAppTuningSeasonSummary(nextSummary) {
      rootStateStore.setAppState(
        setTuningSeasonSummary(rootStateStore.getAppState(), nextSummary)
      );
      saveRootState();
    },
    getTuningRosterBundle: rootStateStore.getTuningRosterBundle,
    setTuningRosterBundle(nextBundle) {
      rootStateStore.setTuningRosterBundle(nextBundle);
      saveRootState();
    },
    createDefaultRosterBundle: () => tuningBootstrap.createDefaultRosterBundle(),
    createFreshTuningGame: () =>
      tuningBootstrap.createFreshTuningGame(
        rootStateStore.getTuningRosterBundle()
      ),
  });

  const router = createPageRouter({
    routeDom,
    getCurrentPage: () => rootStateStore.getAppState().currentPage,
    setCurrentPageState,
    renderCurrentPage,
    saveRootState,
    gmDeskPageController,
    statsPageController,
    tuningPageController,
  });

  function bootstrap() {
    saveControls.ensureSaveControls();
    router.wireEvents();
    renderAllPages();
    router.applyInitialPage();
    saveControls.updateSaveStatusLabel();
  }

  bootstrap();
}