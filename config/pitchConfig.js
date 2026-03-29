export const PITCH_CONFIG = {
  types: {
    fourSeam: {
      label: "4シーム",
      strikeRate: 0.015,
      oSwing: -0.005,
      zContact: 0.01,
      oContact: -0.01,
      weak: -0.01,
      topped: -0.01,
      under: 0.02,
      flare: 0,
      solid: 0,
      barrel: 0,
    },
    slider: {
      label: "スライダー",
      strikeRate: -0.01,
      oSwing: 0.025,
      zContact: -0.03,
      oContact: -0.05,
      weak: 0.01,
      topped: 0.03,
      under: -0.01,
      flare: -0.01,
      solid: -0.01,
      barrel: -0.01,
    },
    curve: {
      label: "カーブ",
      strikeRate: -0.015,
      oSwing: 0.015,
      zContact: -0.015,
      oContact: -0.03,
      weak: 0.015,
      topped: 0,
      under: 0.02,
      flare: 0,
      solid: -0.015,
      barrel: -0.015,
    },
    fork: {
      label: "フォーク",
      strikeRate: -0.03,
      oSwing: 0.04,
      zContact: -0.05,
      oContact: -0.07,
      weak: 0.02,
      topped: 0.05,
      under: -0.02,
      flare: -0.02,
      solid: -0.015,
      barrel: -0.015,
    },
  },

  defaultAdjustments: {
    strikeRate: 0,
    oSwing: 0,
    zContact: 0,
    oContact: 0,
    weak: 0,
    topped: 0,
    under: 0,
    flare: 0,
    solid: 0,
    barrel: 0,
  },

  controlRanks: {
    S: { min: 90 },
    A: { min: 80 },
    B: { min: 70 },
    C: { min: 60 },
    D: { min: 50 },
    E: { min: 40 },
    F: { min: 30 },
    G: { min: -Infinity },
  },

  baseStrikeRateByControl: {
    base: 0.48,
    spread: 0.03,
    min: 0.45,
    max: 0.51,
  },

  courseWeightsByRank: {
    S: { A: 0.54, B: 0.41, C: 0.05 },
    A: { A: 0.49, B: 0.44, C: 0.07 },
    B: { A: 0.42, B: 0.48, C: 0.10 },
    C: { A: 0.35, B: 0.51, C: 0.14 },
    D: { A: 0.29, B: 0.52, C: 0.19 },
    E: { A: 0.22, B: 0.53, C: 0.25 },
    F: { A: 0.16, B: 0.53, C: 0.31 },
    G: { A: 0.10, B: 0.52, C: 0.38 },
  },

  countSwingAdjustments: {
    "0-0": { z: 0.02, o: -0.01 },
    "1-0": { z: 0.01, o: 0.015 },
    "2-0": { z: -0.01, o: 0.04 },
    "3-0": { z: -0.05, o: -0.02 },
    "0-1": { z: 0.005, o: 0.015 },
    "1-1": { z: 0.005, o: 0.015 },
    "2-1": { z: -0.005, o: 0.035 },
    "3-1": { z: -0.015, o: 0.03 },
    "0-2": { z: 0.02, o: 0.02 },
    "1-2": { z: 0.02, o: 0.02 },
    "2-2": { z: 0.01, o: 0.02 },
    "3-2": { z: -0.01, o: 0.01 },
  },

  outcomeRates: {
    strikeRateByCourse: {
      Ball: 0.08,
      A: 0.82,
      B: 0.63,
      C: 0.48,
    },

    baseZSwingByCourse: {
      A: 0.72,
      B: 0.68,
      C: 0.63,
      Ball: 0.24,
    },

    baseOSwingByCourse: {
      Ball: 0.26,
      default: 0.19,
    },

    baseZContactByCourse: {
      A: 0.79,
      B: 0.84,
      C: 0.87,
    },

    baseOContactByCourse: {
      Ball: 0.56,
      default: 0.63,
    },

    tuning: {
      zSwing: {
        approach: 0.02,
        stuff: -0.01,
        min: 0.35,
        max: 0.9,
      },
      oSwing: {
        approach: -0.06,
        stuff: 0.015,
        min: 0.05,
        max: 0.6,
      },
      zContact: {
        contact: 0.09,
        stuff: -0.06,
        min: 0.52,
        max: 0.97,
      },
      oContact: {
        contact: 0.08,
        stuff: -0.07,
        min: 0.3,
        max: 0.9,
      },
      strikeRate: {
        ballPitchTypeScale: 0.15,
        min: 0.02,
        max: 0.98,
      },
    },
  },
};

export function getPitchTypeAdjustments(pitchType) {
  return PITCH_CONFIG.types[pitchType] || PITCH_CONFIG.defaultAdjustments;
}

export function getPitchTypeLabel(pitchType) {
  return PITCH_CONFIG.types[pitchType]?.label || pitchType;
}

export function getCountSwingAdjustment(key) {
  return PITCH_CONFIG.countSwingAdjustments[key] || { z: 0, o: 0 };
}