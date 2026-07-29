import {
  createFastSimulationOptions,
  simulateGameMutable,
} from "../../engine/core/engineCore.js";
import { PITCH_LOCATION_CONFIG } from "../../config/pitchLocationConfig.js";
import { BATTED_BALL_DIRECTION_CONFIG } from "../../config/battedBallDirectionConfig.js";
import {
  DEFENSE_CALIBRATION_CONFIG,
  DEFENSE_CALIBRATION_MODES,
} from "../../config/defenseCalibrationConfig.js";
import { BATTED_BALL_DEFENSE_CONFIG } from "../../config/defenseProbabilityConfig.js";
import { FIELD_GEOMETRY_CONFIG } from "../../config/fieldGeometryConfig.js";
import { createInitialSimState } from "../../state/gameState.js";
import {
  createSeededRandom,
  deriveNamespacedSeed,
  normalizeSeed,
} from "../seededRandomService.js";
import {
  commitAdvancedMeasurementGame,
  createAdvancedMeasurementAccumulator,
  finalizeAdvancedMeasurement,
  getRawPitchMeasurementValue,
  recordAdvancedBattedBallMeasurement,
  recordPitchMeasurement,
} from "./measurementAdvancedService.js";
import {
  buildMeasurementReferenceComparison,
  getMlb2025ReferenceBenchmark,
} from "./measurementReferenceService.js";
import {
  createDirectionMeasurementAccumulator,
  finalizeDirectionMeasurement,
  mergeDirectionMeasurement,
  recordDirectionMeasurement,
} from "./measurementDirectionService.js";
import {
  createGeometryMeasurementAccumulator,
  finalizeGeometryMeasurement,
  mergeGeometryMeasurement,
  recordGeometryMeasurement,
} from "./measurementGeometryService.js";
import {
  createDefenseMeasurementAccumulator,
  finalizeDefenseMeasurement,
  mergeDefenseMeasurement,
  recordDefenseMeasurement,
} from "./measurementDefenseService.js";
import {
  createDefenseCalibrationAccumulator,
  finalizeDefenseCalibrationMeasurement,
  mergeDefenseCalibrationMeasurement,
  recordDefenseCalibrationMeasurement,
} from "./measurementDefenseCalibrationService.js";

export const MAX_MEASUREMENT_GAMES = 10000;
export const DEFAULT_MEASUREMENT_BATCH_SIZE = 25;
export const MEASUREMENT_SUMMARY_SCHEMA_VERSION = 7;

const QOC_KEYS = Object.freeze([
  "Weak",
  "Topped",
  "Under",
  "Flare",
  "Solid",
  "Barrel",
]);
const SOURCE_KEYS = Object.freeze([
  "ev_la_smoothed",
  "ev_la_neighbor",
  "unexpected",
]);
const SAMPLE_QUALITY_KEYS = Object.freeze([
  "good",
  "low_sample",
  "very_low_sample",
  "none",
  "unknown",
]);
const NEIGHBOR_MODE_KEYS = Object.freeze([
  "local",
  "expanded",
  "distant",
  "unknown",
]);
const OUTCOME_KEYS = Object.freeze([
  "out",
  "single",
  "double",
  "triple",
  "homeRun",
]);
const STRUCTURAL_ERROR_CODES = new Set([
  "BATTED_BALL_MISSING",
  "BATTED_BALL_OUTCOME_INVALID",
  "BATTED_BALL_DIRECTION_RANDOM_MISSING",
  "BATTED_BALL_DIRECTION_RANDOM_SHARED",
  "BATTED_BALL_GEOMETRY_DIRECTION_REQUIRED",
  "BATTED_BALL_GEOMETRY_INPUT_INVALID",
  "BATTED_BALL_GEOMETRY_OUTPUT_INVALID",
  "BATTED_BALL_DEFENSE_GEOMETRY_REQUIRED",
  "BATTED_BALL_DEFENSE_ACTIVE_DEFENSE_REQUIRED",
  "BATTED_BALL_DEFENSE_SEED_REQUIRED",
  "BATTED_BALL_DEFENSE_INPUT_INVALID",
  "BATTED_BALL_DEFENSE_OUTPUT_INVALID",
  "BATTED_BALL_DEFENSE_CALIBRATION_MODE_INVALID",
  "BATTED_BALL_DEFENSE_CALIBRATION_DEFENSE_REQUIRED",
  "BATTED_BALL_DEFENSE_CALIBRATION_INPUT_INVALID",
  "EV_LA_LOOKUP_NOT_READY",
  "EV_LA_LOOKUP_INVALID",
  "EV_LA_LOOKUP_LOAD_FAILED",
  PITCH_LOCATION_CONFIG.legacyGridCompatibility.invariantErrorCode,
]);
const MAX_SIMULATION_ERRORS = 10;
const MAX_CONSECUTIVE_FAILURES = 10;

