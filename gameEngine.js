import {
  stepPitchMutable,
  simulateGameMutable,
} from "./engineCore.js";
import {
  createPresentationCallbacks,
  syncPresentationFromRuntime,
} from "./presentationEngine.js";

/**
 * visible game 専用:
 * ユーザー操作の入口でのみ clone する。
 * 1球進行 / 1打席進行 / 1試合進行の内部では mutable core を使う。
 */
function cloneVisibleState(state) {
  return structuredClone(state);
}

function createVisibleSimulationOptions(state) {
  return createPresentationCallbacks(state);
}

function simulatePlateAppearanceOnClonedState(state) {
  if (state.isComplete) return state;

  const startSide = state.half === "top" ? "away" : "home";
  const startBatterName =
    state[startSide === "away" ? "awayTeam" : "homeTeam"]
      .lineup[state.battingIndex[startSide] % 9]?.name || "";

  while (!state.isComplete) {
    stepPitchMutable(state, createVisibleSimulationOptions(state));
    syncPresentationFromRuntime(state);

    if (state.isComplete) break;

    const nowSide = state.half === "top" ? "away" : "home";
    const nowBatterName =
      state[nowSide === "away" ? "awayTeam" : "homeTeam"]
        .lineup[state.battingIndex[nowSide] % 9]?.name || "";

    if (nowSide !== startSide) break;
    if (nowBatterName !== startBatterName) break;
  }

  syncPresentationFromRuntime(state);
  return state;
}

export function simulateNextPitch(prevState) {
  const state = cloneVisibleState(prevState);
  stepPitchMutable(state, createVisibleSimulationOptions(state));
  syncPresentationFromRuntime(state);
  return state;
}

export function simulateNextPlateAppearance(prevState) {
  const state = cloneVisibleState(prevState);
  return simulatePlateAppearanceOnClonedState(state);
}

export function simulateGame(prevState) {
  const state = cloneVisibleState(prevState);
  simulateGameMutable(state, createVisibleSimulationOptions(state));
  syncPresentationFromRuntime(state);
  return state;
}