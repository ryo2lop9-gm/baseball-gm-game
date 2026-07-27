import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  createFastSimulationOptions,
  simulateGameMutable,
} from "../engine/core/engineCore.js";
import { createMlbAverageValidationTeams } from "../models/teamModels.js";
import {
  MEASUREMENT_REPORT_SCHEMA_VERSION,
  buildMeasurementJson,
  buildMeasurementReportObject,
} from "../services/measurement/measurementReportService.js";
import {
  MEASUREMENT_ATTACK_REGIONS,
  MEASUREMENT_ATTACK_REGION_DETAILS,
  MEASUREMENT_LOCATION_COURSES,
  MEASUREMENT_LOCATION_GRID_KEYS,
  MEASUREMENT_MEATBALL_KEYS,
} from "../services/measurement/measurementAdvancedService.js";
import {
  MEASUREMENT_SUMMARY_SCHEMA_VERSION,
  createEmptyMeasurementAccumulator,
  finalizeMeasurementSummary,
  recordPitchMeasurementEvent,
  runMeasurementBatches,
} from "../services/measurement/measurementService.js";
import {
  classifyPitchLocation,
  createLegacyCompatibleActualPoint,
} from "../services/pitchLocationService.js";
import { loadEvLaLookup } from "../services/evLaLookupStore.js";
import { createSeededRandom } from "../services/seededRandomService.js";
import { createInitialSimState } from "../state/gameState.js";

const lookup = JSON.parse(
  await readFile(new URL("../data/ev_la_lookup.json", import.meta.url), "utf8")
);
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => ({ ok: true, json: async () => lookup });
await loadEvLaLookup();
globalThis.fetch = originalFetch;

const LEGACY_LOCATION_MODEL = "legacy_grid_compat";
const COMPATIBILITY_TEAMS = createMlbAverageValidationTeams();
const POSITION_BREAKDOWN_GROUPS = Object.freeze([
  "attackRegion",
  "attackRegionDetail",
  "meatball",
  "locationCourse",
  "locationGrid",
  "locationModel",
]);

function eventFromPoint(actualPoint, overrides = {}) {
  const location = classifyPitchLocation(actualPoint);
  const isStrike = location.actualIsZone;
  return {
    battingSide: "away",
    defenseSide: "home",
    batterKey: "away:batter:1",
    batterName: "Location Batter",
    batterRatings: { contact: 50, power: 50, eye: 50 },
    lineupIndex: 0,
    pitcherKey: "home:pitcher:1",
    pitcherName: "Location Pitcher",
    pitcherRole: "starter",
    pitcherRatings: { control: 50, stuff: 50 },
    pitchMix: {},
    ballsBefore: 0,
    strikesBefore: 0,
    pitchType: "fourSeam",
    pitchVelocity: 95,
    course: "A",
    isStrike,
    swung: false,
    madeContact: false,
    pitchResult: isStrike ? "called_strike" : "called_ball",
    paResult: null,
    strikeoutType: null,
    runsScored: 0,
    strikeType: isStrike ? "looking" : null,
    ballType: isStrike ? null : "edge_side",
    obviousBall: false,
    edgeBall: !isStrike,
    chaseableBall: false,
    isMistake: false,
    drift: 0,
    ...location,
    locationModel: LEGACY_LOCATION_MODEL,
    ...overrides,
  };
}

function eventAtRadius(normalizedRadius, overrides = {}) {
  return eventFromPoint(
    { x: (10 / 12) * normalizedRadius, z: 2.5 },
    overrides
  );
}

function eventForCell(zoneRow, zoneCol, overrides = {}) {
  return eventFromPoint(
    createLegacyCompatibleActualPoint(zoneRow, zoneCol),
    overrides
  );
}

function summarizeEvents(events) {
  const accumulator = createEmptyMeasurementAccumulator();
  for (const event of events) {
    assert.equal(recordPitchMeasurementEvent(accumulator, event), true);
  }
  return finalizeMeasurementSummary(accumulator, {
    status: "completed",
    seed: 1,
    requestedGames: 0,
    elapsedMs: 0,
  });
}

function sumPitches(group, side = "combined") {
  return Object.values(group[side]).reduce(
    (sum, line) => sum + line.pitches,
    0
  );
}

function sumPitchPct(group, side = "combined") {
  return Object.values(group[side]).reduce(
    (sum, line) => sum + line.pitchPct,
    0
  );
}

