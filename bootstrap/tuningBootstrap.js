import { createDefaultTeams } from "../models/teamModels.js";
import { createInitialGameState } from "../state/gameState.js";
import {
  createRosterState,
  buildTeamFromRoster,
} from "../engine/gm/rosterEngine.js";

export function createTuningBootstrap() {
  function createDefaultRosterBundle() {
    const teams = createDefaultTeams();

    return {
      awayMeta: { name: teams.away.name },
      homeMeta: { name: teams.home.name },
      awayRoster: createRosterState(teams.away),
      homeRoster: createRosterState(teams.home),
    };
  }

  function buildCurrentTuningTeams(rosterBundle) {
    return {
      away: buildTeamFromRoster(rosterBundle.awayMeta, rosterBundle.awayRoster),
      home: buildTeamFromRoster(rosterBundle.homeMeta, rosterBundle.homeRoster),
    };
  }

  function createFreshTuningGame(rosterBundle) {
    const teams = buildCurrentTuningTeams(rosterBundle);
    return createInitialGameState(teams.away, teams.home);
  }

  return {
    createDefaultRosterBundle,
    buildCurrentTuningTeams,
    createFreshTuningGame,
  };
}