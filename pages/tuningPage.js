import { getTuningDom } from "./tuningDom.js";
import {
  simulateGame,
  simulateNextPitch,
  simulateNextPlateAppearance,
} from "../engine/game/gameEngine.js";
import { simulateSeason } from "../engine/game/seasonEngine.js";
import {
  fillEditorSlotOptions,
  getSelectedEditableEntity,
  loadEditorFormFromEntity,
  applyEditorFormToRoster,
} from "../editorEngine.js";
import {
  renderGameCore,
  renderPitchPresentation,
  renderLineups,
  appendLog,
  clearLog,
  renderTuningGameTables,
  renderTuningSeasonTables,
} from "../render/tuningRender.js";

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
  let lastRenderedLogIndex = 0;

  function getTuningState() {
    return getAppState().tuning;
  }

  function getTuningSeasonSummary() {
    return getAppState().tuningSeasonSummary;
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
    fillEditorSlotOptions(dom);
    const entity = getSelectedEditableEntity(dom, getTuningRosterBundle());
    loadEditorFormFromEntity(dom, entity);
  }

  function syncTuningPage() {
    renderTuningPageCore();
    refreshEditorForm();
  }

  function prepareFreshTuningGame() {
    const newGame = createFreshTuningGame(getTuningRosterBundle());
    setAppTuningState(newGame);
    resetLogCursor();
    renderFullLog();
    syncTuningPage();
  }

  function pushFinishedGameNote() {
    const state = getTuningState();
    if (!Array.isArray(state.presentation?.log)) return;

    const next = structuredClone(state);
    next.presentation = next.presentation || {};
    next.presentation.log = Array.isArray(next.presentation.log)
      ? [...next.presentation.log]
      : [];
    next.presentation.log.push("この試合はすでに終了しています。新しい試合を準備してください。");

    setAppTuningState(next);
    appendOnlyNewLogs();
    syncTuningPage();
  }

  function stepOnePitch() {
    if (getTuningState().isComplete) {
      pushFinishedGameNote();
      return;
    }

    const next = simulateNextPitch(getTuningState());
    setAppTuningState(next);
    appendOnlyNewLogs();
    syncTuningPage();
  }

  function stepOnePlateAppearance() {
    if (getTuningState().isComplete) {
      pushFinishedGameNote();
      return;
    }

    const next = simulateNextPlateAppearance(getTuningState());
    setAppTuningState(next);
    appendOnlyNewLogs();
    syncTuningPage();
  }

  function stepHalfInning() {
    if (getTuningState().isComplete) {
      pushFinishedGameNote();
      return;
    }

    const startInning = getTuningState().inning;
    const startHalf = getTuningState().half;
    let next = getTuningState();

    while (!next.isComplete) {
      next = simulateNextPitch(next);
      if (next.isComplete) break;
      if (next.inning !== startInning || next.half !== startHalf) break;
    }

    setAppTuningState(next);
    appendOnlyNewLogs();
    syncTuningPage();
  }

  function playFullGame() {
    if (getTuningState().isComplete) {
      pushFinishedGameNote();
      return;
    }

    const next = simulateGame(getTuningState());
    setAppTuningState(next);
    appendOnlyNewLogs();
    syncTuningPage();
  }

  function buildCurrentTuningTeamsFromRoster() {
    const bundle = getTuningRosterBundle();

    return {
      away: {
        name: bundle.awayMeta.name,
        lineup: structuredClone(bundle.awayRoster.lineup || []),
        startingPitcher: structuredClone(bundle.awayRoster.rotation?.[0] || null),
        bullpen: structuredClone(bundle.awayRoster.bullpen || []),
      },
      home: {
        name: bundle.homeMeta.name,
        lineup: structuredClone(bundle.homeRoster.lineup || []),
        startingPitcher: structuredClone(bundle.homeRoster.rotation?.[0] || null),
        bullpen: structuredClone(bundle.homeRoster.bullpen || []),
      },
    };
  }

  function runSeasonSimulation(games) {
    const teams = buildCurrentTuningTeamsFromRoster();
    const summary = simulateSeason(teams.away, teams.home, games);
    setAppTuningSeasonSummary(summary);
    syncTuningPage();
  }

  function resetSandboxRoster() {
    setTuningRosterBundle(createDefaultRosterBundle());
    setAppTuningSeasonSummary(null);
    prepareFreshTuningGame();
  }

  function applyEditorChanges() {
    const nextBundle = applyEditorFormToRoster(dom, getTuningRosterBundle());
    setTuningRosterBundle(nextBundle);
    setAppTuningSeasonSummary(null);
    prepareFreshTuningGame();
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