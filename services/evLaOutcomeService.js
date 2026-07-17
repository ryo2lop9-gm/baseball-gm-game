function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

const EV_MIN = 50;
const EV_MAX = 120;
const LA_MIN = -90;
const LA_MAX = 90;

export const SMOOTHING_CONFIG = Object.freeze({
  priorStrength: 100,
  evBandwidth: 3,
  laBandwidth: 5,
  searchStages: Object.freeze([
    Object.freeze({
      mode: "local",
      evRadius: 3,
      laRadius: 5,
      minEffectiveSampleSize: 50,
      minNeighborCells: 5,
    }),
    Object.freeze({
      mode: "expanded",
      evRadius: 5,
      laRadius: 10,
      minEffectiveSampleSize: 100,
      minNeighborCells: 5,
    }),
    Object.freeze({
      mode: "expanded",
      evRadius: 10,
      laRadius: 20,
      minEffectiveSampleSize: 100,
      minNeighborCells: 5,
    }),
  ]),
  distantMinEffectiveSampleSize: 100,
  distantMinNeighborCells: 5,
  distantMaxNeighborCells: 50,
});

const RESULT_FIELDS = Object.freeze([
  { probability: "out", count: "outs", rate: "outRate" },
  { probability: "single", count: "singles", rate: "singleRate" },
  { probability: "double", count: "doubles", rate: "doubleRate" },
  { probability: "triple", count: "triples", rate: "tripleRate" },
  { probability: "homeRun", count: "hrs", rate: "hrRate" },
]);

const lookupCaches = new WeakMap();

function makeEvBin(exitVelocity) {
  const ev = Number(exitVelocity);

  if (!Number.isFinite(ev)) return "85";
  return String(Math.round(clamp(ev, EV_MIN, EV_MAX)));
}

function makeLegacyEvBin(exitVelocity) {
  const ev = Number(exitVelocity);

  if (!Number.isFinite(ev)) return "80_85";
  if (ev < 50) return "under_50";
  if (ev >= 120) return "120_plus";
  const lower = Math.floor(ev / 5) * 5;
  const upper = lower + 5;

  return `${lower}_${upper}`;
}

function makeLaBin(launchAngle) {
  const la = Number(launchAngle);

  if (!Number.isFinite(la)) return "12";
  return String(Math.round(clamp(la, LA_MIN, LA_MAX)));
}

function makeLegacyLaBin(launchAngle) {
  const la = Number(launchAngle);

  if (!Number.isFinite(la)) return "10_15";
  if (la < -60) return "under_-60";
  if (la >= 70) return "70_plus";
  const lower = Math.floor(la / 5) * 5;
  const upper = lower + 5;

  return `${lower}_${upper}`;
}

function createLookupInvalidError(message) {
  const error = new Error(message);
  error.code = "EV_LA_LOOKUP_INVALID";
  return error;
}

function isLookupObject(lookup) {
  return lookup !== null && typeof lookup === "object" && !Array.isArray(lookup);
}

function getBattedBallCount(row) {
  const count = Number(row?.battedBalls);
  return Number.isFinite(count) && count > 0 ? count : 0;
}

function normalizeProbabilityVector(raw) {
  const probabilities = {};
  let total = 0;

  for (const field of RESULT_FIELDS) {
    const value = Number(raw?.[field.probability]);
    const safeValue = Number.isFinite(value) && value > 0 ? value : 0;
    probabilities[field.probability] = safeValue;
    total += safeValue;
  }

  if (total <= 0) return null;

  for (const field of RESULT_FIELDS) {
    probabilities[field.probability] /= total;
  }

  return probabilities;
}

function scaleCountsToBattedBalls(values, battedBalls) {
  const total = Object.values(values).reduce((sum, value) => sum + value, 0);
  if (total <= 0 || battedBalls <= 0) return null;

  const counts = {};
  for (const field of RESULT_FIELDS) {
    counts[field.probability] =
      (values[field.probability] / total) * battedBalls;
  }

  return counts;
}