function assertFiniteNumbers(value, path = "value") {
  if (typeof value === "number") {
    assert.ok(Number.isFinite(value), path);
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      assertFiniteNumbers(entry, `${path}.${key}`);
    }
  }
}

function runSeededGame({ measure }) {
  const state = createInitialSimState(
    structuredClone(COMPATIBILITY_TEAMS.away),
    structuredClone(COMPATIBILITY_TEAMS.home)
  );
  const seeded = createSeededRandom(314159265);
  let randomCalls = 0;
  const random = () => {
    randomCalls += 1;
    return seeded();
  };
  const runtime = { random };
  if (measure) runtime.onPitchMeasurement = () => {};

  simulateGameMutable(state, createFastSimulationOptions(runtime));
  return { state, randomCalls };
}

test("all fixed pitch-location keys exist when every count is zero", () => {
  const summary = summarizeEvents([]);
  const expectedKeys = {
    attackRegion: MEASUREMENT_ATTACK_REGIONS,
    attackRegionDetail: MEASUREMENT_ATTACK_REGION_DETAILS,
    meatball: MEASUREMENT_MEATBALL_KEYS,
    locationCourse: MEASUREMENT_LOCATION_COURSES,
    locationGrid: MEASUREMENT_LOCATION_GRID_KEYS,
  };

  for (const [group, keys] of Object.entries(expectedKeys)) {
    for (const side of ["away", "home", "combined"]) {
      assert.deepEqual(Object.keys(summary.breakdowns[group][side]), keys);
      assert.ok(
        Object.values(summary.breakdowns[group][side]).every(
          (line) => line.pitches === 0 && line.pitchPct === 0
        )
      );
    }
  }
  assert.ok(Object.hasOwn(summary.breakdowns.locationModel.combined, "unknown"));
});

test("one pitch is recorded once in every location breakdown", () => {
  const summary = summarizeEvents([eventForCell(2, 2)]);

  assert.equal(summary.breakdowns.attackRegion.combined.HEART.pitches, 1);
  assert.equal(summary.breakdowns.attackRegionDetail.combined.HEART.pitches, 1);
  assert.equal(summary.breakdowns.meatball.combined.MEATBALL.pitches, 1);
  assert.equal(summary.breakdowns.locationCourse.combined.C.pitches, 1);
  assert.equal(summary.breakdowns.locationGrid.combined.r2c2.pitches, 1);
  assert.equal(
    summary.breakdowns.locationModel.combined[LEGACY_LOCATION_MODEL].pitches,
    1
  );
});

test("each populated location breakdown has pitchPct totaling one", () => {
  const summary = summarizeEvents([
    eventAtRadius(0),
    eventAtRadius(0.8),
    eventAtRadius(1.1),
    eventAtRadius(1.5),
    eventAtRadius(2.1),
  ]);

  for (const group of POSITION_BREAKDOWN_GROUPS) {
    assert.ok(
      Math.abs(sumPitchPct(summary.breakdowns[group]) - 1) < 1e-12,
      group
    );
  }
});

test("Heart, Shadow-In, Shadow-Out, Chase, and Waste remain distinct", () => {
  const summary = summarizeEvents([
    eventAtRadius(0),
    eventAtRadius(0.8),
    eventAtRadius(1.1),
    eventAtRadius(1.5, { locationModel: "continuous_test" }),
    eventAtRadius(2.1),
  ]);

  assert.equal(summary.breakdowns.attackRegion.combined.HEART.pitches, 1);
  assert.equal(summary.breakdowns.attackRegion.combined.SHADOW.pitches, 2);
  assert.equal(summary.breakdowns.attackRegion.combined.CHASE.pitches, 1);
  assert.equal(summary.breakdowns.attackRegion.combined.WASTE.pitches, 1);
  assert.equal(
    summary.breakdowns.attackRegionDetail.combined.SHADOW_IN.pitches,
    1
  );
  assert.equal(
    summary.breakdowns.attackRegionDetail.combined.SHADOW_OUT.pitches,
    1
  );
});

test("Shadow percentage and Edge percentage are exactly equal", () => {
  const summary = summarizeEvents([
    eventAtRadius(0),
    eventAtRadius(0.8),
    eventAtRadius(1.1),
  ]);

  assert.equal(
    summary.pitchLocation.combined.shadowPct,
    summary.pitchLocation.combined.edgePct
  );
});

