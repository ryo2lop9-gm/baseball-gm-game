import { createGameBatter, createGamePitcher } from "./playerModels.js";

/**
 * teamModels.js の責務
 * - チーム構成を定義する
 * - 選手生成の詳細ロジックは playerModels.js に委譲する
 * - 最小リーグ用の複数球団セットを返せるようにする
 */

function createBullpenPitchers(configs) {
  return configs.map((cfg) =>
    createGamePitcher(cfg.name, cfg.control, cfg.stuff, cfg.pitchMix)
  );
}

function createTokyoWaves() {
  return {
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
  };
}

function createOsakaComets() {
  return {
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
  };
}

function createNagoyaArrows() {
  return {
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
  };
}

function createFukuokaBlaze() {
  return {
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