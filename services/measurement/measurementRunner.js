const WORKER_URL = new URL(
  "../../workers/tuningMeasurementWorker.js?v=codex10-1",
  import.meta.url
);

function createRunnerError(code, message, cause = null) {
  const error = new Error(message, cause ? { cause } : undefined);
  error.code = code;
  return error;
}

export function createMeasurementRunner({
  workerFactory = null,
  runIdFactory = null,
} = {}) {
  let worker = null;
  let activeRunId = null;
  let handlers = null;
  let runSequence = 0;

  function getWorkerFactory() {
    if (workerFactory) return workerFactory;
    if (typeof Worker !== "function") {
      throw createRunnerError(
        "MEASUREMENT_WORKER_UNAVAILABLE",
        "このブラウザでは高速計測を利用できません"
      );
    }
    return () => new Worker(WORKER_URL, { type: "module" });
  }

  function nextRunId() {
    runSequence += 1;
    return runIdFactory
      ? String(runIdFactory(runSequence))
      : `measurement-${Date.now()}-${runSequence}`;
  }

  function clearActiveRun() {
    activeRunId = null;
    handlers = null;
  }

  function handleMessage(event) {
    const message = event?.data || {};
    if (!activeRunId || message.runId !== activeRunId) return;

    if (message.type === "progress") {
      handlers?.onProgress?.(message);
      return;
    }

    if (message.type === "complete") {
      const completeHandler = handlers?.onComplete;
      clearActiveRun();
      completeHandler?.(message);
      return;
    }

    if (message.type === "error") {
      const errorHandler = handlers?.onError;
      clearActiveRun();
      errorHandler?.(
        createRunnerError(
          message.code || "MEASUREMENT_WORKER_ERROR",
          message.message || "Measurement worker failed."
        ),
        message
      );
    }
  }

  function handleWorkerError(event) {
    if (!activeRunId) return;
    const errorHandler = handlers?.onError;
    clearActiveRun();
    errorHandler?.(
      createRunnerError(
        "MEASUREMENT_WORKER_ERROR",
        event?.message || "Measurement worker failed.",
        event?.error || null
      )
    );
  }

  function ensureWorker() {
    if (worker) return worker;
    worker = getWorkerFactory()();
    worker.addEventListener("message", handleMessage);
    worker.addEventListener("error", handleWorkerError);
    return worker;
  }

  function start(payload, nextHandlers = {}) {
    if (activeRunId) {
      throw createRunnerError(
        "MEASUREMENT_ALREADY_RUNNING",
        "A measurement run is already active."
      );
    }

    const runId = nextRunId();
    activeRunId = runId;
    handlers = nextHandlers;

    try {
      ensureWorker().postMessage({
        type: "start",
        runId,
        payload: structuredClone(payload),
      });
    } catch (error) {
      clearActiveRun();
      throw error?.code
        ? error
        : createRunnerError(
            "MEASUREMENT_WORKER_START_FAILED",
            "Measurement worker could not be started.",
            error
          );
    }

    return runId;
  }

  function cancel() {
    if (!worker || !activeRunId) return false;
    worker.postMessage({ type: "cancel", runId: activeRunId });
    return true;
  }

  function terminate() {
    worker?.terminate?.();
    worker = null;
    clearActiveRun();
  }

  return {
    start,
    cancel,
    terminate,
    getActiveRunId: () => activeRunId,
    isRunning: () => Boolean(activeRunId),
  };
}
