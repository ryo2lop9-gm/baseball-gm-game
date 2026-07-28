import {
  DEFENSIVE_LINEUP_POSITIONS,
  DESIGNATED_HITTER_POSITION,
} from "../config/defenseConfig.js";
import {
  createGameBatter,
  createGamePitcher,
  createPlayerDefense,
} from "./playerModels.js";

/**
 * teamModels.js の責務
 * - チーム構成を定義する
 * - 選手生成の詳細ロジックは playerModels.js に委譲する
 * - 最小リーグ用の複数球団セットを返せるようにする
 */

function createPitchMix({ fourSeam, slider, curve, fork }) {
  return {
    fourSeam: { usage: fourSeam.usage, velocity: fourSeam.velocity },
    slider: { usage: slider.usage, velocity: slider.velocity },
    curve: { usage: curve.usage, velocity: curve.velocity },
    fork: { usage: fork.usage, velocity: fork.velocity },
  };
}

function createBullpenPitchers(configs) {
  return configs.map((cfg) =>
    createGamePitcher(cfg.name, cfg.control, cfg.stuff, cfg.pitchMix)
  );
}

function createGameableTeam(team) {
  const battingPositions = [
    ...DEFENSIVE_LINEUP_POSITIONS,
    DESIGNATED_HITTER_POSITION,
  ];
  const lineup = team.lineup.map((player, index) => ({
    ...player,
    defense: createPlayerDefense({
      primaryPosition: battingPositions[index],
    }),
  }));
  const defensiveAlignment = Object.fromEntries(
    DEFENSIVE_LINEUP_POSITIONS.map((position, index) => [
      position,
      lineup[index].profile.id,
    ])
  );

  return {
    ...team,
    lineup,
    defensiveAlignment,
  };
}

function createTokyoWaves() {
  return createGameableTeam({
    name: "Tokyo Waves",
    startingPitcher: createGamePitcher("R. Sato", 58, 56, {
      fourSeam: 0.45,
      slider: 0.22,
      curve: 0.13,
      fork: 0.20,
    }),
    bullpen: createBullpenPitchers([
      {
        name: "Y. Kanda",
        control: 56,
        stuff: 61,
        pitchMix: {
          fourSeam: 0.48,
          slider: 0.31,
          curve: 0.08,
          fork: 0.13,
        },
      },
      {
        name: "S. Arai",
        control: 61,
        stuff: 54,
        pitchMix: {
          fourSeam: 0.42,
          slider: 0.23,
          curve: 0.17,
          fork: 0.18,
        },
      },
    ]),
    lineup: [
      createGameBatter("Akiyama", 58, 42, 56),
      createGameBatter("Mori", 60, 48, 54),
      createGameBatter("Hayashi", 55, 62, 50),
      createGameBatter("Kuroda", 52, 70, 47),
      createGameBatter("Nakamura", 57, 55, 53),
      createGameBatter("Ishii", 54, 50, 52),
      createGameBatter("Okada", 51, 58, 49),
      createGameBatter("Shimizu", 53, 44, 55),
      createGameBatter("Fujita", 49, 40, 51),
    ],
  });
}

function createOsakaComets() {
  return createGameableTeam({
    name: "Osaka Comets",
    startingPitcher: createGamePitcher("K. Tanaka", 55, 59, {
      fourSeam: 0.38,
      slider: 0.28,
      curve: 0.12,
      fork: 0.22,
    }),
    bullpen: createBullpenPitchers([
      {
        name: "D. Muroi",
        control: 53,
        stuff: 64,
        pitchMix: {
          fourSeam: 0.44,
          slider: 0.34,
          curve: 0.07,
          fork: 0.15,
        },
      },
      {
        name: "T. Kiyota",
        control: 60,
        stuff: 55,
        pitchMix: {
          fourSeam: 0.40,
          slider: 0.21,
          curve: 0.16,
          fork: 0.23,
        },
      },
    ]),
    lineup: [
      createGameBatter("Yamada", 57, 45, 57),
      createGameBatter("Inoue", 59, 50, 55),
      createGameBatter("Kobayashi", 54, 66, 49),
      createGameBatter("Ando", 53, 72, 46),
      createGameBatter("Ito", 56, 54, 53),
      createGameBatter("Sakai", 55, 51, 52),
      createGameBatter("Hara", 50, 57, 50),
      createGameBatter("Ueda", 52, 46, 54),
      createGameBatter("Maeda", 48, 41, 52),
    ],
  });
}

