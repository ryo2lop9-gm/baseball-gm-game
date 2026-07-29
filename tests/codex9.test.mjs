import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  createFastSimulationOptions,
  simulateGameMutable,
} from "../engine/core/engineCore.js";
import { createRootStateFactory } from "../bootstrap/rootStateFactory.js";
import {
  applyRouteVisibility,
  wireRouteEvents,
} from "../bootstrap/appRouter.js";
import { createMlbAverageValidationTeams } from "../models/teamModels.js";
import { createInitialSimState } from "../state/gameState.js";
import { resolveContactResult } from "../services/contactResolutionService.js";
import {
  EV_LA_LOOKUP_URL,
  loadEvLaLookup,
} from "../services/evLaLookupStore.js";
import {
  createSeededRandom,
  normalizeSeed,
} from "../services/seededRandomService.js";
import {
  commitCompletedMeasurementGame,
  createEmptyMeasurementAccumulator,
  createGameMeasurementAccumulator,
  finalizeMeasurementSummary,
  normalizeMeasurementGameCount,
  recordBattedBallMeasurement,
  runMeasurementBatches,
} from "../services/measurement/measurementService.js";
import { createMeasurementRunner } from "../services/measurement/measurementRunner.js";
import {
  buildMeasurementJson,
  buildMeasurementMarkdown,
  buildMeasurementReportObject,
  getMeasurementEngineConfig,
} from "../services/measurement/measurementReportService.js";
import { copyMeasurementText } from "../pages/measurementPage.js";

const realLookup = JSON.parse(
  await readFile(new URL("../data/ev_la_lookup.json", import.meta.url), "utf8")
);
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => ({ ok: true, json: async () => realLookup });
await loadEvLaLookup();
globalThis.fetch = originalFetch;

function makeStats(overrides = {}) {
  return {
    PA: 4,
    AB: 3,
    H: 1,
    doubles: 0,
    triples: 0,
    HR: 0,
    BB: 1,
    K: 1,
    RBI: 0,
    R: 0,
    ...overrides,
  };
}

function makeCompletedGame(awayTeam, homeTeam, score = { away: 2, home: 1 }) {
  const cloneTeam = (team, stats) => ({
    ...structuredClone(team),
    lineup: team.lineup.map((player, index) => ({
      ...structuredClone(player),
      gameStats: index === 0 ? stats : makeStats({ PA: 0, AB: 0, H: 0, BB: 0, K: 0 }),
    })),
  });

  return {
    isComplete: true,
    score,
    awayTeam: cloneTeam(awayTeam, makeStats({ H: 2, doubles: 1 })),
    homeTeam: cloneTeam(homeTeam, makeStats({ H: 1, HR: 1 })),
  };
}

function makeMeasurementEvent(overrides = {}) {
  return {
    side: "away",
    exitVelocity: 95,
    launchAngle: 21,
    qoc: "Solid",
    evLaKey: "95|21",
    source: "ev_la_smoothed",
    sampleQuality: "good",
    neighborMode: "local",
    expansionLevel: 0,
    targetBattedBalls: 329,
    targetWeight: 0.76,
    neighborEffectiveSampleSize: 1200,
    physicalConstraints: [],
    outcome: "double",
    ...overrides,
  };
}

test("seeded random is repeatable and seed is normalized to uint32", () => {
  const first = createSeededRandom(123456789);
  const second = createSeededRandom(123456789);
  const third = createSeededRandom(987654321);
  const firstValues = Array.from({ length: 20 }, () => first());
  const secondValues = Array.from({ length: 20 }, () => second());
  const thirdValues = Array.from({ length: 20 }, () => third());

  assert.deepEqual(firstValues, secondValues);
  assert.notDeepEqual(firstValues, thirdValues);
  assert.equal(normalizeSeed(-1), 0xffffffff);
});

test("measurement game count accepts 1 through 10000 only", () => {
  assert.equal(normalizeMeasurementGameCount(1), 1);
  assert.equal(normalizeMeasurementGameCount(10000), 10000);
  for (const value of [0, -1, 1.5, 10001, Number.NaN]) {
    assert.throws(
      () => normalizeMeasurementGameCount(value),
      (error) => error.code === "MEASUREMENT_GAME_COUNT_INVALID"
    );
  }
});

test("fast simulation options remain empty by default and accept opt-in hooks", () => {
  assert.deepEqual(createFastSimulationOptions(), {});
  const random = () => 0.5;
  const onBattedBallMeasurement = () => {};
  assert.deepEqual(
    createFastSimulationOptions({ random, onBattedBallMeasurement }),
    { random, onBattedBallMeasurement }
  );
});

