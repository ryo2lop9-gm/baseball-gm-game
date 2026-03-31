import {
  advanceGMDay,
  getPendingDecisions,
  resolveDecisionCard,
  getLastDayResults,
  appendGMInboxNote,
} from "../../engine/gm/gmEngine.js";
import {
  createStatsIndex,
  ingestLastDayResults,
} from "../../engine/stats/statsEngine.js";

function createProgressNote(beforeDay, afterState) {
  const pendingCount = Array.isArray(afterState?.pendingDecisions)
    ? afterState.pendingDecisions.length
    : 0;
  const currentDay = Number(afterState?.day || 0);
  const progressed = Math.max(0, currentDay - Number(beforeDay || 0));

  if (pendingCount > 0) {
    return `Day ${Math.max(0, currentDay - 1)} の処理後に ${pendingCount} 件の判断待ちが発生しました。`;
  }

  if (progressed <= 0) {
    return "これ以上進める日程がありません。";
  }

  return `${progressed} 日進行しました。`;
}

export function advanceGMDesk({ gmState, statsIndex, days }) {
  const safeDays = Math.max(0, Number(days || 0));
  const beforeDay = Number(gmState?.day || 0);

  let nextGMState = gmState;
  let nextStatsIndex = statsIndex;
  let statsChanged = false;

  for (let i = 0; i < safeDays; i += 1) {
    const advanced = advanceGMDay(nextGMState);
    const progressed =
      advanced.day !== nextGMState.day ||
      advanced.isComplete !== nextGMState.isComplete;

    nextGMState = advanced;

    const results = getLastDayResults(nextGMState);
    if (Array.isArray(results) && results.length > 0) {
      nextStatsIndex = ingestLastDayResults(nextStatsIndex, results);
      statsChanged = true;
    }

    if (
      !progressed ||
      getPendingDecisions(nextGMState).length > 0 ||
      nextGMState.isComplete
    ) {
      break;
    }
  }

  nextGMState = appendGMInboxNote(
    nextGMState,
    "GMデスク",
    createProgressNote(beforeDay, nextGMState),
    "system"
  );

  return {
    gmState: nextGMState,
    statsIndex: nextStatsIndex,
    statsChanged,
  };
}

export function startNewGMSeason({ createFreshGMDesk }) {
  const freshGMState = appendGMInboxNote(
    createFreshGMDesk(),
    "GMデスク",
    "新しいGMシーズンを開始しました。",
    "system"
  );

  return {
    gmState: freshGMState,
    statsIndex: createStatsIndex(),
    statsChanged: true,
  };
}

export function resolveGMDecision({ gmState, decisionId, actionKey }) {
  const nextGMState = resolveDecisionCard(gmState, decisionId, actionKey);

  return {
    gmState: nextGMState,
    statsChanged: false,
  };
}