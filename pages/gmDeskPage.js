import { getGMDeskDom } from "./gmDeskDom.js";
import {
  advanceGMDay,
  getPendingDecisions,
  resolveDecisionCard,
  getLastDayResults,
  appendGMInboxNote,
} from "../engine/gm/gmEngine.js";
import {
  createStatsIndex,
  ingestLastDayResults,
} from "../engine/stats/statsEngine.js";
import { renderGMPage } from "../render/gmRender.js";

export function createGMDeskPageController({
  getAppState,
  setAppGMState,
  getStatsIndex,
  setStatsIndex,
  createFreshGMDesk,
}) {
  const dom = getGMDeskDom();

  function getGMState() {
    return getAppState().gm;
  }

  function render() {
    renderGMPage(dom, getGMState());
  }

  function createProgressNote(beforeDay, afterState) {
    const pending = getPendingDecisions(afterState).length;
    const progressed = Math.max(0, afterState.day - beforeDay);

    if (pending > 0) {
      return `Day ${afterState.day - 1} の処理後に ${pending} 件の判断待ちが発生しました。`;
    }

    if (progressed <= 0) {
      return "これ以上進める日程がありません。";
    }

    return `${progressed} 日進行しました。`;
  }

  function handleAdvance(days, callbacks = {}) {
    const beforeDay = getGMState().day;
    let next = getGMState();
    let nextStatsIndex = getStatsIndex();

    for (let i = 0; i < days; i += 1) {
      const advanced = advanceGMDay(next);
      const progressed = advanced.day !== next.day || advanced.isComplete !== next.isComplete;
      next = advanced;

      const results = getLastDayResults(next);
      if (results.length > 0) {
        nextStatsIndex = ingestLastDayResults(nextStatsIndex, results);
      }

      if (
        !progressed ||
        getPendingDecisions(next).length > 0 ||
        next.isComplete
      ) {
        break;
      }
    }

    next = appendGMInboxNote(
      next,
      "GMデスク",
      createProgressNote(beforeDay, next),
      "system"
    );

    setAppGMState(next);
    setStatsIndex(nextStatsIndex);
    render();

    if (typeof callbacks.onStatsChanged === "function") {
      callbacks.onStatsChanged();
    }
  }

  function handleNewSeason(callbacks = {}) {
    const fresh = appendGMInboxNote(
      createFreshGMDesk(),
      "GMデスク",
      "新しいGMシーズンを開始しました。",
      "system"
    );

    setAppGMState(fresh);
    setStatsIndex(createStatsIndex());
    render();

    if (typeof callbacks.onStatsChanged === "function") {
      callbacks.onStatsChanged();
    }
  }

  function handleDecisionClick(event) {
    const button = event.target.closest("button[data-decision-id][data-action-key]");
    if (!button) return;

    const decisionId = button.dataset.decisionId;
    const actionKey = button.dataset.actionKey;
    const next = resolveDecisionCard(getGMState(), decisionId, actionKey);

    setAppGMState(next);
    render();
  }

  function wireEvents(callbacks = {}) {
    dom.gmAdvanceDayBtn?.addEventListener("click", () => handleAdvance(1, callbacks));
    dom.gmAdvanceWeekBtn?.addEventListener("click", () => handleAdvance(7, callbacks));
    dom.gmNewSeasonBtn?.addEventListener("click", () => handleNewSeason(callbacks));
    dom.gmPendingCards?.addEventListener("click", handleDecisionClick);
  }

  return {
    render,
    wireEvents,
  };
}