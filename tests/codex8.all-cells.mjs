import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { readFile } from "node:fs/promises";

import {
  getEvLaOutcomeProbabilities,
  validateEvLaLookup,
} from "../services/evLaOutcomeService.js";

const lookup = JSON.parse(
  await readFile(new URL("../data/ev_la_lookup.json", import.meta.url), "utf8")
);
const validation = validateEvLaLookup(lookup);
const modeCounts = { local: 0, expanded: 0, distant: 0 };
const sourceCounts = { ev_la_smoothed: 0, ev_la_neighbor: 0 };
const examples = {
  noneLocal: null,
  expanded: null,
  distant: null,
};
const errors = [];
let inspectedCells = 0;
const startedAt = performance.now();

for (let ev = 50; ev <= 120; ev += 1) {
  for (let la = -90; la <= 90; la += 1) {
    const key = `${ev}|${la}`;

    try {
      const result = getEvLaOutcomeProbabilities({
        exitVelocity: ev,
        launchAngle: la,
        lookup,
      });
      const probabilities = Object.values(result.probabilities);
      const total = probabilities.reduce((sum, value) => sum + value, 0);
      const mode = result.smoothing.neighborMode;

      assert.ok(probabilities.every(Number.isFinite));
      assert.ok(probabilities.every((value) => value >= 0));
      assert.ok(Math.abs(total - 1) < 1e-10);
      assert.ok(mode in modeCounts);
      assert.ok(result.source in sourceCounts);
      assert.notEqual(result.source, "ev_la_emergency_fallback");
      if (la < 0) assert.equal(result.probabilities.homeRun, 0);

      modeCounts[mode] += 1;
      sourceCounts[result.source] += 1;
      inspectedCells += 1;

      if (
        !examples.noneLocal &&
        result.sampleQuality === "none" &&
        mode === "local"
      ) {
        examples.noneLocal = { ev, la, key };
      }
      if (!examples.expanded && mode === "expanded") {
        examples.expanded = { ev, la, key };
      }
      if (!examples.distant && mode === "distant") {
        examples.distant = { ev, la, key };
      }
    } catch (error) {
      errors.push({ key, code: error.code, message: error.message });
    }
  }
}

const elapsedMs = performance.now() - startedAt;
const cachedPassStartedAt = performance.now();
for (let ev = 50; ev <= 120; ev += 1) {
  for (let la = -90; la <= 90; la += 1) {
    getEvLaOutcomeProbabilities({
      exitVelocity: ev,
      launchAngle: la,
      lookup,
    });
  }
}
const cachedPassElapsedMs = performance.now() - cachedPassStartedAt;
const extremes = {};
for (const [label, exitVelocity, launchAngle] of [
  ["52|-80", 52, -80],
  ["118|85", 118, 85],
]) {
  const result = getEvLaOutcomeProbabilities({
    exitVelocity,
    launchAngle,
    lookup,
  });
  extremes[label] = {
    source: result.source,
    neighborMode: result.smoothing.neighborMode,
    probabilities: result.probabilities,
  };
}

assert.equal(inspectedCells, 12851);
assert.equal(errors.length, 0);

console.log(
  JSON.stringify(
    {
      inspectedCells,
      elapsedMs: Number(elapsedMs.toFixed(3)),
      cachedPassElapsedMs: Number(cachedPassElapsedMs.toFixed(3)),
      errors: errors.length,
      modeCounts,
      sourceCounts,
      validation,
      examples,
      extremes,
    },
    null,
    2
  )
);
