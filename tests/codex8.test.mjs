import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  SMOOTHING_CONFIG,
  getEvLaOutcomeProbabilities,
  validateEvLaLookup,
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
  assert.ok(values.every((value) => Number.isFinite(value) && value >= 0));
  assert.ok(Math.abs(values.reduce((sum, value) => sum + value, 0) - 1) < 1e-12);
}

function assertClose(actual, expected, tolerance = 1e-10) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `Expected ${actual} to be within ${tolerance} of ${expected}`
  );
}

const LOCAL_COORDINATES = [
  [94, 21],
  [96, 21],
  [95, 20],
  [95, 22],
  [94, 20],
];

function addCells(lookup, coordinates, rowFactory) {
  coordinates.forEach(([ev, la], index) => {
    lookup[`${ev}|${la}`] = rowFactory(index, ev, la);
  });
  return lookup;
}

function makeLocalLookup({ targetBattedBalls = 10, neighborBattedBalls = 100 } = {}) {
  const lookup = {
    "95|21": makeRow({
      battedBalls: targetBattedBalls,
      out: targetBattedBalls,
      sampleQuality: targetBattedBalls >= 100 ? "good" : "low_sample",
    }),
  };

  return addCells(lookup, LOCAL_COORDINATES, () =>
    makeRow({
      battedBalls: neighborBattedBalls,
      homeRun: neighborBattedBalls,
    })
  );
}

function getResult(lookup, exitVelocity = 95, launchAngle = 21, extra = {}) {
  return getEvLaOutcomeProbabilities({
    exitVelocity,
    launchAngle,
    lookup,
    ...extra,
  });
}

let realLookupPromise;
function loadRealLookup() {
  realLookupPromise ||= readFile(
    new URL("../data/ev_la_lookup.json", import.meta.url),
    "utf8"
  ).then(JSON.parse);
  return realLookupPromise;
}

test("probabilities are nonnegative and normalized", () => {
  const result = getResult(makeLocalLookup());

  assert.equal(result.source, "ev_la_smoothed");
  assert.equal(result.smoothing.neighborMode, "local");
  assertProbabilityVector(result.probabilities);
});

test("small cells defer more to neighbors and large cells retain target data", () => {
  const small = getResult(makeLocalLookup({ targetBattedBalls: 10 }));
  const large = getResult(makeLocalLookup({ targetBattedBalls: 1000 }));

  assert.ok(small.probabilities.homeRun > large.probabilities.homeRun);
  assert.ok(large.probabilities.out > small.probabilities.out);
  assert.ok(small.smoothing.targetWeight < large.smoothing.targetWeight);
  assertProbabilityVector(small.probabilities);
  assertProbabilityVector(large.probabilities);
});

test("targetWeight matches the actual target and effective-prior mixture", () => {
  const result = getResult(makeLocalLookup({ targetBattedBalls: 10 }));
  const expectedWeight =
    10 / (10 + result.smoothing.effectivePriorStrength);

  assertClose(result.smoothing.targetWeight, expectedWeight);
  assertClose(result.probabilities.out, expectedWeight);
  assertClose(
    result.smoothing.configuredReliability,
    10 / (10 + SMOOTHING_CONFIG.priorStrength)
  );
});

test("zero-sample targets use the neighbor distribution", () => {
  const lookup = makeLocalLookup({ targetBattedBalls: 0 });
  lookup["95|21"].sampleQuality = "none";
  const result = getResult(lookup);

  assert.equal(result.source, "ev_la_neighbor");
  assert.equal(result.sampleQuality, "none");
  assert.equal(result.smoothing.targetWeight, 0);
  assert.equal(result.probabilities.homeRun, 1);
  assertProbabilityVector(result.probabilities);
});

test("ESS follows the weighted-sample formula", () => {
  const lookup = makeLocalLookup({ neighborBattedBalls: 20 });
  const result = getResult(lookup);
  let weightedSamples = 0;
  let squaredWeightedSamples = 0;

  for (const [ev, la] of LOCAL_COORDINATES) {
    const distanceSquared =
      ((ev - 95) / SMOOTHING_CONFIG.evBandwidth) ** 2 +
      ((la - 21) / SMOOTHING_CONFIG.laBandwidth) ** 2;
    const weight = Math.exp(-0.5 * distanceSquared);
    weightedSamples += 20 * weight;
    squaredWeightedSamples += 20 * weight ** 2;
  }

  const expectedEss = weightedSamples ** 2 / squaredWeightedSamples;
  assertClose(result.smoothing.neighborEffectiveSampleSize, expectedEss);
});

test("insufficient local ESS advances to expanded search", () => {
  const lookup = makeLocalLookup({ neighborBattedBalls: 1 });
  addCells(
    lookup,
    [
      [99, 21],
      [91, 21],
      [95, 27],
      [95, 15],
      [99, 27],
    ],
    () => makeRow({ battedBalls: 100, single: 100 })
  );

  const result = getResult(lookup);
  assert.equal(result.smoothing.neighborMode, "expanded");
  assert.equal(result.smoothing.expansionLevel, 1);
  assert.ok(result.smoothing.neighborEffectiveSampleSize >= 100);
});

