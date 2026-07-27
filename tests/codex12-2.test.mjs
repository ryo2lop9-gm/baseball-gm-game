import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { PITCH_LOCATION_CONFIG } from "../config/pitchLocationConfig.js";
import {
  createFastSimulationOptions,
  simulateGameMutable,
  stepPitchMutable,
} from "../engine/core/engineCore.js";
import { createPresentationCallbacks } from "../engine/core/presentationEngine.js";
import { createMlbAverageValidationTeams } from "../models/teamModels.js";
import {
  buildPitchExecutionContext,
} from "../services/pitchExecutionService.js";
import {
  classifyPitchLocation,
  createLegacyCompatibleActualPoint,
} from "../services/pitchLocationService.js";
import { loadEvLaLookup } from "../services/evLaLookupStore.js";
import { createSeededRandom } from "../services/seededRandomService.js";
import {
  createInitialGameState,
  createInitialSimState,
} from "../state/gameState.js";

const lookup = JSON.parse(
  await readFile(new URL("../data/ev_la_lookup.json", import.meta.url), "utf8")
);
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => ({ ok: true, json: async () => lookup });
await loadEvLaLookup();
globalThis.fetch = originalFetch;

const LOCATION_FIELDS = Object.freeze([
  "actualPoint",
  "normalizedX",
  "normalizedZ",
  "normalizedRadius",
  "normalizedZoneEdgeDistance",
  "actualIsZone",
  "attackRegion",
  "attackRegionDetail",
  "shadowSide",
  "isMeatball",
  "zoneRow",
  "zoneCol",
  "locationCourse",
  "locationModel",
]);

const CONTROLLED_PITCHER = Object.freeze({
  name: "Compatibility Pitcher",
  ratings: { control: 100, stuff: 50 },
  pitchMix: {
    fourSeam: { usage: 1, velocity: 95 },
    slider: { usage: 0, velocity: 85 },
    curve: { usage: 0, velocity: 79 },
    fork: { usage: 0, velocity: 86 },
  },
});

const CONTROLLED_BATTER = Object.freeze({
  name: "Compatibility Batter",
  ratings: { contact: 50, power: 50, eye: 50 },
});

const BASELINE_RESULTS = Object.freeze([
  {
    seed: 13579,
    randomCalls: 2861,
    battedBallCount: 65,
    stateDigest:
      "21e19bbbe2487b1beae78c9bf1f82e0aca800a61df807ffc144ffa99409e093c",
    battedBallDigest:
      "1dc54d497337e81ff19dfdf305c1c34367210cd3d38e461cbe9a5844d55346c3",
    digest:
      "9f511e0d9d8f20354bbf55608fa7f34074e449c73eb07facb7ec2f26f411a629",
  },
  {
    seed: 246813579,
    randomCalls: 2512,
    battedBallCount: 65,
    stateDigest:
      "e20eff96702f855ffd6b3954943433bfbb488ff1025fbca44fe12e81fceb7e55",
    battedBallDigest:
      "836113c3d763592d731ae13b61e56debc77d10d0d982636d3a6afc93b9817bd2",
    digest:
      "da18d2bbc2763d9051785bae76a8acea5be05b287e7319fc37c9750413e2cec5",
  },
  {
    seed: 987654321,
    randomCalls: 2902,
    battedBallCount: 65,
    stateDigest:
      "e29993db275d181869db443d380fbbd282ee6777b6d7edf18fea0052509bded0",
    battedBallDigest:
      "51d781b2b8afa5732509753cfd470db3df0750a57b2be77639ccb7b49aedcf67",
    digest:
      "a14e4f872c36365e6ced64f3fa20c2dffb4a0184c0ae92147661ff7d7053c174",
  },
]);

function assertClose(actual, expected) {
  assert.ok(
    Math.abs(actual - expected) < 1e-12,
    `expected ${actual} to be close to ${expected}`
  );
}