test("a Shadow-Out swing raises Chase% without raising Chase Region%", () => {
  const summary = summarizeEvents([
    eventAtRadius(1.1, {
      swung: true,
      madeContact: false,
      pitchResult: "swinging_strike",
    }),
  ]);

  assert.equal(summary.pitchLocation.combined.chasePct, 1);
  assert.equal(summary.pitchLocation.combined.chaseRegionPct, 0);
  assert.equal(summary.breakdowns.attackRegion.combined.CHASE.pitches, 0);
});

test("Heart and isMistake remain independent dimensions", () => {
  const summary = summarizeEvents([
    eventAtRadius(0, { isMistake: false }),
    eventAtRadius(0.8, { isMistake: true }),
  ]);

  assert.equal(summary.breakdowns.attackRegion.combined.HEART.pitches, 1);
  assert.equal(summary.breakdowns.mistake.combined.mistake.pitches, 1);
  assert.equal(summary.breakdowns.mistake.combined.nonMistake.pitches, 1);
});

test("course and locationCourse enter separate breakdowns", () => {
  const summary = summarizeEvents([
    eventForCell(2, 2, { course: "A" }),
  ]);

  assert.equal(summary.breakdowns.course.combined.A.pitches, 1);
  assert.equal(summary.breakdowns.course.combined.C.pitches, 0);
  assert.equal(summary.breakdowns.locationCourse.combined.C.pitches, 1);
  assert.equal(summary.breakdowns.locationCourse.combined.A.pitches, 0);
});

test("Meatball percentage and Meatball Swing% use their correct denominators", () => {
  const summary = summarizeEvents([
    eventAtRadius(0, {
      swung: true,
      madeContact: true,
      pitchResult: "foul",
    }),
    eventAtRadius(0.8),
  ]);
  const meatball = summary.breakdowns.meatball.combined.MEATBALL;

  assert.equal(summary.pitchLocation.combined.meatballPct, 0.5);
  assert.equal(meatball.pitchPct, 0.5);
  assert.equal(meatball.swingPct, 1);
  assert.equal(meatball.contactPct, 1);
});

test("all 25 legacy cells aggregate into distinct locationGrid keys", () => {
  const events = [];
  for (let row = 0; row <= 4; row += 1) {
    for (let col = 0; col <= 4; col += 1) {
      events.push(eventForCell(row, col));
    }
  }
  const summary = summarizeEvents(events);

  for (let row = 0; row <= 4; row += 1) {
    for (let col = 0; col <= 4; col += 1) {
      const line = summary.breakdowns.locationGrid.combined[`r${row}c${col}`];
      assert.equal(line.pitches, 1);
      assert.equal(line.zoneRow, row);
      assert.equal(line.zoneCol, col);
    }
  }
  assert.equal(summary.breakdowns.locationGrid.combined.unknown.pitches, 0);
});

test("invalid location fields use unknown buckets and increment diagnostics", () => {
  const invalid = {
    ...eventForCell(2, 2),
    actualPoint: { x: Number.NaN, z: 2.5 },
    normalizedRadius: Number.POSITIVE_INFINITY,
    actualIsZone: false,
    attackRegion: "INVALID",
    attackRegionDetail: "INVALID",
    shadowSide: "INVALID",
    isMeatball: "yes",
    zoneRow: 5,
    zoneCol: -1,
    locationCourse: "D",
    locationModel: "",
  };
  const summary = summarizeEvents([invalid]);

  assert.equal(summary.breakdowns.attackRegion.combined.unknown.pitches, 1);
  assert.equal(
    summary.breakdowns.attackRegionDetail.combined.unknown.pitches,
    1
  );
  assert.equal(summary.breakdowns.meatball.combined.unknown.pitches, 1);
  assert.equal(summary.breakdowns.locationCourse.combined.unknown.pitches, 1);
  assert.equal(summary.breakdowns.locationGrid.combined.unknown.pitches, 1);
  assert.equal(summary.breakdowns.locationModel.combined.unknown.pitches, 1);
  assert.equal(summary.diagnostics.invalidPitchLocationMeasurementEventCount, 1);
  assert.equal(summary.diagnostics.pitchLocationFieldMismatchCount, 1);
  assert.ok(summary.diagnostics.pitchLocationAggregationMismatchCount > 0);
});

