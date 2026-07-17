let evLaLookup = null;
let loadPromise = null;
let loadStatus = "idle";
let loadError = null;

function createLookupLoadError(message, cause = null) {
  const error = new Error(message, cause ? { cause } : undefined);
  error.code = "EV_LA_LOOKUP_LOAD_FAILED";
  return error;
}

export function loadEvLaLookup() {
  if (evLaLookup) return Promise.resolve(evLaLookup);
  if (loadPromise) return loadPromise;

  loadStatus = "loading";
  loadError = null;

  loadPromise = fetch("./data/ev_la_lookup.json")
    .then((response) => {
      if (!response.ok) {
        throw createLookupLoadError(
          `EV/LA lookup load failed: ${response.status}`
        );
      }

      return response.json();
    })
    .then((lookup) => {
      if (!lookup || typeof lookup !== "object" || Array.isArray(lookup)) {
        throw createLookupLoadError("EV/LA lookup has an invalid format.");
      }

      evLaLookup = lookup;
      loadStatus = "ready";
      loadPromise = null;
      return evLaLookup;
    })
    .catch((error) => {
      loadStatus = "error";
      loadError =
        error?.code === "EV_LA_LOOKUP_LOAD_FAILED"
          ? error
          : createLookupLoadError("EV/LA lookup load failed.", error);
      loadPromise = null;
      throw loadError;
    });

  return loadPromise;
}

export function getLoadedEvLaLookup() {
  return evLaLookup;
}

export function getEvLaLookupLoadState() {
  return {
    status: loadStatus,
    error: loadError,
  };
}