test("fast simulation without an injected RNG uses the Math.random path", () => {
  const teams = createMlbAverageValidationTeams();
  const state = createInitialSimState(
    structuredClone(teams.away),
    structuredClone(teams.home)
  );
  const originalRandom = Math.random;
  const seededRandom = createSeededRandom(13579);
  let randomCalls = 0;

  Math.random = () => {
    randomCalls += 1;
    return seededRandom();
  };
  try {
    simulateGameMutable(state, createFastSimulationOptions());
  } finally {
    Math.random = originalRandom;
  }

  assert.equal(state.isComplete, true);
  assert.ok(randomCalls > 0);
});

test("contact measurement fires once without consuming another random value", () => {
  const teams = createMlbAverageValidationTeams();
  const state = createInitialSimState(
    structuredClone(teams.away),
    structuredClone(teams.home)
  );
  const batter = state.awayTeam.lineup[0];
  let randomCalls = 0;
  const events = [];

  resolveContactResult({
    state,
    batter,
    side: "away",
    pitchType: "fourSeam",
    course: "middle",
    pitchVelocity: 95,
    qoc: "Solid",
    battedBall: { exitVelocity: 95, launchAngle: 21, qoc: "Solid" },
    options: { onBattedBallMeasurement: (event) => events.push(event) },
    random: () => {
      randomCalls += 1;
      return 0;
    },
    addQoCToBox: () => {},
    addOutInPlayStat: () => {},
    addHitStat: () => {},
    advanceRunnersOnHit: () => 0,
    maybeEndGameMidInning: () => {},
    moveToNextBatter: () => {},
    finishPlateAppearanceState: () => {},
    emitLog: () => {},
    emitLastPitchPatch: () => {},
  });

  assert.equal(randomCalls, 1);
  assert.equal(events.length, 1);
  assert.equal(events[0].outcome, "out");
  assert.equal(events[0].source, "ev_la_smoothed");
  assert.equal(events[0].sampleQuality, "good");
  assert.equal(events[0].neighborMode, "local");
});

test("measurement aggregation computes batting, QoC, smoothing, and outcome rates", () => {
  const teams = createMlbAverageValidationTeams();
  const total = createEmptyMeasurementAccumulator();
  const game = createGameMeasurementAccumulator();
  recordBattedBallMeasurement(game, makeMeasurementEvent());
  recordBattedBallMeasurement(
    game,
    makeMeasurementEvent({
      side: "home",
      launchAngle: -10,
      qoc: "Topped",
      sampleQuality: "none",
      neighborMode: "distant",
      source: "ev_la_neighbor",
      targetBattedBalls: 0,
      targetWeight: 0,
      outcome: "out",
      physicalConstraints: ["negative_launch_angle_no_direct_home_run"],
    })
  );
  commitCompletedMeasurementGame(
    total,
    makeCompletedGame(teams.away, teams.home),
    game
  );
  const summary = finalizeMeasurementSummary(total, {
    status: "completed",
    seed: 7,
    requestedGames: 1,
    elapsedMs: 1000,
  });

  assert.equal(summary.run.completedGames, 1);
  assert.equal(summary.results.away.singles, 1);
  assert.equal(summary.results.away.totalBases, 3);
  assert.equal(summary.results.combined.averageRuns, 1.5);
  assert.equal(summary.results.away.AVG, 2 / 3);
  assert.equal(summary.results.away.OBP, 3 / 4);
  assert.equal(summary.results.away.SLG, 1);
  assert.equal(summary.results.away.BBPct, 1 / 4);
  assert.equal(summary.results.away.KPct, 1 / 4);
  assert.equal(summary.battedBallMetrics.fairBattedBalls, 2);
  assert.equal(summary.battedBallMetrics.source.ev_la_smoothed.count, 1);
  assert.equal(summary.battedBallMetrics.source.ev_la_neighbor.count, 1);
  assert.equal(summary.battedBallMetrics.neighborModeOutcomes.local.double, 1);
  assert.equal(summary.battedBallMetrics.neighborModeOutcomes.distant.out, 1);
  assert.equal(summary.qoc.away.Solid.count, 1);
  assert.equal(summary.qoc.home.Topped.count, 1);
  assert.equal(summary.diagnostics.negativeLaHomeRunCount, 0);
});

