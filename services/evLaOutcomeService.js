function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function makeEvBin(exitVelocity) {
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

export function getEvLaKey(exitVelocity, launchAngle) {
  return `${makeEvBin(exitVelocity)}|${makeLaBin(launchAngle)}`;
}

export function getEvLaOutcomeProbabilities({
  exitVelocity,
  launchAngle,
  lookup,
}) {
  const key = getEvLaKey(exitVelocity, launchAngle);
  const row = lookup?.[key];

  if (!row) {
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

  return {
    key,
    source: "ev_la_lookup",
    sampleQuality: row.sampleQuality,
    probabilities: normalizeProbabilities(row),
    row,
  };
}