function assertLocationPayload(payload) {
  for (const field of LOCATION_FIELDS) {
    assert.equal(
      Object.hasOwn(payload, field),
      true,
      `missing location field: ${field}`
    );
  }

  assert.ok(Number.isFinite(payload.actualPoint.x));
  assert.ok(Number.isFinite(payload.actualPoint.z));
  assert.ok(Number.isFinite(payload.normalizedX));
  assert.ok(Number.isFinite(payload.normalizedZ));
  assert.ok(Number.isFinite(payload.normalizedRadius));
  assert.ok(Number.isFinite(payload.normalizedZoneEdgeDistance));
  assert.equal(typeof payload.actualIsZone, "boolean");
  assert.equal(typeof payload.isMeatball, "boolean");
  assert.ok(Number.isInteger(payload.zoneRow));
  assert.ok(Number.isInteger(payload.zoneCol));
  assert.equal(
    payload.locationModel,
    PITCH_LOCATION_CONFIG.legacyGridCompatibility.locationModel
  );
}

function buildControlledPitch({
  strikeRate = 1,
  cell = [2, 2],
  course = "A",
  random = () => 0.5,
  chooseZoneSpot = () => cell,
  chooseCourse = () => course,
} = {}) {
  return buildPitchExecutionContext({
    batter: CONTROLLED_BATTER,
    pitcher: CONTROLLED_PITCHER,
    balls: 0,
    strikes: 0,
    random,
    chooseCourse,
    calcPitchOutcomeProbabilities: () => ({
      strikeRate,
      zSwingRate: 0.5,
      oSwingRate: 0.5,
      zContactRate: 0.8,
      oContactRate: 0.6,
      foulRate: 0.2,
    }),
    chooseZoneSpot,
  });
}

function createCompatibilitySnapshot(state, battedBalls) {
  return {
    result: {
      inning: state.inning,
      half: state.half,
      finalInning: state.finalInning,
      finalHalf: state.finalHalf,
      score: state.score,
      box: state.box,
      battingIndex: state.battingIndex,
      pitcherUsage: state.pitcherUsage,
      awayLineup: state.awayTeam.lineup.map((player) => ({
        name: player.name,
        gameStats: player.gameStats,
      })),
      homeLineup: state.homeTeam.lineup.map((player) => ({
        name: player.name,
        gameStats: player.gameStats,
      })),
    },
    battedBalls: battedBalls.map((event) => ({
      side: event.side,
      course: event.course,
      isStrike: event.isStrike,
      exitVelocity: event.exitVelocity,
      launchAngle: event.launchAngle,
      qoc: event.qoc,
      evLaKey: event.evLaKey,
      source: event.source,
      outcome: event.outcome,
      runsScored: event.runsScored,
    })),
  };
}

