import {
  buildPlayerRows,
  buildTeamRows,
  sortPlayerRows,
  filterPlayerRows,
  getLeader,
} from "../engine/stats/statsEngine.js";

function safeNum(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function to3(value) {
  return Number.isFinite(Number(value)) ? Number(value).toFixed(3) : ".000";
}

function buildPlayerStatsTable(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return `<div class="empty-note">まだリーグ選手成績がありません。</div>`;
  }

  return `
    <table class="stats-table">
      <thead>
        <tr>
          <th>#</th>
          <th>選手</th>
          <th>球団</th>
          <th>PA</th>
          <th>AB</th>
          <th>H</th>
          <th>2B</th>
          <th>3B</th>
          <th>HR</th>
          <th>BB</th>
          <th>K</th>
          <th>RBI</th>
          <th>R</th>
          <th>AVG</th>
          <th>OBP</th>
          <th>SLG</th>
          <th>OPS</th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .map(
            (row, index) => `
              <tr>
                <td>${index + 1}</td>
                <td>${row.name}</td>
                <td>${row.teamName}</td>
                <td>${safeNum(row.stats.PA)}</td>
                <td>${safeNum(row.stats.AB)}</td>
                <td>${safeNum(row.stats.H)}</td>
                <td>${safeNum(row.stats.doubles)}</td>
                <td>${safeNum(row.stats.triples)}</td>
                <td>${safeNum(row.stats.HR)}</td>
                <td>${safeNum(row.stats.BB)}</td>
                <td>${safeNum(row.stats.K)}</td>
                <td>${safeNum(row.stats.RBI)}</td>
                <td>${safeNum(row.stats.R)}</td>
                <td>${to3(row.AVG)}</td>
                <td>${to3(row.OBP)}</td>
                <td>${to3(row.SLG)}</td>
                <td>${to3(row.OPS)}</td>
              </tr>
            `
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function buildTeamSummaryTable(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return `<div class="empty-note">まだリーグチーム成績がありません。</div>`;
  }

  return `
    <table class="stats-table">
      <thead>
        <tr>
          <th>球団</th>
          <th>G</th>
          <th>R</th>
          <th>H</th>
          <th>HR</th>
          <th>BB</th>
          <th>K</th>
          <th>AVG</th>
          <th>OBP</th>
          <th>SLG</th>
          <th>OPS</th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .map(
            (row) => `
              <tr>
                <td>${row.teamName}</td>
                <td>${safeNum(row.games)}</td>
                <td>${safeNum(row.runs)}</td>
                <td>${safeNum(row.hits)}</td>
                <td>${safeNum(row.hr)}</td>
                <td>${safeNum(row.walks)}</td>
                <td>${safeNum(row.strikeouts)}</td>
                <td>${to3(row.AVG)}</td>
                <td>${to3(row.OBP)}</td>
                <td>${to3(row.SLG)}</td>
                <td>${to3(row.OPS)}</td>
              </tr>
            `
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function buildLeadersBox(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return `<div class="empty-note">ハイライト対象がありません。</div>`;
  }

  const opsLeader = getLeader(rows, "OPS");
  const hrLeader = getLeader(rows, "HR");
  const avgLeader = getLeader(rows.filter((row) => safeNum(row.stats.PA) > 0), "AVG");

  return `
    <div class="leaders-grid">
      <article class="leader-card">
        <h4>OPS Leader</h4>
        <strong>${opsLeader ? opsLeader.name : "-"}</strong>
        <p>${opsLeader ? `${opsLeader.teamName} / OPS ${to3(opsLeader.OPS)}` : "-"}</p>
      </article>
      <article class="leader-card">
        <h4>HR Leader</h4>
        <strong>${hrLeader ? hrLeader.name : "-"}</strong>
        <p>${hrLeader ? `${hrLeader.teamName} / HR ${safeNum(hrLeader.stats.HR)}` : "-"}</p>
      </article>
      <article class="leader-card">
        <h4>AVG Leader</h4>
        <strong>${avgLeader ? avgLeader.name : "-"}</strong>
        <p>${avgLeader ? `${avgLeader.teamName} / AVG ${to3(avgLeader.AVG)}` : "-"}</p>
      </article>
    </div>
  `;
}

export function renderStatsPage(dom, statsIndex, controlledTeamName, statsPageState) {
  const teamRows = buildTeamRows(statsIndex);
  const playerRows = buildPlayerRows(statsIndex);
  const teamNames = teamRows.map((row) => row.teamName).sort();

  if (dom.statsTeamFilter) {
    const currentTeam = dom.statsTeamFilter.value || statsPageState.filters.team || "all";
    dom.statsTeamFilter.innerHTML = [
      `<option value="all">全チーム</option>`,
      ...teamNames.map((name) => `<option value="${name}">${name}</option>`),
    ].join("");
    dom.statsTeamFilter.value = teamNames.includes(currentTeam) ? currentTeam : "all";
  }

  statsPageState.filters.team = dom.statsTeamFilter?.value || "all";
  statsPageState.filters.scope = dom.statsScopeFilter?.value || "all";
  statsPageState.filters.sortKey = dom.statsSortKey?.value || "OPS";
  statsPageState.filters.search = dom.statsSearchInput?.value || "";
  statsPageState.filters.minPA = safeNum(dom.statsMinPAInput?.value, 0);

  let filteredPlayers = filterPlayerRows(playerRows, statsPageState.filters);

  if (statsPageState.filters.scope === "controlled") {
    filteredPlayers = filteredPlayers.filter((row) => row.teamName === controlledTeamName);
  }

  const sortedPlayers = sortPlayerRows(filteredPlayers, statsPageState.filters.sortKey);

  let filteredTeams = teamRows.filter(
    (row) =>
      statsPageState.filters.team === "all" ||
      row.teamName === statsPageState.filters.team
  );

  if (statsPageState.filters.scope === "controlled") {
    filteredTeams = filteredTeams.filter((row) => row.teamName === controlledTeamName);
  }

  if (dom.statsRecordedDaysValue) dom.statsRecordedDaysValue.textContent = String(statsIndex.recordedDays);
  if (dom.statsTeamsValue) dom.statsTeamsValue.textContent = String(teamRows.length);
  if (dom.statsPlayersValue) dom.statsPlayersValue.textContent = String(playerRows.length);
  if (dom.statsCurrentTeamValue) dom.statsCurrentTeamValue.textContent = controlledTeamName || "-";
  if (dom.statsPlayersTable) dom.statsPlayersTable.innerHTML = buildPlayerStatsTable(sortedPlayers);
  if (dom.statsTeamSummaryTable) dom.statsTeamSummaryTable.innerHTML = buildTeamSummaryTable(filteredTeams);
  if (dom.statsLeadersBox) dom.statsLeadersBox.innerHTML = buildLeadersBox(playerRows);
}