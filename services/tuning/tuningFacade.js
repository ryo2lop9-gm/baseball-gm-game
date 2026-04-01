import {
  simulateGame,
  simulateNextPitch,
  simulateNextPlateAppearance,
} from "../../engine/game/gameEngine.js";
import { simulateSeason } from "../../engine/game/seasonEngine.js";
import {
  fillEditorSlotOptions,
  getSelectedEditableEntity,
  loadEditorFormFromEntity,
  applyEditorFormToRoster,
} from "../../engine/gm/editorEngine.js";

export function createTuningFacade({
  getAppState,
  setAppTuningState,
  setAppTuningSeasonSummary,
  getTuningRosterBundle,
  setTuningRosterBundle,
  createDefaultRosterBundle,
  createFreshTuningGame,
}) {
  function getTuningState() {
    return getAppState().tuning;
  }

  function getTuningSeasonSummary() {
    return getAppState().tuningSeasonSummary;
  }

  function buildFinishedGameNoteState() {
    const state = getTuningState();
    if (!Array.isArray(state.presentation?.log)) return state;

    const next = structuredClone(state);
    next.presentation = next.presentation || {};
    next.presentation.log = Array.isArray(next.presentation.log)
      ? [...next.presentation.log]
      : [];
    next.presentation.log.push(
      "この試合はすでに終了しています。新しい試合を準備してください。"
    );
    return next;
  }

  function pushFinishedGameNote() {
    const next = buildFinishedGameNoteState();
    setAppTuningState(next);
    return next;
  }

  function prepareFreshTuningGame() {
    const next = createFreshTuningGame(getTuningRosterBundle());
    setAppTuningState(next);
    return next;
  }

  function stepOnePitch() {
    const state = getTuningState();
    if (state.isComplete) {
      return pushFinishedGameNote();
    }
    const next = simulateNextPitch(state);
    setAppTuningState(next);
    return next;
  }

  function stepOnePlateAppearance() {
    const state = getTuningState();
    if (state.isComplete) {
      return pushFinishedGameNote();
    }
    const next = simulateNextPlateAppearance(state);
    setAppTuningState(next);
    return next;
  }

  function stepHalfInning() {
    const state = getTuningState();
    if (state.isComplete) {
      return pushFinishedGameNote();
    }

    const startInning = state.inning;
    const startHalf = state.half;
    let next = state;

    while (!next.isComplete) {
      next = simulateNextPitch(next);
      if (next.isComplete) break;
      if (next.inning !== startInning || next.half !== startHalf) break;
    }

    setAppTuningState(next);
    return next;
  }

  function playFullGame() {
    const state = getTuningState();
    if (state.isComplete) {
      return pushFinishedGameNote();
    }
    const next = simulateGame(state);
    setAppTuningState(next);
    return next;
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
    return summary;
  }

  function resetSandboxRoster() {
    const nextBundle = createDefaultRosterBundle();
    setTuningRosterBundle(nextBundle);
    setAppTuningSeasonSummary(null);

    const nextGame = createFreshTuningGame(nextBundle);
    setAppTuningState(nextGame);

    return nextGame;
  }

  function refreshEditorForm(dom) {
    fillEditorSlotOptions(dom);
    const entity = getSelectedEditableEntity(dom, getTuningRosterBundle());
    loadEditorFormFromEntity(dom, entity);
    return entity;
  }

  function applyEditorChanges(dom) {
    const nextBundle = applyEditorFormToRoster(dom, getTuningRosterBundle());
    setTuningRosterBundle(nextBundle);
    setAppTuningSeasonSummary(null);

    const nextGame = createFreshTuningGame(nextBundle);
    setAppTuningState(nextGame);

    return {
      rosterBundle: nextBundle,
      tuningState: nextGame,
    };
  }

  return {
    getTuningState,
    getTuningSeasonSummary,
    prepareFreshTuningGame,
    pushFinishedGameNote,
    stepOnePitch,
    stepOnePlateAppearance,
    stepHalfInning,
    playFullGame,
    runSeasonSimulation,
    resetSandboxRoster,
    refreshEditorForm,
    applyEditorChanges,
  };
}