test("insufficient local cell count advances even when local ESS is high", () => {
  const lookup = {
    "95|21": makeRow({ battedBalls: 10, out: 10 }),
  };
  addCells(lookup, LOCAL_COORDINATES.slice(0, 4), () =>
    makeRow({ battedBalls: 100, single: 100 })
  );
  lookup["99|21"] = makeRow({ battedBalls: 100, single: 100 });

  const result = getResult(lookup);
  assert.equal(result.smoothing.neighborMode, "expanded");
  assert.equal(result.smoothing.expansionLevel, 1);
});

test("expanded aggregation does not duplicate cells from earlier stages", () => {
  const lookup = {
    "95|21": makeRow({ battedBalls: 10, out: 10 }),
  };
  addCells(lookup, LOCAL_COORDINATES.slice(0, 4), () =>
    makeRow({ battedBalls: 100, single: 100 })
  );
  lookup["99|21"] = makeRow({ battedBalls: 100, single: 100 });

  const result = getResult(lookup);
  assert.equal(result.smoothing.neighborCount, 5);
  assert.equal(result.smoothing.neighborBattedBalls, 500);
});

test("local conditions produce local neighbor mode", () => {
  const result = getResult(makeLocalLookup({ neighborBattedBalls: 20 }));

  assert.equal(result.smoothing.neighborMode, "local");
  assert.equal(result.smoothing.expansionLevel, 0);
  assert.deepEqual(result.smoothing.searchRange, {
    evRadius: 3,
    laRadius: 5,
  });
});

test("data outside normal ranges uses distant neighbors", () => {
  const lookup = {
    "95|21": makeRow({ battedBalls: 0, sampleQuality: "none" }),
  };
  addCells(
    lookup,
    [
      [55, 21],
      [54, 21],
      [53, 21],
      [52, 21],
      [51, 21],
    ],
    () => makeRow({ battedBalls: 100, double: 100 })
  );

  const result = getResult(lookup);
  assert.equal(result.source, "ev_la_neighbor");
  assert.equal(result.smoothing.neighborMode, "distant");
  assert.equal(result.probabilities.double, 1);
  assert.ok(result.smoothing.nearestEvDistance >= 40);
});

test("distant search consumes valid cells in distance order", () => {
  const lookup = {
    "95|21": makeRow({ battedBalls: 0, sampleQuality: "none" }),
  };
  for (let ev = 50; ev <= 55; ev += 1) {
    lookup[`${ev}|21`] = makeRow({
      battedBalls: 100,
      out: ev >= 51 ? 100 : 0,
      homeRun: ev === 50 ? 100 : 0,
    });
  }

  const result = getResult(lookup);
  assert.equal(result.smoothing.neighborMode, "distant");
  assert.equal(result.smoothing.neighborCount, 5);
  assert.equal(result.probabilities.out, 1);
});

test("distant search never exceeds the configured cell cap", () => {
  const lookup = {};
  for (let index = 0; index < 60; index += 1) {
    lookup[`${index}|-90`] = makeRow({ battedBalls: 1, out: 1 });
  }

  const result = getResult(lookup, 120, 90);
  assert.equal(result.smoothing.neighborMode, "distant");
  assert.equal(
    result.smoothing.neighborCount,
    SMOOTHING_CONFIG.distantMaxNeighborCells
  );
  assert.equal(result.probabilities.out, 1);
});