export function isStructuralMeasurementError(error) {
  return STRUCTURAL_ERROR_CODES.has(error?.code);
}

function zeroMap(keys) {
  return Object.fromEntries(keys.map((key) => [key, 0]));
}

function createTeamTotals() {
  return {
    G: 0,
    wins: 0,
    runs: 0,
    PA: 0,
    AB: 0,
    H: 0,
    doubles: 0,
    triples: 0,
    HR: 0,
    BB: 0,
    K: 0,
    swingingK: 0,
    lookingK: 0,
    outsInPlay: 0,
    R: 0,
    RBI: 0,
  };
}

function createBattedBallTotals() {
  return {
    fairBattedBalls: 0,
    exitVelocitySum: 0,
    launchAngleSum: 0,
    exitVelocityMin: null,
    exitVelocityMax: null,
    launchAngleMin: null,
    launchAngleMax: null,
    negativeLACount: 0,
    targetWeightSum: 0,
    targetBattedBallsSum: 0,
    neighborEffectiveSampleSizeSum: 0,
    source: zeroMap(SOURCE_KEYS),
    sampleQuality: zeroMap(SAMPLE_QUALITY_KEYS),
    neighborMode: zeroMap(NEIGHBOR_MODE_KEYS),
    physicalConstraints: {
      negative_launch_angle_no_direct_home_run: 0,
      unknown: {},
    },
    neighborModeOutcomes: Object.fromEntries(
      NEIGHBOR_MODE_KEYS.map((mode) => [
        mode,
        { fairBattedBalls: 0, ...zeroMap(OUTCOME_KEYS) },
      ])
    ),
  };
}

function createDiagnostics() {
  return {
    unexpectedSourceCount: 0,
    unknownNeighborModeCount: 0,
    unknownSampleQualityCount: 0,
    invalidMeasurementEventCount: 0,
    negativeLaHomeRunCount: 0,
  };
}

export function createEmptyMeasurementAccumulator() {
  return {
    completedGames: 0,
    failedGames: 0,
    teams: {
      away: createTeamTotals(),
      home: createTeamTotals(),
    },
    qoc: {
      away: zeroMap(QOC_KEYS),
      home: zeroMap(QOC_KEYS),
    },
    battedBallMetrics: createBattedBallTotals(),
    diagnostics: createDiagnostics(),
    simulationErrors: [],
    advanced: createAdvancedMeasurementAccumulator(),
    direction: createDirectionMeasurementAccumulator(),
    geometry: createGeometryMeasurementAccumulator(),
    defense: createDefenseMeasurementAccumulator(),
    defenseCalibration: createDefenseCalibrationAccumulator(),
  };
}

export function createGameMeasurementAccumulator(
  directionMode = "shadow",
  geometryMode = "shadow",
  defenseMode = "shadow",
  defenseCalibrationMode = DEFENSE_CALIBRATION_CONFIG.defaultMode
) {
  return {
    qoc: {
      away: zeroMap(QOC_KEYS),
      home: zeroMap(QOC_KEYS),
    },
    battedBallMetrics: createBattedBallTotals(),
    diagnostics: createDiagnostics(),
    advanced: createAdvancedMeasurementAccumulator(),
    direction:
      directionMode === BATTED_BALL_DIRECTION_CONFIG.defaultMode
        ? null
        : createDirectionMeasurementAccumulator(),
    geometry:
      geometryMode === FIELD_GEOMETRY_CONFIG.defaultMode
        ? null
        : createGeometryMeasurementAccumulator(),
    defense:
      defenseMode === BATTED_BALL_DEFENSE_CONFIG.defaultMode
        ? null
        : createDefenseMeasurementAccumulator(),
    defenseCalibration:
      defenseCalibrationMode === DEFENSE_CALIBRATION_CONFIG.defaultMode
        ? null
        : createDefenseCalibrationAccumulator(),
  };
}

export function normalizeMeasurementGameCount(value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1 || number > MAX_MEASUREMENT_GAMES) {
    const error = new Error(
      `Game count must be an integer from 1 to ${MAX_MEASUREMENT_GAMES}.`
    );
    error.code = "MEASUREMENT_GAME_COUNT_INVALID";
    throw error;
  }
  return number;
}

