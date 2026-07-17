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
  minWeightedNeighborBattedBalls: 25,
  searchRanges: Object.freeze([
    Object.freeze({ evRadius: 3, laRadius: 5 }),
    Object.freeze({ evRadius: 5, laRadius: 10 }),
    Object.freeze({ evRadius: 10, laRadius: 20 }),
  ]),
});

const RESULT_FIELDS = Object.freeze([
  { probability: "out", count: "outs", rate: "outRate" },
  { probability: "single", count: "singles", rate: "singleRate" },
  { probability: "double", count: "doubles", rate: "doubleRate" },
  { probability: "triple", count: "triples", rate: "tripleRate" },
  { probability: "homeRun", count: "hrs", rate: "hrRate" },
]);

const EMERGENCY_PROBABILITIES = Object.freeze({
  out: 0.7,
  single: 0.2,
  double: 0.07,
  triple: 0.005,
  homeRun: 0.025,
});

const smoothingCache = new WeakMap();
const emergencyWarningKeys = new WeakMap();
const nonObjectEmergencyWarningKeys = new Set();

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

function toNonNegativeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function normalizeProbabilities(raw) {
  const values = {};
  let total = 0;

  for (const field of RESULT_FIELDS) {
    const value = toNonNegativeNumber(raw?.[field.probability]);
    values[field.probability] = value;
    total += value;
  }

  if (total <= 0) {
    return { ...EMERGENCY_PROBABILITIES };
  }

  for (const field of RESULT_FIELDS) {
    values[field.probability] /= total;
  }

  return values;
}

function getBattedBallCount(row) {
  return Math.max(0, Number(row?.battedBalls) || 0);
}

function getOutcomeCounts(row) {
  const battedBalls = getBattedBallCount(row);
  const counts = {};
  let rawTotal = 0;

  for (const field of RESULT_FIELDS) {
    const value = toNonNegativeNumber(row?.[field.count]);
    counts[field.probability] = value;
    rawTotal += value;
  }

  if (battedBalls > 0 && rawTotal > 0) {
    return counts;
  }

  for (const field of RESULT_FIELDS) {
    counts[field.probability] =
      toNonNegativeNumber(row?.[field.rate]) * battedBalls;
  }

  return counts;
}

function parseEvLaKey(key) {
  const [evText, laText] = String(key).split("|");
  const ev = Number(evText);
  const la = Number(laText);

  if (!Number.isFinite(ev) || !Number.isFinite(la)) {
    return null;
  }

  return { ev, la };
}

function getLookupRowByEvLa(lookup, ev, la) {
  return lookup?.[`${ev}|${la}`] || null;
}

function gaussianWeight(evDistance, laDistance) {
  const evScale = evDistance / SMOOTHING_CONFIG.evBandwidth;
  const laScale = laDistance / SMOOTHING_CONFIG.laBandwidth;

  return Math.exp(-0.5 * (evScale ** 2 + laScale ** 2));
}

function collectNeighbors({ lookup, targetEv, targetLa, range }) {
  const weightedCounts = Object.fromEntries(
    RESULT_FIELDS.map((field) => [field.probability, 0])
  );
  let neighborCount = 0;
  let neighborBattedBalls = 0;
  let weightedNeighborBattedBalls = 0;

  const minEv = Math.max(EV_MIN, targetEv - range.evRadius);
  const maxEv = Math.min(EV_MAX, targetEv + range.evRadius);
  const minLa = Math.max(LA_MIN, targetLa - range.laRadius);
  const maxLa = Math.min(LA_MAX, targetLa + range.laRadius);

  for (let ev = minEv; ev <= maxEv; ev += 1) {
    for (let la = minLa; la <= maxLa; la += 1) {
      if (ev === targetEv && la === targetLa) continue;

      const row = getLookupRowByEvLa(lookup, ev, la);
      const battedBalls = getBattedBallCount(row);
      if (battedBalls <= 0) continue;

      const weight = gaussianWeight(
        Math.abs(ev - targetEv),
        Math.abs(la - targetLa)
      );
      if (weight <= 0) continue;

      const counts = getOutcomeCounts(row);

      for (const field of RESULT_FIELDS) {
        weightedCounts[field.probability] +=
          counts[field.probability] * weight;
      }

      neighborCount += 1;
      neighborBattedBalls += battedBalls;
      weightedNeighborBattedBalls += battedBalls * weight;
    }
  }

  return {
    weightedCounts,
    neighborCount,
    neighborBattedBalls,
    weightedNeighborBattedBalls,
    searchRange: { ...range },
  };
}

function findNeighborDistribution({ lookup, key }) {
  const target = parseEvLaKey(key);
  if (!target) return null;

  let candidate = null;

  for (const range of SMOOTHING_CONFIG.searchRanges) {
    candidate = collectNeighbors({
      lookup,
      targetEv: target.ev,
      targetLa: target.la,
      range,
    });

    if (
      candidate.weightedNeighborBattedBalls >=
      SMOOTHING_CONFIG.minWeightedNeighborBattedBalls
    ) {
      break;
    }
  }

  if (!candidate || candidate.weightedNeighborBattedBalls <= 0) {
    return candidate;
  }

  return {
    ...candidate,
    probabilities: normalizeProbabilities(candidate.weightedCounts),
  };
}

