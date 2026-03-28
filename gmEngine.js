import {
  createLeagueState,
  advanceLeagueDay,
  getLeagueStandingsTable,
} from "./leagueEngine.js";
import {
  createRosterState,
  buildTeamFromRoster,
} from "./rosterEngine.js";
import {
  generateDailyDecisionCards,
  GM_DECISION_TYPES,
  GM_DECISION_ACTIONS,
} from "./eventEngine.js";
import { GM_CONFIG } from "./config/gmConfig.js";
import { calcSimplePlayerValue } from "./services/playerValueService.js";
import { calcSuggestedSalary, recalcBudgetState } from "./services/contractService.js";
import { createTransaction } from "./services/transactionService.js";
import {
  pickWeakestLineupPlayer,
  pickBestBenchBatter,
} from "./services/rosterDecisionService.js";

/**
 * gmEngine.js の責務
 * - GMモード全体 state を持つ
 * - 予算 / ロースター / FA候補 / 簡易トレード提案を扱う
 * - leagueEngine の日次進行と接続する
 * - 意思決定カード(eventEngine)を管理する
 * 
 * 計算式・評価式・確率/係数は services / config に分離している。
 */

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

function ensurePlayerProfile(player) {
  const profile = clone(player?.profile || {});
  profile.id = profile.id || player?.id || crypto.randomUUID();
  profile.name = profile.name || player?.name || "Unknown Player";
  profile.type = profile.type || player?.type || "batter";
  return profile;
}

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

function createInboxMessage(type, title, body, payload = {}) {
  return {
    id: crypto.randomUUID(),
    type,
    title,
    body,
    payload,
    isRead: false,
  };
}

function prependInboxMessage(next, type, title, body, payload = {}) {
  next.inbox = next.inbox || [];
  next.inbox.unshift(createInboxMessage(type, title, body, payload));
  return next;
}

export function appendGMInboxNote(
  prevGMState,
  title,
  body,
  type = "system",
  payload = {}
) {
  const next = clone(prevGMState);
  prependInboxMessage(next, type, title, body, payload);
  return next;
}

