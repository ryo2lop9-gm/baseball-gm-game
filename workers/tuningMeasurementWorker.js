import { loadEvLaLookup } from "../services/evLaLookupStore.js";
import { runMeasurementBatches } from "../services/measurement/measurementService.js";

let activeRunId = null;
let cancelRequested = false;

function postProgress(runId, status, progress = {}) {
  self.postMessage({
    type: "progress",
    runId,
    status,
    completedGames: progress.completedGames || 0,
    failedGames: progress.failedGames || 0,
    requestedGames: progress.requestedGames || 0,
    elapsedMs: progress.elapsedMs || 0,
    gamesPerSecond: progress.gamesPerSecond || 0,
  });
}

async function startMeasurement(runId, payload) {
  if (activeRunId) {
    self.postMessage({
      type: "error",
      runId,
      code: "MEASUREMENT_ALREADY_RUNNING",
      message: "A measurement run is already active.",
    });
    return;
  }

  activeRunId = runId;
  cancelRequested = false;
  postProgress(runId, "loading", {
    requestedGames: payload?.gameCount,
  });

  try {
    await loadEvLaLookup();
    postProgress(runId, "running", {
      requestedGames: payload?.gameCount,
    });

    const summary = await runMeasurementBatches({
      awayTeam: payload?.awayTeam,
      homeTeam: payload?.homeTeam,
      gameCount: payload?.gameCount,
      seed: payload?.seed,
      shouldCancel: () => cancelRequested && activeRunId === runId,
      onProgress: (progress) =>
        postProgress(
          runId,
          cancelRequested ? "cancelling" : "running",
          progress
        ),
    });

    self.postMessage({
      type: "complete",
      runId,
      status: summary.status,
      summary,
    });
  } catch (error) {
    self.postMessage({
      type: "error",
      runId,
      code: error?.code || "MEASUREMENT_WORKER_ERROR",
      message: error?.message || String(error),
    });
  } finally {
    if (activeRunId === runId) {
      activeRunId = null;
      cancelRequested = false;
    }
  }
}

self.addEventListener("message", (event) => {
  const message = event?.data || {};

  if (message.type === "start") {
    startMeasurement(message.runId, message.payload);
    return;
  }

  if (message.type === "cancel" && message.runId === activeRunId) {
    cancelRequested = true;
  }
});
