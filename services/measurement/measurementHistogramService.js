export const MEASUREMENT_PERCENTILES = Object.freeze([
  0.1,
  0.25,
  0.5,
  0.75,
  0.9,
  0.95,
]);

export function createMeasurementHistogram(binWidth = 1) {
  return {
    binWidth: Number(binWidth) > 0 ? Number(binWidth) : 1,
    count: 0,
    sum: 0,
    sumSquares: 0,
    min: null,
    max: null,
    bins: Object.create(null),
  };
}

export function recordMeasurementHistogram(histogram, rawValue) {
  const value = Number(rawValue);
  if (!histogram || !Number.isFinite(value)) return false;

  const bin = Math.round(value / histogram.binWidth);
  histogram.bins[bin] = (histogram.bins[bin] || 0) + 1;
  histogram.count += 1;
  histogram.sum += value;
  histogram.sumSquares += value * value;
  histogram.min = histogram.min === null ? value : Math.min(histogram.min, value);
  histogram.max = histogram.max === null ? value : Math.max(histogram.max, value);
  return true;
}

export function mergeMeasurementHistogram(target, source) {
  if (!target || !source) return target;
  for (const [bin, count] of Object.entries(source.bins || {})) {
    target.bins[bin] = (target.bins[bin] || 0) + count;
  }
  target.count += source.count || 0;
  target.sum += source.sum || 0;
  target.sumSquares += source.sumSquares || 0;
  if (source.min !== null) {
    target.min = target.min === null ? source.min : Math.min(target.min, source.min);
    target.max = target.max === null ? source.max : Math.max(target.max, source.max);
  }
  return target;
}

export function percentileFromMeasurementHistogram(histogram, percentile) {
  if (!histogram?.count) return 0;
  const targetRank = Math.max(1, Math.ceil(histogram.count * percentile));
  let cumulative = 0;
  const bins = Object.keys(histogram.bins)
    .map(Number)
    .sort((a, b) => a - b);

  for (const bin of bins) {
    cumulative += histogram.bins[bin] || 0;
    if (cumulative >= targetRank) {
      return bin * histogram.binWidth;
    }
  }

  return histogram.max ?? 0;
}

export function finalizeMeasurementHistogram(histogram) {
  const count = histogram?.count || 0;
  const average = count > 0 ? histogram.sum / count : 0;
  const variance = count > 0
    ? Math.max(0, histogram.sumSquares / count - average * average)
    : 0;
  const percentiles = Object.fromEntries(
    MEASUREMENT_PERCENTILES.map((percentile) => [
      `p${Math.round(percentile * 100)}`,
      percentileFromMeasurementHistogram(histogram, percentile),
    ])
  );

  return {
    count,
    average,
    standardDeviation: Math.sqrt(variance),
    min: histogram?.min ?? 0,
    max: histogram?.max ?? 0,
    ...percentiles,
  };
}