function incrementKnownCounter(map, key, fallbackKey) {
  const normalizedKey = Object.hasOwn(map, key) ? key : fallbackKey;
  map[normalizedKey] += 1;
  return normalizedKey;
}

function updateRange(target, minKey, maxKey, value) {
  target[minKey] = target[minKey] === null ? value : Math.min(target[minKey], value);
  target[maxKey] = target[maxKey] === null ? value : Math.max(target[maxKey], value);
}

export function recordBattedBallMeasurement(gameAccumulator, event) {
  const side = event?.side;
  const exitVelocity = Number(event?.exitVelocity);
  const launchAngle = Number(event?.launchAngle);
  const outcome = event?.outcome;
  const valid =
    (side === "away" || side === "home") &&
    Number.isFinite(exitVelocity) &&
    Number.isFinite(launchAngle) &&
    OUTCOME_KEYS.includes(outcome);

  if (!valid) {
    gameAccumulator.diagnostics.invalidMeasurementEventCount += 1;
    return false;
  }

  const metrics = gameAccumulator.battedBallMetrics;
  metrics.fairBattedBalls += 1;
  metrics.exitVelocitySum += exitVelocity;
  metrics.launchAngleSum += launchAngle;
  updateRange(metrics, "exitVelocityMin", "exitVelocityMax", exitVelocity);
  updateRange(metrics, "launchAngleMin", "launchAngleMax", launchAngle);

  if (launchAngle < 0) {
    metrics.negativeLACount += 1;
    if (outcome === "homeRun") {
      gameAccumulator.diagnostics.negativeLaHomeRunCount += 1;
    }
  }

  const targetWeight = Number(event?.targetWeight);
  const targetBattedBalls = Number(event?.targetBattedBalls);
  const neighborEss = Number(event?.neighborEffectiveSampleSize);
  if (
    !Number.isFinite(targetWeight) ||
    !Number.isFinite(targetBattedBalls) ||
    !Number.isFinite(neighborEss)
  ) {
    gameAccumulator.diagnostics.invalidMeasurementEventCount += 1;
  } else {
    metrics.targetWeightSum += targetWeight;
    metrics.targetBattedBallsSum += targetBattedBalls;
    metrics.neighborEffectiveSampleSizeSum += neighborEss;
  }

  const source = incrementKnownCounter(
    metrics.source,
    event?.source,
    "unexpected"
  );
  if (source === "unexpected") {
    gameAccumulator.diagnostics.unexpectedSourceCount += 1;
  }

  const sampleQuality = incrementKnownCounter(
    metrics.sampleQuality,
    event?.sampleQuality,
    "unknown"
  );
  if (sampleQuality === "unknown") {
    gameAccumulator.diagnostics.unknownSampleQualityCount += 1;
  }

  const neighborMode = incrementKnownCounter(
    metrics.neighborMode,
    event?.neighborMode,
    "unknown"
  );
  if (neighborMode === "unknown") {
    gameAccumulator.diagnostics.unknownNeighborModeCount += 1;
  }

  const modeOutcomes = metrics.neighborModeOutcomes[neighborMode];
  modeOutcomes.fairBattedBalls += 1;
  modeOutcomes[outcome] += 1;

  for (const constraint of event?.physicalConstraints || []) {
    if (constraint === "negative_launch_angle_no_direct_home_run") {
      metrics.physicalConstraints[constraint] += 1;
    } else {
      const name = String(constraint || "unknown");
      metrics.physicalConstraints.unknown[name] =
        (metrics.physicalConstraints.unknown[name] || 0) + 1;
    }
  }

  if (Object.hasOwn(gameAccumulator.qoc[side], event?.qoc)) {
    gameAccumulator.qoc[side][event.qoc] += 1;
  }

  if (gameAccumulator.direction) {
    recordDirectionMeasurement(gameAccumulator.direction, event);
  }
  if (gameAccumulator.geometry) {
    recordGeometryMeasurement(gameAccumulator.geometry, event);
  }
  if (gameAccumulator.defense) {
    recordDefenseMeasurement(gameAccumulator.defense, event);
  }
  if (gameAccumulator.defenseCalibration) {
    recordDefenseCalibrationMeasurement(
      gameAccumulator.defenseCalibration,
      event
    );
  }
  recordAdvancedBattedBallMeasurement(gameAccumulator.advanced, event);

  return true;
}

export function recordPitchMeasurementEvent(gameAccumulator, event) {
  return recordPitchMeasurement(gameAccumulator.advanced, event);
}

function addMap(target, source) {
  for (const [key, value] of Object.entries(source || {})) {
    target[key] = (target[key] || 0) + (Number(value) || 0);
  }
}