function readNonNegativeFields(row, propertyName) {
  const values = {};

  for (const field of RESULT_FIELDS) {
    const value = Number(row?.[field[propertyName]]);
    if (!Number.isFinite(value) || value < 0) return null;
    values[field.probability] = value;
  }

  return values;
}

function getOutcomeCounts(row) {
  const battedBalls = getBattedBallCount(row);
  if (battedBalls <= 0) return null;

  const rawCounts = readNonNegativeFields(row, "count");
  const scaledRawCounts = rawCounts
    ? scaleCountsToBattedBalls(rawCounts, battedBalls)
    : null;
  if (scaledRawCounts) return scaledRawCounts;

  const rates = readNonNegativeFields(row, "rate");
  return rates ? scaleCountsToBattedBalls(rates, battedBalls) : null;
}

function parseEvLaKey(key) {
  const parts = String(key).split("|");
  if (parts.length !== 2) return null;

  const ev = Number(parts[0]);
  const la = Number(parts[1]);
  if (!Number.isFinite(ev) || !Number.isFinite(la)) return null;

  return { ev, la };
}

function buildLookupCache(lookup) {
  if (!isLookupObject(lookup)) {
    throw createLookupInvalidError("EV/LA lookup must be a non-array object.");
  }

  const entries = Object.entries(lookup);
  if (entries.length === 0) {
    throw createLookupInvalidError("EV/LA lookup is empty.");
  }

  const validCells = [];
  let parseableCellCount = 0;

  for (const [key, row] of entries) {
    const parsed = parseEvLaKey(key);
    if (!parsed) continue;
    parseableCellCount += 1;

    const counts = getOutcomeCounts(row);
    if (!counts) continue;

    validCells.push({
      key,
      ev: parsed.ev,
      la: parsed.la,
      row,
      counts,
      battedBalls: getBattedBallCount(row),
    });
  }

  if (parseableCellCount === 0) {
    throw createLookupInvalidError(
      "EV/LA lookup has no parseable EV|LA keys."
    );
  }

  if (validCells.length === 0) {
    throw createLookupInvalidError(
      "EV/LA lookup has no cells with a valid batted-ball distribution."
    );
  }

  return {
    resultCache: new Map(),
    validCells,
    parseableCellCount,
  };
}

function getLookupCache(lookup) {
  if (!isLookupObject(lookup)) {
    throw createLookupInvalidError("EV/LA lookup must be a non-array object.");
  }

  let cache = lookupCaches.get(lookup);
  if (!cache) {
    cache = buildLookupCache(lookup);
    lookupCaches.set(lookup, cache);
  }

  return cache;
}

export function validateEvLaLookup(lookup) {
  const cache = getLookupCache(lookup);

  return {
    parseableCellCount: cache.parseableCellCount,
    validCellCount: cache.validCells.length,
  };
}

function distanceSquared(targetEv, targetLa, ev, la) {
  const evDistance = Math.abs(ev - targetEv);
  const laDistance = Math.abs(la - targetLa);
  const evScale = evDistance / SMOOTHING_CONFIG.evBandwidth;
  const laScale = laDistance / SMOOTHING_CONFIG.laBandwidth;

  return {
    distanceSquared: evScale ** 2 + laScale ** 2,
    evDistance,
    laDistance,
  };
}

function gaussianWeight(value) {
  return Math.exp(-0.5 * value);
}

function createNeighborAccumulator(metadata) {
  return {
    ...metadata,
    weightedCounts: Object.fromEntries(
      RESULT_FIELDS.map((field) => [field.probability, 0])
    ),
    neighborCount: 0,
    neighborBattedBalls: 0,
    weightedNeighborBattedBalls: 0,
    sumSquaredWeightedSamples: 0,
  };
}

