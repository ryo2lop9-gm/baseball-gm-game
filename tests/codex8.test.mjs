import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  SMOOTHING_CONFIG,
  getEvLaOutcomeProbabilities,
} from "../services/evLaOutcomeService.js";
import { resolveContactResult } from "../services/contactResolutionService.js";
import { simulateSeason } from "../engine/game/seasonEngine.js";

function makeRow({
  battedBalls,
  out = 0,
  single = 0,
  double = 0,
  triple = 0,
  homeRun = 0,
  sampleQuality = "good",
}) {
  const denominator = battedBalls || 1;

  return {
    battedBalls,
    outs: out,
    singles: single,
    doubles: double,
    triples: triple,
    hrs: homeRun,
    outRate: out / denominator,
    singleRate: single / denominator,
    doubleRate: double / denominator,
    tripleRate: triple / denominator,
    hrRate: homeRun / denominator,
    sampleQuality,
  };
}

function assertProbabilityVector(probabilities) {
  const values = Object.values(probabilities);
  assert.equal(values.length, 5);
  assert.ok(values.every((value) => value >= 0));
  assert.ok(Math.abs(values.reduce((sum, value) => sum + value, 0) - 1) < 1e-12);
}

function makeTargetAndNeighborLookup(targetBattedBalls) {
  return {
    "95|21": makeRow({
      battedBalls: targetBattedBalls,
      out: targetBattedBalls,
      sampleQuality: targetBattedBalls >= 100 ? "good" : "low_sample",
    }),
    "94|21": makeRow({ battedBalls: 500, homeRun: 500 }),
    "96|21": makeRow({ battedBalls: 500, homeRun: 500 }),
  };
}

test("smoothing produces a normalized five-outcome distribution", () => {
  const result = getEvLaOutcomeProbabilities({
    exitVelocity: 95,
    launchAngle: 21,
    lookup: makeTargetAndNeighborLookup(10),
  });

  assert.equal(result.source, "ev_la_smoothed");
  assert.equal(result.smoothing.applied, true);
  assert.equal(result.smoothing.effectivePriorStrength, 100);
  assert.equal(
    result.smoothing.reliability,
    10 / (10 + SMOOTHING_CONFIG.priorStrength)
  );
  assertProbabilityVector(result.probabilities);
});

test("small target cells defer more strongly to neighbors than large cells", () => {
  const small = getEvLaOutcomeProbabilities({
    exitVelocity: 95,
    launchAngle: 21,
    lookup: makeTargetAndNeighborLookup(10),
  });
  const large = getEvLaOutcomeProbabilities({
    exitVelocity: 95,
    launchAngle: 21,
    lookup: makeTargetAndNeighborLookup(1000),
  });

  assert.ok(small.probabilities.homeRun > 0.85);
  assert.ok(large.probabilities.out > 0.85);
  assert.ok(small.probabilities.homeRun > large.probabilities.homeRun);
  assert.ok(large.smoothing.reliability > small.smoothing.reliability);
});

test("zero-sample cells use neighbors only", () => {
  const lookup = makeTargetAndNeighborLookup(0);
  lookup["95|21"].sampleQuality = "none";

  const result = getEvLaOutcomeProbabilities({
    exitVelocity: 95,
    launchAngle: 21,
    lookup,
  });

  assert.equal(result.source, "ev_la_neighbor");
  assert.equal(result.sampleQuality, "none");
  assert.equal(result.smoothing.targetBattedBalls, 0);
  assert.equal(result.probabilities.homeRun, 1);
  assertProbabilityVector(result.probabilities);
});

test("neighbor search expands to the configured third range", () => {
  const lookup = {
    "95|21": makeRow({ battedBalls: 0, sampleQuality: "none" }),
    "103|36": makeRow({ battedBalls: 50, out: 50 }),
  };
  const result = getEvLaOutcomeProbabilities({
    exitVelocity: 95,
    launchAngle: 21,
    lookup,
  });

  assert.equal(result.source, "ev_la_neighbor");
  assert.equal(result.smoothing.neighborCount, 1);
  assert.deepEqual(result.smoothing.searchRange, {
    evRadius: 10,
    laRadius: 20,
  });
});

test("emergency fallback is used only without target or neighbor samples", () => {
  const originalWarn = console.warn;
  let warnings = 0;
  console.warn = () => {
    warnings += 1;
  };

  try {
    const lookup = {};
    const first = getEvLaOutcomeProbabilities({
      exitVelocity: 95,
      launchAngle: 21,
      lookup,
    });
    const second = getEvLaOutcomeProbabilities({
      exitVelocity: 95,
      launchAngle: 21,
      lookup,
    });

    assert.equal(first.source, "ev_la_emergency_fallback");
    assert.strictEqual(second, first);
    assert.equal(warnings, 1);
    assertProbabilityVector(first.probabilities);
  } finally {
    console.warn = originalWarn;
  }
});

test("cache reuses results without mutating lookup data", () => {
  const lookup = makeTargetAndNeighborLookup(50);
  const original = structuredClone(lookup);
  const first = getEvLaOutcomeProbabilities({
    exitVelocity: 95.2,
    launchAngle: 20.8,
    lookup,
  });
  const second = getEvLaOutcomeProbabilities({
    exitVelocity: 95.4,
    launchAngle: 21.2,
    lookup,
  });

  assert.strictEqual(second, first);
  assert.deepEqual(lookup, original);
});

