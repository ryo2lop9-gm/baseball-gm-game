import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  createGmBasicReferenceValidationTeams,
  createMlbAverageValidationTeams,
} from "../models/teamModels.js";
import {
  TUNING_VALIDATION_PRESETS,
  createTuningBootstrap,
} from "../bootstrap/tuningBootstrap.js";
import { createMeasurementContext } from "../pages/measurementPage.js";
import { loadEvLaLookup } from "../services/evLaLookupStore.js";
import {
  buildContactDisposition,
  runMeasurementBatches,
} from "../services/measurement/measurementService.js";
import {
  buildMeasurementReferenceComparison,
  calculateMlb2025DerivedContactDisposition,
  getMlb2025ReferenceBenchmark,
} from "../services/measurement/measurementReferenceService.js";
import {
  buildMeasurementJson,
  buildMeasurementMarkdown,
  buildMeasurementReportObject,
} from "../services/measurement/measurementReportService.js";

const lookup = JSON.parse(
  await readFile(new URL("../data/ev_la_lookup.json", import.meta.url), "utf8")
);
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => ({ ok: true, json: async () => lookup });
await loadEvLaLookup();
globalThis.fetch = originalFetch;

const EXPECTED_PITCH_MIX = {
  fourSeam: { usage: 0.42, velocity: 94.0 },
  slider: { usage: 0.27, velocity: 85.3 },
  curve: { usage: 0.10, velocity: 79.2 },
  fork: { usage: 0.21, velocity: 86.0 },
};

function allPitchers(teams) {
  return ["away", "home"].flatMap((side) => [
    teams[side].startingPitcher,
    ...teams[side].bullpen,
  ]);
}

test("GM basic symmetric preset has exact independent batter and pitcher objects", () => {
  const teams = createGmBasicReferenceValidationTeams();

  assert.notStrictEqual(teams.away, teams.home);
  assert.notStrictEqual(teams.away.lineup, teams.home.lineup);
  assert.equal(teams.away.lineup.length, 9);
  assert.equal(teams.home.lineup.length, 9);
  for (const batter of [...teams.away.lineup, ...teams.home.lineup]) {
    assert.deepEqual(batter.ratings, { contact: 60, power: 60, eye: 50 });
  }
  assert.equal(new Set([...teams.away.lineup, ...teams.home.lineup]).size, 18);

  const pitchers = allPitchers(teams);
  assert.equal(pitchers.length, 6);
  assert.equal(new Set(pitchers).size, 6);
  for (const pitcher of pitchers) {
    assert.deepEqual(pitcher.ratings, { control: 58, stuff: 61 });
    assert.deepEqual(pitcher.pitchMix, EXPECTED_PITCH_MIX);
  }
  assert.equal(new Set(pitchers.map((pitcher) => pitcher.pitchMix)).size, 6);
});

test("existing average-lineup versus power-pitcher preset is preserved", () => {
  const teams = createMlbAverageValidationTeams();
  assert.equal(teams.away.name, "MLB Avg Lineup");
  assert.equal(teams.home.name, "MLB Power Pitch Test");
  assert.deepEqual(teams.home.startingPitcher.ratings, {
    control: 56,
    stuff: 70,
  });
  assert.equal(teams.home.startingPitcher.pitchMix.fourSeam.velocity, 97.2);
});

test("tuning preset metadata and the measurement context carry the same roster", () => {
  const bootstrap = createTuningBootstrap();
  const bundle = bootstrap.createGmBasicReferenceRosterBundle();
  const tuningTeams = bootstrap.buildCurrentTuningTeams(bundle);
  const context = createMeasurementContext(
    bundle,
    bootstrap.buildCurrentTuningTeams
  );

  assert.equal(
    bundle.validationPreset,
    TUNING_VALIDATION_PRESETS.gmBasicSymmetricReference.id
  );
  assert.equal(
    context.validationPreset.id,
    "gm_basic_symmetric_reference"
  );
  assert.deepEqual(context.teams, tuningTeams);
  assert.notStrictEqual(context.teams.away, tuningTeams.away);
  assert.notStrictEqual(
    context.teams.away.lineup[0],
    tuningTeams.away.lineup[0]
  );
});

test("2025 MLB benchmark and derived contact rates match the static definitions", () => {
  const benchmark = getMlb2025ReferenceBenchmark();
  const derived = calculateMlb2025DerivedContactDisposition();

  assert.equal(benchmark.source.url, "https://baseballsavant.mlb.com/league?season=2025");
  assert.equal(benchmark.totals.PA, 182926);
  assert.equal(benchmark.totals.pitches, 710084);
  assert.equal(benchmark.metrics.OPS, 0.719);
  assert.ok(Math.abs(derived.contactPerPitch - 0.357066) < 1e-12);
  assert.ok(Math.abs(derived.foulPerPitch - 0.18118821652649547) < 1e-12);
  assert.ok(Math.abs(derived.fairBattedBallPerPitch - 0.17587778347350455) < 1e-12);
  assert.ok(Math.abs(derived.foulPerContact - 0.507436206545836) < 1e-12);
  assert.ok(Math.abs(derived.fairBattedBallPerContact - 0.492563793454164) < 1e-12);
});

