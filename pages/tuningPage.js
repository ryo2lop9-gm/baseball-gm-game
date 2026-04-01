import { getTuningDom } from "./tuningDom.js";
import {
  renderGameCore,
  renderPitchPresentation,
  renderLineups,
  appendLog,
  clearLog,
  renderTuningGameTables,
  renderTuningSeasonTables,
} from "../render/tuningRender.js";
import { createTuningFacade } from "../services/tuning/tuningFacade.js";

export function createTuningPageController({
  getAppState,
  setAppTuningState,
  setAppTuningSeasonSummary,
  getTuningRosterBundle,
  setTuningRosterBundle,
  createDefaultRosterBundle,
  createFreshTuningGame,
}) {
  const dom = getTuningDom();
  const facade = createTuningFacade({
    getAppState,
    setAppTuningState,
    setAppTuningSeasonSummary,
    getTuningRosterBundle,
    setTuningRosterBundle,
    createDefaultRosterBundle,
    createFreshTuningGame,
  });

  let lastRenderedLogIndex = 0;

  function getTuningState() {
    return facade.getTuningState();
  }

  function getTuningSeasonSummary() {
    return facade.getTuningSeasonSummary();
  }

  function resetLogCursor() {
    lastRenderedLogIndex = 0;
  }

  function renderTuningPageCore() {
    renderGameCore(getTuningState(), dom);
    renderPitchPresentation(getTuningState(), dom);
    renderLineups(getTuningState(), dom);
    renderTuningGameTables(getTuningState(), dom);
    renderTuningSeasonTables(getTuningSeasonSummary(), dom);
  }

  function renderFullLog() {
    clearLog(dom);

    const lines = Array.isArray(getTuningState().presentation?.log)
      ? getTuningState().presentation.log
      : [];

    for (const line of lines) {
      appendLog(dom, line);
    }

    lastRenderedLogIndex = lines.length;

    if (dom.log) {
      dom.log.scrollTop = dom.log.scrollHeight;
    }
  }

  function appendOnlyNewLogs() {
    if (!dom.log || !Array.isArray(getTuningState().presentation?.log)) return;

    const lines = getTuningState().presentation.log;

    for (let i = lastRenderedLogIndex; i < lines.length; i += 1) {
      appendLog(dom, lines[i]);
    }

    lastRenderedLogIndex = lines.length;
    dom.log.scrollTop = dom.log.scrollHeight;
  }

  function refreshEditorForm() {
    facade.refreshEditorForm(dom);
  }

  function syncTuningPage() {
    renderTuningPageCore();
    refreshEditorForm();
  }

  function prepareFreshTuningGame() {
    facade.prepareFreshTuningGame();
    resetLogCursor();
    renderFullLog();
    syncTuningPage();
  }

  function stepOnePitch() {
    facade.stepOnePitch();
    appendOnlyNewLogs();
    syncTuningPage();
  }

  function stepOnePlateAppearance() {
    facade.stepOnePlateAppearance();
    appendOnlyNewLogs();
    syncTuningPage();
  }

  function stepHalfInning() {
    facade.stepHalfInning();
    appendOnlyNewLogs();
    syncTuningPage();
  }

  function playFullGame() {
    facade.playFullGame();
    appendOnlyNewLogs();
    syncTuningPage();
  }

  function runSeasonSimulation(games) {
    facade.runSeasonSimulation(games);
    syncTuningPage();
  }

  function resetSandboxRoster() {
    facade.resetSandboxRoster();
    resetLogCursor();
    renderFullLog();
    syncTuningPage();
  }

  function applyEditorChanges() {
    facade.applyEditorChanges(dom);
    resetLogCursor();
    renderFullLog();
    syncTuningPage();
  }

  function wireEvents() {
    dom.newGameBtn?.addEventListener("click", () => {
      setAppTuningSeasonSummary(null);
      prepareFreshTuningGame();
    });

    dom.stepPitchBtn?.addEventListener("click", stepOnePitch);
    dom.stepPaBtn?.addEventListener("click", stepOnePlateAppearance);
    dom.halfInningBtn?.addEventListener("click", stepHalfInning);
    dom.playGameBtn?.addEventListener("click", playFullGame);

    dom.sim10Btn?.addEventListener("click", () => runSeasonSimulation(10));
    dom.sim162Btn?.addEventListener("click", () => runSeasonSimulation(162));

    dom.resetTuningRosterBtn?.addEventListener("click", resetSandboxRoster);

    dom.editorSideSelect?.addEventListener("change", refreshEditorForm);
    dom.editorPlayerTypeSelect?.addEventListener("change", refreshEditorForm);
    dom.editorSlotSelect?.addEventListener("change", refreshEditorForm);
    dom.reloadEditorBtn?.addEventListener("click", refreshEditorForm);
    dom.applyPlayerEditBtn?.addEventListener("click", applyEditorChanges);
  }

  function render() {
    if (!Array.isArray(getTuningState().presentation?.log)) {
      renderTuningPageCore();
      refreshEditorForm();
      return;
    }

    if (lastRenderedLogIndex === 0 && dom.log?.childElementCount === 0) {
      renderFullLog();
    }

    syncTuningPage();
  }

  return {
    render,
    wireEvents,
    refreshEditorForm,
  };
}