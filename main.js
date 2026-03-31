import {
  createRouteDom,
  applyRouteVisibility,
  wireRouteEvents,
} from "./bootstrap/appRouter.js";
import { createGMDeskPageController } from "./pages/gmDeskPage.js";
import { createStatsPageController } from "./pages/statsPage.js";
import { createTuningPageController } from "./pages/tuningPage.js";
import {
  createInitialAppState,
  createGMDeskFactory,
} from "./bootstrap/gmBootstrap.js";
import { createTuningBootstrap } from "./bootstrap/tuningBootstrap.js";
import {
  setCurrentPage,
  setGMState,
  setTuningState,
  setTuningSeasonSummary,
} from "./state/appState.js";

const STORAGE_KEY = "baseball-gm-prototype-save";
const STORAGE_VERSION = 1;

/**
 * 保存データの必須構造。
 * 主要構造を変えたのに version を上げ忘れても、
 * schemaTag と path 検証で弾きやすくする。
 */
const REQUIRED_SNAPSHOT_PATHS = [
  "appState",
  "appState.currentPage",
  "appState.gm",
  "appState.tuning",
  "statsIndex",
  "tuningRosterBundle",
  "tuningRosterBundle.awayRoster",
  "tuningRosterBundle.homeRoster",
];

const STORAGE_SCHEMA_TAG = REQUIRED_SNAPSHOT_PATHS.join("|");

const routeDom = createRouteDom();

let statsIndex = createInitialAppState().statsIndex;
let tuningRosterBundle = null;
let appState = null;
let lastSavedAt = null;

const gmFactory = createGMDeskFactory();
const tuningBootstrap = createTuningBootstrap();

function safeClone(value) {
  return structuredClone(value);
}

function hasPath(target, path) {
  if (!target || typeof target !== "object") return false;

  const keys = path.split(".");
  let current = target;

  for (const key of keys) {
    if (current == null || typeof current !== "object" || !(key in current)) {
      return false;
    }
    current = current[key];
  }

  return true;
}

function formatSavedAt(value) {
  if (!value) return "未保存";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "未保存";

  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");

  return `${yyyy}/${mm}/${dd} ${hh}:${mi}:${ss}`;
}

function updateSaveStatusLabel() {
  const label = document.getElementById("saveStatusLabel");
  if (!label) return;
  label.textContent = `最終保存: ${formatSavedAt(lastSavedAt)}`;
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

function isValidSnapshotShape(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return false;
  if (snapshot.version !== STORAGE_VERSION) return false;
  if (snapshot.schemaTag !== STORAGE_SCHEMA_TAG) return false;

  const payload = snapshot.payload;
  if (!payload || typeof payload !== "object") return false;

  for (const path of REQUIRED_SNAPSHOT_PATHS) {
    if (!hasPath(payload, path)) {
      return false;
    }
  }

  return true;
}

function buildPersistedSnapshot(savedAt) {
  return {
    version: STORAGE_VERSION,
    schemaTag: STORAGE_SCHEMA_TAG,
    savedAt,
    payload: {
      appState: safeClone(appState),
      statsIndex: safeClone(statsIndex),
      tuningRosterBundle: safeClone(tuningRosterBundle),
    },
  };
}

function saveRootState() {
  try {
    const savedAt = new Date().toISOString();
    const snapshot = buildPersistedSnapshot(savedAt);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    lastSavedAt = savedAt;
    updateSaveStatusLabel();
  } catch (error) {
    console.warn("saveRootState failed:", error);
  }
}

function clearPersistedState() {
  try {
    localStorage.removeItem(STORAGE_KEY);
    lastSavedAt = null;
    updateSaveStatusLabel();
  } catch (error) {
    console.warn("clearPersistedState failed:", error);
  }
}

function loadRootStateFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!isValidSnapshotShape(parsed)) {
      return null;
    }

    lastSavedAt = parsed.savedAt || null;

    return normalizeRootState({
      appState: safeClone(parsed.payload.appState),
      statsIndex: safeClone(parsed.payload.statsIndex),
      tuningRosterBundle: safeClone(parsed.payload.tuningRosterBundle),
    });
  } catch (error) {
    console.warn("loadRootStateFromStorage failed:", error);
    return null;
  }
}