function addNeighbor(accumulator, cell, weight) {
  if (!cell || !cell.counts || weight <= 0 || !Number.isFinite(weight)) {
    return;
  }

  for (const field of RESULT_FIELDS) {
    accumulator.weightedCounts[field.probability] +=
      cell.counts[field.probability] * weight;
  }

  accumulator.neighborCount += 1;
  accumulator.neighborBattedBalls += cell.battedBalls;
  accumulator.weightedNeighborBattedBalls += cell.battedBalls * weight;
  accumulator.sumSquaredWeightedSamples +=
    cell.battedBalls * weight ** 2;
}

function calculateEffectiveSampleSize(accumulator) {
  const sumWeightedSamples = accumulator.weightedNeighborBattedBalls;
  const denominator = accumulator.sumSquaredWeightedSamples;

  if (sumWeightedSamples <= 0 || denominator <= 0) return 0;
  return (sumWeightedSamples ** 2) / denominator;
}

function finalizeNeighbors(accumulator) {
  const neighborEffectiveSampleSize =
    calculateEffectiveSampleSize(accumulator);
  const probabilities = normalizeProbabilityVector(
    accumulator.weightedCounts
  );

  return {
    ...accumulator,
    neighborEffectiveSampleSize,
    probabilities,
  };
}

function isSearchStageSatisfied(neighbors, stage) {
  return (
    neighbors.neighborCount >= stage.minNeighborCells &&
    neighbors.neighborEffectiveSampleSize >= stage.minEffectiveSampleSize
  );
}

function collectRangeNeighbors({ lookup, targetEv, targetLa, stage, stageIndex }) {
  const accumulator = createNeighborAccumulator({
    neighborMode: stage.mode,
    expansionLevel: stageIndex,
    searchRange: {
      evRadius: stage.evRadius,
      laRadius: stage.laRadius,
    },
    nearestDistanceSquared: null,
    nearestEvDistance: null,
    nearestLaDistance: null,
  });

  const minEv = Math.max(EV_MIN, targetEv - stage.evRadius);
  const maxEv = Math.min(EV_MAX, targetEv + stage.evRadius);
  const minLa = Math.max(LA_MIN, targetLa - stage.laRadius);
  const maxLa = Math.min(LA_MAX, targetLa + stage.laRadius);

  for (let ev = minEv; ev <= maxEv; ev += 1) {
    for (let la = minLa; la <= maxLa; la += 1) {
      if (ev === targetEv && la === targetLa) continue;

      const key = `${ev}|${la}`;
      const row = lookup[key];
      const counts = getOutcomeCounts(row);
      if (!counts) continue;

      const distance = distanceSquared(targetEv, targetLa, ev, la);
      addNeighbor(
        accumulator,
        {
          key,
          ev,
          la,
          row,
          counts,
          battedBalls: getBattedBallCount(row),
        },
        gaussianWeight(distance.distanceSquared)
      );
    }
  }

  return finalizeNeighbors(accumulator);
}

function insertNearestCell(cells, candidate, maxCells) {
  let insertAt = cells.length;

  for (let index = 0; index < cells.length; index += 1) {
    const current = cells[index];
    if (
      candidate.distanceSquared < current.distanceSquared ||
      (candidate.distanceSquared === current.distanceSquared &&
        candidate.cell.key < current.cell.key)
    ) {
      insertAt = index;
      break;
    }
  }

  if (insertAt >= maxCells && cells.length >= maxCells) return;
  cells.splice(insertAt, 0, candidate);
  if (cells.length > maxCells) cells.pop();
}