test("failed games discard their partial batted-ball measurements", async () => {
  const teams = createMlbAverageValidationTeams();
  let attempt = 0;
  const summary = await runMeasurementBatches({
    awayTeam: teams.away,
    homeTeam: teams.home,
    gameCount: 2,
    seed: 1,
    batchSize: 1,
    runtime: {
      now: () => 0,
      yieldControl: async () => {},
      createGameState: () => ({}),
      simulateGame: (_state, options) => {
        attempt += 1;
        options.onBattedBallMeasurement(makeMeasurementEvent());
        if (attempt === 1) throw new Error("Injected failure");
        return makeCompletedGame(teams.away, teams.home);
      },
    },
  });

  assert.equal(summary.run.completedGames, 1);
  assert.equal(summary.run.failedGames, 1);
  assert.equal(summary.battedBallMetrics.fairBattedBalls, 1);
  assert.equal(summary.simulationErrors.length, 1);
});

test("invalid measurement events are diagnosed without entering aggregates", () => {
  const game = createGameMeasurementAccumulator();

  assert.equal(
    recordBattedBallMeasurement(
      game,
      makeMeasurementEvent({ side: "invalid", exitVelocity: Number.NaN })
    ),
    false
  );
  assert.equal(game.diagnostics.invalidMeasurementEventCount, 1);
  assert.equal(game.battedBallMetrics.fairBattedBalls, 0);
});

test("structural simulation errors stop immediately with a partial summary", async () => {
  const teams = createMlbAverageValidationTeams();
  let attempts = 0;

  await assert.rejects(
    runMeasurementBatches({
      awayTeam: teams.away,
      homeTeam: teams.home,
      gameCount: 100,
      seed: 3,
      runtime: {
        now: () => 0,
        yieldControl: async () => {},
        createGameState: () => ({}),
        simulateGame: () => {
          attempts += 1;
          const error = new Error("Lookup unavailable");
          error.code = "EV_LA_LOOKUP_NOT_READY";
          throw error;
        },
      },
    }),
    (error) => {
      assert.equal(error.code, "EV_LA_LOOKUP_NOT_READY");
      assert.equal(error.measurementSummary.status, "error");
      assert.equal(error.measurementSummary.run.failedGames, 1);
      return true;
    }
  );
  assert.equal(attempts, 1);
});

test("ten consecutive failures abort and retain at most ten errors", async () => {
  const teams = createMlbAverageValidationTeams();
  let attempts = 0;

  await assert.rejects(
    runMeasurementBatches({
      awayTeam: teams.away,
      homeTeam: teams.home,
      gameCount: 100,
      seed: 4,
      runtime: {
        now: () => 0,
        yieldControl: async () => {},
        createGameState: () => ({}),
        simulateGame: () => {
          attempts += 1;
          throw new Error(`Failure ${attempts}`);
        },
      },
    }),
    (error) => {
      assert.equal(error.code, "MEASUREMENT_CONSECUTIVE_FAILURES");
      assert.equal(error.measurementSummary.run.failedGames, 10);
      assert.equal(error.measurementSummary.simulationErrors.length, 10);
      return true;
    }
  );
  assert.equal(attempts, 10);
});

test("measurement cancellation returns only completed batches", async () => {
  const teams = createMlbAverageValidationTeams();
  let cancelled = false;
  const progress = [];
  const summary = await runMeasurementBatches({
    awayTeam: teams.away,
    homeTeam: teams.home,
    gameCount: 10,
    seed: 2,
    batchSize: 2,
    shouldCancel: () => cancelled,
    onProgress: (value) => progress.push(value),
    runtime: {
      now: () => 0,
      yieldControl: async () => {
        cancelled = true;
      },
      createGameState: () => ({}),
      simulateGame: () => makeCompletedGame(teams.away, teams.home),
    },
  });

  assert.equal(summary.status, "cancelled");
  assert.equal(summary.run.completedGames, 2);
  assert.equal(progress.length, 1);
});

test("same seed and teams produce identical real aggregate results", async () => {
  const teams = createMlbAverageValidationTeams();
  const run = (seed) =>
    runMeasurementBatches({
      awayTeam: teams.away,
      homeTeam: teams.home,
      gameCount: 4,
      seed,
      runtime: { now: () => 0, yieldControl: async () => {} },
    });
  const first = await run(2468);
  const second = await run(2468);
  const different = await run(8642);

  assert.deepEqual(first, second);
  assert.notDeepEqual(first.results, different.results);
  assert.equal(first.diagnostics.unexpectedSourceCount, 0);
  assert.equal(first.diagnostics.negativeLaHomeRunCount, 0);
});

class FakeWorker {
  constructor() {
    this.listeners = { message: [], error: [] };
    this.messages = [];
  }

  addEventListener(type, listener) {
    this.listeners[type].push(listener);
  }

  postMessage(message) {
    this.messages.push(message);
  }

