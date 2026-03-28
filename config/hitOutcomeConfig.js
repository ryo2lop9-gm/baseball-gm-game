export const HIT_PROBABILITIES = {
  Weak: { out: 0.89, single: 0.10, double: 0.01, triple: 0, hr: 0 },
  Topped: { out: 0.72, single: 0.26, double: 0.02, triple: 0, hr: 0 },
  Under: { out: 0.77, single: 0.14, double: 0.05, triple: 0.01, hr: 0.03 },
  Flare: { out: 0.46, single: 0.43, double: 0.10, triple: 0.005, hr: 0.005 },
  Solid: { out: 0.30, single: 0.33, double: 0.20, triple: 0.02, hr: 0.15 },
  Barrel: { out: 0.08, single: 0.08, double: 0.15, triple: 0.03, hr: 0.66 },
  Default: { out: 0.70, single: 0.22, double: 0.06, triple: 0.01, hr: 0.01 },
};

export function getHitTypeProbabilities(qoc) {
  return HIT_PROBABILITIES[qoc] || HIT_PROBABILITIES.Default;
}