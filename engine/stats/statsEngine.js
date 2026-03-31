function safeNum(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function createEmptyBattingStats() {
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

function createEmptyTeamSummary() {
  return {
    games: 0,
    runs: 0,
    hits: 0,
    doubles: 0,
    triples: 0,
    hr: 0,
    walks: 0,
    strikeouts: 0,
    outsInPlay: 0,
  };
}

function calcRates(stats) {
  const pa = safeNum(stats.PA);
  const ab = safeNum(stats.AB);
  const h = safeNum(stats.H);
  const bb = safeNum(stats.BB);
  const doubles = safeNum(stats.doubles);
  const triples = safeNum(stats.triples);
  const hr = safeNum(stats.HR);
  const singles = Math.max(0, h - doubles - triples - hr);
  const tb = singles + doubles * 2 + triples * 3 + hr * 4;

  const avg = ab > 0 ? Number((h / ab).toFixed(3)) : 0;
  const obp = pa > 0 ? Number(((h + bb) / pa).toFixed(3)) : 0;
  const slg = ab > 0 ? Number((tb / ab).toFixed(3)) : 0;
  const ops = Number((obp + slg).toFixed(3));

  return { avg, obp, slg, ops };
}

function addBattingStats(target, source) {
  target.PA += safeNum(source.PA);
  target.AB += safeNum(source.AB);
  target.H += safeNum(source.H);
  target.doubles += safeNum(source.doubles);
  target.triples += safeNum(source.triples);
  target.HR += safeNum(source.HR);
  target.BB += safeNum(source.BB);
  target.K += safeNum(source.K);
  target.RBI += safeNum(source.RBI);
  target.R += safeNum(source.R);
}

function addTeamBox(target, source) {
  target.runs += safeNum(source.runs);
  target.hits += safeNum(source.hits);
  target.doubles += safeNum(source.doubles);
  target.triples += safeNum(source.triples);
  target.hr += safeNum(source.hr);
  target.walks += safeNum(source.walks);
  target.strikeouts += safeNum(source.strikeouts);
  target.outsInPlay += safeNum(source.outsInPlay);
}

export function createStatsIndex() {
  return {
    recordedDays: 0,
    teams: {},
    players: {},
  };
}

function ensureTeam(index, teamName) {
  if (!index.teams[teamName]) {
    index.teams[teamName] = createEmptyTeamSummary();
  }
  return index.teams[teamName];
}

function buildPlayerKey(teamName, playerId, playerName) {
  if (playerId) return `player:${playerId}`;
  return `legacy:${teamName}__${playerName}`;
}

function ensurePlayer(index, teamName, playerId, playerName) {
  const key = buildPlayerKey(teamName, playerId, playerName);

  if (!index.players[key]) {
    index.players[key] = {
      key,
      playerId: playerId || null,
      teamName,
      name: playerName,
      stats: createEmptyBattingStats(),
    };
  } else {
    index.players[key].teamName = teamName;
    index.players[key].name = playerName;
    if (playerId) {
      index.players[key].playerId = playerId;
    }
  }

  return index.players[key];
}

function ingestSide(index, sideResult) {
  if (!sideResult?.name) return;

  const team = ensureTeam(index, sideResult.name);
  team.games += 1;
  addTeamBox(team, sideResult.box || {});

  for (const player of sideResult.lineup || []) {
    const entry = ensurePlayer(
      index,
      sideResult.name,
      player?.playerId || null,
      player?.name || "-"
    );
    addBattingStats(entry.stats, player?.stats || {});
  }
}

export function ingestLastDayResults(index, results) {
  if (!Array.isArray(results) || results.length === 0) return index;

  const next = structuredClone(index);
  next.recordedDays += 1;

  for (const result of results) {
    ingestSide(next, result?.away);
    ingestSide(next, result?.home);
  }

  return next;
}

export function buildPlayerRows(index) {
  return Object.values(index.players).map((entry) => {
    const rates = calcRates(entry.stats);
    return {
      ...entry,
      AVG: rates.avg,
      OBP: rates.obp,
      SLG: rates.slg,
      OPS: rates.ops,
    };
  });
}

export function buildTeamRows(index) {
  return Object.entries(index.teams).map(([teamName, team]) => {
    const pa = Math.max(1, safeNum(team.games) * 38);
    const ab = Math.max(1, pa - safeNum(team.walks));
    const singles = Math.max(
      0,
      safeNum(team.hits) - safeNum(team.doubles) - safeNum(team.triples) - safeNum(team.hr)
    );
    const tb =
      singles +
      safeNum(team.doubles) * 2 +
      safeNum(team.triples) * 3 +
      safeNum(team.hr) * 4;

    const avg = ab > 0 ? Number((safeNum(team.hits) / ab).toFixed(3)) : 0;
    const obp = pa > 0 ? Number(((safeNum(team.hits) + safeNum(team.walks)) / pa).toFixed(3)) : 0;
    const slg = ab > 0 ? Number((tb / ab).toFixed(3)) : 0;
    const ops = Number((obp + slg).toFixed(3));

    return {
      teamName,
      games: safeNum(team.games),
      runs: safeNum(team.runs),
      hits: safeNum(team.hits),
      hr: safeNum(team.hr),
      walks: safeNum(team.walks),
      strikeouts: safeNum(team.strikeouts),
      AVG: avg,
      OBP: obp,
      SLG: slg,
      OPS: ops,
    };
  });
}

export function sortPlayerRows(rows, sortKey = "OPS") {
  const sorted = [...rows];

  sorted.sort((a, b) => {
    if (sortKey === "name" || sortKey === "teamName") {
      return String(a?.[sortKey] || "").localeCompare(String(b?.[sortKey] || ""));
    }

    const aVal = sortKey in a ? a[sortKey] : a?.stats?.[sortKey];
    const bVal = sortKey in b ? b[sortKey] : b?.stats?.[sortKey];
    return safeNum(bVal) - safeNum(aVal);
  });

  return sorted;
}

export function filterPlayerRows(rows, filters = {}) {
  return (rows || []).filter((row) => {
    const matchTeam =
      !filters.team ||
      filters.team === "all" ||
      row.teamName === filters.team;

    const search = String(filters.search || "").trim().toLowerCase();
    const matchSearch =
      !search ||
      String(row.name || "").toLowerCase().includes(search) ||
      String(row.teamName || "").toLowerCase().includes(search);

    const minPA = safeNum(filters.minPA, 0);
    const matchPA = safeNum(row?.stats?.PA, 0) >= minPA;

    return matchTeam && matchSearch && matchPA;
  });
}

export function getLeader(rows, key) {
  if (!Array.isArray(rows) || rows.length === 0) return null;

  let best = null;
  let bestValue = -Infinity;

  for (const row of rows) {
    const value = key in row ? row[key] : row?.stats?.[key];
    const numeric = safeNum(value, -Infinity);
    if (numeric > bestValue) {
      best = row;
      bestValue = numeric;
    }
  }

  return best;
}