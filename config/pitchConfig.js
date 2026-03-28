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
};

export function getPitchTypeAdjustments(pitchType) {
  return PITCH_CONFIG.types[pitchType] || PITCH_CONFIG.defaultAdjustments;
}

export function getPitchTypeLabel(pitchType) {
  return PITCH_CONFIG.types[pitchType]?.label || pitchType;
}