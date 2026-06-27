let evLaLookup = null;

export async function loadEvLaLookup() {
  if (evLaLookup) return evLaLookup;

  const response = await fetch("./data/ev_la_lookup.json");

  if (!response.ok) {
    throw new Error(`EV/LA lookup load failed: ${response.status}`);
  }

  evLaLookup = await response.json();
  return evLaLookup;
}

export function getLoadedEvLaLookup() {
  return evLaLookup;
}