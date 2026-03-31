import { getGMDeskDom } from "./gmDeskDom.js";
import { renderGMPage } from "../render/gmRender.js";
import { buildGMViewModel } from "../selectors/gmSelectors.js";
import {
  advanceGMDesk,
  startNewGMSeason,
  resolveGMDecision,
} from "../services/gm/gmFacade.js";

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
    const viewModel = buildGMViewModel(getGMState());
    renderGMPage(dom, viewModel);
  }

  function notifyStatsChanged(callbacks) {
    if (typeof callbacks?.onStatsChanged === "function") {
      callbacks.onStatsChanged();
    }
  }

  function handleAdvance(days, callbacks = {}) {
    const result = advanceGMDesk({
      gmState: getGMState(),
      statsIndex: getStatsIndex(),
      days,
    });

    setAppGMState(result.gmState);
    setStatsIndex(result.statsIndex);
    render();

    if (result.statsChanged) {
      notifyStatsChanged(callbacks);
    }
  }

  function handleNewSeason(callbacks = {}) {
    const result = startNewGMSeason({
      createFreshGMDesk,
    });

    setAppGMState(result.gmState);
    setStatsIndex(result.statsIndex);
    render();

    if (result.statsChanged) {
      notifyStatsChanged(callbacks);
    }
  }

  function handleDecisionClick(event) {
    const button = event.target.closest("button[data-decision-id][data-action-key]");
    if (!button) return;

    const decisionId = button.dataset.decisionId;
    const actionKey = button.dataset.actionKey;

    const result = resolveGMDecision({
      gmState: getGMState(),
      decisionId,
      actionKey,
    });

    setAppGMState(result.gmState);
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