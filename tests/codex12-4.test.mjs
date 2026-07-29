import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  createFastSimulationOptions,
  simulateGameMutable,
} from "../engine/core/engineCore.js";
import { createMlbAverageValidationTeams } from "../models/teamModels.js";
import { getMeasurementDom } from "../pages/measurementDom.js";
import {
  PITCH_LOCATION_ATTACK_REGION_DETAIL_ORDER,
  PITCH_LOCATION_ATTACK_REGION_ORDER,
  PITCH_LOCATION_COURSE_ORDER,
  buildLocationGridCellData,
  buildPitchLocationBreakdownRows,
  buildPitchLocationKpiData,
  renderMeasurementPage,
  renderPitchLocation,
} from "../render/measurementRender.js";
import { loadEvLaLookup } from "../services/evLaLookupStore.js";
import {
  MEASUREMENT_REPORT_SCHEMA_VERSION,
  buildMeasurementJson,
  buildMeasurementMarkdown,
  buildMeasurementReportObject,
} from "../services/measurement/measurementReportService.js";
import {
  MEASUREMENT_SUMMARY_SCHEMA_VERSION,
  runMeasurementBatches,
} from "../services/measurement/measurementService.js";
import { createSeededRandom } from "../services/seededRandomService.js";
import { createInitialSimState } from "../state/gameState.js";

const lookup = JSON.parse(
  await readFile(new URL("../data/ev_la_lookup.json", import.meta.url), "utf8")
);
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => ({ ok: true, json: async () => lookup });
await loadEvLaLookup();
globalThis.fetch = originalFetch;

class FakeElement {
  constructor(tagName = "div") {
    this.tagName = String(tagName).toUpperCase();
    this.children = [];
    this.dataset = {};
    this.attributes = {};
    this.style = {
      setProperty(name, value) {
        this[name] = String(value);
      },
    };
    this.className = "";
    this._textContent = "";
    this.value = "";
    this.disabled = false;
    this.readOnly = false;
    this.classList = {
      add: (...names) => this.#changeClasses(names, true),
      remove: (...names) => this.#changeClasses(names, false),
      toggle: (name, force) => {
        const enabled =
          force === undefined ? !this.classList.contains(name) : Boolean(force);
        this.#changeClasses([name], enabled);
        return enabled;
      },
      contains: (name) => this.className.split(/\s+/).includes(name),
    };
  }

  #changeClasses(names, enabled) {
    const classes = new Set(this.className.split(/\s+/).filter(Boolean));
    for (const name of names) {
      if (enabled) classes.add(name);
      else classes.delete(name);
    }
    this.className = [...classes].join(" ");
  }

  set textContent(value) {
    this._textContent = String(value ?? "");
    this.children = [];
  }

  get textContent() {
    return (
      this._textContent +
      this.children.map((child) => child?.textContent || "").join("")
    );
  }

  append(...nodes) {
    for (const node of nodes) {
      if (node?.tagName === "#FRAGMENT") {
        this.children.push(...node.children);
      } else if (node) {
        this.children.push(node);
      }
    }
  }

  replaceChildren(...nodes) {
    this.children = [];
    this._textContent = "";
    this.append(...nodes);
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  querySelectorAll() {
    return [];
  }
}

class FakeDocument {
  constructor() {
    this.elements = new Map();
  }

  createElement(tagName) {
    return new FakeElement(tagName);
  }

  createDocumentFragment() {
    return new FakeElement("#fragment");
  }

  getElementById(id) {
    return this.elements.get(id) || null;
  }

  querySelectorAll() {
    return [];
  }
}

const fakeDocument = new FakeDocument();
globalThis.document = fakeDocument;

function createRenderDom() {
  const target = {
    measurementPage: new FakeElement("section"),
    presetButtons: [],
  };
  return new Proxy(target, {
    get(object, property) {
      if (Reflect.has(object, property)) return Reflect.get(object, property);
      if (typeof property !== "string") return undefined;
      object[property] = new FakeElement(
        property === "referenceSource" ? "a" : "div"
      );
      return object[property];
    },
  });
}

