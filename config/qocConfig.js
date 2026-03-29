export const QOC_CONFIG = {
  keys: ["Weak", "Topped", "Under", "Flare", "Solid", "Barrel"],

  baseWeightsByCourse: {
    A: {
      Weak: 0.09,
      Topped: 0.34,
      Under: 0.28,
      Flare: 0.20,
      Solid: 0.06,
      Barrel: 0.03,
    },
    B: {
      Weak: 0.05,
      Topped: 0.31,
      Under: 0.24,
      Flare: 0.25,
      Solid: 0.08,
      Barrel: 0.07,
    },
    C: {
      Weak: 0.03,
      Topped: 0.23,
      Under: 0.19,
      Flare: 0.28,
      Solid: 0.12,
      Barrel: 0.15,
    },
    Default: {
      Weak: 0.06,
      Topped: 0.30,
      Under: 0.23,
      Flare: 0.25,
      Solid: 0.08,
      Barrel: 0.08,
    },
  },

  tuning: {
    minWeight: 0.001,

    contactEffects: {
      Weak: -0.015,
      Topped: 0.0,
      Under: -0.01,
      Flare: 0.01,
      Solid: 0.012,
      Barrel: 0.0,
    },

    powerEffects: {
      Weak: 0.0,
      Topped: -0.01,
      Under: 0.0,
      Flare: 0.0,
      Solid: 0.008,
      Barrel: 0.02,
    },
  },
};

export const QOC_KEYS = QOC_CONFIG.keys;

export const QOC_WEIGHTS_BY_COURSE = QOC_CONFIG.baseWeightsByCourse;

export function getQoCWeightsByCourse(course) {
  return (
    QOC_CONFIG.baseWeightsByCourse[course] ||
    QOC_CONFIG.baseWeightsByCourse.Default
  );
}

export function getQoCTuning() {
  return QOC_CONFIG.tuning;
}