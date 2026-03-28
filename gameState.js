function emptyQoC() {
  return {
    Weak: 0,
    Topped: 0,
    Under: 0,
    Flare: 0,
    Solid: 0,
    Barrel: 0,
  };
}

function emptyTeamBattingBox() {
  return {
    runs: 0,
    hits: 0,
    doubles: 0,
    triples: 0,
    hr: 0,
    walks: 0,
    strikeouts: 0,
    outsInPlay: 0,
    qoc: emptyQoC(),
  };
}

function createPitcherUsageEntry(pitcher = null) {
  return {
    pitcherName: pitcher?.name || "-",
    pitches: 0,
    battersFaced: 0,
    outsRecorded: 0,
    enteredInning: 1,
  };
}

function clonePitcherForActiveUse(pitcher) {
  return pitcher ? structuredClone(pitcher) : null;
}

/**
 * 野球進行に必要な最小 runtime state
 * presentation / log / lastPitch は含めない
 */
export function createInitialRuntimeState(awayTeam, homeTeam) {
  const awayActivePitcher = clonePitcherForActiveUse(awayTeam.startingPitcher);
  const homeActivePitcher = clonePitcherForActiveUse(homeTeam.startingPitcher);

  return {
    awayTeam,
    homeTeam,

    inning: 1,
    half: "top",

    outs: 0,
    balls: 0,
    strikes: 0,

    bases: {
      first: null,
      second: null,
      third: null,
    },

    score: {
      away: 0,
      home: 0,
    },

    battingIndex: {
      away: 0,
      home: 0,
    },

    activePitchers: {
      away: awayActivePitcher,
      home: homeActivePitcher,
    },

    pitcherUsage: {
      away: createPitcherUsageEntry(awayActivePitcher),
      home: createPitcherUsageEntry(homeActivePitcher),
    },

    plateAppearanceActive: false,

    isComplete: false,
    finalInning: null,
    finalHalf: null,

    box: {
      away: emptyTeamBattingBox(),
      home: emptyTeamBattingBox(),
    },
  };
}

/**
 * 観戦用の通常 state
 * runtime に presentation を外付けする
 */
export function createInitialGameState(awayTeam, homeTeam) {
  const runtimeState = createInitialRuntimeState(awayTeam, homeTeam);
  return {
    ...runtimeState,
    presentation: {
      currentBatterName: awayTeam.lineup[0]?.name || "-",
      currentPitcherName: homeTeam.startingPitcher?.name || "-",
      log: ["試合準備完了"],
      lastPitch: {
        pitchType: "",
        course: "",
        isStrike: false,
        swung: false,
        madeContact: false,
        resultText: "",
        zoneRow: null,
        zoneCol: null,
      },
    },
  };
}

/**
 * 高速シミュ用の軽量 state
 */
export function createInitialSimState(awayTeam, homeTeam) {
  return createInitialRuntimeState(awayTeam, homeTeam);
}