function getLookupCache(lookup) {
  if (!lookup || (typeof lookup !== "object" && typeof lookup !== "function")) {
    return null;
  }

  let cache = smoothingCache.get(lookup);
  if (!cache) {
    cache = new Map();
    smoothingCache.set(lookup, cache);
  }

  return cache;
}

function warnEmergencyFallbackOnce(lookup, key) {
  let warningKeys = nonObjectEmergencyWarningKeys;

  if (lookup && (typeof lookup === "object" || typeof lookup === "function")) {
    warningKeys = emergencyWarningKeys.get(lookup);
    if (!warningKeys) {
      warningKeys = new Set();
      emergencyWarningKeys.set(lookup, warningKeys);
    }
  }

  if (warningKeys.has(key)) return;
  warningKeys.add(key);
  console.warn(
    `EV/LA emergency fallback used for ${key}: no target or neighbor samples.`
  );
}

function createSmoothingDetails({
  targetBattedBalls,
  neighbors,
  effectivePriorStrength,
  applied,
}) {
  const configuredPrior = SMOOTHING_CONFIG.priorStrength;
  const reliability =
    targetBattedBalls > 0
      ? targetBattedBalls / (targetBattedBalls + configuredPrior)
      : 0;
  const effectiveReliability =
    targetBattedBalls + effectivePriorStrength > 0
      ? targetBattedBalls /
        (targetBattedBalls + effectivePriorStrength)
      : 0;

  return {
    applied,
    targetBattedBalls,
    neighborCount: neighbors?.neighborCount || 0,
    neighborBattedBalls: neighbors?.neighborBattedBalls || 0,
    weightedNeighborBattedBalls:
      neighbors?.weightedNeighborBattedBalls || 0,
    effectivePriorStrength,
    reliability,
    effectiveReliability,
    searchRange: neighbors?.searchRange || null,
  };
}

function createEmergencyOutcome({ lookup, key, row, neighbors }) {
  warnEmergencyFallbackOnce(lookup, key);

  return {
    key,
    source: "ev_la_emergency_fallback",
    sampleQuality: row?.sampleQuality || "none",
    probabilities: normalizeProbabilities(EMERGENCY_PROBABILITIES),
    row: row || null,
    smoothing: createSmoothingDetails({
      targetBattedBalls: 0,
      neighbors,
      effectivePriorStrength: 0,
      applied: false,
    }),
    neighborCount: neighbors?.neighborCount || 0,
    neighborBattedBalls: neighbors?.neighborBattedBalls || 0,
  };
}

function calculateSmoothedOutcome({ lookup, key, row }) {
  const targetBattedBalls = getBattedBallCount(row);
  const targetCounts = getOutcomeCounts(row);
  const neighbors = findNeighborDistribution({ lookup, key });
  const weightedNeighborBattedBalls =
    neighbors?.weightedNeighborBattedBalls || 0;

  if (targetBattedBalls <= 0 && weightedNeighborBattedBalls <= 0) {
    return createEmergencyOutcome({ lookup, key, row, neighbors });
  }

  const effectivePriorStrength = Math.min(
    SMOOTHING_CONFIG.priorStrength,
    weightedNeighborBattedBalls
  );
  const smoothingApplied = effectivePriorStrength > 0;
  let probabilities;
  let source;

  if (targetBattedBalls <= 0) {
    probabilities = neighbors.probabilities;
    source = "ev_la_neighbor";
  } else if (!smoothingApplied) {
    probabilities = normalizeProbabilities(targetCounts);
    source = "ev_la_smoothed";
  } else {
    const denominator = targetBattedBalls + effectivePriorStrength;
    const smoothedCounts = {};

    for (const field of RESULT_FIELDS) {
      smoothedCounts[field.probability] =
        (targetCounts[field.probability] +
          neighbors.probabilities[field.probability] *
            effectivePriorStrength) /
        denominator;
    }

    probabilities = normalizeProbabilities(smoothedCounts);
    source = "ev_la_smoothed";
  }

  const smoothing = createSmoothingDetails({
    targetBattedBalls,
    neighbors,
    effectivePriorStrength,
    applied: smoothingApplied,
  });

  return {
    key,
    source,
    sampleQuality:
      row?.sampleQuality || (targetBattedBalls > 0 ? "unknown" : "none"),
    probabilities,
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
  const key = getEvLaKey(exitVelocity, launchAngle);
  const cache = getLookupCache(lookup);
  const cached = cache?.get(key);
  if (cached) return cached;

  const legacyKey = getLegacyEvLaKey(exitVelocity, launchAngle);
  const row = lookup?.[key] || lookup?.[legacyKey] || null;
  const result = calculateSmoothedOutcome({ lookup, key, row });

  cache?.set(key, result);
  return result;
}