function createNagoyaArrows() {
  return createGameableTeam({
    name: "Nagoya Arrows",
    startingPitcher: createGamePitcher("T. Suzuki", 61, 54, {
      fourSeam: 0.43,
      slider: 0.24,
      curve: 0.15,
      fork: 0.18,
    }),
    bullpen: createBullpenPitchers([
      {
        name: "K. Oshima",
        control: 59,
        stuff: 57,
        pitchMix: {
          fourSeam: 0.41,
          slider: 0.28,
          curve: 0.14,
          fork: 0.17,
        },
      },
      {
        name: "R. Fujimori",
        control: 55,
        stuff: 63,
        pitchMix: {
          fourSeam: 0.39,
          slider: 0.33,
          curve: 0.08,
          fork: 0.20,
        },
      },
    ]),
    lineup: [
      createGameBatter("Sato", 61, 44, 58),
      createGameBatter("Kondo", 63, 46, 60),
      createGameBatter("Takagi", 56, 64, 50),
      createGameBatter("Noda", 54, 73, 45),
      createGameBatter("Abe", 58, 57, 52),
      createGameBatter("Sugiyama", 55, 53, 51),
      createGameBatter("Ono", 52, 55, 49),
      createGameBatter("Mizuno", 51, 45, 54),
      createGameBatter("Yoshida", 50, 41, 53),
    ],
  });
}

function createFukuokaBlaze() {
  return createGameableTeam({
    name: "Fukuoka Blaze",
    startingPitcher: createGamePitcher("H. Yamamoto", 53, 62, {
      fourSeam: 0.36,
      slider: 0.30,
      curve: 0.10,
      fork: 0.24,
    }),
    bullpen: createBullpenPitchers([
      {
        name: "A. Nishi",
        control: 52,
        stuff: 66,
        pitchMix: {
          fourSeam: 0.43,
          slider: 0.29,
          curve: 0.06,
          fork: 0.22,
        },
      },
      {
        name: "M. Takase",
        control: 58,
        stuff: 56,
        pitchMix: {
          fourSeam: 0.37,
          slider: 0.25,
          curve: 0.18,
          fork: 0.20,
        },
      },
    ]),
    lineup: [
      createGameBatter("Kawasaki", 56, 47, 56),
      createGameBatter("Shiraishi", 58, 49, 55),
      createGameBatter("Noguchi", 55, 68, 48),
      createGameBatter("Matsuda", 52, 75, 44),
      createGameBatter("Fukuda", 57, 54, 52),
      createGameBatter("Imai", 54, 52, 51),
      createGameBatter("Kikuchi", 51, 58, 49),
      createGameBatter("Nakano", 53, 46, 53),
      createGameBatter("Morita", 49, 43, 50),
    ],
  });
}

function createMlbAverageLineup(prefix) {
  return [
    createGameBatter(`${prefix} Contact 1`, 57, 47, 58),
    createGameBatter(`${prefix} Table 2`, 59, 49, 60),
    createGameBatter(`${prefix} Balanced 3`, 60, 60, 56),
    createGameBatter(`${prefix} Power 4`, 56, 72, 50),
    createGameBatter(`${prefix} Power 5`, 55, 67, 51),
    createGameBatter(`${prefix} Average 6`, 54, 56, 53),
    createGameBatter(`${prefix} Low Contact 7`, 50, 58, 48),
    createGameBatter(`${prefix} Defense 8`, 51, 46, 52),
    createGameBatter(`${prefix} Utility 9`, 52, 43, 54),
  ];
}

function createMlbValidationPitcher(name, profile) {
  return createGamePitcher(
    name,
    profile.control,
    profile.stuff,
    createPitchMix(profile.pitchMix)
  );
}

const GM_BASIC_REFERENCE_PITCHER_PROFILE = Object.freeze({
  control: 58,
  stuff: 61,
  pitchMix: Object.freeze({
    fourSeam: Object.freeze({ usage: 0.42, velocity: 94.0 }),
    slider: Object.freeze({ usage: 0.27, velocity: 85.3 }),
    curve: Object.freeze({ usage: 0.10, velocity: 79.2 }),
    fork: Object.freeze({ usage: 0.21, velocity: 86.0 }),
  }),
});

