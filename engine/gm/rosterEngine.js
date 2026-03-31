/**
 * rosterEngine.js の責務
 * - lineup
 * - bench
 * - rotation
 * - bullpen
 * - roster から試合用 team を安全に再構成する
 */

function clone(value) {
  return structuredClone(value);
}

function clonePlayer(player) {
  return clone(player);
}

function clonePlayers(players) {
  return Array.isArray(players) ? players.map(clonePlayer) : [];
}

function createEmptyBatterStats() {
  return {
    PA: 0,
    AB: 0,
    H: 0,
    doubles: 0,
    triples: 0,
    HR: 0,
    BB: 0,
    K: 0,
    RBI: 0,
    R: 0,
  };
}

function ensureUniquePlayers(players) {
  const used = new Set();
  const unique = [];

  for (const player of players || []) {
    const id = player?.profile?.id || player?.id || player?.name;
    if (!id || used.has(id)) continue;
    used.add(id);
    unique.push(player);
  }

  return unique;
}

function ensureRosterBatter(player) {
  const next = clonePlayer(player || {});
  next.name = next.name || "Unknown Batter";
  next.type = "batter";
  next.profile = clone(next.profile || {});
  next.profile.id = next.profile.id || next.id || crypto.randomUUID();
  next.profile.name = next.profile.name || next.name;
  next.profile.type = "batter";
  next.ratings = clone(next.ratings || {});
  next.gameStats = clone(next.gameStats || createEmptyBatterStats());
  next.seasonStats = clone(next.seasonStats || createEmptyBatterStats());
  return next;
}

function ensureRosterPitcher(player) {
  const next = clonePlayer(player || {});
  next.name = next.name || "Unknown Pitcher";
  next.type = "pitcher";
  next.profile = clone(next.profile || {});
  next.profile.id = next.profile.id || next.id || crypto.randomUUID();
  next.profile.name = next.profile.name || next.name;
  next.profile.type = "pitcher";
  next.ratings = clone(next.ratings || {});
  next.pitchMix = clone(next.pitchMix || {});
  return next;
}

function ensureRosterPlayer(player) {
  if ((player?.type || "") === "pitcher") {
    return ensureRosterPitcher(player);
  }
  return ensureRosterBatter(player);
}

function normalizeLineup(players) {
  return ensureUniquePlayers((players || []).map(ensureRosterPlayer)).slice(0, 9);
}

function normalizePlayerGroup(players) {
  return ensureUniquePlayers((players || []).map(ensureRosterPlayer));
}

function pickActivePitcher(rosterState) {
  if (Array.isArray(rosterState?.rotation) && rosterState.rotation.length > 0) {
    return ensureRosterPitcher(rosterState.rotation[0]);
  }

  if (Array.isArray(rosterState?.bullpen) && rosterState.bullpen.length > 0) {
    return ensureRosterPitcher(rosterState.bullpen[0]);
  }

  return null;
}

export function createRosterState(team) {
  const lineup = normalizeLineup(team?.lineup || []);
  const startingPitcher = team?.startingPitcher ? ensureRosterPitcher(team.startingPitcher) : null;
  const bullpen = normalizePlayerGroup(team?.bullpen || []);

  return {
    teamName: team?.name || "Unknown Team",
    lineup,
    bench: [],
    rotation: startingPitcher ? [startingPitcher] : [],
    bullpen,
  };
}

export function getActiveLineup(rosterState) {
  return normalizeLineup(rosterState?.lineup || []);
}

export function getBench(rosterState) {
  return normalizePlayerGroup(rosterState?.bench || []);
}

export function getRotation(rosterState) {
  return normalizePlayerGroup(rosterState?.rotation || []);
}

export function getBullpen(rosterState) {
  return normalizePlayerGroup(rosterState?.bullpen || []);
}

export function setLineup(prevRosterState, lineup) {
  return {
    ...clone(prevRosterState),
    lineup: normalizeLineup(lineup),
  };
}

export function setBench(prevRosterState, bench) {
  return {
    ...clone(prevRosterState),
    bench: normalizePlayerGroup(bench),
  };
}

export function setRotation(prevRosterState, rotation) {
  return {
    ...clone(prevRosterState),
    rotation: normalizePlayerGroup(rotation),
  };
}

export function setBullpen(prevRosterState, bullpen) {
  return {
    ...clone(prevRosterState),
    bullpen: normalizePlayerGroup(bullpen),
  };
}

export function buildTeamFromRoster(teamMeta, rosterState) {
  const lineup = getActiveLineup(rosterState);
  const rotation = getRotation(rosterState);
  const bullpen = getBullpen(rosterState);
  const startingPitcher = pickActivePitcher(rosterState);

  return {
    name: teamMeta?.name || rosterState?.teamName || "Unknown Team",
    startingPitcher,
    rotation,
    bullpen,
    lineup,
  };
}

export function buildTeamsFromRosters(teamMetas, rosterStates) {
  return {
    away: buildTeamFromRoster(teamMetas?.away, rosterStates?.away),
    home: buildTeamFromRoster(teamMetas?.home, rosterStates?.home),
  };
}