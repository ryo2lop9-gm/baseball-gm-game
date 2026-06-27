function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

const TRUSTED_SAMPLE_QUALITIES = new Set(["good", "low_sample"]);
const INTERPOLATION_RANGES = [
  { evRadius: 3, laRadius: 5 },
  { evRadius: 5, laRadius: 10 },
];

function makeEvBin(exitVelocity) {
  const ev = Number(exitVelocity);

  if (!Number.isFinite(ev)) return "85";
  return String(Math.round(clamp(ev, 50, 120)));
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
  return String(Math.round(clamp(la, -90, 90)));
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

function normalizeProbabilities(raw) {
  const out = clamp(Number(raw?.outRate ?? 0.7), 0, 1);
  const single = clamp(Number(raw?.singleRate ?? 0.2), 0, 1);
  const double = clamp(Number(raw?.doubleRate ?? 0.05), 0, 1);
  const triple = clamp(Number(raw?.tripleRate ?? 0.005), 0, 1);
  const homeRun = clamp(Number(raw?.hrRate ?? 0.02), 0, 1);

  const total = out + single + double + triple + homeRun;

  if (total <= 0) {
    return {
      out: 0.7,
      single: 0.2,
      double: 0.07,
      triple: 0.005,
      homeRun: 0.025,
    };
  }

  return {
    out: out / total,
    single: single / total,
    double: double / total,
    triple: triple / total,
    homeRun: homeRun / total,
  };
}

function getFallbackOutcome(key) {
  return {
    key,
    source: "fallback",
    sampleQuality: "missing",
    probabilities: {
      out: 0.7,
      single: 0.2,
      double: 0.07,
      triple: 0.005,
      homeRun: 0.025,
    },
  };
}

function isTrustedLookupRow(row) {
  return (
    row &&
    TRUSTED_SAMPLE_QUALITIES.has(row.sampleQuality) &&
    Number(row.battedBalls) > 0
  );
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

function collectInterpolationNeighbors({ lookup, targetEv, targetLa, evRadius, laRadius }) {
  const neighbors = [];

  for (let ev = targetEv - evRadius; ev <= targetEv + evRadius; ev += 1) {
    for (let la = targetLa - laRadius; la <= targetLa + laRadius; la += 1) {
      if (ev === targetEv && la === targetLa) continue;

      const row = getLookupRowByEvLa(lookup, ev, la);
      if (!isTrustedLookupRow(row)) continue;

      const evDistance = Math.abs(ev - targetEv);
      const laDistance = Math.abs(la - targetLa);
      const battedBalls = Number(row.battedBalls);
      const weight = battedBalls / (1 + evDistance + laDistance);

      if (weight > 0) {
        neighbors.push({
          row,
          weight,
          battedBalls,
        });
      }
    }
  }

  return neighbors;
}

function interpolateOutcomeRow({ lookup, key }) {
  const parsed = parseEvLaKey(key);
  if (!parsed) return null;

  let neighbors = [];

  for (const range of INTERPOLATION_RANGES) {
    neighbors = collectInterpolationNeighbors({
      lookup,
      targetEv: parsed.ev,
      targetLa: parsed.la,
      evRadius: range.evRadius,
      laRadius: range.laRadius,
    });

    if (neighbors.length > 0) break;
  }

  if (!neighbors.length) return null;

  const totals = {
    outRate: 0,
    singleRate: 0,
    doubleRate: 0,
    tripleRate: 0,
    hrRate: 0,
  };
  let totalWeight = 0;
  let neighborBattedBalls = 0;

  for (const neighbor of neighbors) {
    const { row, weight, battedBalls } = neighbor;

    totals.outRate += Number(row.outRate || 0) * weight;
    totals.singleRate += Number(row.singleRate || 0) * weight;
    totals.doubleRate += Number(row.doubleRate || 0) * weight;
    totals.tripleRate += Number(row.tripleRate || 0) * weight;
    totals.hrRate += Number(row.hrRate || 0) * weight;
    totalWeight += weight;
    neighborBattedBalls += battedBalls;
  }

  if (totalWeight <= 0) return null;

  return {
    outRate: totals.outRate / totalWeight,
    singleRate: totals.singleRate / totalWeight,
    doubleRate: totals.doubleRate / totalWeight,
    tripleRate: totals.tripleRate / totalWeight,
    hrRate: totals.hrRate / totalWeight,
    neighborCount: neighbors.length,
    neighborBattedBalls,
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
  const legacyKey = getLegacyEvLaKey(exitVelocity, launchAngle);
  const row = lookup?.[key] || lookup?.[legacyKey];

  if (isTrustedLookupRow(row)) {
    return {
      key: row === lookup?.[key] ? key : legacyKey,
      source: "ev_la_lookup",
      sampleQuality: row.sampleQuality,
      probabilities: normalizeProbabilities(row),
      row,
    };
  }

  const interpolatedRow = interpolateOutcomeRow({ lookup, key });

  if (interpolatedRow) {
    return {
      key,
      source: "ev_la_interpolated",
      sampleQuality: "interpolated",
      probabilities: normalizeProbabilities(interpolatedRow),
      row: {
        ev: parseEvLaKey(key)?.ev,
        la: parseEvLaKey(key)?.la,
        sampleQuality: "interpolated",
        ...interpolatedRow,
      },
      neighborCount: interpolatedRow.neighborCount,
      neighborBattedBalls: interpolatedRow.neighborBattedBalls,
    };
  }

  if (!row) {
    return getFallbackOutcome(key);
  }

  return getFallbackOutcome(key);
}
