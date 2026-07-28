import {
  DEFENSIVE_LINEUP_POSITIONS,
  DESIGNATED_HITTER_POSITION,
  MAX_DEFENSE_RATING,
  MIN_DEFENSE_RATING,
  NEUTRAL_DEFENSE_RATING,
  isPlayerDefensePosition,
} from "../config/defenseConfig.js";

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

function createPlayerDefenseError(errors) {
  const error = new Error("Player defense information is invalid.");
  error.code = "PLAYER_DEFENSE_INVALID";
  error.context = { errors };
  return error;
}

function validateDefenseRating(errors, field, value) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < MIN_DEFENSE_RATING ||
    value > MAX_DEFENSE_RATING
  ) {
    errors.push({
      code: "PLAYER_DEFENSE_RATING_INVALID",
      field,
      value,
    });
  }
}

export function validatePlayerDefense(defense) {
  const errors = [];
  if (!defense || typeof defense !== "object" || Array.isArray(defense)) {
    errors.push({
      code: "PLAYER_DEFENSE_NOT_OBJECT",
      value: defense,
    });
    return { valid: false, errors };
  }

  const { primaryPosition, eligiblePositions, fielding, arm } = defense;
  if (!isPlayerDefensePosition(primaryPosition)) {
    errors.push({
      code: "PLAYER_DEFENSE_PRIMARY_POSITION_INVALID",
      position: primaryPosition,
    });
  }

  if (!Array.isArray(eligiblePositions) || eligiblePositions.length === 0) {
    errors.push({
      code: "PLAYER_DEFENSE_ELIGIBLE_POSITIONS_INVALID",
      value: eligiblePositions,
    });
  } else {
    const seen = new Set();
    for (const position of eligiblePositions) {
      if (!isPlayerDefensePosition(position)) {
        errors.push({
          code: "PLAYER_DEFENSE_ELIGIBLE_POSITION_INVALID",
          position,
        });
      }
      if (seen.has(position)) {
        errors.push({
          code: "PLAYER_DEFENSE_ELIGIBLE_POSITION_DUPLICATE",
          position,
        });
      }
      seen.add(position);
    }
    if (!seen.has(primaryPosition)) {
      errors.push({
        code: "PLAYER_DEFENSE_PRIMARY_NOT_ELIGIBLE",
        position: primaryPosition,
      });
    }
  }

  validateDefenseRating(errors, "fielding", fielding);
  validateDefenseRating(errors, "arm", arm);
  return { valid: errors.length === 0, errors };
}

export function assertValidPlayerDefense(defense) {
  const validation = validatePlayerDefense(defense);
  if (!validation.valid) {
    throw createPlayerDefenseError(validation.errors);
  }
  return defense;
}

export function createPlayerDefense(
  defense,
  { defaultPrimaryPosition = DESIGNATED_HITTER_POSITION } = {}
) {
  const source = defense === undefined ? {} : defense;
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    throw createPlayerDefenseError([
      {
        code: "PLAYER_DEFENSE_NOT_OBJECT",
        value: source,
      },
    ]);
  }

  const primaryPosition =
    source.primaryPosition === undefined
      ? defaultPrimaryPosition
      : source.primaryPosition;
  const normalized = {
    primaryPosition,
    eligiblePositions:
      source.eligiblePositions === undefined
        ? [primaryPosition]
        : Array.isArray(source.eligiblePositions)
          ? [...source.eligiblePositions]
          : source.eligiblePositions,
    fielding:
      source.fielding === undefined
        ? NEUTRAL_DEFENSE_RATING
        : source.fielding,
    arm:
      source.arm === undefined ? NEUTRAL_DEFENSE_RATING : source.arm,
  };
  assertValidPlayerDefense(normalized);
  return normalized;
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
  const { defense, ...profileExtra } = extraProfile || {};
  return {
    profile: createBatterProfile(name, profileExtra),
    name,
    type: "batter",
    ratings: {
      contact,
      power,
      eye,
    },
    defense: createPlayerDefense(defense),
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
  const { defense, ...profileExtra } = extraProfile || {};
  const pitcherDefense = createPlayerDefense(defense, {
    defaultPrimaryPosition: "P",
  });
  if (pitcherDefense.primaryPosition !== "P") {
    throw createPlayerDefenseError([
      {
        code: "PLAYER_DEFENSE_PITCHER_PRIMARY_INVALID",
        position: pitcherDefense.primaryPosition,
      },
    ]);
  }

  return {
    profile: createPitcherProfile(name, profileExtra),
    name,
    type: "pitcher",
    ratings: {
      control,
      stuff,
    },
    defense: pitcherDefense,
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
    defense: createPlayerDefense(player.defense),
    seasonStats: createEmptyBatterSeasonStats(),
  };
}

export function buildPrototypeLineup(prefix) {
  const lineup = [
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
  const positions = [
    ...DEFENSIVE_LINEUP_POSITIONS,
    DESIGNATED_HITTER_POSITION,
  ];
  return lineup.map((player, index) => ({
    ...player,
    defense: createPlayerDefense({
      primaryPosition: positions[index],
    }),
  }));
}