function collectDistantNeighbors({ cache, targetEv, targetLa, targetKey }) {
  const nearestCells = [];

  for (const cell of cache.validCells) {
    if (cell.key === targetKey) continue;

    const distance = distanceSquared(targetEv, targetLa, cell.ev, cell.la);
    insertNearestCell(
      nearestCells,
      { cell, ...distance },
      SMOOTHING_CONFIG.distantMaxNeighborCells
    );
  }

  const nearest = nearestCells[0] || null;
  const accumulator = createNeighborAccumulator({
    neighborMode: "distant",
    expansionLevel: SMOOTHING_CONFIG.searchStages.length,
    searchRange: null,
    nearestDistanceSquared: nearest?.distanceSquared ?? null,
    nearestEvDistance: nearest?.evDistance ?? null,
    nearestLaDistance: nearest?.laDistance ?? null,
  });

  for (const candidate of nearestCells) {
    const relativeDistanceSquared =
      candidate.distanceSquared - nearest.distanceSquared;
    addNeighbor(
      accumulator,
      candidate.cell,
      gaussianWeight(relativeDistanceSquared)
    );

    const effectiveSampleSize = calculateEffectiveSampleSize(accumulator);
    if (
      accumulator.neighborCount >=
        SMOOTHING_CONFIG.distantMinNeighborCells &&
      effectiveSampleSize >=
        SMOOTHING_CONFIG.distantMinEffectiveSampleSize
    ) {
      break;
    }
  }

  return finalizeNeighbors(accumulator);
}

function findNeighborDistribution({ lookup, cache, key }) {
  const target = parseEvLaKey(key);
  if (!target) {
    throw createLookupInvalidError(`Invalid EV/LA target key: ${key}`);
  }

  for (
    let stageIndex = 0;
    stageIndex < SMOOTHING_CONFIG.searchStages.length;
    stageIndex += 1
  ) {
    const stage = SMOOTHING_CONFIG.searchStages[stageIndex];
    const neighbors = collectRangeNeighbors({
      lookup,
      targetEv: target.ev,
      targetLa: target.la,
      stage,
      stageIndex,
    });

    if (isSearchStageSatisfied(neighbors, stage)) return neighbors;
  }

  return collectDistantNeighbors({
    cache,
    targetEv: target.ev,
    targetLa: target.la,
    targetKey: key,
  });
}

function applyPhysicalConstraints(probabilities, launchAngle) {
  const normalized = normalizeProbabilityVector(probabilities);
  if (!normalized) {
    throw createLookupInvalidError(
      "EV/LA outcome distribution could not be normalized."
    );
  }

  const physicalConstraints = [];
  if (!(Number(launchAngle) < 0)) {
    return { probabilities: normalized, physicalConstraints };
  }

  physicalConstraints.push("negative_launch_angle_no_direct_home_run");
  normalized.homeRun = 0;

  const remainingTotal =
    normalized.out +
    normalized.single +
    normalized.double +
    normalized.triple;

  if (remainingTotal <= 0) {
    return {
      probabilities: {
        out: 1,
        single: 0,
        double: 0,
        triple: 0,
        homeRun: 0,
      },
      physicalConstraints,
    };
  }

  normalized.out /= remainingTotal;
  normalized.single /= remainingTotal;
  normalized.double /= remainingTotal;
  normalized.triple /= remainingTotal;

  return { probabilities: normalized, physicalConstraints };
}

function createSmoothingDetails({
  targetBattedBalls,
  neighbors,
  effectivePriorStrength,
  targetWeight,
  physicalConstraints,
}) {
  const configuredPriorStrength = SMOOTHING_CONFIG.priorStrength;
  const configuredReliability =
    targetBattedBalls > 0
      ? targetBattedBalls /
        (targetBattedBalls + configuredPriorStrength)
      : 0;

  return {
    applied: Boolean(neighbors?.probabilities && effectivePriorStrength > 0),
    targetBattedBalls,
    neighborMode: neighbors?.neighborMode || null,
    expansionLevel: neighbors?.expansionLevel ?? null,
    searchRange: neighbors?.searchRange || null,
    neighborCount: neighbors?.neighborCount || 0,
    neighborBattedBalls: neighbors?.neighborBattedBalls || 0,
    weightedNeighborBattedBalls:
      neighbors?.weightedNeighborBattedBalls || 0,
    neighborEffectiveSampleSize:
      neighbors?.neighborEffectiveSampleSize || 0,
    configuredPriorStrength,
    effectivePriorStrength,
    configuredReliability,
    targetWeight,
    nearestDistanceSquared: neighbors?.nearestDistanceSquared ?? null,
    nearestEvDistance: neighbors?.nearestEvDistance ?? null,
    nearestLaDistance: neighbors?.nearestLaDistance ?? null,
    physicalConstraints,
    reliability: configuredReliability,
    effectiveReliability: targetWeight,
  };
}

