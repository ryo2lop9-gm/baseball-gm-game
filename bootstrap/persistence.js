const DEFAULT_STORAGE_KEY = "baseball-gm-prototype-save";
const DEFAULT_STORAGE_VERSION = 1;
const DEFAULT_REQUIRED_SNAPSHOT_PATHS = [
  "appState",
  "appState.currentPage",
  "appState.gm",
  "appState.tuning",
  "statsIndex",
  "tuningRosterBundle",
  "tuningRosterBundle.awayRoster",
  "tuningRosterBundle.homeRoster",
];

export function createRootStatePersistence({
  storageKey = DEFAULT_STORAGE_KEY,
  storageVersion = DEFAULT_STORAGE_VERSION,
  requiredSnapshotPaths = DEFAULT_REQUIRED_SNAPSHOT_PATHS,
  createFreshRootState,
  normalizeRootState,
  getRootState,
  setRootState,
}) {
  const schemaTag = requiredSnapshotPaths.join("|");
  let lastSavedAt = null;

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

  function isValidSnapshotShape(snapshot) {
    if (!snapshot || typeof snapshot !== "object") return false;
    if (snapshot.version !== storageVersion) return false;
    if (snapshot.schemaTag !== schemaTag) return false;

    const payload = snapshot.payload;
    if (!payload || typeof payload !== "object") return false;

    for (const path of requiredSnapshotPaths) {
      if (!hasPath(payload, path)) {
        return false;
      }
    }

    return true;
  }

  function buildPersistedSnapshot(savedAt) {
    const rootState = getRootState();

    return {
      version: storageVersion,
      schemaTag,
      savedAt,
      payload: {
        appState: safeClone(rootState.appState),
        statsIndex: safeClone(rootState.statsIndex),
        tuningRosterBundle: safeClone(rootState.tuningRosterBundle),
      },
    };
  }

  function saveRootState() {
    try {
      const savedAt = new Date().toISOString();
      const snapshot = buildPersistedSnapshot(savedAt);
      localStorage.setItem(storageKey, JSON.stringify(snapshot));
      lastSavedAt = savedAt;
      updateSaveStatusLabel();
    } catch (error) {
      console.warn("saveRootState failed:", error);
    }
  }

  function clearPersistedState() {
    try {
      localStorage.removeItem(storageKey);
      lastSavedAt = null;
      updateSaveStatusLabel();
    } catch (error) {
      console.warn("clearPersistedState failed:", error);
    }
  }

  function loadRootStateFromStorage() {
    try {
      const raw = localStorage.getItem(storageKey);
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

  function initializeRootState() {
    const restored = loadRootStateFromStorage();
    if (restored) {
      setRootState(restored);
      return;
    }

    const fresh = createFreshRootState();
    setRootState(fresh);
    lastSavedAt = null;
    saveRootState();
  }

  function ensureSaveControls({ routeDom, onResetConfirmed }) {
    const host =
      routeDom?.showTuningPageBtn?.parentElement ||
      document.querySelector(".tabbar");
    if (!host) return;

    if (!document.getElementById("resetPersistedStateBtn")) {
      const resetBtn = document.createElement("button");
      resetBtn.id = "resetPersistedStateBtn";
      resetBtn.type = "button";
      resetBtn.textContent = "保存削除";
      resetBtn.title = "localStorage の保存データを削除して初期状態に戻します";
      resetBtn.addEventListener("click", () => {
        const ok = window.confirm(
          "保存データを削除して初期状態に戻します。よろしいですか？"
        );
        if (!ok) return;
        clearPersistedState();
        onResetConfirmed();
      });
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

  return {
    saveRootState,
    clearPersistedState,
    loadRootStateFromStorage,
    initializeRootState,
    updateSaveStatusLabel,
    ensureSaveControls,
    formatSavedAt,
    getLastSavedAt: () => lastSavedAt,
  };
}