function mergeBattedBallTotals(target, source) {
  for (const key of [
    "fairBattedBalls",
    "exitVelocitySum",
    "launchAngleSum",
    "negativeLACount",
    "targetWeightSum",
    "targetBattedBallsSum",
    "neighborEffectiveSampleSizeSum",
  ]) {
    target[key] += source[key] || 0;
  }

  for (const [minKey, maxKey] of [
    ["exitVelocityMin", "exitVelocityMax"],
    ["launchAngleMin", "launchAngleMax"],
  ]) {
    if (source[minKey] !== null) {
      updateRange(target, minKey, maxKey, source[minKey]);
      updateRange(target, minKey, maxKey, source[maxKey]);
    }
  }

  addMap(target.source, source.source);
  addMap(target.sampleQuality, source.sampleQuality);
  addMap(target.neighborMode, source.neighborMode);
  target.physicalConstraints.negative_launch_angle_no_direct_home_run +=
    source.physicalConstraints.negative_launch_angle_no_direct_home_run || 0;
  addMap(
    target.physicalConstraints.unknown,
    source.physicalConstraints.unknown
  );

  for (const mode of NEIGHBOR_MODE_KEYS) {
    addMap(
      target.neighborModeOutcomes[mode],
      source.neighborModeOutcomes[mode]
    );
  }
}

function addLineupStats(target, lineup) {
  for (const player of lineup || []) {
    const stats = player?.gameStats || {};
    for (const key of [
      "PA", "AB", "H", "doubles", "triples", "HR", "BB", "K", "R", "RBI",
    ]) {
      target[key] += Number(stats[key]) || 0;
    }
  }
}

export function commitCompletedMeasurementGame(
  accumulator,
  gameState,
  gameAccumulator
) {
  if (!gameState?.isComplete || !gameState?.score) {
    const error = new Error("Measurement game did not return a completed state.");
    error.code = "INVALID_SIMULATION_RESULT";
    throw error;
  }

  accumulator.completedGames += 1;
  accumulator.teams.away.G += 1;
  accumulator.teams.home.G += 1;
  accumulator.teams.away.runs += Number(gameState.score.away) || 0;
  accumulator.teams.home.runs += Number(gameState.score.home) || 0;
  addLineupStats(accumulator.teams.away, gameState.awayTeam?.lineup);
  addLineupStats(accumulator.teams.home, gameState.homeTeam?.lineup);
  for (const side of ["away", "home"]) {
    const pitch = gameAccumulator.advanced.pitchBySide[side];
    accumulator.teams[side].swingingK += getRawPitchMeasurementValue(
      pitch,
      "swingingK"
    );
    accumulator.teams[side].lookingK += getRawPitchMeasurementValue(
      pitch,
      "lookingK"
    );
    accumulator.teams[side].outsInPlay += Number(gameState.box?.[side]?.outsInPlay) || 0;
  }

  if (gameState.score.away > gameState.score.home) {
    accumulator.teams.away.wins += 1;
  } else if (gameState.score.home > gameState.score.away) {
    accumulator.teams.home.wins += 1;
  }

  addMap(accumulator.qoc.away, gameAccumulator.qoc.away);
  addMap(accumulator.qoc.home, gameAccumulator.qoc.home);
  mergeBattedBallTotals(
    accumulator.battedBallMetrics,
    gameAccumulator.battedBallMetrics
  );
  addMap(accumulator.diagnostics, gameAccumulator.diagnostics);
  commitAdvancedMeasurementGame(
    accumulator.advanced,
    gameAccumulator.advanced,
    gameState
  );
  if (gameAccumulator.direction) {
    mergeDirectionMeasurement(
      accumulator.direction,
      gameAccumulator.direction
    );
  }
  if (gameAccumulator.geometry) {
    mergeGeometryMeasurement(
      accumulator.geometry,
      gameAccumulator.geometry
    );
  }
  if (gameAccumulator.defense) {
    mergeDefenseMeasurement(
      accumulator.defense,
      gameAccumulator.defense
    );
  }
  if (gameAccumulator.defenseCalibration) {
    mergeDefenseCalibrationMeasurement(
      accumulator.defenseCalibration,
      gameAccumulator.defenseCalibration
    );
  }
}

function safeDivide(numerator, denominator) {
  return denominator > 0 ? numerator / denominator : 0;
}