function calculateSmoothedOutcome({ lookup, cache, key, row, launchAngle }) {
  const targetCounts = getOutcomeCounts(row);
  const targetBattedBalls = targetCounts ? getBattedBallCount(row) : 0;
  const neighbors = findNeighborDistribution({ lookup, cache, key });
  const hasNeighborDistribution = Boolean(neighbors?.probabilities);

  if (targetBattedBalls <= 0 && !hasNeighborDistribution) {
    throw createLookupInvalidError(
      `No valid target or neighbor distribution is available for ${key}.`
    );
  }

  const effectivePriorStrength = hasNeighborDistribution
    ? Math.min(
        SMOOTHING_CONFIG.priorStrength,
        neighbors.neighborEffectiveSampleSize
      )
    : 0;
  const denominator = targetBattedBalls + effectivePriorStrength;
  const targetWeight = denominator > 0 ? targetBattedBalls / denominator : 0;
  let probabilities;
  let source;

  if (targetBattedBalls <= 0) {
    probabilities = neighbors.probabilities;
    source = "ev_la_neighbor";
  } else if (!hasNeighborDistribution || effectivePriorStrength <= 0) {
    probabilities = normalizeProbabilityVector(targetCounts);
    source = "ev_la_smoothed";
  } else {
    const smoothedCounts = {};

    for (const field of RESULT_FIELDS) {
      smoothedCounts[field.probability] =
        targetCounts[field.probability] +
        neighbors.probabilities[field.probability] *
          effectivePriorStrength;
    }

    probabilities = normalizeProbabilityVector(smoothedCounts);
    source = "ev_la_smoothed";
  }

  const constrained = applyPhysicalConstraints(probabilities, launchAngle);
  const smoothing = createSmoothingDetails({
    targetBattedBalls,
    neighbors,
    effectivePriorStrength,
    targetWeight,
    physicalConstraints: constrained.physicalConstraints,
  });

  return {
    key,
    source,
    sampleQuality:
      row?.sampleQuality || (targetBattedBalls > 0 ? "unknown" : "none"),
    probabilities: constrained.probabilities,
    row: row || null,
    smoothing,
    neighborCount: smoothing.neighborCount,
    neighborBattedBalls: smoothing.neighborBattedBalls,
  };
}

export function getEvLaKey(exitVelocity, launchAngle) {
  return `${makeEvBin(exitVelocity)}|${makeLaBin(launchAngle)}`;
}

export function getLegacyEvLaKey(exitVelocity, launchAngle) {
  return `${makeLegacyEvBin(exitVelocity)}|${makeLegacyLaBin(launchAngle)}`;
}

export function getEvLaOutcomeProbabilities({
  exitVelocity,
  launchAngle,
  lookup,
}) {
  const cache = getLookupCache(lookup);
  const key = getEvLaKey(exitVelocity, launchAngle);
  const constraintKey = Number(launchAngle) < 0 ? "negative" : "nonnegative";
  const resultCacheKey = `${key}|${constraintKey}`;
  const cached = cache.resultCache.get(resultCacheKey);
  if (cached) return cached;

  const row = lookup[key] || null;
  const result = calculateSmoothedOutcome({
    lookup,
    cache,
    key,
    row,
    launchAngle,
  });

  cache.resultCache.set(resultCacheKey, result);
  return result;
}
