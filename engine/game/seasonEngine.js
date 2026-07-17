import { createInitialSimState } from "../../state/gameState.js";
import {
  simulateGameMutable,
  createFastSimulationOptions,
} from "../core/engineCore.js";
import { createEmptyVelocityBandStats } from "../../services/velocityBandStatsService.js";

const MAX_SIMULATION_ERRORS = 10;
const MAX_CONSECUTIVE_FAILURES = 10;

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

function createEmptySeasonStatLine() {
  return {
    PA: 0,
    AB: 0,
    H: 0,
    doubles: 0,
    triples: 0,
    HR: 0,
    BB: 0,
    K: 0,
    RBI: 0,
    R: 0,
  };
}

function addQoC(target, source = {}) {
  for (const key of Object.keys(target)) {
    target[key] += source[key] || 0;
  }
}

function addVelocityBandStats(target, source = {}) {
  for (const [bandId, sourceLine] of Object.entries(source || {})) {
    if (!target[bandId]) {
      target[bandId] = {
        bandId: sourceLine.bandId || bandId,
        label: sourceLine.label || bandId,
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

    target[bandId].PA += sourceLine.PA || 0;
    target[bandId].AB += sourceLine.AB || 0;
    target[bandId].H += sourceLine.H || 0;
    target[bandId].doubles += sourceLine.doubles || 0;
    target[bandId].triples += sourceLine.triples || 0;
    target[bandId].HR += sourceLine.HR || 0;
    target[bandId].BB += sourceLine.BB || 0;
    target[bandId].K += sourceLine.K || 0;
    target[bandId].totalBases += sourceLine.totalBases || 0;
  }
}

function totalQoC(qoc) {
  return Object.values(qoc || {}).reduce((sum, value) => sum + value, 0);
}

function qocPercentMap(qoc) {
  const total = totalQoC(qoc);
  const out = {};

  for (const key of Object.keys(qoc || {})) {
    out[key] = total > 0 ? ((qoc[key] / total) * 100).toFixed(1) : "0.0";
  }

  return out;
}

function createSeasonTeamSummary() {
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
    velocityBandStats: createEmptyVelocityBandStats(),
  };
}

function addTeamBox(target, source = {}) {
  target.runs += source.runs || 0;
  target.hits += source.hits || 0;
  target.doubles += source.doubles || 0;
  target.triples += source.triples || 0;
  target.hr += source.hr || 0;
  target.walks += source.walks || 0;
  target.strikeouts += source.strikeouts || 0;
  target.outsInPlay += source.outsInPlay || 0;
  addQoC(target.qoc, source.qoc);
  addVelocityBandStats(target.velocityBandStats, source.velocityBandStats);
}

function sumPlayerStats(players) {
  return (players || []).reduce(
    (total, player) => {
      const s = player?.seasonStats || {};
      total.PA += s.PA || 0;
      total.AB += s.AB || 0;
      total.H += s.H || 0;
      total.doubles += s.doubles || 0;
      total.triples += s.triples || 0;
      total.HR += s.HR || 0;
      total.BB += s.BB || 0;
      total.K += s.K || 0;
      total.RBI += s.RBI || 0;
      total.R += s.R || 0;
      return total;
    },
    createEmptySeasonStatLine()
  );
}

function formatRate(numerator, denominator) {
  if (!denominator || denominator <= 0) return ".000";
  return (numerator / denominator).toFixed(3);
}

function calcRateSummaryFromPlayers(players) {
  const total = sumPlayerStats(players);
  const singles = Math.max(0, total.H - total.doubles - total.triples - total.HR);
  const totalBases = singles + total.doubles * 2 + total.triples * 3 + total.HR * 4;
  const avg = formatRate(total.H, total.AB);
  const obp = formatRate(total.H + total.BB, total.PA);
  const slg = formatRate(totalBases, total.AB);
  const ops = (Number(obp) + Number(slg)).toFixed(3);

  return {
    avg,
    obp,
    slg,
    ops,
    PA: total.PA,
    AB: total.AB,
    H: total.H,
    BB: total.BB,
    totalBases,
  };
}

function cloneSeasonPlayerTemplate(lineup) {
  return lineup.map((player) => ({
    name: player.name,
    ratings: { ...player.ratings },
    seasonStats: createEmptySeasonStatLine(),
  }));
}

function addPlayerSeasonStats(targetPlayers, sourcePlayers) {
  for (let i = 0; i < targetPlayers.length; i += 1) {
    const target = targetPlayers[i];
    const source = sourcePlayers[i];
    const sourceStats = source?.gameStats;
    if (!target || !sourceStats) continue;

    target.seasonStats.PA += sourceStats.PA || 0;
    target.seasonStats.AB += sourceStats.AB || 0;
    target.seasonStats.H += sourceStats.H || 0;
    target.seasonStats.doubles += sourceStats.doubles || 0;
    target.seasonStats.triples += sourceStats.triples || 0;
    target.seasonStats.HR += sourceStats.HR || 0;
    target.seasonStats.BB += sourceStats.BB || 0;
    target.seasonStats.K += sourceStats.K || 0;
    target.seasonStats.RBI += sourceStats.RBI || 0;
    target.seasonStats.R += sourceStats.R || 0;
  }
}

function syncTeamSummaryFromPlayerTotals(teamSummary, players) {
  const total = sumPlayerStats(players);
  teamSummary.hits = total.H;
  teamSummary.doubles = total.doubles;
  teamSummary.triples = total.triples;
  teamSummary.hr = total.HR;
  teamSummary.walks = total.BB;
  teamSummary.strikeouts = total.K;
}

/**
 * fast sim 用:
 * 1球ごと・1打席ごとには clone しない。
 * 1試合の入口だけ team を複製し、その中身は mutable core に任せる。
 */
function createSimGameStateFromTeams(awayTeam, homeTeam) {
  return createInitialSimState(
    structuredClone(awayTeam),
    structuredClone(homeTeam)
  );
}

function addCompletedGameToSeason(season, result) {
  if (!result?.box?.away || !result?.box?.home || !result?.score) {
    const error = new Error("Simulation returned an invalid game result.");
    error.code = "INVALID_SIMULATION_RESULT";
    throw error;
  }

  addTeamBox(season.away, result.box.away);
  addTeamBox(season.home, result.box.home);

  addPlayerSeasonStats(season.awayPlayers, result.awayTeam?.lineup || []);
  addPlayerSeasonStats(season.homePlayers, result.homeTeam?.lineup || []);

  if (result.score.away > result.score.home) {
    season.awayWins += 1;
  } else if (result.score.home > result.score.away) {
    season.homeWins += 1;
  }
}

function recordSimulationError(season, gameIndex, error) {
  season.failedGames += 1;

  if (season.simulationErrors.length >= MAX_SIMULATION_ERRORS) return;

  season.simulationErrors.push({
    gameIndex,
    code: error?.code || "SIMULATION_ERROR",
    message: error?.message || String(error),
  });
}

export function simulateSeason(
  awayTeam,
  homeTeam,
  gameCount,
  runtime = {}
) {
  const safeGameCount = Math.floor(Math.max(0, Number(gameCount || 0)));
  const season = {
    games: safeGameCount,
    requestedGames: safeGameCount,
    completedGames: 0,
    failedGames: 0,
    simulationErrors: [],
    aborted: false,
    abortReason: null,
    awayName: awayTeam.name,
    homeName: homeTeam.name,
    awayWins: 0,
    homeWins: 0,
    away: createSeasonTeamSummary(),
    home: createSeasonTeamSummary(),
    awayPlayers: cloneSeasonPlayerTemplate(awayTeam.lineup),
    homePlayers: cloneSeasonPlayerTemplate(homeTeam.lineup),
  };

  const fastOptions = createFastSimulationOptions();
  const createGameState = runtime.createGameState || createSimGameStateFromTeams;
  const runGame = runtime.simulateGame || simulateGameMutable;
  let consecutiveFailures = 0;

  for (let i = 0; i < safeGameCount; i += 1) {
    try {
      const simState = createGameState(awayTeam, homeTeam);
      const result = runGame(simState, fastOptions);

      addCompletedGameToSeason(season, result);
      season.completedGames += 1;
      consecutiveFailures = 0;
    } catch (error) {
      recordSimulationError(season, i + 1, error);
      consecutiveFailures += 1;

      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        season.aborted = true;
        season.abortReason = `${MAX_CONSECUTIVE_FAILURES}試合連続でシミュレーションに失敗したため中止しました。`;
        break;
      }
    }
  }

  syncTeamSummaryFromPlayerTotals(season.away, season.awayPlayers);
  syncTeamSummaryFromPlayerTotals(season.home, season.homePlayers);

  season.awayRPG =
    season.completedGames > 0
      ? (season.away.runs / season.completedGames).toFixed(2)
      : "0.00";
  season.homeRPG =
    season.completedGames > 0
      ? (season.home.runs / season.completedGames).toFixed(2)
      : "0.00";

  season.awayQoCPct = qocPercentMap(season.away.qoc);
  season.homeQoCPct = qocPercentMap(season.home.qoc);

  season.awayRates = calcRateSummaryFromPlayers(season.awayPlayers);
  season.homeRates = calcRateSummaryFromPlayers(season.homePlayers);

  return season;
}