export function buildContactDisposition(plateDiscipline) {
  const combined = plateDiscipline?.combined || {};
  const pitches = Number(combined.pitches) || 0;
  const swings = Number(combined.swings) || 0;
  const contacts = Number(combined.contacts) || 0;
  const fouls = Number(combined.fouls) || 0;
  const fairBattedBalls = Number(combined.fairBattedBalls) || 0;

  return {
    pitches,
    swings,
    contacts,
    fouls,
    fairBattedBalls,
    contactPerPitch: safeDivide(contacts, pitches),
    foulPerPitch: safeDivide(fouls, pitches),
    fairBattedBallPerPitch: safeDivide(fairBattedBalls, pitches),
    foulPerContact: safeDivide(fouls, contacts),
    fairBattedBallPerContact: safeDivide(fairBattedBalls, contacts),
  };
}

function finalizeTeam(raw, completedGames, combined = false) {
  const singles = Math.max(0, raw.H - raw.doubles - raw.triples - raw.HR);
  const totalBases =
    singles + raw.doubles * 2 + raw.triples * 3 + raw.HR * 4;
  const gameDenominator = combined ? completedGames * 2 : completedGames;
  const xbh = raw.doubles + raw.triples + raw.HR;
  const avg = safeDivide(raw.H, raw.AB);
  const obp = safeDivide(raw.H + raw.BB, raw.PA);
  const slg = safeDivide(totalBases, raw.AB);

  return {
    ...raw,
    singles,
    totalBases,
    XBH: xbh,
    averageRuns: safeDivide(raw.runs, gameDenominator),
    AVG: avg,
    OBP: obp,
    SLG: slg,
    OPS: obp + slg,
    ISO: slg - avg,
    BABIP: safeDivide(raw.H - raw.HR, raw.AB - raw.K - raw.HR),
    BBPct: safeDivide(raw.BB, raw.PA),
    KPct: safeDivide(raw.K, raw.PA),
    HRPct: safeDivide(raw.HR, raw.PA),
    BBPerK: safeDivide(raw.BB, raw.K),
    XBHPerH: safeDivide(xbh, raw.H),
  };
}

function combineTeamTotals(away, home) {
  const combined = createTeamTotals();
  for (const key of Object.keys(combined)) {
    combined[key] = (away[key] || 0) + (home[key] || 0);
  }
  return combined;
}

function finalizeCounterMap(map, denominator) {
  return Object.fromEntries(
    Object.entries(map).map(([key, count]) => [
      key,
      { count, pct: safeDivide(count, denominator) },
    ])
  );
}

function finalizeOutcomeMap(raw) {
  const denominator = raw.fairBattedBalls;
  return {
    ...raw,
    rates: Object.fromEntries(
      OUTCOME_KEYS.map((key) => [key, safeDivide(raw[key], denominator)])
    ),
  };
}

function finalizeQoC(accumulator) {
  const combined = zeroMap(QOC_KEYS);
  addMap(combined, accumulator.qoc.away);
  addMap(combined, accumulator.qoc.home);

  return {
    away: finalizeCounterMap(
      accumulator.qoc.away,
      Object.values(accumulator.qoc.away).reduce((sum, value) => sum + value, 0)
    ),
    home: finalizeCounterMap(
      accumulator.qoc.home,
      Object.values(accumulator.qoc.home).reduce((sum, value) => sum + value, 0)
    ),
    combined: finalizeCounterMap(
      combined,
      Object.values(combined).reduce((sum, value) => sum + value, 0)
    ),
  };
}