function createGmBasicReferenceLineup(prefix) {
  return Array.from({ length: 9 }, (_, index) =>
    createGameBatter(`${prefix} Batter ${index + 1}`, 60, 60, 50)
  );
}

function createGmBasicReferencePitcher(name) {
  return createMlbValidationPitcher(name, GM_BASIC_REFERENCE_PITCHER_PROFILE);
}

function createGmBasicReferenceTeam({ name, playerPrefix }) {
  return createGameableTeam({
    name,
    startingPitcher: createGmBasicReferencePitcher(`${playerPrefix} Starter`),
    bullpen: [
      createGmBasicReferencePitcher(`${playerPrefix} RP 1`),
      createGmBasicReferencePitcher(`${playerPrefix} RP 2`),
    ],
    lineup: createGmBasicReferenceLineup(playerPrefix),
  });
}

export function createGmBasicReferenceValidationTeams() {
  return {
    away: createGmBasicReferenceTeam({
      name: "GM Basic Reference Away",
      playerPrefix: "GM Ref Away",
    }),
    home: createGmBasicReferenceTeam({
      name: "GM Basic Reference Home",
      playerPrefix: "GM Ref Home",
    }),
  };
}

export function createMlbAverageValidationTeams() {
  const averageStarter = createMlbValidationPitcher("MLB Avg Starter", {
    control: 61,
    stuff: 61,
    pitchMix: {
      fourSeam: { usage: 0.42, velocity: 94.5 },
      slider: { usage: 0.27, velocity: 85.7 },
      curve: { usage: 0.10, velocity: 79.2 },
      fork: { usage: 0.21, velocity: 86.4 },
    },
  });

  const powerStarter = createMlbValidationPitcher("MLB Power Starter", {
    control: 56,
    stuff: 70,
    pitchMix: {
      fourSeam: { usage: 0.50, velocity: 97.2 },
      slider: { usage: 0.31, velocity: 88.1 },
      curve: { usage: 0.06, velocity: 81.0 },
      fork: { usage: 0.13, velocity: 89.0 },
    },
  });

  return {
    away: createGameableTeam({
      name: "MLB Avg Lineup",
      startingPitcher: averageStarter,
      bullpen: createBullpenPitchers([
        {
          name: "MLB Avg RP 1",
          control: 60,
          stuff: 63,
          pitchMix: createPitchMix({
            fourSeam: { usage: 0.48, velocity: 95.4 },
            slider: { usage: 0.30, velocity: 86.5 },
            curve: { usage: 0.07, velocity: 79.8 },
            fork: { usage: 0.15, velocity: 87.1 },
          }),
        },
        {
          name: "MLB Avg RP 2",
          control: 57,
          stuff: 66,
          pitchMix: createPitchMix({
            fourSeam: { usage: 0.52, velocity: 96.1 },
            slider: { usage: 0.26, velocity: 87.0 },
            curve: { usage: 0.08, velocity: 80.2 },
            fork: { usage: 0.14, velocity: 88.0 },
          }),
        },
      ]),
      lineup: createMlbAverageLineup("Avg"),
    }),
    home: createGameableTeam({
      name: "MLB Power Pitch Test",
      startingPitcher: powerStarter,
      bullpen: createBullpenPitchers([
        {
          name: "MLB Power RP 1",
          control: 55,
          stuff: 70,
          pitchMix: createPitchMix({
            fourSeam: { usage: 0.55, velocity: 97.5 },
            slider: { usage: 0.28, velocity: 88.4 },
            curve: { usage: 0.05, velocity: 81.5 },
            fork: { usage: 0.12, velocity: 89.2 },
          }),
        },
        {
          name: "MLB Control RP",
          control: 66,
          stuff: 59,
          pitchMix: createPitchMix({
            fourSeam: { usage: 0.40, velocity: 93.8 },
            slider: { usage: 0.24, velocity: 84.9 },
            curve: { usage: 0.16, velocity: 78.2 },
            fork: { usage: 0.20, velocity: 85.6 },
          }),
        },
      ]),
      lineup: createMlbAverageLineup("PowerTest"),
    }),
  };
}

export function createDefaultTeams() {
  return {
    away: createTokyoWaves(),
    home: createOsakaComets(),
  };
}

export function createDefaultLeagueTeams() {
  return [
    createTokyoWaves(),
    createOsakaComets(),
    createNagoyaArrows(),
    createFukuokaBlaze(),
  ];
}
