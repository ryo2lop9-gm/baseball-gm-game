import { createInitialSimState } from "../../state/gameState.js";
import {
  simulateGameMutable,
  createFastSimulationOptions,
} from "../core/engineCore.js";

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

function addQoC(target, source) {
  for (const key of Object.keys(target)) {
    target[key] += source[key] || 0;
  }
}

function totalQoC(qoc) {
  return Object.values(qoc).reduce((sum, value) => sum + value, 0);
}

function qocPercentMap(qoc) {
  const total = totalQoC(qoc);
  const out = {};

  for (const key of Object.keys(qoc)) {
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
  };
}

function addTeamBox(target, source) {
  target.runs += source.runs;
  target.hits += source.hits;
  target.doubles += source.doubles;
  target.triples += source.triples;
  target.hr += source.hr;
  target.walks += source.walks;
  target.strikeouts += source.strikeouts;
  target.outsInPlay += source.outsInPlay;
  addQoC(target.qoc, source.qoc);
}

function calcRateSummary(team, games) {
  const pa = Math.max(1, games * 38);
  const ab = Math.max(1, pa - team.walks);
  const singles = Math.max(0, team.hits - team.doubles - team.triples - team.hr);
  const totalBases = singles + team.doubles * 2 + team.triples * 3 + team.hr * 4;
  const avg = (team.hits / ab).toFixed(3);
  const obp = ((team.hits + team.walks) / pa).toFixed(3);
  const slg = (totalBases / ab).toFixed(3);
  const ops = (Number(obp) + Number(slg)).toFixed(3);
  return { avg, obp, slg, ops };
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

export function simulateSeason(awayTeam, homeTeam, gameCount) {
  const season = {
    games: gameCount,
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

  for (let i = 0; i < gameCount; i += 1) {
    const simState = createSimGameStateFromTeams(awayTeam, homeTeam);
    const result = simulateGameMutable(simState, fastOptions);

    addTeamBox(season.away, result.box.away);
    addTeamBox(season.home, result.box.home);

    addPlayerSeasonStats(season.awayPlayers, result.awayTeam.lineup);
    addPlayerSeasonStats(season.homePlayers, result.homeTeam.lineup);

    if (result.score.away > result.score.home) {
      season.awayWins += 1;
    } else if (result.score.home > result.score.away) {
      season.homeWins += 1;
    }
  }

  season.awayRPG = (season.away.runs / gameCount).toFixed(2);
  season.homeRPG = (season.home.runs / gameCount).toFixed(2);

  season.awayQoCPct = qocPercentMap(season.away.qoc);
  season.homeQoCPct = qocPercentMap(season.home.qoc);

  season.awayRates = calcRateSummary(season.away, gameCount);
  season.homeRates = calcRateSummary(season.home, gameCount);

  return season;
}