function metricLine(overrides = {}) {
  return {
    pitches: 0,
    pitchPct: 0,
    zonePct: 0,
    swingPct: 0,
    contactPct: 0,
    whiffPct: 0,
    cswPct: 0,
    PA: 0,
    AVG: 0,
    OBP: 0,
    SLG: 0,
    OPS: 0,
    ...overrides,
  };
}

function fixedGroup(keys) {
  return {
    combined: Object.fromEntries(keys.map((key) => [key, metricLine()])),
  };
}

function createDisplaySummary() {
  const metricKeys = [
    "geometricZonePct",
    "heartPct",
    "shadowPct",
    "shadowInPct",
    "shadowOutPct",
    "chasePct",
    "chaseRegionPct",
    "wastePct",
    "meatballPct",
  ];
  const side = (factor) =>
    Object.fromEntries(
      metricKeys.map((key, index) => [key, factor * (index + 1)])
    );
  const grid = {};
  for (let row = 0; row <= 4; row += 1) {
    for (let col = 0; col <= 4; col += 1) {
      const index = row * 5 + col;
      grid[`r${row}c${col}`] = metricLine({
        pitches: index,
        pitchPct: index / 300,
        swingPct: index / 100,
      });
    }
  }
  return {
    pitchLocation: {
      away: side(0.01),
      home: side(0.02),
      combined: side(0.03),
      compatibility: {
        activeLocationModel: "legacy_grid_compat",
        legacyGridCompatNoChaseByDesign: true,
        continuousLocationDistributionAvailable: false,
      },
    },
    breakdowns: {
      attackRegion: fixedGroup(PITCH_LOCATION_ATTACK_REGION_ORDER),
      attackRegionDetail: fixedGroup(
        PITCH_LOCATION_ATTACK_REGION_DETAIL_ORDER
      ),
      meatball: fixedGroup(["MEATBALL", "NON_MEATBALL", "unknown"]),
      locationCourse: fixedGroup(PITCH_LOCATION_COURSE_ORDER),
      locationGrid: { combined: grid },
      locationModel: {
        combined: {
          legacy_grid_compat: metricLine({ pitches: 24, pitchPct: 1 }),
          unknown: metricLine(),
        },
      },
    },
  };
}

function renderDisplaySummary(summary = createDisplaySummary()) {
  const dom = createRenderDom();
  renderPitchLocation(dom, summary);
  return dom;
}

function descendants(element) {
  return [
    element,
    ...element.children.flatMap((child) => descendants(child)),
  ];
}

const teams = createMlbAverageValidationTeams();
const measuredSummary = await runMeasurementBatches({
  awayTeam: teams.away,
  homeTeam: teams.home,
  gameCount: 2,
  seed: 123456789,
});
const reportOptions = {
  summary: measuredSummary,
  teams,
  generatedAt: "2026-07-27T00:00:00.000Z",
};

test("all new pitch-location DOM ids are present and retrieved", async () => {
  const [html, main, bootstrap, measurementPage, measurementRender] =
    await Promise.all([
      readFile(new URL("../index.html", import.meta.url), "utf8"),
      readFile(new URL("../main.js", import.meta.url), "utf8"),
      readFile(new URL("../bootstrap/appBootstrap.js", import.meta.url), "utf8"),
      readFile(new URL("../pages/measurementPage.js", import.meta.url), "utf8"),
      readFile(new URL("../render/measurementRender.js", import.meta.url), "utf8"),
    ]);
  const ids = [
    "measurementPitchLocationKpis",
    "measurementPitchLocationCompatibility",
    "measurementLocationGrid",
    "measurementAttackRegionBreakdown",
    "measurementAttackRegionDetailBreakdown",
    "measurementMeatballBreakdown",
    "measurementLocationCourseBreakdown",
    "measurementLocationGridBreakdown",
    "measurementLocationModelBreakdown",
  ];
  for (const id of ids) {
    assert.match(html, new RegExp(`id="${id}"`));
    fakeDocument.elements.set(id, new FakeElement("div"));
  }
  const dom = getMeasurementDom();
  assert.equal(dom.pitchLocationKpis, fakeDocument.elements.get(ids[0]));
  assert.equal(
    dom.locationModelBreakdown,
    fakeDocument.elements.get(ids.at(-1))
  );
  assert.match(html, /main\.js\?v=codex12-4/);
  assert.match(main, /appBootstrap\.js\?v=codex12-4/);
  assert.match(bootstrap, /measurementPage\.js\?v=codex12-4/);
  assert.match(measurementPage, /measurementDom\.js\?v=codex12-4/);
  assert.match(measurementPage, /measurementRender\.js\?v=codex12-4/);
  assert.match(
    measurementPage,
    /measurementReportService\.js\?v=codex12-4/
  );
  assert.match(
    measurementRender,
    /measurementReportService\.js\?v=codex12-4/
  );
});