function digest(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function runCompatibilityGame(seed, { measurePitches = false } = {}) {
  const teams = createMlbAverageValidationTeams();
  const state = createInitialSimState(
    structuredClone(teams.away),
    structuredClone(teams.home)
  );
  const seeded = createSeededRandom(seed);
  const battedBalls = [];
  const pitches = [];
  let randomCalls = 0;
  const random = () => {
    randomCalls += 1;
    return seeded();
  };
  const runtime = {
    random,
    onBattedBallMeasurement: (event) => battedBalls.push(event),
  };
  if (measurePitches) {
    runtime.onPitchMeasurement = (event) => pitches.push(event);
  }

  simulateGameMutable(state, createFastSimulationOptions(runtime));
  const snapshot = createCompatibilitySnapshot(state, battedBalls);

  return {
    seed,
    randomCalls,
    battedBallCount: battedBalls.length,
    pitchCount: pitches.length,
    stateDigest: digest(snapshot.result),
    battedBallDigest: digest(snapshot.battedBalls),
    digest: digest(snapshot),
  };
}

test("all 25 legacy cells round-trip without producing Chase", () => {
  for (let zoneRow = 0; zoneRow <= 4; zoneRow += 1) {
    for (let zoneCol = 0; zoneCol <= 4; zoneCol += 1) {
      const actualPoint = createLegacyCompatibleActualPoint(zoneRow, zoneCol);
      const location = classifyPitchLocation(actualPoint);

      assert.deepEqual(
        [location.zoneRow, location.zoneCol],
        [zoneRow, zoneCol]
      );
      assert.notEqual(location.attackRegion, "CHASE");
    }
  }
});

test("center legacy cell is Heart, Meatball, and location course C", () => {
  const actualPoint = createLegacyCompatibleActualPoint(2, 2);
  const location = classifyPitchLocation(actualPoint);

  assert.equal(location.attackRegion, "HEART");
  assert.equal(location.attackRegionDetail, "HEART");
  assert.equal(location.isMeatball, true);
  assert.equal(location.actualIsZone, true);
  assert.equal(location.locationCourse, "C");
});

test("all non-center in-zone legacy cells are Shadow-In", () => {
  for (let zoneRow = 1; zoneRow <= 3; zoneRow += 1) {
    for (let zoneCol = 1; zoneCol <= 3; zoneCol += 1) {
      if (zoneRow === 2 && zoneCol === 2) continue;
      const location = classifyPitchLocation(
        createLegacyCompatibleActualPoint(zoneRow, zoneCol)
      );

      assert.equal(location.attackRegion, "SHADOW");
      assert.equal(location.attackRegionDetail, "SHADOW_IN");
      assert.equal(location.shadowSide, "IN");
      assert.equal(location.actualIsZone, true);
    }
  }
});

test("all legacy outer-edge cells are Shadow-Out", () => {
  const cells = [];
  for (const innerCell of [1, 2, 3]) {
    cells.push(
      [0, innerCell],
      [4, innerCell],
      [innerCell, 0],
      [innerCell, 4]
    );
  }

  for (const [zoneRow, zoneCol] of cells) {
    const location = classifyPitchLocation(
      createLegacyCompatibleActualPoint(zoneRow, zoneCol)
    );
    assert.equal(location.attackRegion, "SHADOW");
    assert.equal(location.attackRegionDetail, "SHADOW_OUT");
    assert.equal(location.shadowSide, "OUT");
    assert.equal(location.actualIsZone, false);
  }
});

test("all four legacy outer corners are Waste", () => {
  for (const zoneRow of [0, 4]) {
    for (const zoneCol of [0, 4]) {
      const location = classifyPitchLocation(
        createLegacyCompatibleActualPoint(zoneRow, zoneCol)
      );
      assert.equal(location.attackRegion, "WASTE");
      assert.equal(location.attackRegionDetail, "WASTE");
      assert.equal(location.actualIsZone, false);
    }
  }
});

test("custom zone bounds preserve compatibility anchor normalization", () => {
  const customZone = { xMin: 10, xMax: 14, zMin: 20, zMax: 28 };
  const inZone = classifyPitchLocation(
    createLegacyCompatibleActualPoint(1, 3, customZone),
    customZone
  );
  const edge = classifyPitchLocation(
    createLegacyCompatibleActualPoint(0, 2, customZone),
    customZone
  );
  const corner = classifyPitchLocation(
    createLegacyCompatibleActualPoint(4, 0, customZone),
    customZone
  );

  assertClose(inZone.normalizedX, 5 / 6);
  assertClose(inZone.normalizedZ, 5 / 6);
  assertClose(edge.normalizedZ, 7 / 6);
  assertClose(corner.normalizedX, -13 / 6);
  assertClose(corner.normalizedZ, -13 / 6);
});

test("invalid legacy cells and zone bounds are rejected without coercion", () => {
  for (const invalid of [Number.NaN, Number.POSITIVE_INFINITY, 1.5, -1, 5]) {
    assert.throws(() => createLegacyCompatibleActualPoint(invalid, 2));
    assert.throws(() => createLegacyCompatibleActualPoint(2, invalid));
  }

  assert.throws(
    () => createLegacyCompatibleActualPoint(2, 2, {
      xMin: 1,
      xMax: 1,
      zMin: 1,
      zMax: 4,
    }),
    /xMin must be less than/
  );
  assert.throws(
    () => createLegacyCompatibleActualPoint(2, 2, {
      xMin: -1,
      xMax: 1,
      zMin: Number.NEGATIVE_INFINITY,
      zMax: 4,
    }),
    /zMin must be a finite number/
  );
});

test("production context derives isStrike and cells from actualPoint", () => {
  for (const scenario of [
    { strikeRate: 1, cell: [1, 3] },
    { strikeRate: 0, cell: [0, 2] },
  ]) {
    const context = buildControlledPitch(scenario);
    const location = classifyPitchLocation(context.actualPoint);

    assert.equal(context.isStrike, context.actualIsZone);
    assert.equal(context.isStrike, location.actualIsZone);
    assert.deepEqual(
      [context.zoneRow, context.zoneCol],
      [location.zoneRow, location.zoneCol]
    );
    assert.deepEqual(
      [context.zoneRow, context.zoneCol],
      scenario.cell
    );
  }
});

test("compatibility invariant mismatch throws an identifiable structural error", () => {
  assert.throws(
    () => buildControlledPitch({ strikeRate: 1, cell: [0, 2] }),
    (error) => {
      assert.equal(
        error.code,
        PITCH_LOCATION_CONFIG.legacyGridCompatibility.invariantErrorCode
      );
      assert.equal(error.name, "PitchLocationCompatibilityError");
      assert.equal(error.context.provisionalIsStrike, true);
      assert.equal(error.context.actualIsZone, false);
      return true;
    }
  );
});

test("resolved course is retained when locationCourse differs", () => {
  const context = buildControlledPitch({
    strikeRate: 1,
    cell: [2, 2],
    course: "A",
  });

  assert.equal(context.course, "A");
  assert.equal(context.locationCourse, "C");
  assert.notEqual(context.course, context.locationCourse);
  assertLocationPayload(context);
});

test("compatibility bridge adds no random draws and calls chooseZoneSpot once", () => {
  let randomCalls = 0;
  let chooseZoneSpotCalls = 0;
  const random = () => {
    randomCalls += 1;
    return 0.5;
  };
  const context = buildControlledPitch({
    random,
    chooseCourse: (_pitcher, runtimeRandom) => {
      runtimeRandom();
      return "A";
    },
    chooseZoneSpot: (_course, _isStrike, runtimeRandom) => {
      chooseZoneSpotCalls += 1;
      runtimeRandom();
      return [2, 2];
    },
  });

  assert.equal(randomCalls, 7);
  assert.equal(chooseZoneSpotCalls, 1);
  assert.equal(context.locationModel, "legacy_grid_compat");
});

test("pitch measurement events contain the complete location payload", () => {
  const teams = createMlbAverageValidationTeams();
  const state = createInitialSimState(
    structuredClone(teams.away),
    structuredClone(teams.home)
  );
  const events = [];

  stepPitchMutable(state, {
    random: createSeededRandom(112233),
    onPitchMeasurement: (event) => events.push(event),
  });

  assert.equal(events.length, 1);
  assertLocationPayload(events[0]);
  assert.equal(events[0].isStrike, events[0].actualIsZone);
  const location = classifyPitchLocation(events[0].actualPoint);
  assert.deepEqual(
    [events[0].zoneRow, events[0].zoneCol],
    [location.zoneRow, location.zoneCol]
  );
});

test("normal-game lastPitch has safe defaults and the complete location payload", () => {
  const teams = createMlbAverageValidationTeams();
  const state = createInitialGameState(
    structuredClone(teams.away),
    structuredClone(teams.home)
  );

  assert.equal(state.presentation.lastPitch.actualPoint, null);
  assert.equal(state.presentation.lastPitch.actualIsZone, null);
  assert.equal(state.presentation.lastPitch.locationModel, "");

  stepPitchMutable(state, {
    ...createPresentationCallbacks(state),
    random: createSeededRandom(445566),
  });

  const lastPitch = state.presentation.lastPitch;
  assertLocationPayload(lastPitch);
  assert.equal(lastPitch.isStrike, lastPitch.actualIsZone);
  const location = classifyPitchLocation(lastPitch.actualPoint);
  assert.deepEqual(
    [lastPitch.zoneRow, lastPitch.zoneCol],
    [location.zoneRow, location.zoneCol]
  );
});

test("three pre-edit seeds retain results, batted balls, and random counts", () => {
  for (const expected of BASELINE_RESULTS) {
    const withoutPitchMeasurement = runCompatibilityGame(expected.seed);
    const withPitchMeasurement = runCompatibilityGame(expected.seed, {
      measurePitches: true,
    });

    assert.deepEqual(withoutPitchMeasurement, {
      ...expected,
      pitchCount: 0,
    });
    assert.equal(
      withPitchMeasurement.randomCalls,
      withoutPitchMeasurement.randomCalls
    );
    assert.equal(
      withPitchMeasurement.battedBallCount,
      withoutPitchMeasurement.battedBallCount
    );
    assert.equal(
      withPitchMeasurement.stateDigest,
      withoutPitchMeasurement.stateDigest
    );
    assert.equal(
      withPitchMeasurement.battedBallDigest,
      withoutPitchMeasurement.battedBallDigest
    );
    assert.equal(withPitchMeasurement.digest, withoutPitchMeasurement.digest);
    assert.ok(withPitchMeasurement.pitchCount > 0);
  }
});