function createRosterPlayerFromExternalPlayer(player) {
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

function getPlayerId(player) {
  return player?.profile?.id || player?.id || player?.name || null;
}

function findPlayerByIdOrName(players, idOrName) {
  return (
    (players || []).find((player) => {
      const id = getPlayerId(player);
      return id === idOrName || player?.name === idOrName;
    }) || null
  );
}

function removePlayerFromArray(players, idOrName) {
  return (players || []).filter((player) => {
    const id = getPlayerId(player);
    return id !== idOrName && player?.name !== idOrName;
  });
}

function upsertBenchPlayer(bench, player) {
  const normalized = createRosterPlayerFromExternalPlayer(player);
  const id = getPlayerId(normalized);
  const nextBench = removePlayerFromArray(bench || [], id);
  nextBench.push(normalized);
  return nextBench;
}

function replaceLineupPlayer(lineup, removeIdOrName, incomingPlayer) {
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

function recalcBudget(next) {
  return recalcBudgetState(next);
}

function addDecisionCardsToInbox(next, cards) {
  const decisionMessages = (cards || []).map((card) =>
    createInboxMessage(
      "decision",
      card.title,
      card.body,
      {
        decisionId: card.id,
        type: card.type,
        day: card.day,
      }
    )
  );

  next.inbox = [...decisionMessages, ...(next.inbox || [])];
}

function buildControlledTeamSummary(gmState) {
  return {
    teamName: gmState?.controlledTeamName || "-",
    budget: clone(gmState?.budget || {}),
    roster: clone(gmState?.roster || {}),
  };
}

function createDefaultTradePayload(card, gmState) {
  const weakest = pickWeakestLineupPlayer(gmState.roster);
  const receiveId = card?.payload?.receive?.id || null;
  const incomingFA =
    (gmState.freeAgents || []).find((player) => player.id === receiveId) || null;

  return {
    removePlayerId:
      card?.payload?.give?.id ||
      weakest?.profile?.id ||
      weakest?.name ||
      null,
    incomingPlayer: incomingFA ? clone(incomingFA) : null,
    ...clone(card?.payload || {}),
  };
}

function removeFreeAgentById(freeAgents, playerId) {
  return (freeAgents || []).filter((player) => player.id !== playerId);
}

function applyFreeAgentSigning(prevGMState, playerId) {
  const next = clone(prevGMState);
  const player = (next.freeAgents || []).find((fa) => fa.id === playerId);
  if (!player) return next;

  const rosterPlayer = createRosterPlayerFromExternalPlayer(player);
  next.roster.bench = [...(next.roster.bench || []), rosterPlayer];
  next.freeAgents = removeFreeAgentById(next.freeAgents, playerId);

  next.transactions.unshift(
    createTransaction("sign", `${player.name} と契約した`, { playerId })
  );

  prependInboxMessage(
    next,
    "transaction",
    "FA契約成立",
    `${player.name} と契約した。`
  );

  return recalcBudget(next);
}

function applyLineupUpgrade(prevGMState, incomingPlayer) {
  const next = clone(prevGMState);
  if (!incomingPlayer) return next;

  const weakest = pickWeakestLineupPlayer(next.roster);
  const incomingRosterPlayer = createRosterPlayerFromExternalPlayer(incomingPlayer);

  next.roster.lineup = replaceLineupPlayer(
    next.roster.lineup,
    weakest?.profile?.id || weakest?.name,
    incomingRosterPlayer
  );

  if (weakest) {
    next.roster.bench = upsertBenchPlayer(next.roster.bench, weakest);
  }

  next.roster.bench = removePlayerFromArray(
    next.roster.bench,
    incomingRosterPlayer.profile?.id || incomingRosterPlayer.name
  );

  next.transactions.unshift(
    createTransaction(
      "upgrade_lineup",
      `${incomingRosterPlayer.name} をスタメンに組み込み、${weakest?.name || "選手"} をベンチへ回した`,
      { incomingPlayerId: incomingRosterPlayer.profile?.id || incomingRosterPlayer.name }
    )
  );

  prependInboxMessage(
    next,
    "transaction",
    "昇格実施",
    `${incomingRosterPlayer.name} をスタメンに昇格した。`
  );

  return recalcBudget(next);
}

function applyTradeAcceptance(prevGMState, card) {
  const next = clone(prevGMState);
  const payload = createDefaultTradePayload(card, next);
  const incoming = payload?.incomingPlayer
    ? createRosterPlayerFromExternalPlayer(payload.incomingPlayer)
    : null;
  if (!incoming) return next;

  const removeId = payload.removePlayerId;
  const outgoing =
    findPlayerByIdOrName(next.roster.lineup, removeId) ||
    findPlayerByIdOrName(next.roster.bench, removeId);

  next.roster.lineup = replaceLineupPlayer(next.roster.lineup, removeId, incoming);
  next.roster.bench = removePlayerFromArray(next.roster.bench, removeId);
  next.freeAgents = removeFreeAgentById(
    next.freeAgents,
    payload?.receive?.id || incoming?.profile?.id || incoming?.id
  );

  if (outgoing) {
    next.transactions.unshift(
      createTransaction(
        "trade",
        `${outgoing.name} を放出し、${incoming.name} を獲得した`,
        {
          outgoingId: removeId,
          incomingId: incoming.profile?.id || incoming.name,
        }
      )
    );

    prependInboxMessage(
      next,
      "transaction",
      "トレード成立",
      `${outgoing.name} ↔ ${incoming.name} の交換が成立した。`
    );
  }

  return recalcBudget(next);
}

function markDecisionResolved(next, decisionId, actionKey) {
  const remaining = [];
  let resolved = null;

  for (const card of next.pendingDecisions || []) {
    if (card.id === decisionId) {
      resolved = {
        ...card,
        status: "resolved",
        resolvedAction: actionKey,
      };
      continue;
    }
    remaining.push(card);
  }

  next.pendingDecisions = remaining;
  return resolved;
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
  let next = clone(prevGMState);
  const resolved = markDecisionResolved(next, decisionId, actionKey);

  if (!resolved) return next;

  if (resolved.type === "free_agent" && actionKey === "sign") {
    next = applyFreeAgentSigning(next, resolved.payload?.playerId);
    return recalcBudget(next);
  }

  if (resolved.type === GM_DECISION_TYPES.TRADE_OFFER) {
    if (actionKey === GM_DECISION_ACTIONS.TRADE_ACCEPT) {
      next = applyTradeAcceptance(next, resolved);
    } else {
      prependInboxMessage(
        next,
        "decision_result",
        "トレード見送り",
        `${resolved.title} を見送った。`
      );
    }
    return recalcBudget(next);
  }

  if (resolved.type === GM_DECISION_TYPES.PROMOTION_RECOMMENDATION) {
    if (actionKey === GM_DECISION_ACTIONS.PROMOTION_ACCEPT) {
      const promotedId = resolved.payload?.promoted?.id;
      const bestBench =
        findPlayerByIdOrName(next.roster.bench, promotedId) ||
        pickBestBenchBatter(next.roster);

      if (bestBench) {
        next = applyLineupUpgrade(next, bestBench);
      }
    } else {
      prependInboxMessage(
        next,
        "decision_result",
        "昇格見送り",
        `${resolved.title} を見送った。`
      );
    }
    return recalcBudget(next);
  }

  if (resolved.type === GM_DECISION_TYPES.INJURY_REPORT) {
    if (actionKey === GM_DECISION_ACTIONS.INJURY_REPLACE) {
      const replacementId = resolved.payload?.replacement?.id;
      const replacementSource = resolved.payload?.replacement?.source;

      if (replacementSource === "free_agent") {
        next = applyFreeAgentSigning(next, replacementId);

        const signedPlayer =
          findPlayerByIdOrName(next.roster.bench, replacementId) ||
          findPlayerByIdOrName(next.roster.lineup, replacementId);

        if (signedPlayer) {
          next = applyLineupUpgrade(next, signedPlayer);
        }
      } else {
        const benchPlayer =
          findPlayerByIdOrName(next.roster.bench, replacementId) ||
          pickBestBenchBatter(next.roster);

        if (benchPlayer) {
          next = applyLineupUpgrade(next, benchPlayer);
        }
      }
    } else {
      prependInboxMessage(
        next,
        "decision_result",
        "負傷対応保留",
        `${resolved.title} を保留にした。`
      );
    }
    return recalcBudget(next);
  }

  prependInboxMessage(
    next,
    "decision_result",
    "判断を記録",
    `${resolved.title} に対して ${actionKey} を選択した。`
  );

  return recalcBudget(next);
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