export function finalizeMeasurementSummary(accumulator, run) {
  const fairBattedBalls = accumulator.battedBallMetrics.fairBattedBalls;
  const combinedRaw = combineTeamTotals(
    accumulator.teams.away,
    accumulator.teams.home
  );
  const metrics = accumulator.battedBallMetrics;
  const results = {
    away: finalizeTeam(accumulator.teams.away, accumulator.completedGames),
    home: finalizeTeam(accumulator.teams.home, accumulator.completedGames),
    combined: finalizeTeam(combinedRaw, accumulator.completedGames, true),
  };
  const qoc = finalizeQoC(accumulator);
  const battedBallMetrics = {
    fairBattedBalls,
    averageExitVelocity: safeDivide(metrics.exitVelocitySum, fairBattedBalls),
    averageLaunchAngle: safeDivide(metrics.launchAngleSum, fairBattedBalls),
    exitVelocityMin: metrics.exitVelocityMin ?? 0,
    exitVelocityMax: metrics.exitVelocityMax ?? 0,
    launchAngleMin: metrics.launchAngleMin ?? 0,
    launchAngleMax: metrics.launchAngleMax ?? 0,
    negativeLACount: metrics.negativeLACount,
    negativeLAPct: safeDivide(metrics.negativeLACount, fairBattedBalls),
    averageTargetWeight: safeDivide(metrics.targetWeightSum, fairBattedBalls),
    averageTargetBattedBalls: safeDivide(
      metrics.targetBattedBallsSum,
      fairBattedBalls
    ),
    averageNeighborEffectiveSampleSize: safeDivide(
      metrics.neighborEffectiveSampleSizeSum,
      fairBattedBalls
    ),
    rawSums: {
      exitVelocity: metrics.exitVelocitySum,
      launchAngle: metrics.launchAngleSum,
      targetWeight: metrics.targetWeightSum,
      targetBattedBalls: metrics.targetBattedBallsSum,
      neighborEffectiveSampleSize: metrics.neighborEffectiveSampleSizeSum,
    },
    source: finalizeCounterMap(metrics.source, fairBattedBalls),
    sampleQuality: finalizeCounterMap(metrics.sampleQuality, fairBattedBalls),
    neighborMode: finalizeCounterMap(metrics.neighborMode, fairBattedBalls),
    physicalConstraints: structuredClone(metrics.physicalConstraints),
    neighborModeOutcomes: Object.fromEntries(
      Object.entries(metrics.neighborModeOutcomes).map(([mode, raw]) => [
        mode,
        finalizeOutcomeMap(raw),
      ])
    ),
  };
  const advanced = finalizeAdvancedMeasurement(accumulator.advanced, {
    results,
    qoc,
    battedBallMetrics,
  });
  const contactDisposition = buildContactDisposition(advanced.plateDiscipline);
  const diagnostics = {
    ...accumulator.diagnostics,
    ...advanced.diagnostics,
    contactDispositionMismatchCount:
      contactDisposition.contacts ===
      contactDisposition.fouls + contactDisposition.fairBattedBalls
        ? 0
        : 1,
  };
  const referenceBenchmark = getMlb2025ReferenceBenchmark();
  const referenceComparison = buildMeasurementReferenceComparison({
    results,
    plateDiscipline: advanced.plateDiscipline,
    battingProfiles: advanced.battingProfiles,
    contactDisposition,
  });
  const directionMode =
    run.directionMode || BATTED_BALL_DIRECTION_CONFIG.defaultMode;
  const direction = finalizeDirectionMeasurement(accumulator.direction, {
    fairBattedBalls,
    mode: directionMode,
    directionSeed: run.directionSeed ?? null,
  });
  const geometryMode =
    run.geometryMode || FIELD_GEOMETRY_CONFIG.defaultMode;
  const geometry = finalizeGeometryMeasurement(accumulator.geometry, {
    fairBattedBalls,
    directionOpportunities: direction.opportunities,
    mode: geometryMode,
  });
  const defenseMode =
    run.defenseMode || BATTED_BALL_DEFENSE_CONFIG.defaultMode;
  const defense = finalizeDefenseMeasurement(accumulator.defense, {
    mode: defenseMode,
    geometryEvaluations: geometry.opportunities,
  });
  const defenseCalibrationMode =
    run.defenseCalibrationMode ||
    DEFENSE_CALIBRATION_CONFIG.defaultMode;
  const defenseCalibration = finalizeDefenseCalibrationMeasurement(
    accumulator.defenseCalibration,
    { mode: defenseCalibrationMode }
  );

  return {
    reportSchemaVersion: MEASUREMENT_SUMMARY_SCHEMA_VERSION,
    status: run.status,
    run: {
      seed: normalizeSeed(run.seed),
      directionMode,
      directionSeed: direction.directionSeed,
      geometryMode,
      defenseMode,
      defenseSeed: run.defenseSeed ?? null,
      defenseCalibrationMode,
      requestedGames: run.requestedGames,
      completedGames: accumulator.completedGames,
      failedGames: accumulator.failedGames,
      elapsedMs: Math.max(0, Number(run.elapsedMs) || 0),
      gamesPerSecond: safeDivide(
        accumulator.completedGames,
        Math.max(0, Number(run.elapsedMs) || 0) / 1000
      ),
    },
    results,
    qoc,
    battedBallMetrics,
    gameDistribution: advanced.gameDistribution,
    plateDiscipline: advanced.plateDiscipline,
    pitchLocation: advanced.pitchLocation,
    direction,
    geometry,
    defense,
    defenseCalibration,
    contactDisposition,
    referenceBenchmark,
    referenceComparison,
    battingProfiles: advanced.battingProfiles,
    players: advanced.players,
    pitchers: advanced.pitchers,
    breakdowns: advanced.breakdowns,
    smoothingDiagnostics: advanced.smoothingDiagnostics,
    diagnostics,
    simulationErrors: structuredClone(accumulator.simulationErrors),
  };
}