function initializeAppState() {
  const restored = loadRootStateFromStorage();

  if (restored) {
    appState = restored.appState;
    statsIndex = restored.statsIndex;
    tuningRosterBundle = restored.tuningRosterBundle;
    return;
  }

  const fresh = createFreshRootState();
  appState = fresh.appState;
  statsIndex = fresh.statsIndex;
  tuningRosterBundle = fresh.tuningRosterBundle;
  lastSavedAt = null;

  saveRootState();
}

initializeAppState();

const gmDeskPageController = createGMDeskPageController({
  getAppState: () => appState,
  setAppGMState(nextGMState) {
    appState = setGMState(appState, nextGMState);
    saveRootState();
  },
  getStatsIndex: () => statsIndex,
  setStatsIndex(nextStatsIndex) {
    statsIndex = nextStatsIndex;
    saveRootState();
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
    saveRootState();
  },
  setAppTuningSeasonSummary(nextSummary) {
    appState = setTuningSeasonSummary(appState, nextSummary);
    saveRootState();
  },
  getTuningRosterBundle: () => tuningRosterBundle,
  setTuningRosterBundle(nextBundle) {
    tuningRosterBundle = nextBundle;
    saveRootState();
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

function setPage(pageName) {
  appState = setCurrentPage(appState, pageName);
  applyRouteVisibility(routeDom, pageName);
  renderCurrentPage();
  saveRootState();
}

function resetToFreshState() {
  const fresh = createFreshRootState();
  appState = fresh.appState;
  statsIndex = fresh.statsIndex;
  tuningRosterBundle = fresh.tuningRosterBundle;

  appState = setCurrentPage(appState, "gm");

  renderAllPages();
  applyRouteVisibility(routeDom, "gm");
  renderCurrentPage();
  saveRootState();
}

function handleResetSaveClick() {
  const ok = window.confirm(
    "保存データを削除して初期状態に戻します。よろしいですか？"
  );
  if (!ok) return;

  clearPersistedState();
  resetToFreshState();
}

function ensureSaveControls() {
  const host =
    routeDom.showTuningPageBtn?.parentElement ||
    document.querySelector(".tabbar");

  if (!host) return;

  if (!document.getElementById("resetPersistedStateBtn")) {
    const resetBtn = document.createElement("button");
    resetBtn.id = "resetPersistedStateBtn";
    resetBtn.type = "button";
    resetBtn.textContent = "保存削除";
    resetBtn.title = "localStorage の保存データを削除して初期状態に戻します";
    resetBtn.addEventListener("click", handleResetSaveClick);
    host.appendChild(resetBtn);
  }

  if (!document.getElementById("saveStatusLabel")) {
    const saveLabel = document.createElement("div");
    saveLabel.id = "saveStatusLabel";
    saveLabel.style.display = "inline-flex";
    saveLabel.style.alignItems = "center";
    saveLabel.style.padding = "10px 14px";
    saveLabel.style.borderRadius = "10px";
    saveLabel.style.background = "rgba(255,255,255,0.06)";
    saveLabel.style.border = "1px solid rgba(255,255,255,0.08)";
    saveLabel.style.color = "var(--muted)";
    saveLabel.style.fontWeight = "700";
    saveLabel.style.fontSize = "12px";
    host.appendChild(saveLabel);
  }

  updateSaveStatusLabel();
}

function wireEvents() {
  wireRouteEvents(routeDom, {
    onShowGM: () => setPage("gm"),
    onShowStats: () => setPage("stats"),
    onShowTuning: () => setPage("tuning"),
    onJumpToStats: () => setPage("stats"),
  });

  gmDeskPageController.wireEvents({
    onStatsChanged() {
      saveRootState();

      if (appState.currentPage === "stats") {
        statsPageController.render();
      }
    },
  });

  statsPageController.wireEvents();
  tuningPageController.wireEvents();

  window.addEventListener("beforeunload", saveRootState);
}

function bootstrap() {
  ensureSaveControls();
  wireEvents();

  renderAllPages();

  const initialPage =
    appState.currentPage === "stats" || appState.currentPage === "tuning"
      ? appState.currentPage
      : "gm";

  applyRouteVisibility(routeDom, initialPage);
  renderCurrentPage();
  updateSaveStatusLabel();
}

bootstrap();