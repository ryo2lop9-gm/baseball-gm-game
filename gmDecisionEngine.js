import {
  GM_DECISION_TYPES,
  GM_DECISION_ACTIONS,
} from "./eventEngine.js";
import { recalcBudgetState } from "./services/contractService.js";
import { createTransaction } from "./services/transactionService.js";
import {
  pickWeakestLineupPlayer,
  pickBestBenchBatter,
} from "./services/rosterDecisionService.js";
import {
  prependInboxMessage,
} from "./gmInboxEngine.js";
import {
  createRosterPlayerFromExternalPlayer,
  findPlayerByIdOrName,
  removePlayerFromArray,
  upsertBenchPlayer,
  replaceLineupPlayer,
} from "./gmRosterEngine.js";

function clone(value) {
  return structuredClone(value);
}

function recalcBudget(next) {
  return recalcBudgetState(next);
}

function removeFreeAgentById(freeAgents, playerId) {
  return (freeAgents || []).filter((player) => player.id !== playerId);
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

export function resolveGMDecisionCard(prevGMState, decisionId, actionKey) {
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