test("rendering without a summary is safe and clears stale location output", () => {
  const dom = createRenderDom();
  dom.pitchLocationKpis.append(new FakeElement("span"));
  assert.doesNotThrow(() =>
    renderMeasurementPage(
      {
        status: "idle",
        completedGames: 0,
        failedGames: 0,
        requestedGames: 100,
        gameCount: 100,
        seed: 1,
        teams: {},
        validationPreset: {},
        elapsedMs: 0,
        gamesPerSecond: 0,
        summary: null,
      },
      dom
    )
  );
  assert.equal(dom.pitchLocationKpis.children.length, 0);
});

test("nine KPI cards carry distinct Away, Home, and Combined values", () => {
  const data = buildPitchLocationKpiData(createDisplaySummary().pitchLocation);
  const dom = renderDisplaySummary();
  assert.equal(data.length, 9);
  assert.equal(dom.pitchLocationKpis.children.length, 9);
  for (const [index, metric] of data.entries()) {
    const text = dom.pitchLocationKpis.children[index].textContent;
    assert.match(text, new RegExp(metric.label.replace("%", "%")));
    assert.match(text, new RegExp(`Away ${(metric.away * 100).toFixed(2)}%`));
    assert.match(text, new RegExp(`Home ${(metric.home * 100).toFixed(2)}%`));
    assert.match(text, new RegExp(`${(metric.combined * 100).toFixed(2)}%`));
  }
});

test("Chase% and Chase Region% use separate labels and values", () => {
  const dom = renderDisplaySummary();
  const chase = dom.pitchLocationKpis.children.find(
    (card) => card.dataset.metric === "chasePct"
  );
  const chaseRegion = dom.pitchLocationKpis.children.find(
    (card) => card.dataset.metric === "chaseRegionPct"
  );
  assert.ok(chase);
  assert.ok(chaseRegion);
  assert.match(chase.textContent, /Chase%/);
  assert.doesNotMatch(chase.textContent, /Chase Region%/);
  assert.match(chaseRegion.textContent, /Chase Region%/);
  assert.notEqual(chase.children[1].textContent, chaseRegion.children[1].textContent);
});

test("Shadow and Edge are presented as one metric", () => {
  const data = buildPitchLocationKpiData(createDisplaySummary().pitchLocation);
  assert.equal(data.filter((metric) => /Shadow|Edge/.test(metric.label)).length, 3);
  assert.equal(data.filter((metric) => metric.label === "Shadow / Edge%").length, 1);
  assert.equal(data.some((metric) => metric.key === "edgePct"), false);
});

test("legacy compatibility constraints render as neutral model information", () => {
  const dom = renderDisplaySummary();
  const compatibility = dom.pitchLocationCompatibility;
  assert.match(compatibility.textContent, /決定的な互換アンカー/);
  assert.match(compatibility.textContent, /連続的なMLB投球位置分布ではありません/);
  assert.match(compatibility.textContent, /Chase Regionが0.*正常動作/);
  assert.match(compatibility.textContent, /Chase%が0.*意味しません/);
  assert.equal(compatibility.classList.contains("measurement-warning"), false);
});