test("current Statcast lookup uses the smoothed source", async () => {
  const lookup = JSON.parse(
    await readFile(new URL("../data/ev_la_lookup.json", import.meta.url), "utf8")
  );
  const result = getEvLaOutcomeProbabilities({
    exitVelocity: 95,
    launchAngle: 21,
    lookup,
  });

  assert.equal(result.source, "ev_la_smoothed");
  assert.equal(result.sampleQuality, "good");
  assert.ok(result.smoothing.neighborCount > 0);
  assertProbabilityVector(result.probabilities);
});

test("contact resolution reports missing batted-ball and lookup states", () => {
  const base = {
    state: { inning: 3, half: "top", balls: 1, strikes: 2 },
    batter: { name: "Test Batter" },
    pitchType: "fourSeam",
    course: "middle",
    qoc: "Weak",
  };

  assert.throws(
    () => resolveContactResult({ ...base, battedBall: null }),
    (error) =>
      error.code === "BATTED_BALL_MISSING" &&
      error.context?.batter === "Test Batter"
  );
  assert.throws(
    () =>
      resolveContactResult({
        ...base,
        battedBall: { exitVelocity: 95, launchAngle: 21, qoc: "Barrel" },
      }),
    (error) => error.code === "EV_LA_LOOKUP_NOT_READY"
  );
});

test("contact result code has no QoC probability fallback dependency", async () => {
  const source = await readFile(
    new URL("../services/contactResolutionService.js", import.meta.url),
    "utf8"
  );

  assert.doesNotMatch(source, /getHitTypeProbabilities/);
  assert.doesNotMatch(source, /qoc_fallback/);
});

test("lookup loader shares an in-flight request and reaches ready state", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCount = 0;
  let finishFetch;

  globalThis.fetch = () => {
    fetchCount += 1;
    return new Promise((resolve) => {
      finishFetch = resolve;
    });
  };

  try {
    const store = await import(
      `../services/evLaLookupStore.js?shared=${Date.now()}`
    );
    const first = store.loadEvLaLookup();
    const second = store.loadEvLaLookup();

    assert.strictEqual(second, first);
    assert.equal(store.getEvLaLookupLoadState().status, "loading");
    finishFetch({ ok: true, json: async () => ({ "95|21": {} }) });

    const [firstLookup, secondLookup] = await Promise.all([first, second]);
    assert.strictEqual(firstLookup, secondLookup);
    assert.equal(fetchCount, 1);
    assert.equal(store.getEvLaLookupLoadState().status, "ready");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("lookup loader exposes an error state and can retry", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCount = 0;

  globalThis.fetch = async () => {
    fetchCount += 1;
    if (fetchCount === 1) return { ok: false, status: 503 };
    return { ok: true, json: async () => ({ "95|21": {} }) };
  };

  try {
    const store = await import(
      `../services/evLaLookupStore.js?retry=${Date.now()}`
    );

    await assert.rejects(
      store.loadEvLaLookup(),
      (error) => error.code === "EV_LA_LOOKUP_LOAD_FAILED"
    );
    assert.equal(store.getEvLaLookupLoadState().status, "error");

    await store.loadEvLaLookup();
    assert.equal(fetchCount, 2);
    assert.equal(store.getEvLaLookupLoadState().status, "ready");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

function makeTeam(name) {
  return {
    name,
    lineup: [{ name: `${name} Batter`, ratings: {} }],
    startingPitcher: null,
    bullpen: [],
  };
}

function makeCompletedGame(awayTeam, homeTeam) {
  const emptyBox = {
    runs: 0,
    hits: 0,
    doubles: 0,
    triples: 0,
    hr: 0,
    walks: 0,
    strikeouts: 0,
    outsInPlay: 0,
    qoc: {},
  };
  const player = (source) => ({
    ...source,
    gameStats: {
      PA: 0,
      AB: 0,
      H: 0,
      doubles: 0,
      triples: 0,
      HR: 0,
      BB: 0,
      K: 0,
      RBI: 0,
      R: 0,
    },
  });

  return {
    box: {
      away: { ...emptyBox, runs: 1 },
      home: { ...emptyBox },
    },
    score: { away: 1, home: 0 },
    awayTeam: { ...awayTeam, lineup: awayTeam.lineup.map(player) },
    homeTeam: { ...homeTeam, lineup: homeTeam.lineup.map(player) },
  };
}

test("season simulation isolates one failed game and uses completed games for rates", () => {
  const away = makeTeam("Away");
  const home = makeTeam("Home");
  let attempts = 0;

  const season = simulateSeason(away, home, 3, {
    createGameState: () => ({}),
    simulateGame: () => {
      attempts += 1;
      if (attempts === 1) {
        const error = new Error("Injected failure");
        error.code = "INJECTED";
        throw error;
      }
      return makeCompletedGame(away, home);
    },
  });

  assert.equal(season.requestedGames, 3);
  assert.equal(season.completedGames, 2);
  assert.equal(season.failedGames, 1);
  assert.equal(season.awayRPG, "1.00");
  assert.equal(season.aborted, false);
  assert.deepEqual(season.simulationErrors[0], {
    gameIndex: 1,
    code: "INJECTED",
    message: "Injected failure",
  });
});

test("season simulation aborts after ten consecutive failures", () => {
  const away = makeTeam("Away");
  const home = makeTeam("Home");
  const season = simulateSeason(away, home, 25, {
    createGameState: () => ({}),
    simulateGame: () => {
      throw new Error("Always fails");
    },
  });

  assert.equal(season.completedGames, 0);
  assert.equal(season.failedGames, 10);
  assert.equal(season.simulationErrors.length, 10);
  assert.equal(season.aborted, true);
  assert.match(season.abortReason, /10試合連続/);
});
