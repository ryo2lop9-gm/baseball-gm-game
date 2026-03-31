import {
  createLeagueState,
  advanceLeagueDay,
  getLeagueStandingsTable,
} from "../game/leagueEngine.js";
import {
  createRosterState,
  buildTeamFromRoster,
} from "./rosterEngine.js";
import {
  generateDailyDecisionCards,
} from "../core/eventEngine.js";
import { GM_CONFIG } from "../../config/gmConfig.js";
import { calcSimplePlayerValue } from "../../services/playerValueService.js";
import { calcSuggestedSalary, recalcBudgetState } from "../../services/contractService.js";
import {
  prependInboxMessage,
  addDecisionCardsToInbox,
  appendGMInboxNote,
} from "./gmInboxEngine.js";
import { ensurePlayerProfile } from "./gmRosterEngine.js";
import { resolveGMDecisionCard } from "./gmDecisionEngine.js";

/**
 * gmEngine.js の責務
 * - GMモード全体 state を持つ
 * - leagueEngine の日次進行と接続する
 * - 日次進行の司令塔として各 engine/service を呼ぶ
 *
 * 個別の decision / roster / inbox ロジックは別ファイルへ分離。
 */

function clone(value) {
  return structuredClone(value);
}

export { appendGMInboxNote };

export function createFreeAgentFromPlayer(player, contractCost = null) {
  return {
    id: player?.profile?.id || player?.id || crypto.randomUUID(),
    name: player?.name || "Unknown Player",
    type: player?.type || "batter",
    profile: ensurePlayerProfile(player),
    ratings: clone(player?.ratings || {}),
    pitchMix: clone(player?.pitchMix || {}),
    contractCost: contractCost ?? calcSuggestedSalary(player),
    expectedValue: calcSimplePlayerValue(player),
  };
}

function createStandingsSnapshot(leagueState) {
  return getLeagueStandingsTable(leagueState);
}

function rebuildControlledTeam(controlledTeamMeta, rosterState) {
  return buildTeamFromRoster(controlledTeamMeta, rosterState);
}

function replaceControlledTeamInLeagueTeams(leagueTeams, controlledTeam) {
  return (leagueTeams || []).map((team) =>
    team.name === controlledTeam.name ? clone(controlledTeam) : clone(team)
  );
}

function buildControlledTeamSummary(gmState) {
  return {
    teamName: gmState?.controlledTeamName || "-",
    budget: clone(gmState?.budget || {}),
    roster: clone(gmState?.roster || {}),
  };
}

function recalcBudget(next) {
  return recalcBudgetState(next);
}

function syncControlledTeamIntoLeague(prevGMState) {
  const next = clone(prevGMState);
  const controlledTeam = rebuildControlledTeam(
    { name: next.controlledTeamName },
    next.roster
  );

  next.league.teams = replaceControlledTeamInLeagueTeams(
    next.league.teams,
    controlledTeam
  );

  for (let dayIndex = 0; dayIndex < next.league.schedule.length; dayIndex += 1) {
    next.league.schedule[dayIndex] = (next.league.schedule[dayIndex] || []).map(
      (game) => ({
        away:
          game.away?.name === controlledTeam.name
            ? clone(controlledTeam)
            : clone(game.away),
        home:
          game.home?.name === controlledTeam.name
            ? clone(controlledTeam)
            : clone(game.home),
      })
    );
  }

  return next;
}

function hasPendingDecisions(gmState) {
  return (gmState?.pendingDecisions || []).length > 0;
}

/**
 * GMモードの初期状態を生成
 * @param {Array} leagueTeams
 * @param {Object} options
 */
export function createGMState(leagueTeams, options = {}) {
  const controlledTeamName =
    options.controlledTeamName || leagueTeams?.[0]?.name || "Unknown Team";
  const controlledTeam =
    (leagueTeams || []).find((team) => team.name === controlledTeamName) ||
    leagueTeams?.[0];

  const roster = createRosterState(controlledTeam);

  const state = {
    controlledTeamName,
    day: 1,
    isComplete: false,
    league: createLeagueState(leagueTeams || [], options.rounds || 10),
    standings: [],
    roster,
    budget: {
      total: options.initialBudget || GM_CONFIG.INITIAL_BUDGET,
      cash: options.initialBudget || GM_CONFIG.INITIAL_BUDGET,
      payroll: 0,
    },
    freeAgents: [],
    pendingDecisions: [],
    inbox: [],
    transactions: [],
  };

  recalcBudget(state);
  state.standings = createStandingsSnapshot(state.league);

  prependInboxMessage(
    state,
    "system",
    "GMデスクを開始",
    `${controlledTeamName} のGMとしてシーズンを開始した。`
  );

  return state;
}

export function resolveDecisionCard(prevGMState, decisionId, actionKey) {
  return resolveGMDecisionCard(prevGMState, decisionId, actionKey);
}

/**
 * GMとして1日進める
 */
export function advanceGMDay(prevGMState) {
  let next = clone(prevGMState);

  if (hasPendingDecisions(next)) {
    prependInboxMessage(
      next,
      "system",
      "進行停止中",
      "未処理の意思決定カードがあります。先に判断してください。"
    );
    return next;
  }

  next = syncControlledTeamIntoLeague(next);

  next.league = advanceLeagueDay(next.league);
  next.day += 1;
  next.isComplete = next.league.isComplete;
  next.standings = createStandingsSnapshot(next.league);

  if ((next.league.lastDayResults || []).length > 0) {
    prependInboxMessage(
      next,
      "day_result",
      `Day ${next.day - 1} 終了`,
      `${next.league.lastDayResults.length} 試合が終了しました。`
    );
  } else {
    prependInboxMessage(
      next,
      "system",
      "進行終了",
      "これ以上進める日程がありません。"
    );
    return next;
  }

  const generatedCards = generateDailyDecisionCards(next);
  if (generatedCards.length > 0) {
    next.pendingDecisions = [...generatedCards, ...(next.pendingDecisions || [])];
    addDecisionCardsToInbox(next, generatedCards);
  }

  return next;
}

export function getGMStandings(gmState) {
  return clone(gmState?.standings || []);
}

export function getLastDayResults(gmState) {
  return clone(gmState?.league?.lastDayResults || []);
}

export function getTransactions(gmState) {
  return clone(gmState?.transactions || []);
}

export function getControlledTeamSummary(gmState) {
  return buildControlledTeamSummary(gmState);
}

export function getGMInbox(gmState) {
  return clone(gmState?.inbox || []);
}

export function getPendingDecisions(gmState) {
  return clone(gmState?.pendingDecisions || []);
}