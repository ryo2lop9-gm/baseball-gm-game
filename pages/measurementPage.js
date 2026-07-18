import { getMeasurementDom } from "./measurementDom.js?v=codex11-2";
import { renderMeasurementPage } from "../render/measurementRender.js?v=codex11-2";
import {
  MAX_MEASUREMENT_GAMES,
  normalizeMeasurementGameCount,
} from "../services/measurement/measurementService.js?v=codex11-2";
import { createMeasurementRunner } from "../services/measurement/measurementRunner.js?v=codex11-2";
import {
  buildMeasurementJson,
  buildMeasurementMarkdown,
} from "../services/measurement/measurementReportService.js?v=codex11-2";
import {
  DEFAULT_MEASUREMENT_SEED,
  normalizeSeed,
} from "../services/seededRandomService.js";

export async function copyMeasurementText(text, clipboard = null) {
  try {
    if (!clipboard || typeof clipboard.writeText !== "function") {
      throw new Error("Clipboard API is unavailable.");
    }
    await clipboard.writeText(text);
    return { success: true, message: "コピーしました" };
  } catch (error) {
    return {
      success: false,
      message:
        "自動コピーに失敗しました。下のテキスト欄からコピーしてください",
      error,
    };
  }
}

export function createMeasurementContext(
  rosterBundle,
  buildCurrentTuningTeams
) {
  return {
    validationPreset: {
      id: rosterBundle?.validationPreset || "custom",
      label: rosterBundle?.validationPresetLabel || "カスタム",
    },
    teams: structuredClone(buildCurrentTuningTeams(rosterBundle)),
  };
}

export function createMeasurementPageController({
  getTuningRosterBundle,
  buildCurrentTuningTeams,
  runner = null,
  clipboard = globalThis.navigator?.clipboard || null,
  generatedAtFactory = () => new Date().toISOString(),
}) {
  const dom = getMeasurementDom();
  const measurementRunner = runner || createMeasurementRunner();
  let state = {
    status: "idle",
    gameCount: 100,
    requestedGames: 100,
    seed: DEFAULT_MEASUREMENT_SEED,
    completedGames: 0,
    failedGames: 0,
    elapsedMs: 0,
    gamesPerSecond: 0,
    validationPreset: { id: "custom", label: "カスタム" },
    teams: null,
    summary: null,
    markdown: "",
    json: "",
    sharePreview: "",
    copyStatus: "",
    errorMessage: "",
  };

  function getCurrentContext() {
    return createMeasurementContext(
      getTuningRosterBundle(),
      buildCurrentTuningTeams
    );
  }

  function render() {
    if (dom.measurementPage && state.status === "idle") {
      state = { ...state, ...getCurrentContext() };
    }
    renderMeasurementPage(state, dom);
  }

  function updateProgress(message) {
    state = {
      ...state,
      status: message.status || "running",
      requestedGames: message.requestedGames || state.requestedGames,
      completedGames: message.completedGames || 0,
      failedGames: message.failedGames || 0,
      elapsedMs: message.elapsedMs || 0,
      gamesPerSecond: message.gamesPerSecond || 0,
      errorMessage: "",
    };
    render();
  }

  function finishMeasurement(message) {
    const summary = message.summary;
    const reportOptions = {
      summary,
      teams: state.teams,
      validationPreset: state.validationPreset,
      generatedAt: generatedAtFactory(),
    };
    const markdown = buildMeasurementMarkdown(reportOptions);
    const json = buildMeasurementJson(reportOptions);

    state = {
      ...state,
      status: summary.status,
      requestedGames: summary.run.requestedGames,
      completedGames: summary.run.completedGames,
      failedGames: summary.run.failedGames,
      elapsedMs: summary.run.elapsedMs,
      gamesPerSecond: summary.run.gamesPerSecond,
      summary,
      markdown,
      json,
      sharePreview: markdown,
      copyStatus: "",
      errorMessage: "",
    };
    render();
  }

  function failMeasurement(error) {
    state = {
      ...state,
      status: "error",
      summary: null,
      markdown: "",
      json: "",
      sharePreview: "",
      copyStatus: "",
      errorMessage: `${error?.code || "MEASUREMENT_ERROR"}: ${
        error?.message || String(error)
      }`,
    };
    render();
  }

  function startMeasurement() {
    try {
      const gameCount = normalizeMeasurementGameCount(dom.gameCountInput?.value);
      const seed = normalizeSeed(dom.seedInput?.value);
      const context = getCurrentContext();
      const teams = context.teams;

      state = {
        ...state,
        status: "loading",
        gameCount,
        requestedGames: gameCount,
        seed,
        validationPreset: context.validationPreset,
        completedGames: 0,
        failedGames: 0,
        elapsedMs: 0,
        gamesPerSecond: 0,
        teams,
        summary: null,
        markdown: "",
        json: "",
        sharePreview: "",
        copyStatus: "",
        errorMessage: "",
      };
      render();

      measurementRunner.start(
        {
          awayTeam: structuredClone(teams.away),
          homeTeam: structuredClone(teams.home),
          gameCount,
          seed,
        },
        {
          onProgress: updateProgress,
          onComplete: finishMeasurement,
          onError: failMeasurement,
        }
      );
    } catch (error) {
      failMeasurement(error);
    }
  }

  function cancelMeasurement() {
    if (!measurementRunner.cancel()) return;
    state = { ...state, status: "cancelling", errorMessage: "" };
    render();
  }

  async function copyReport(kind) {
    const text = kind === "json" ? state.json : state.markdown;
    if (!text) return;

    state = { ...state, sharePreview: text, copyStatus: "" };
    render();
    const result = await copyMeasurementText(text, clipboard);
    state = { ...state, copyStatus: result.message };
    render();
  }

  function wireEvents() {
    dom.presetButtons?.forEach((button) => {
      button.addEventListener("click", () => {
        const gameCount = Number(button.dataset.measurementGames);
        if (!Number.isInteger(gameCount)) return;
        state = {
          ...state,
          gameCount: Math.min(MAX_MEASUREMENT_GAMES, Math.max(1, gameCount)),
          requestedGames: Math.min(
            MAX_MEASUREMENT_GAMES,
            Math.max(1, gameCount)
          ),
          errorMessage: "",
        };
        render();
      });
    });

    dom.gameCountInput?.addEventListener("change", () => {
      try {
        const gameCount = normalizeMeasurementGameCount(
          dom.gameCountInput.value
        );
        state = {
          ...state,
          gameCount,
          requestedGames: gameCount,
          errorMessage: "",
        };
      } catch (error) {
        state = { ...state, errorMessage: error.message };
      }
      render();
    });

    dom.seedInput?.addEventListener("change", () => {
      state = { ...state, seed: normalizeSeed(dom.seedInput.value) };
      render();
    });

    dom.startButton?.addEventListener("click", startMeasurement);
    dom.cancelButton?.addEventListener("click", cancelMeasurement);
    dom.copyMarkdownButton?.addEventListener("click", () =>
      copyReport("markdown")
    );
    dom.copyJsonButton?.addEventListener("click", () => copyReport("json"));
  }

  return {
    render,
    wireEvents,
    startMeasurement,
    cancelMeasurement,
    getState: () => state,
  };
}