test("no fixed emergency fallback source remains", async () => {
  const source = await readFile(
    new URL("../services/evLaOutcomeService.js", import.meta.url),
    "utf8"
  );

  assert.doesNotMatch(source, /source:\s*["']ev_la_emergency_fallback["']/);
  assert.doesNotMatch(source, /EMERGENCY_PROBABILITIES/);
});

test("extreme real EV/LA cells no longer share a fixed distribution", async () => {
  const lookup = await loadRealLookup();
  const low = getResult(lookup, 52, -80);
  const high = getResult(lookup, 118, 85);

  assert.notDeepEqual(low.probabilities, high.probabilities);
  assert.equal(low.probabilities.homeRun, 0);
  assert.ok(["local", "expanded", "distant"].includes(low.smoothing.neighborMode));
  assert.ok(["local", "expanded", "distant"].includes(high.smoothing.neighborMode));
});

test("invalid lookups throw EV_LA_LOOKUP_INVALID", () => {
  const invalidLookups = [
    null,
    [],
    {},
    { invalid: makeRow({ battedBalls: 10, out: 10 }) },
    { "95|21": makeRow({ battedBalls: 0 }) },
    { "95|21": { battedBalls: 10 } },
  ];

  for (const lookup of invalidLookups) {
    assert.throws(
      () => getResult(lookup),
      (error) => error.code === "EV_LA_LOOKUP_INVALID"
    );
  }
});

test("negative launch angles remove direct home runs and renormalize", () => {
  for (const launchAngle of [-1, -80]) {
    const lookup = {
      [`95|${launchAngle}`]: makeRow({ battedBalls: 10, single: 5, homeRun: 5 }),
    };
    const result = getResult(lookup, 95, launchAngle);

    assert.equal(result.probabilities.homeRun, 0);
    assert.equal(result.probabilities.single, 1);
    assert.deepEqual(result.smoothing.physicalConstraints, [
      "negative_launch_angle_no_direct_home_run",
    ]);
    assertProbabilityVector(result.probabilities);
  }
});

test("negative launch angles with only home runs become certain outs", () => {
  const lookup = {
    "95|-1": makeRow({ battedBalls: 10, homeRun: 10 }),
  };
  const result = getResult(lookup, 95, -1);

  assert.deepEqual(result.probabilities, {
    out: 1,
    single: 0,
    double: 0,
    triple: 0,
    homeRun: 0,
  });
});

test("raw negative LA is constrained even when it rounds to the zero-degree key", () => {
  const lookup = {
    "95|0": makeRow({ battedBalls: 10, single: 5, homeRun: 5 }),
  };
  const negative = getResult(lookup, 95, -0.4);
  const positive = getResult(lookup, 95, 0.4);

  assert.equal(negative.key, positive.key);
  assert.equal(negative.probabilities.homeRun, 0);
  assert.equal(positive.probabilities.homeRun, 0.5);
});

test("non-finite LA does not poison the default-key result cache", () => {
  const lookup = {
    "85|12": makeRow({ battedBalls: 10, out: 5, homeRun: 5 }),
    "84|12": makeRow({ battedBalls: 100, out: 50, homeRun: 50 }),
    "86|12": makeRow({ battedBalls: 100, out: 50, homeRun: 50 }),
    "85|11": makeRow({ battedBalls: 100, out: 50, homeRun: 50 }),
    "85|13": makeRow({ battedBalls: 100, out: 50, homeRun: 50 }),
    "84|11": makeRow({ battedBalls: 100, out: 50, homeRun: 50 }),
  };

  const missingAngle = getEvLaOutcomeProbabilities({
    exitVelocity: 85,
    launchAngle: Number.NaN,
    lookup,
  });
  const validAngle = getEvLaOutcomeProbabilities({
    exitVelocity: 85,
    launchAngle: 12,
    lookup,
  });

  assert.ok(missingAngle.probabilities.homeRun > 0);
  assert.strictEqual(validAngle, missingAngle);
  assert.deepEqual(validAngle.smoothing.physicalConstraints, []);
});

test("QoC values do not affect the EV/LA probability result", () => {
  const lookup = makeLocalLookup();
  const weak = getResult(lookup, 95, 21, { qoc: "Weak" });
  const barrel = getResult(lookup, 95, 21, { qoc: "Barrel" });

  assert.strictEqual(weak, barrel);
  assert.deepEqual(weak.probabilities, barrel.probabilities);
});

test("contact result code has no QoC probability fallback dependency", async () => {
  const source = await readFile(
    new URL("../services/contactResolutionService.js", import.meta.url),
    "utf8"
  );

  assert.doesNotMatch(source, /getHitTypeProbabilities/);
  assert.doesNotMatch(source, /source:\s*["']qoc_fallback["']/);
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

test("result and valid-cell caches are reused without mutating lookup", () => {
  const sourceLookup = makeLocalLookup({ targetBattedBalls: 50 });
  const original = structuredClone(sourceLookup);
  let ownKeysCount = 0;
  const lookup = new Proxy(sourceLookup, {
    ownKeys(target) {
      ownKeysCount += 1;
      return Reflect.ownKeys(target);
    },
  });

  const first = getResult(lookup, 95.2, 20.8);
  const second = getResult(lookup, 95.4, 21.2);
  getResult(lookup, 110, 70);

  assert.strictEqual(second, first);
  assert.equal(ownKeysCount, 1);
  assert.deepEqual(sourceLookup, original);
});

test("lookup validation reports parseable and valid cell counts", () => {
  const lookup = makeLocalLookup();
  lookup.invalid = {};
  const result = validateEvLaLookup(lookup);

  assert.equal(result.parseableCellCount, 6);
  assert.equal(result.validCellCount, 6);
});

test("lookup loader shares one request and validates before ready", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCount = 0;
  let finishFetch;
  const validLookup = { "95|21": makeRow({ battedBalls: 10, out: 10 }) };

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
    finishFetch({ ok: true, json: async () => validLookup });

    const [firstLookup, secondLookup] = await Promise.all([first, second]);
    assert.strictEqual(firstLookup, secondLookup);
    assert.equal(fetchCount, 1);
    assert.equal(store.getEvLaLookupLoadState().status, "ready");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("lookup loader exposes invalid state and can retry", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCount = 0;
  const validLookup = { "95|21": makeRow({ battedBalls: 10, out: 10 }) };

  globalThis.fetch = async () => {
    fetchCount += 1;
    return {
      ok: true,
      json: async () => (fetchCount === 1 ? {} : validLookup),
    };
  };

  try {
    const store = await import(
      `../services/evLaLookupStore.js?retry=${Date.now()}`
    );

    await assert.rejects(
      store.loadEvLaLookup(),
      (error) => error.code === "EV_LA_LOOKUP_INVALID"
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

test("season simulation isolates one failed game and uses completed games", () => {
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