test("every location breakdown total matches the all-pitch total", () => {
  const events = [];
  for (let row = 0; row <= 4; row += 1) {
    for (let col = 0; col <= 4; col += 1) {
      events.push(eventForCell(row, col));
    }
  }
  const summary = summarizeEvents(events);
  const pitches = summary.plateDiscipline.combined.pitches;

  for (const group of POSITION_BREAKDOWN_GROUPS) {
    assert.equal(sumPitches(summary.breakdowns[group]), pitches, group);
  }
  assert.equal(summary.diagnostics.pitchLocationAggregationMismatchCount, 0);
});

test("legacy_grid_compat alone produces no Chase Region pitches", () => {
  const events = [];
  for (let row = 0; row <= 4; row += 1) {
    for (let col = 0; col <= 4; col += 1) {
      events.push(eventForCell(row, col));
    }
  }
  const summary = summarizeEvents(events);

  assert.equal(summary.breakdowns.attackRegion.combined.CHASE.pitches, 0);
  assert.equal(summary.pitchLocation.combined.chaseRegionPct, 0);
  assert.equal(
    summary.pitchLocation.compatibility.activeLocationModel,
    LEGACY_LOCATION_MODEL
  );
  assert.equal(
    summary.pitchLocation.compatibility.legacyGridCompatNoChaseByDesign,
    true
  );
  assert.equal(
    summary.pitchLocation.compatibility.continuousLocationDistributionAvailable,
    false
  );
});

test("all pitchLocation summary percentages remain finite", () => {
  const summary = summarizeEvents([
    eventAtRadius(0),
    eventAtRadius(0.8),
    eventAtRadius(1.1),
    eventAtRadius(2.1),
  ]);

  for (const side of ["away", "home", "combined"]) {
    assertFiniteNumbers(summary.pitchLocation[side], `pitchLocation.${side}`);
  }
});

test("Summary and Report schema versions are both three", () => {
  const summary = summarizeEvents([]);
  const report = buildMeasurementReportObject({ summary, teams: {} });

  assert.equal(MEASUREMENT_SUMMARY_SCHEMA_VERSION, 3);
  assert.equal(MEASUREMENT_REPORT_SCHEMA_VERSION, 3);
  assert.equal(summary.reportSchemaVersion, 3);
  assert.equal(report.reportSchemaVersion, 3);
});

test("JSON contains pitchLocation and every location breakdown", () => {
  const summary = summarizeEvents([eventForCell(2, 2)]);
  const parsed = JSON.parse(
    buildMeasurementJson({ summary, teams: {}, generatedAt: "2026-07-27" })
  );

  assert.ok(Object.hasOwn(parsed, "pitchLocation"));
  for (const group of POSITION_BREAKDOWN_GROUPS) {
    assert.ok(Object.hasOwn(parsed.breakdowns, group), group);
  }
  assert.match(
    parsed.definitions.pitchLocation.chaseVsChaseRegion,
    /Chase%.*Chase Region%/
  );
  assert.match(
    parsed.definitions.pitchLocation.legacyGridCompatibility,
    /not a continuous MLB pitch distribution/
  );
});

test("100-game fixed-seed measurement has zero location diagnostics", async () => {
  const teams = createMlbAverageValidationTeams();
  const summary = await runMeasurementBatches({
    awayTeam: teams.away,
    homeTeam: teams.home,
    gameCount: 100,
    seed: 123456789,
  });

  assert.equal(summary.run.completedGames, 100);
  assert.equal(summary.diagnostics.invalidPitchLocationMeasurementEventCount, 0);
  assert.equal(summary.diagnostics.pitchLocationFieldMismatchCount, 0);
  assert.equal(summary.diagnostics.pitchLocationAggregationMismatchCount, 0);
  assert.equal(summary.pitchLocation.combined.chaseRegionPct, 0);
});

test("measurement does not change game results or random call count", () => {
  const baseline = runSeededGame({ measure: false });
  const measured = runSeededGame({ measure: true });

  assert.equal(measured.randomCalls, baseline.randomCalls);
  assert.deepEqual(measured.state, baseline.state);
});

test("future locationModel names remain distinct instead of becoming unknown", () => {
  const summary = summarizeEvents([
    eventAtRadius(1.5, { locationModel: "continuous_v1" }),
  ]);

  assert.equal(
    summary.breakdowns.locationModel.combined.continuous_v1.pitches,
    1
  );
  assert.equal(summary.breakdowns.locationModel.combined.unknown.pitches, 0);
  assert.equal(
    summary.pitchLocation.compatibility.activeLocationModel,
    "continuous_v1"
  );
  assert.equal(
    summary.pitchLocation.compatibility.continuousLocationDistributionAvailable,
    true
  );
});
