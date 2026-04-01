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
    } catch (error) {
      console.warn("saveRootState failed:", error);
    }
  }

  function clearPersistedState() {
    try {
      localStorage.removeItem(storageKey);
      lastSavedAt = null;
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

  return {
    saveRootState,
    clearPersistedState,
    loadRootStateFromStorage,
    initializeRootState,
    getLastSavedAt: () => lastSavedAt,
  };
}