test("contact disposition uses pitch-event denominators and preserves invariants", () => {
  const disposition = buildContactDisposition({
    combined: {
      pitches: 100,
      swings: 50,
      contacts: 40,
      fouls: 23,
      fairBattedBalls: 17,
    },
  });
  assert.deepEqual(disposition, {
    pitches: 100,
    swings: 50,
    contacts: 40,
    fouls: 23,
    fairBattedBalls: 17,
    contactPerPitch: 0.4,
    foulPerPitch: 0.23,
    fairBattedBallPerPitch: 0.17,
    foulPerContact: 0.575,
    fairBattedBallPerContact: 0.425,
  });
  assert.equal(disposition.fouls + disposition.fairBattedBalls, disposition.contacts);
  assert.ok(
    Math.abs(disposition.foulPerContact + disposition.fairBattedBallPerContact - 1) <
      1e-12
  );
});

test("seeded GM reference measurement is reproducible with zero diagnostics", async () => {
  const teams = createGmBasicReferenceValidationTeams();
  const options = {
    awayTeam: teams.away,
    homeTeam: teams.home,
    gameCount: 10,
    seed: 246813579,
  };
  const first = await runMeasurementBatches(options);
  const second = await runMeasurementBatches(options);

  assert.deepEqual(first.results, second.results);
  assert.deepEqual(first.plateDiscipline, second.plateDiscipline);
  assert.deepEqual(first.contactDisposition, second.contactDisposition);
  assert.equal(
    first.contactDisposition.fouls + first.contactDisposition.fairBattedBalls,
    first.contactDisposition.contacts
  );
  assert.ok(
    Math.abs(
      first.contactDisposition.foulPerContact +
        first.contactDisposition.fairBattedBallPerContact -
        1
    ) < 1e-12
  );
  for (const [key, value] of Object.entries(first.diagnostics)) {
    assert.equal(value, 0, key);
  }
});

test("reference comparison marks approximate and unavailable rows explicitly", () => {
  const comparison = buildMeasurementReferenceComparison({
    results: { combined: { AVG: 0.25 } },
    plateDiscipline: { combined: {} },
    battingProfiles: { combined: { GBPct: 0.4 } },
    contactDisposition: {},
  });
  assert.ok(
    Math.abs(comparison.find((row) => row.key === "AVG").difference - 0.005) <
      1e-12
  );
  assert.equal(comparison.find((row) => row.key === "GBPct").accuracy, "approximate");
  const barrel = comparison.find((row) => row.key === "officialBarrelPct");
  assert.equal(barrel.current, null);
  assert.equal(barrel.difference, null);
  assert.equal(barrel.accuracy, "not_comparable");
});

test("schema v5 Markdown and JSON include preset, benchmark, comparison, and disposition", async () => {
  const teams = createGmBasicReferenceValidationTeams();
  const summary = await runMeasurementBatches({
    awayTeam: teams.away,
    homeTeam: teams.home,
    gameCount: 3,
    seed: 13579,
  });
  const options = {
    summary,
    teams,
    validationPreset: {
      id: "gm_basic_symmetric_reference",
      label: "GM基礎参考・対称MLB基準",
    },
    generatedAt: "2026-07-18T00:00:00.000Z",
  };
  const report = buildMeasurementReportObject(options);
  const markdown = buildMeasurementMarkdown(options);
  const json = buildMeasurementJson(options);
  const parsed = JSON.parse(json);

  assert.equal(report.reportSchemaVersion, 5);
  assert.equal(report.validationPreset, "gm_basic_symmetric_reference");
  assert.equal(report.referenceBenchmark.season, 2025);
  assert.ok(report.referenceComparison.length >= 25);
  assert.equal(report.contactDisposition.contacts, summary.contactDisposition.contacts);
  for (const section of [
    "Validation Preset",
    "Reference Benchmark",
    "Reference Comparison",
    "Contact Disposition",
  ]) {
    assert.match(markdown, new RegExp(`## ${section}`));
  }
  assert.match(markdown, /validationPreset: gm_basic_symmetric_reference/);
  assert.doesNotMatch(json, /NaN|Infinity|undefined/);
  assert.equal(parsed.reportSchemaVersion, 5);
  assert.equal(parsed.validationPreset, "gm_basic_symmetric_reference");
});

test("new tuning and measurement DOM ids are unique and fully wired", async () => {
  const [html, tuningDom, tuningPage, measurementDom, measurementRender] =
    await Promise.all([
      readFile(new URL("../index.html", import.meta.url), "utf8"),
      readFile(new URL("../pages/tuningDom.js", import.meta.url), "utf8"),
      readFile(new URL("../pages/tuningPage.js", import.meta.url), "utf8"),
      readFile(new URL("../pages/measurementDom.js", import.meta.url), "utf8"),
      readFile(new URL("../render/measurementRender.js", import.meta.url), "utf8"),
    ]);
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);

  assert.deepEqual(duplicates, []);
  for (const id of [
    "applyGmBasicReferencePresetBtn",
    "tuningValidationPreset",
    "editorBatterFields",
    "editorPitcherFields",
    "measurementValidationPreset",
    "measurementReferenceComparison",
    "measurementContactDisposition",
  ]) {
    assert.ok(ids.includes(id), id);
  }
  assert.match(tuningDom, /applyGmBasicReferencePresetBtn/);
  assert.match(tuningPage, /addEventListener\([\s\S]*applyGmBasicReferencePreset/);
  assert.match(measurementDom, /referenceComparison/);
  assert.match(measurementRender, /renderReferenceComparison/);
  assert.match(html, /grid-template-columns: minmax\(0, 1\.2fr\) minmax\(280px, 0\.8fr\) minmax\(300px, 0\.9fr\)/);
  assert.match(html, /@media \(max-width: 760px\)/);
});
