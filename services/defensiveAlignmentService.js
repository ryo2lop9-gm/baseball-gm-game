import {
  DEFENSE_POSITIONS,
  DEFENSIVE_LINEUP_POSITIONS,
  isDefensiveLineupPosition,
} from "../config/defenseConfig.js";
import { validatePlayerDefense } from "../models/playerModels.js";

export const DEFENSIVE_ALIGNMENT_ERROR_CODES = Object.freeze({
  ALIGNMENT_MISSING: "DEFENSIVE_ALIGNMENT_MISSING",
  POSITION_MISSING: "DEFENSIVE_ALIGNMENT_POSITION_MISSING",
  POSITION_UNEXPECTED: "DEFENSIVE_ALIGNMENT_POSITION_UNEXPECTED",
  PLAYER_DUPLICATE: "DEFENSIVE_ALIGNMENT_PLAYER_DUPLICATE",
  PLAYER_UNKNOWN: "DEFENSIVE_ALIGNMENT_PLAYER_UNKNOWN",
  PLAYER_ID_INVALID: "DEFENSIVE_ALIGNMENT_PLAYER_ID_INVALID",
  PLAYER_ID_DUPLICATE: "DEFENSIVE_ALIGNMENT_LINEUP_ID_DUPLICATE",
  PLAYER_DEFENSE_INVALID: "DEFENSIVE_ALIGNMENT_PLAYER_DEFENSE_INVALID",
  PLAYER_INELIGIBLE: "DEFENSIVE_ALIGNMENT_PLAYER_INELIGIBLE",
});

function getPlayerId(player) {
  return player?.profile?.id || player?.id || null;
}

function issue(code, team, context = {}) {
  return {
    code,
    team: team?.name || null,
    ...context,
  };
}

function createStrictError(message, code, context) {
  const error = new Error(message);
  error.code = code;
  error.context = context;
  return error;
}

function buildLineupIdMap(team, errors) {
  const playersById = new Map();
  const lineup = Array.isArray(team?.lineup) ? team.lineup : [];
  for (const player of lineup) {
    const playerId = getPlayerId(player);
    if (typeof playerId !== "string" || playerId.length === 0) {
      errors.push(
        issue(DEFENSIVE_ALIGNMENT_ERROR_CODES.PLAYER_ID_INVALID, team, {
          playerId,
          playerName: player?.name || null,
        })
      );
      continue;
    }
    if (playersById.has(playerId)) {
      errors.push(
        issue(DEFENSIVE_ALIGNMENT_ERROR_CODES.PLAYER_ID_DUPLICATE, team, {
          playerId,
          playerName: player?.name || null,
        })
      );
      continue;
    }
    playersById.set(playerId, player);
  }
  return playersById;
}

export function validateDefensiveAlignment(team) {
  const errors = [];
  const alignment = team?.defensiveAlignment;
  if (
    !alignment ||
    typeof alignment !== "object" ||
    Array.isArray(alignment)
  ) {
    errors.push(
      issue(DEFENSIVE_ALIGNMENT_ERROR_CODES.ALIGNMENT_MISSING, team)
    );
    return { valid: false, errors };
  }

  for (const position of Object.keys(alignment)) {
    if (!isDefensiveLineupPosition(position)) {
      errors.push(
        issue(DEFENSIVE_ALIGNMENT_ERROR_CODES.POSITION_UNEXPECTED, team, {
          position,
          playerId: alignment[position],
        })
      );
    }
  }

  const playersById = buildLineupIdMap(team, errors);
  const assignedPlayerIds = new Set();
  for (const position of DEFENSIVE_LINEUP_POSITIONS) {
    if (!Object.hasOwn(alignment, position)) {
      errors.push(
        issue(DEFENSIVE_ALIGNMENT_ERROR_CODES.POSITION_MISSING, team, {
          position,
        })
      );
      continue;
    }

    const playerId = alignment[position];
    if (typeof playerId !== "string" || playerId.length === 0) {
      errors.push(
        issue(DEFENSIVE_ALIGNMENT_ERROR_CODES.PLAYER_ID_INVALID, team, {
          position,
          playerId,
        })
      );
      continue;
    }
    if (assignedPlayerIds.has(playerId)) {
      errors.push(
        issue(DEFENSIVE_ALIGNMENT_ERROR_CODES.PLAYER_DUPLICATE, team, {
          position,
          playerId,
        })
      );
    }
    assignedPlayerIds.add(playerId);

    const player = playersById.get(playerId);
    if (!player) {
      errors.push(
        issue(DEFENSIVE_ALIGNMENT_ERROR_CODES.PLAYER_UNKNOWN, team, {
          position,
          playerId,
        })
      );
      continue;
    }

    const defenseValidation = validatePlayerDefense(player.defense);
    if (!defenseValidation.valid) {
      errors.push(
        issue(DEFENSIVE_ALIGNMENT_ERROR_CODES.PLAYER_DEFENSE_INVALID, team, {
          position,
          playerId,
          playerName: player.name || null,
          defenseErrors: defenseValidation.errors,
        })
      );
      continue;
    }
    if (!player.defense.eligiblePositions.includes(position)) {
      errors.push(
        issue(DEFENSIVE_ALIGNMENT_ERROR_CODES.PLAYER_INELIGIBLE, team, {
          position,
          playerId,
          playerName: player.name || null,
          eligiblePositions: [...player.defense.eligiblePositions],
        })
      );
    }
  }

  return { valid: errors.length === 0, errors };
}

export function assertValidDefensiveAlignment(team) {
  const validation = validateDefensiveAlignment(team);
  if (!validation.valid) {
    throw createStrictError(
      `Defensive alignment is invalid for ${team?.name || "unknown team"}.`,
      "DEFENSIVE_ALIGNMENT_INVALID",
      {
        team: team?.name || null,
        errors: validation.errors,
      }
    );
  }
  return team;
}

export function resolvePositionPlayers(team) {
  assertValidDefensiveAlignment(team);
  const playersById = new Map(
    team.lineup.map((player) => [getPlayerId(player), player])
  );
  return Object.fromEntries(
    DEFENSIVE_LINEUP_POSITIONS.map((position) => [
      position,
      playersById.get(team.defensiveAlignment[position]),
    ])
  );
}

export function resolveActiveDefense(state, defenseSide) {
  if (defenseSide !== "away" && defenseSide !== "home") {
    throw createStrictError(
      "Defense side must be away or home.",
      "ACTIVE_DEFENSE_SIDE_INVALID",
      { defenseSide }
    );
  }

  const team = state?.[`${defenseSide}Team`];
  const pitcher = state?.activePitchers?.[defenseSide];
  if (!pitcher) {
    throw createStrictError(
      `Active pitcher is missing for ${defenseSide}.`,
      "ACTIVE_DEFENSE_PITCHER_MISSING",
      {
        defenseSide,
        team: team?.name || null,
      }
    );
  }

  const positionPlayers = resolvePositionPlayers(team);
  return Object.fromEntries(
    DEFENSE_POSITIONS.map((position) => [
      position,
      position === "P" ? pitcher : positionPlayers[position],
    ])
  );
}