function recordSimulationError(accumulator, gameIndex, error) {
  accumulator.failedGames += 1;
  if (accumulator.simulationErrors.length >= MAX_SIMULATION_ERRORS) return;
  accumulator.simulationErrors.push({
    gameIndex,
    code: error?.code || "SIMULATION_ERROR",
    message: error?.message || String(error),
  });
}

function defaultNow() {
  return globalThis.performance?.now?.() ?? Date.now();
}

function defaultYieldControl() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

export async function runMeasurementBatches({
  awayTeam,
  homeTeam,
  gameCount,
  seed,
  batchSize = DEFAULT_MEASUREMENT_BATCH_SIZE,
  shouldCancel = () => false,
  onProgress = () => {},
  runtime = {},
}) {
  const requestedGames = normalizeMeasurementGameCount(gameCount);
  const normalizedSeed = normalizeSeed(seed);
  const safeBatchSize = Math.max(1, Math.floor(Number(batchSize) || 1));
  const random = runtime.random || createSeededRandom(normalizedSeed);
  const directionMode =
    runtime.directionMode ?? BATTED_BALL_DIRECTION_CONFIG.shadowMode;
  if (directionMode !== "off" && directionMode !== "shadow") {
    const error = new Error("Measurement Direction mode is invalid.");
    error.code = "BATTED_BALL_DIRECTION_INPUT_INVALID";
    error.context = { directionMode };
    throw error;
  }
  const geometryMode =
    runtime.geometryMode ?? FIELD_GEOMETRY_CONFIG.shadowMode;
  if (geometryMode !== "off" && geometryMode !== "shadow") {
    const error = new Error("Measurement Geometry mode is invalid.");
    error.code = "BATTED_BALL_GEOMETRY_INPUT_INVALID";
    error.context = { geometryMode };
    throw error;
  }
  if (geometryMode === "shadow" && directionMode !== "shadow") {
    const error = new Error(
      "Geometry Shadow requires Direction Shadow."
    );
    error.code = "BATTED_BALL_GEOMETRY_DIRECTION_REQUIRED";
    error.context = { geometryMode, directionMode };
    throw error;
  }
  const defenseMode =
    runtime.defenseMode ?? BATTED_BALL_DEFENSE_CONFIG.shadowMode;
  if (defenseMode !== "off" && defenseMode !== "shadow") {
    const error = new Error("Measurement Defense mode is invalid.");
    error.code = "BATTED_BALL_DEFENSE_INPUT_INVALID";
    error.context = { defenseMode };
    throw error;
  }
  if (
    defenseMode === BATTED_BALL_DEFENSE_CONFIG.shadowMode &&
    geometryMode !== FIELD_GEOMETRY_CONFIG.shadowMode
  ) {
    const error = new Error("Defense Shadow requires Geometry Shadow.");
    error.code = "BATTED_BALL_DEFENSE_GEOMETRY_REQUIRED";
    error.context = { defenseMode, geometryMode };
    throw error;
  }
  const defenseCalibrationMode =
    runtime.defenseCalibrationMode ??
    DEFENSE_CALIBRATION_CONFIG.defaultMode;
  if (!DEFENSE_CALIBRATION_MODES.includes(defenseCalibrationMode)) {
    const error = new Error("Defense Calibration mode is invalid.");
    error.code = "BATTED_BALL_DEFENSE_CALIBRATION_MODE_INVALID";
    error.context = { defenseCalibrationMode };
    throw error;
  }
  if (
    defenseCalibrationMode ===
      DEFENSE_CALIBRATION_CONFIG.diagnosticMode &&
    defenseMode !== BATTED_BALL_DEFENSE_CONFIG.shadowMode
  ) {
    const error = new Error(
      "Defense Calibration requires Defense Shadow."
    );
    error.code =
      "BATTED_BALL_DEFENSE_CALIBRATION_DEFENSE_REQUIRED";
    error.context = { defenseCalibrationMode, defenseMode };
    throw error;
  }
  const directionSeed = normalizeSeed(
    runtime.directionSeed ??
      deriveNamespacedSeed(normalizedSeed, BATTED_BALL_DIRECTION_CONFIG.model)
  );
  const directionRandom =
    directionMode === BATTED_BALL_DIRECTION_CONFIG.shadowMode
      ? runtime.directionRandom || createSeededRandom(directionSeed)
      : undefined;
  if (directionMode === "shadow" && directionRandom === random) {
    const error = new Error(
      "Direction Shadow random must be independent from the main random."
    );
    error.code = "BATTED_BALL_DIRECTION_RANDOM_SHARED";
    error.context = { directionMode };
    throw error;
  }
  let defenseSeed = null;
  if (defenseMode === BATTED_BALL_DEFENSE_CONFIG.shadowMode) {
    const derivedDefenseSeed = deriveNamespacedSeed(
      normalizedSeed,
      BATTED_BALL_DEFENSE_CONFIG.model
    );
    const rawDefenseSeed =
      runtime.defenseSeed ?? derivedDefenseSeed;
    if (
      typeof rawDefenseSeed !== "number" ||
      !Number.isFinite(rawDefenseSeed) ||
      !Number.isInteger(rawDefenseSeed) ||
      rawDefenseSeed < 0 ||
      rawDefenseSeed > 0xffffffff
    ) {
      const error = new Error("Measurement Defense seed is invalid.");
      error.code = "BATTED_BALL_DEFENSE_SEED_REQUIRED";
      error.context = { defenseSeed: rawDefenseSeed };
      throw error;
    }
    defenseSeed = rawDefenseSeed >>> 0;
  }
  const createGameState =
    runtime.createGameState ||
    ((away, home) =>
      createInitialSimState(structuredClone(away), structuredClone(home)));
  const simulateGame = runtime.simulateGame || simulateGameMutable;
  const now = runtime.now || defaultNow;
  const yieldControl = runtime.yieldControl || defaultYieldControl;
  const accumulator = createEmptyMeasurementAccumulator();
  const startedAt = now();
  let consecutiveFailures = 0;

  while (accumulator.completedGames + accumulator.failedGames < requestedGames) {
    if (shouldCancel()) break;

    const batchEnd = Math.min(
      requestedGames,
      accumulator.completedGames + accumulator.failedGames + safeBatchSize
    );

    while (accumulator.completedGames + accumulator.failedGames < batchEnd) {
      const gameIndex = accumulator.completedGames + accumulator.failedGames + 1;
      const gameAccumulator = createGameMeasurementAccumulator(
        directionMode,
        geometryMode,
        defenseMode,
        defenseCalibrationMode
      );

      try {
        const state = createGameState(awayTeam, homeTeam);
        const options = createFastSimulationOptions({
          random,
          directionMode,
          directionRandom,
          gameKey: `seed:${normalizedSeed}:game:${gameIndex}`,
          geometryMode,
          defenseMode,
          defenseSeed,
          onPitchMeasurement: (event) =>
            recordPitchMeasurementEvent(gameAccumulator, event),
          onBattedBallMeasurement: (event) =>
            recordBattedBallMeasurement(gameAccumulator, event),
        });
        const result = simulateGame(state, options);
        commitCompletedMeasurementGame(accumulator, result, gameAccumulator);
        consecutiveFailures = 0;
      } catch (error) {
        recordSimulationError(accumulator, gameIndex, error);
        consecutiveFailures += 1;

        if (isStructuralMeasurementError(error)) {
          error.measurementSummary = finalizeMeasurementSummary(accumulator, {
            status: "error",
            seed: normalizedSeed,
            directionMode,
            directionSeed,
            geometryMode,
            defenseMode,
            defenseSeed,
            defenseCalibrationMode,
            requestedGames,
            elapsedMs: now() - startedAt,
          });
          throw error;
        }

        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          const abortError = new Error(
            `${MAX_CONSECUTIVE_FAILURES} consecutive measurement games failed.`
          );
          abortError.code = "MEASUREMENT_CONSECUTIVE_FAILURES";
          abortError.measurementSummary = finalizeMeasurementSummary(accumulator, {
            status: "error",
            seed: normalizedSeed,
            directionMode,
            directionSeed,
            geometryMode,
            defenseMode,
            defenseSeed,
            defenseCalibrationMode,
            requestedGames,
            elapsedMs: now() - startedAt,
          });
          throw abortError;
        }
      }
    }

    const elapsedMs = Math.max(0, now() - startedAt);
    onProgress({
      completedGames: accumulator.completedGames,
      failedGames: accumulator.failedGames,
      requestedGames,
      elapsedMs,
      gamesPerSecond: safeDivide(
        accumulator.completedGames,
        elapsedMs / 1000
      ),
    });

    await yieldControl();
  }

  const status = shouldCancel() ? "cancelled" : "completed";
  return finalizeMeasurementSummary(accumulator, {
    status,
    seed: normalizedSeed,
    directionMode,
    directionSeed,
    geometryMode,
    defenseMode,
    defenseSeed,
    defenseCalibrationMode,
    requestedGames,
    elapsedMs: now() - startedAt,
  });
}