  emit(type, data) {
    for (const listener of this.listeners[type]) listener({ data });
  }
}

test("measurement runner ignores stale runIds and supports cancel and rerun", () => {
  const worker = new FakeWorker();
  const progress = [];
  const completions = [];
  const runner = createMeasurementRunner({
    workerFactory: () => worker,
    runIdFactory: (sequence) => `run-${sequence}`,
  });

  const firstRunId = runner.start(
    { awayTeam: {}, homeTeam: {}, gameCount: 10, seed: 1 },
    {
      onProgress: (message) => progress.push(message),
      onComplete: (message) => completions.push(message),
    }
  );
  worker.emit("message", { type: "progress", runId: "stale", completedGames: 9 });
  worker.emit("message", { type: "progress", runId: firstRunId, completedGames: 2 });
  assert.equal(progress.length, 1);
  assert.equal(runner.cancel(), true);
  assert.deepEqual(worker.messages.at(-1), { type: "cancel", runId: firstRunId });
  worker.emit("message", { type: "complete", runId: firstRunId, summary: {} });
  assert.equal(completions.length, 1);
  assert.equal(runner.isRunning(), false);

  const secondRunId = runner.start(
    { awayTeam: {}, homeTeam: {}, gameCount: 1, seed: 2 },
    {}
  );
  assert.equal(secondRunId, "run-2");
});

test("report Markdown and JSON contain complete, finite, shareable data", () => {
  const teams = createMlbAverageValidationTeams();
  const total = createEmptyMeasurementAccumulator();
  const game = createGameMeasurementAccumulator();
  recordBattedBallMeasurement(game, makeMeasurementEvent());
  commitCompletedMeasurementGame(
    total,
    makeCompletedGame(teams.away, teams.home),
    game
  );
  const summary = finalizeMeasurementSummary(total, {
    status: "cancelled",
    seed: 123,
    requestedGames: 10,
    elapsedMs: 500,
  });
  const options = {
    summary,
    teams,
    generatedAt: "2026-07-17T00:00:00.000Z",
  };
  const markdown = buildMeasurementMarkdown(options);
  const json = buildMeasurementJson(options);
  const report = JSON.parse(json);

  for (const section of [
    "実行条件",
    "エンジン設定",
    "主要結果",
    "EV/LA",
    "Source",
    "Sample Quality",
    "Neighbor Mode",
    "Neighbor Mode別結果",
    "QoC",
    "異常診断",
    "AIへの確認依頼",
  ]) {
    assert.match(markdown, new RegExp(section));
  }
  assert.match(markdown, /部分結果/);
  assert.match(markdown, /seed: 123/);
  assert.equal(report.reportSchemaVersion, 7);
  assert.equal(report.partial, true);
  assert.equal(report.teams.away.lineup.length, 9);
  assert.equal(report.engineConfig.evBandwidth, 3);
  assert.equal(report.engineConfig.laBandwidth, 5);
  assert.equal(report.engineConfig.priorStrength, 100);
  assert.equal(json.includes("NaN"), false);
  assert.equal(json.includes("Infinity"), false);
  assert.equal(json.includes("undefined"), false);
});

test("report sanitizes non-finite values without mutating engine configuration", () => {
  const report = buildMeasurementReportObject({
    summary: {
      status: "completed",
      run: { seed: 1, requestedGames: 1, completedGames: 1, value: Number.NaN },
      results: { away: { OPS: Number.POSITIVE_INFINITY } },
    },
    teams: {},
    generatedAt: "fixed",
  });
  const engineConfig = getMeasurementEngineConfig();

  assert.equal(report.run.value, 0);
  assert.equal(report.results.away.OPS, 0);
  assert.equal(engineConfig.distantMaxNeighborCells, 50);
});

test("clipboard reports success and preserves manual fallback on failure", async () => {
  let copied = "";
  const success = await copyMeasurementText("report", {
    writeText: async (text) => {
      copied = text;
    },
  });
  const failure = await copyMeasurementText("report", {
    writeText: async () => {
      throw new Error("Denied");
    },
  });

  assert.equal(copied, "report");
  assert.equal(success.success, true);
  assert.equal(success.message, "コピーしました");
  assert.equal(failure.success, false);
  assert.match(failure.message, /下のテキスト欄/);
});

class FakeClassList {
  constructor() {
    this.values = new Set();
  }
  toggle(name, force) {
    if (force) this.values.add(name);
    else this.values.delete(name);
  }
  has(name) {
    return this.values.has(name);
  }
}

class FakeButton {
  constructor() {
    this.classList = new FakeClassList();
    this.listeners = {};
  }
  addEventListener(type, handler) {
    this.listeners[type] = handler;
  }
}

