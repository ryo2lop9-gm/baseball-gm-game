import { createDefaultTeams } from "../teamModels.js";
import { createInitialGameState } from "../gameState.js";
import {
  createRosterState,
  buildTeamFromRoster,
} from "../rosterEngine.js";

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