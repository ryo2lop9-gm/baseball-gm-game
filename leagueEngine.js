import { createInitialSimState } from "./gameState.js";
import {
  simulateGameMutable,
  createFastSimulationOptions,
} from "./engineCore.js";

/**
 * leagueEngine.js の責務
 * - 観戦用の重い state を外に漏らさない
 * - 他球団戦を「軽量 result」で返す
 * - リーグの日付進行・順位表の最小入口になる
 */

function createEmptyBattingLine() {
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

function calcBattingRate(stats) {
  const ab = stats.AB || 0;
  const h = stats.H || 0;
  const bb = stats.BB || 0;
  const singles = Math.max(
    0,
    h - (stats.doubles || 0) - (stats.triples || 0) - (stats.HR || 0)
  );
  const tb =
    singles +
    (stats.doubles || 0) * 2 +
    (stats.triples || 0) * 3 +
    (stats.HR || 0) * 4;

  const pa = stats.PA || 0;
  const avg = ab > 0 ? (h / ab).toFixed(3) : ".000";
  const obp = pa > 0 ? ((h + bb) / pa).toFixed(3) : ".000";
  const slg = ab > 0 ? (tb / ab).toFixed(3) : ".000";
  const ops = (Number(obp) + Number(slg)).toFixed(3);

  return { avg, obp, slg, ops };
}

function buildLightPlayerBattingResult(player) {
  const stats = player?.gameStats || createEmptyBattingLine();

  return {
    playerId: player?.profile?.id || player?.id || null,
    name: player?.name || "-",
    stats: {
      PA: stats.PA || 0,
      AB: stats.AB || 0,
      H: stats.H || 0,
      doubles: stats.doubles || 0,
      triples: stats.triples || 0,
      HR: stats.HR || 0,
      BB: stats.BB || 0,
      K: stats.K || 0,
      RBI: stats.RBI || 0,
      R: stats.R || 0,
    },
    rates: calcBattingRate(stats),
  };
}

function buildLightTeamBox(teamBox) {
  return {
    runs: teamBox?.runs || 0,
    hits: teamBox?.hits || 0,
    doubles: teamBox?.doubles || 0,
    triples: teamBox?.triples || 0,
    hr: teamBox?.hr || 0,
    walks: teamBox?.walks || 0,
    strikeouts: teamBox?.strikeouts || 0,
    outsInPlay: teamBox?.outsInPlay || 0,
    qoc: {
      Weak: teamBox?.qoc?.Weak || 0,
      Topped: teamBox?.qoc?.Topped || 0,
      Under: teamBox?.qoc?.Under || 0,
      Flare: teamBox?.qoc?.Flare || 0,
      Solid: teamBox?.qoc?.Solid || 0,
      Barrel: teamBox?.qoc?.Barrel || 0,
    },
  };
}

function buildLightTeamResult(team, box, score, side) {
  return {
    side,
    name: team?.name || "-",
    score: score || 0,
    startingPitcher: team?.startingPitcher?.name || "-",
    box: buildLightTeamBox(box),
    lineup: Array.isArray(team?.lineup)
      ? team.lineup.map((player) => buildLightPlayerBattingResult(player))
      : [],
  };
}

function buildWinnerLabel(resultState) {
  if (resultState.score.away > resultState.score.home) return "away";
  if (resultState.score.home > resultState.score.away) return "home";
  return "tie";
}

function buildFinalStatus(resultState) {
  if (!resultState.isComplete) return "in_progress";
  return "final";
}

function createOtherGameSimState(awayTeam, homeTeam) {
  return createInitialSimState(
    structuredClone(awayTeam),
    structuredClone(homeTeam)
  );
}

function simulateOtherGame(awayTeam, homeTeam) {
  const simState = createOtherGameSimState(awayTeam, homeTeam);
  const result = simulateGameMutable(simState, createFastSimulationOptions());

  return {
    away: buildLightTeamResult(result.awayTeam, result.box.away, result.score.away, "away"),
    home: buildLightTeamResult(result.homeTeam, result.box.home, result.score.home, "home"),
    score: {
      away: result.score.away,
      home: result.score.home,
    },
    winner: buildWinnerLabel(result),
    status: buildFinalStatus(result),
    inning: result.finalInning || result.inning,
    half: result.finalHalf || result.half,
  };
}

function createEmptyStandingRow(teamName) {
  return {
    team: teamName,
    W: 0,
    L: 0,
    RS: 0,
    RA: 0,
  };
}

function calcStandingDerived(row, leaderWins = 0) {
  const games = row.W + row.L;
  const pct = games > 0 ? (row.W / games).toFixed(3) : ".000";
  const gb = ((leaderWins - row.W) / 2).toFixed(1);

  return {
    ...row,
    PCT: pct,
    GB: gb,
  };
}

function sortStandings(rows) {
  return [...rows].sort((a, b) => {
    if (b.W !== a.W) return b.W - a.W;
    const aDiff = a.RS - a.RA;
    const bDiff = b.RS - b.RA;
    if (bDiff !== aDiff) return bDiff - aDiff;
    return a.team.localeCompare(b.team);
  });
}

function createScheduleRound(teams) {
  const games = [];

  for (let i = 0; i < teams.length; i += 2) {
    const away = teams[i];
    const home = teams[i + 1];
    if (!away || !home) continue;

    games.push({
      away: structuredClone(away),
      home: structuredClone(home),
    });
  }

  return games;
}

export function createLeagueState(teams, rounds = 10) {
  const rows = {};
  for (const team of teams || []) {
    rows[team.name] = createEmptyStandingRow(team.name);
  }

  const schedule = [];
  for (let i = 0; i < rounds; i += 1) {
    schedule.push(createScheduleRound(teams));
  }

  return {
    day: 1,
    totalDays: schedule.length,
    teams: structuredClone(teams || []),
    schedule,
    standings: rows,
    lastDayResults: [],
    isComplete: schedule.length === 0,
  };
}

function applyGameToStandings(leagueState, result) {
  const awayRow = leagueState.standings[result.away.name];
  const homeRow = leagueState.standings[result.home.name];
  if (!awayRow || !homeRow) return;

  awayRow.RS += result.score.away;
  awayRow.RA += result.score.home;
  homeRow.RS += result.score.home;
  homeRow.RA += result.score.away;

  if (result.score.away > result.score.home) {
    awayRow.W += 1;
    homeRow.L += 1;
  } else if (result.score.home > result.score.away) {
    homeRow.W += 1;
    awayRow.L += 1;
  }
}

export function advanceLeagueDay(prevLeagueState) {
  const next = structuredClone(prevLeagueState);

  if (next.isComplete) {
    next.lastDayResults = [];
    return next;
  }

  const todayGames = next.schedule[next.day - 1] || [];
  const results = todayGames.map((game) => simulateOtherGame(game.away, game.home));

  next.lastDayResults = results;

  for (const result of results) {
    applyGameToStandings(next, result);
  }

  next.day += 1;
  if (next.day > next.totalDays) {
    next.isComplete = true;
  }

  return next;
}

export function getLeagueStandingsTable(leagueState) {
  const sorted = sortStandings(Object.values(leagueState?.standings || {}));
  const leaderWins = sorted[0]?.W || 0;
  return sorted.map((row) => calcStandingDerived(row, leaderWins));
}