import { validateEvLaLookup } from "./evLaOutcomeService.js";

let evLaLookup = null;
let loadPromise = null;
let loadStatus = "idle";
let loadError = null;

export const EV_LA_LOOKUP_URL = new URL(
  "../data/ev_la_lookup.json",
  import.meta.url
);

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

  loadPromise = fetch(EV_LA_LOOKUP_URL)
    .then((response) => {
      if (!response.ok) {
        throw createLookupLoadError(
          `EV/LA lookup load failed: ${response.status}`
        );
      }

      return response.json();
    })
    .then((lookup) => {
      validateEvLaLookup(lookup);

      evLaLookup = lookup;
      loadStatus = "ready";
      loadPromise = null;
      return evLaLookup;
    })
    .catch((error) => {
      loadStatus = "error";
      loadError =
        error?.code === "EV_LA_LOOKUP_LOAD_FAILED" ||
        error?.code === "EV_LA_LOOKUP_INVALID"
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