test("the visual location grid always contains 25 cells", () => {
  const dom = renderDisplaySummary();
  assert.equal(dom.locationGrid.children.length, 25);
});

test("location grid cells are ordered row 0-4 then column 0-4", () => {
  const cells = buildLocationGridCellData(
    createDisplaySummary().breakdowns.locationGrid
  );
  assert.deepEqual(
    cells.map(({ row, col }) => `${row},${col}`),
    Array.from({ length: 25 }, (_, index) =>
      `${Math.floor(index / 5)},${index % 5}`
    )
  );
});

test("the inner 3x3 cells have the geometric-zone class", () => {
  const dom = renderDisplaySummary();
  assert.equal(
    dom.locationGrid.children.filter((cell) =>
      cell.classList.contains("geometric-zone-cell")
    ).length,
    9
  );
});

test("an all-zero grid produces finite zero color intensities", () => {
  const cells = buildLocationGridCellData({ combined: {} });
  assert.equal(cells.length, 25);
  assert.ok(
    cells.every(
      (cell) => Number.isFinite(cell.colorIntensity) && cell.colorIntensity === 0
    )
  );
});

test("every visual cell shows Pitch%, pitch count, Swing%, and accessibility metadata", () => {
  const dom = renderDisplaySummary();
  for (const cell of dom.locationGrid.children) {
    assert.match(cell.textContent, /%n=\d+Swing \d+\.\d{2}%/);
    assert.match(cell.attributes["aria-label"], /row [0-4], col [0-4]/);
    assert.match(cell.attributes["aria-label"], /Pitch .*n=.*Swing/);
    assert.match(cell.dataset.gridKey, /^r[0-4]c[0-4]$/);
  }
});

test("Attack Region Detail rows use the fixed order", () => {
  const rows = buildPitchLocationBreakdownRows(
    { combined: {} },
    PITCH_LOCATION_ATTACK_REGION_DETAIL_ORDER
  );
  assert.deepEqual(
    rows.map((row) => row.key),
    ["HEART", "SHADOW_IN", "SHADOW_OUT", "CHASE", "WASTE", "unknown"]
  );
});

test("fixed zero-count categories are never omitted", () => {
  assert.deepEqual(
    buildPitchLocationBreakdownRows(
      { combined: {} },
      PITCH_LOCATION_ATTACK_REGION_ORDER
    ).map((row) => [row.key, row.pitches]),
    PITCH_LOCATION_ATTACK_REGION_ORDER.map((key) => [key, 0])
  );
});

test("Course and Location Course remain separate displays", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /id="measurementCourseBreakdown"/);
  assert.match(html, /id="measurementLocationCourseBreakdown"/);
  assert.match(html, /Courseは既存確率計算に使うresolved course/);
  assert.match(html, /Location CourseはactualPointから派生した位置分類/);
});

test("future location model names are preserved verbatim", () => {
  const rows = buildPitchLocationBreakdownRows({
    combined: {
      continuous_model_v2: metricLine({ pitches: 3 }),
      unknown: metricLine(),
    },
  });
  assert.deepEqual(
    rows.map((row) => row.key),
    ["continuous_model_v2", "unknown"]
  );
});

test("unknown categories render safely", () => {
  const summary = createDisplaySummary();
  summary.breakdowns.locationModel.combined = {
    unknown: metricLine({ pitches: 1, pitchPct: 1 }),
  };
  const dom = renderDisplaySummary(summary);
  assert.match(dom.locationModelBreakdown.textContent, /unknown/);
  assert.doesNotMatch(
    dom.locationModelBreakdown.textContent,
    /NaN|Infinity|undefined/
  );
});

