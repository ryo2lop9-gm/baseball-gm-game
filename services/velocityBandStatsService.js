import {
  VELOCITY_BANDS,
  getVelocityBandByVelocity,
} from "../config/velocityBandConfig.js";

function createEmptyStatLine() {
  return {
    PA: 0,
    AB: 0,
    H: 0,
    doubles: 0,
    triples: 0,
    HR: 0,
    BB: 0,
    K: 0,
    totalBases: 0,
  };
}

export function createEmptyVelocityBandStats() {
  return VELOCITY_BANDS.reduce((stats, band) => {
    stats[band.id] = {
      bandId: band.id,
      label: band.label,
      ...createEmptyStatLine(),
    };
    return stats;
  }, {});
}

function calculateTotalBases({ H = 0, doubles = 0, triples = 0, HR = 0 }) {
  const singles = Math.max(0, H - doubles - triples - HR);
  return singles + doubles * 2 + triples * 3 + HR * 4;
}

function ensureVelocityBandStats(target) {
  if (!target || typeof target !== "object") {
    return createEmptyVelocityBandStats();
  }

  for (const band of VELOCITY_BANDS) {
    if (!target[band.id]) {
      target[band.id] = {
        bandId: band.id,
        label: band.label,
        ...createEmptyStatLine(),
      };
    }
  }

  return target;
}

export function recordVelocityBandPlateAppearance(stats, pitchVelocity, result = {}) {
  const nextStats = ensureVelocityBandStats(stats);
  const band = getVelocityBandByVelocity(pitchVelocity);

  if (!band) {
    return nextStats;
  }

  const line = nextStats[band.id];
  line.PA += result.PA || 0;
  line.AB += result.AB || 0;
  line.H += result.H || 0;
  line.doubles += result.doubles || 0;
  line.triples += result.triples || 0;
  line.HR += result.HR || 0;
  line.BB += result.BB || 0;
  line.K += result.K || 0;
  line.totalBases += result.totalBases ?? calculateTotalBases(result);

  return nextStats;
}

function formatRate(numerator, denominator) {
  if (!denominator || denominator <= 0) return ".000";
  return (numerator / denominator).toFixed(3);
}

export function createVelocityBandStatsRows(stats) {
  const source = ensureVelocityBandStats(stats);

  return VELOCITY_BANDS.map((band) => {
    const line = source[band.id];
    const avg = formatRate(line.H, line.AB);
    const obp = formatRate(line.H + line.BB, line.PA);
    const slg = formatRate(line.totalBases, line.AB);
    const ops = (Number(obp) + Number(slg)).toFixed(3);

    return {
      bandId: band.id,
      label: band.label,
      PA: line.PA,
      AB: line.AB,
      H: line.H,
      doubles: line.doubles,
      triples: line.triples,
      HR: line.HR,
      BB: line.BB,
      K: line.K,
      AVG: avg,
      OBP: obp,
      SLG: slg,
      OPS: ops,
    };
  });
}
