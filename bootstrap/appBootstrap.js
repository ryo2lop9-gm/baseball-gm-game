import { createRouteDom, applyRouteVisibility } from "./appRouter.js?v=codex11-2";
import { createPageRouter } from "./router.js?v=codex11-2";
import { createRootStatePersistence } from "./persistence.js";
import { createSaveControls } from "./saveControls.js";
import { createRootStateFactory } from "./rootStateFactory.js?v=codex11-2";
import { createRootStateStore } from "./rootStateStore.js";
import { loadEvLaLookup } from "../services/evLaLookupStore.js";

import { createGMDeskPageController } from "../pages/gmDeskPage.js";
import { createStatsPageController } from "../pages/statsPage.js";
import { createTuningPageController } from "../pages/tuningPage.js?v=codex11-2";
import { createMeasurementPageController } from "../pages/measurementPage.js?v=codex12-4";

import { createInitialAppState, createGMDeskFactory } from "./gmBootstrap.js";
import { createTuningBootstrap } from "./tuningBootstrap.js?v=codex11-2";

import {
  setCurrentPage,
  setGMState,
  setTuningState,
  setTuningSeasonSummary,
} from "../state/appState.js";

const LOOKUP_STATUS_ID = "evLaLookupStartupStatus";
let appInitialized = false;
let bootstrapPromise = null;

function setStartupControlsDisabled(disabled) {
  const controls = document.querySelectorAll("button, input, select, textarea");

  for (const control of controls) {
    if (control.dataset.lookupStartupControl === "retry") continue;

    if (disabled) {
      if (!("lookupStartupWasDisabled" in control.dataset)) {
        control.dataset.lookupStartupWasDisabled = control.disabled ? "1" : "0";
      }
      control.disabled = true;
    } else {
      control.disabled = control.dataset.lookupStartupWasDisabled === "1";
      delete control.dataset.lookupStartupWasDisabled;
    }
  }
}

function getStartupStatusElement() {
  let element = document.getElementById(LOOKUP_STATUS_ID);
  if (element) return element;

  element = document.createElement("div");
  element.id = LOOKUP_STATUS_ID;
  element.setAttribute("role", "status");
  element.style.marginBottom = "16px";
  element.style.padding = "12px 14px";
  element.style.border = "1px solid rgba(245, 158, 11, 0.45)";
  element.style.borderRadius = "8px";
  element.style.background = "rgba(245, 158, 11, 0.12)";
  element.style.color = "#fde68a";

  const host = document.querySelector(".app-shell") || document.body;
  host.prepend(element);
  return element;
}

function showLookupStartupStatus({ message, isError = false, onRetry = null }) {
  const element = getStartupStatusElement();
  element.setAttribute("role", isError ? "alert" : "status");
  element.style.borderColor = isError
    ? "rgba(239, 68, 68, 0.55)"
    : "rgba(245, 158, 11, 0.45)";
  element.style.background = isError
    ? "rgba(239, 68, 68, 0.14)"
    : "rgba(245, 158, 11, 0.12)";
  element.style.color = isError ? "#fecaca" : "#fde68a";
  element.replaceChildren();

  const text = document.createElement("span");
  text.textContent = message;
  element.append(text);

  if (typeof onRetry === "function") {
    const retryButton = document.createElement("button");
    retryButton.type = "button";
    retryButton.dataset.lookupStartupControl = "retry";
    retryButton.textContent = "再読み込み";
    retryButton.style.marginLeft = "12px";
    retryButton.addEventListener("click", onRetry, { once: true });
    element.append(retryButton);
  }
}

function clearLookupStartupStatus() {
  document.getElementById(LOOKUP_STATUS_ID)?.remove();
}

async function initializeApp() {
  setStartupControlsDisabled(true);
  showLookupStartupStatus({ message: "EV・LA Lookupを読み込んでいます。" });

  try {
    await loadEvLaLookup();
  } catch (error) {
    showLookupStartupStatus({
      message: "EV・LA Lookupの読み込みに失敗しました。試合操作は停止中です。",
      isError: true,
      onRetry: () => {
        bootstrapApp().catch((retryError) => {
          console.error("Application bootstrap retry failed.", retryError);
        });
      },
    });
    throw error;
  }

  clearLookupStartupStatus();
  setStartupControlsDisabled(false);

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
    if (currentPage === "measurement") measurementPageController.render();
  }

  function renderAllPages() {
    gmDeskPageController.render();
    statsPageController.render();
    tuningPageController.render();
    measurementPageController.render();
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
    createMlbValidationRosterBundle: () =>
      tuningBootstrap.createMlbValidationRosterBundle(),
    createGmBasicReferenceRosterBundle: () =>
      tuningBootstrap.createGmBasicReferenceRosterBundle(),
    createFreshTuningGame: () =>
      tuningBootstrap.createFreshTuningGame(
        rootStateStore.getTuningRosterBundle()
      ),
  });

  const measurementPageController = createMeasurementPageController({
    getTuningRosterBundle: rootStateStore.getTuningRosterBundle,
    buildCurrentTuningTeams: (rosterBundle) =>
      tuningBootstrap.buildCurrentTuningTeams(rosterBundle),
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
    measurementPageController,
  });

  function bootstrap() {
    saveControls.ensureSaveControls();
    router.wireEvents();
    renderAllPages();
    router.applyInitialPage();
    saveControls.updateSaveStatusLabel();
  }

  bootstrap();

  appInitialized = true;
}

export function bootstrapApp() {
  if (appInitialized) return Promise.resolve();
  if (bootstrapPromise) return bootstrapPromise;

  bootstrapPromise = initializeApp().finally(() => {
    bootstrapPromise = null;
  });

  return bootstrapPromise;
}