test("measurement route visibility and navigation are independent", () => {
  const routeDom = {
    gmPage: new FakeButton(),
    statsPage: new FakeButton(),
    tuningPage: new FakeButton(),
    measurementPage: new FakeButton(),
    showGMPageBtn: new FakeButton(),
    showStatsPageBtn: new FakeButton(),
    showTuningPageBtn: new FakeButton(),
    showMeasurementPageBtn: new FakeButton(),
    jumpToStatsBtn: new FakeButton(),
  };
  const calls = [];
  applyRouteVisibility(routeDom, "measurement");
  wireRouteEvents(routeDom, {
    onShowGM: () => calls.push("gm"),
    onShowStats: () => calls.push("stats"),
    onShowTuning: () => calls.push("tuning"),
    onShowMeasurement: () => calls.push("measurement"),
    onJumpToStats: () => calls.push("stats"),
  });

  assert.equal(routeDom.measurementPage.classList.has("active"), true);
  assert.equal(routeDom.tuningPage.classList.has("active"), false);
  routeDom.showMeasurementPageBtn.listeners.click();
  routeDom.showTuningPageBtn.listeners.click();
  routeDom.showGMPageBtn.listeners.click();
  assert.deepEqual(calls, ["measurement", "tuning", "gm"]);
});

test("root state normalization preserves measurement and old saves", () => {
  const factory = createRootStateFactory({
    createInitialAppState: () => ({
      statsIndex: { players: [] },
      appStateFactory: ({ gmState, tuningState }) => ({
        currentPage: "gm",
        gm: gmState,
        tuning: tuningState,
        tuningSeasonSummary: null,
      }),
    }),
    gmFactory: { createFreshGMDesk: () => ({ day: 1 }) },
    tuningBootstrap: {
      createDefaultRosterBundle: () => ({
        awayRoster: { lineup: [] },
        homeRoster: { lineup: [] },
      }),
      createFreshTuningGame: () => ({ inning: 1 }),
    },
  });
  const fresh = factory.createFreshRootState();
  const measurement = factory.normalizeRootState({
    ...fresh,
    appState: { ...fresh.appState, currentPage: "measurement" },
  });
  const oldSave = factory.normalizeRootState({ ...fresh });

  assert.equal(measurement.appState.currentPage, "measurement");
  assert.equal(oldSave.appState.currentPage, "gm");
});

test("measurement page is separate and cache-busted module entrypoints stay wired", async () => {
  const [
    indexSource,
    mainSource,
    bootstrapSource,
    routerSource,
    tuningSource,
    runnerSource,
    workerSource,
  ] = await Promise.all([
    readFile(new URL("../index.html", import.meta.url), "utf8"),
    readFile(new URL("../main.js", import.meta.url), "utf8"),
    readFile(new URL("../bootstrap/appBootstrap.js", import.meta.url), "utf8"),
    readFile(new URL("../bootstrap/router.js", import.meta.url), "utf8"),
    readFile(new URL("../pages/tuningPage.js", import.meta.url), "utf8"),
    readFile(
      new URL("../services/measurement/measurementRunner.js", import.meta.url),
      "utf8"
    ),
    readFile(
      new URL("../workers/tuningMeasurementWorker.js", import.meta.url),
      "utf8"
    ),
  ]);

  assert.match(indexSource, /id="measurementPage"/);
  assert.match(indexSource, /id="showMeasurementPageBtn"/);
  assert.match(indexSource, /no-cache, no-store, must-revalidate/);
  assert.match(indexSource, /main\.js\?v=codex12-4/);
  assert.match(mainSource, /appBootstrap\.js\?v=codex12-4/);
  assert.match(bootstrapSource, /appRouter\.js\?v=codex11-2/);
  assert.match(bootstrapSource, /router\.js\?v=codex11-2/);
  assert.match(bootstrapSource, /rootStateFactory\.js\?v=codex11-2/);
  assert.match(routerSource, /appRouter\.js\?v=codex11-2/);
  assert.doesNotMatch(tuningSource, /measurementProgress|tuningMeasurementWorker/);
  assert.match(runnerSource, /new URL\(/);
  assert.match(runnerSource, /tuningMeasurementWorker\.js\?v=codex11-2/);
  assert.match(runnerSource, /type:\s*["']module["']/);
  assert.match(workerSource, /loadEvLaLookup\(\)/);
  assert.match(EV_LA_LOOKUP_URL.pathname, /data\/ev_la_lookup\.json$/);
  assert.doesNotMatch(workerSource, /qoc_fallback|ev_la_emergency_fallback/);
});
