function clone(value) {
  return structuredClone(value);
}

function createEmptyPlayerStats() {
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

export function ensurePlayerProfile(player) {
  const profile = clone(player?.profile || {});
  profile.id = profile.id || player?.id || crypto.randomUUID();
  profile.name = profile.name || player?.name || "Unknown Player";
  profile.type = profile.type || player?.type || "batter";
  return profile;
}

export function createRosterPlayerFromExternalPlayer(player) {
  const type = player?.type || "batter";
  const profile = ensurePlayerProfile(player);

  const base = {
    name: player?.name || profile.name || "Unknown Player",
    type,
    profile,
    ratings: clone(player?.ratings || {}),
    pitchMix: clone(player?.pitchMix || {}),
  };

  if (type === "pitcher") {
    return base;
  }

  return {
    ...base,
    gameStats: clone(player?.gameStats || createEmptyPlayerStats()),
    seasonStats: clone(player?.seasonStats || createEmptyPlayerStats()),
  };
}

export function getPlayerId(player) {
  return player?.profile?.id || player?.id || player?.name || null;
}

export function findPlayerByIdOrName(players, idOrName) {
  return (
    (players || []).find((player) => {
      const id = getPlayerId(player);
      return id === idOrName || player?.name === idOrName;
    }) || null
  );
}

export function removePlayerFromArray(players, idOrName) {
  return (players || []).filter((player) => {
    const id = getPlayerId(player);
    return id !== idOrName && player?.name !== idOrName;
  });
}

export function upsertBenchPlayer(bench, player) {
  const normalized = createRosterPlayerFromExternalPlayer(player);
  const id = getPlayerId(normalized);
  const nextBench = removePlayerFromArray(bench || [], id);
  nextBench.push(normalized);
  return nextBench;
}

export function replaceLineupPlayer(lineup, removeIdOrName, incomingPlayer) {
  const normalizedIncoming = createRosterPlayerFromExternalPlayer(incomingPlayer);
  const nextLineup = [...(lineup || [])];

  const removeIndex = nextLineup.findIndex((player) => {
    const id = getPlayerId(player);
    return id === removeIdOrName || player?.name === removeIdOrName;
  });

  if (removeIndex === -1) {
    nextLineup.push(normalizedIncoming);
    return nextLineup.slice(0, 9);
  }

  nextLineup[removeIndex] = normalizedIncoming;
  return nextLineup;
}