test("Markdown includes Pitch Location Summary and every location breakdown", () => {
  const markdown = buildMeasurementMarkdown(reportOptions);
  for (const heading of [
    "## Pitch Location Summary",
    "### Compatibility",
    "### Attack Region",
    "### Attack Region Detail",
    "### Meatball",
    "### Location Course",
    "### Location Grid",
    "### Location Model",
  ]) {
    assert.match(markdown, new RegExp(heading.replaceAll("%", "\\%")));
  }
  assert.equal((markdown.match(/^\| r[0-4]c[0-4] \|/gm) || []).length, 25);
});

test("Markdown clearly separates Chase% from Chase Region%", () => {
  const markdown = buildMeasurementMarkdown(reportOptions);
  const summaryStart = markdown.indexOf("## Pitch Location Summary");
  const summaryEnd = markdown.indexOf("## Pitch Location Breakdowns");
  const section = markdown.slice(summaryStart, summaryEnd);
  assert.match(section, /^\| Chase% \|/m);
  assert.match(section, /^\| Chase Region% \|/m);
  assert.match(section, /Chase% is the swing rate/);
  assert.match(section, /Chase Region 0 is expected/);
});

test("Markdown never exposes NaN, Infinity, or undefined", () => {
  const summary = structuredClone(measuredSummary);
  summary.pitchLocation.combined.chasePct = Number.POSITIVE_INFINITY;
  summary.breakdowns.locationModel.combined.future_model = metricLine({
    OPS: Number.NaN,
  });
  const markdown = buildMeasurementMarkdown({
    ...reportOptions,
    summary,
  });
  assert.doesNotMatch(markdown, /NaN|Infinity|undefined/);
});

test("JSON and Summary/Report schemas are version 7", () => {
  const report = buildMeasurementReportObject(reportOptions);
  const parsed = JSON.parse(buildMeasurementJson(reportOptions));
  assert.equal(MEASUREMENT_SUMMARY_SCHEMA_VERSION, 7);
  assert.equal(MEASUREMENT_REPORT_SCHEMA_VERSION, 7);
  assert.equal(measuredSummary.reportSchemaVersion, 7);
  assert.equal(report.reportSchemaVersion, 7);
  assert.equal(parsed.reportSchemaVersion, 7);
});

test("rendering does not mutate the summary object", () => {
  const summary = createDisplaySummary();
  const before = structuredClone(summary);
  renderDisplaySummary(summary);
  assert.deepEqual(summary, before);
});

test("position invariants and multiple-seed reproducibility remain intact", async () => {
  for (const seed of [246813579, 975318642]) {
    const first = await runMeasurementBatches({
      awayTeam: teams.away,
      homeTeam: teams.home,
      gameCount: 1,
      seed,
    });
    const second = await runMeasurementBatches({
      awayTeam: teams.away,
      homeTeam: teams.home,
      gameCount: 1,
      seed,
    });
    assert.deepEqual(first.results, second.results);
    assert.deepEqual(first.pitchLocation, second.pitchLocation);
    assert.deepEqual(
      first.breakdowns.locationGrid,
      second.breakdowns.locationGrid
    );
    assert.equal(
      first.pitchLocation.combined.shadowPct,
      first.pitchLocation.combined.edgePct
    );
    assert.equal(first.diagnostics.pitchLocationFieldMismatchCount, 0);
    assert.equal(first.diagnostics.pitchLocationAggregationMismatchCount, 0);
  }
});

test("measurement hooks do not change game results or RNG calls", () => {
  function runGame(measure) {
    const state = createInitialSimState(
      structuredClone(teams.away),
      structuredClone(teams.home)
    );
    const seeded = createSeededRandom(11223344);
    let randomCalls = 0;
    const runtime = {
      random: () => {
        randomCalls += 1;
        return seeded();
      },
    };
    if (measure) {
      runtime.onPitchMeasurement = () => {};
      runtime.onBattedBallMeasurement = () => {};
    }
    simulateGameMutable(state, createFastSimulationOptions(runtime));
    return { state, randomCalls };
  }

  const baseline = runGame(false);
  const measured = runGame(true);
  assert.equal(measured.randomCalls, baseline.randomCalls);
  assert.deepEqual(measured.state, baseline.state);
});
