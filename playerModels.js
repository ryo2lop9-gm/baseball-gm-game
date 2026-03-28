function createEmptyBatterStatLine() {
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

function createBaseProfile(name, type, extra = {}) {
  return {
    id: crypto.randomUUID(),
    name,
    type,
    ...extra,
  };
}

export function createBatterProfile(name, extra = {}) {
  return createBaseProfile(name, "batter", extra);
}

export function createPitcherProfile(name, extra = {}) {
  return createBaseProfile(name, "pitcher", extra);
}

export function createEmptyBatterGameStats() {
  return createEmptyBatterStatLine();
}

export function createEmptyBatterSeasonStats() {
  return createEmptyBatterStatLine();
}

export function getPlayerGameStats(player) {
  if (!player) return createEmptyBatterGameStats();
  if (!player.gameStats) {
    player.gameStats = createEmptyBatterGameStats();
  }
  return player.gameStats;
}

export function getPlayerSeasonStats(player) {
  if (!player) return createEmptyBatterSeasonStats();
  if (!player.seasonStats) {
    player.seasonStats = createEmptyBatterSeasonStats();
  }
  return player.seasonStats;
}

/**
 * 観戦試合で直接使用する打者オブジェクト
 * gameStats と seasonStats を完全分離する
 */
export function createGameBatter(name, contact, power, eye, extraProfile = {}) {
  return {
    profile: createBatterProfile(name, extraProfile),
    name,
    type: "batter",
    ratings: {
      contact,
      power,
      eye,
    },
    gameStats: createEmptyBatterGameStats(),
    seasonStats: createEmptyBatterSeasonStats(),
  };
}

/**
 * 観戦試合で直接使用する投手オブジェクト
 */
export function createGamePitcher(
  name,
  control,
  stuff,
  pitchMix = {},
  extraProfile = {}
) {
  return {
    profile: createPitcherProfile(name, extraProfile),
    name,
    type: "pitcher",
    ratings: {
      control,
      stuff,
    },
    pitchMix,
  };
}

export function resetBatterGameStats(player) {
  player.gameStats = createEmptyBatterGameStats();
  return player;
}

/**
 * シーズン集計用の軽量テンプレート
 * seasonStats のみを持つ
 */
export function createSeasonBatterSnapshot(player) {
  return {
    id: player.profile?.id || crypto.randomUUID(),
    name: player.name,
    profile: player.profile ? { ...player.profile } : createBatterProfile(player.name),
    ratings: { ...player.ratings },
    seasonStats: createEmptyBatterSeasonStats(),
  };
}

export function buildPrototypeLineup(prefix) {
  return [
    createGameBatter(`${prefix} 1`, 62, 48, 58),
    createGameBatter(`${prefix} 2`, 68, 44, 61),
    createGameBatter(`${prefix} 3`, 71, 67, 59),
    createGameBatter(`${prefix} 4`, 65, 79, 52),
    createGameBatter(`${prefix} 5`, 60, 71, 51),
    createGameBatter(`${prefix} 6`, 57, 58, 53),
    createGameBatter(`${prefix} 7`, 55, 50, 49),
    createGameBatter(`${prefix} 8`, 53, 46, 47),
    createGameBatter(`${prefix} 9`, 59, 42, 57),
  ];
}