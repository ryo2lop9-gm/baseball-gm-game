import { createDefaultLeagueTeams } from "../models/teamModels.js";
import { createGameBatter, createGamePitcher } from "../models/playerModels.js";
import {
  createGMState,
  createFreeAgentFromPlayer,
} from "../engine/gm/gmEngine.js";
import { createAppState } from "../state/appState.js";
import { createStatsIndex } from "../engine/stats/statsEngine.js";

function createBenchSeedPlayers() {
  return [
    createGameBatter("Bench Spark", 61, 46, 58),
    createGameBatter("Utility Ace", 57, 52, 56),
    createGameBatter("Power Bench", 49, 68, 44),
  ];
}

function createGMFreeAgentPool() {
  return [
    createFreeAgentFromPlayer(createGameBatter("FA Contact", 66, 42, 63), 980),
    createFreeAgentFromPlayer(createGameBatter("FA Slugger", 51, 76, 45), 1320),
    createFreeAgentFromPlayer(createGameBatter("FA OBP", 59, 48, 68), 1140),
    createFreeAgentFromPlayer(createGameBatter("FA Balanced", 60, 58, 56), 1210),
    createFreeAgentFromPlayer(
      createGamePitcher("FA Reliever", 61, 64, {
        fourSeam: 0.47,
        slider: 0.30,
        curve: 0.08,
        fork: 0.15,
      }),
      1050
    ),
    createFreeAgentFromPlayer(
      createGamePitcher("FA Starter", 58, 62, {
        fourSeam: 0.41,
        slider: 0.23,
        curve: 0.14,
        fork: 0.22,
      }),
      1420
    ),
  ];
}

function seedGMStateDepth(gmState) {
  const next = structuredClone(gmState);

  if ((next.roster?.bench || []).length === 0) {
    next.roster.bench.push(...createBenchSeedPlayers());
  }

  if ((next.freeAgents || []).length === 0) {
    next.freeAgents = createGMFreeAgentPool();
  }

  return next;
}

export function createGMDeskFactory() {
  function createFreshGMDesk() {
    const leagueTeams = createDefaultLeagueTeams();
    const initial = createGMState(leagueTeams, {
      controlledTeamName: leagueTeams[0]?.name,
      initialBudget: 8000,
      rounds: 6,
    });
    return seedGMStateDepth(initial);
  }

  return {
    createFreshGMDesk,
  };
}

export function createInitialAppState() {
  return {
    statsIndex: createStatsIndex(),
    appStateFactory: ({ gmState, tuningState }) =>
      createAppState({
        gmState,
        tuningState,
      }),
  };
}