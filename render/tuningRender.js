function formatInningText(state) {
  const inning = state.isComplete && state.finalInning ? state.finalInning : state.inning;
  const half = state.isComplete && state.finalHalf ? state.finalHalf : state.half;
  return `${inning}回${half === "top" ? "表" : "裏"}`;
}

function formatRunner(baseRunner) {
  return baseRunner?.name || "なし";
}

function formatBasesLine(bases) {
  const runners = [];
  if (bases?.first) runners.push(`一塁:${bases.first.name}`);
  if (bases?.second) runners.push(`二塁:${bases.second.name}`);
  if (bases?.third) runners.push(`三塁:${bases.third.name}`);
  return runners.length ? runners.join(" / ") : "走者なし";
}

function safeAvg(h, ab) {
  return ab > 0 ? (h / ab).toFixed(3) : ".000";
}

function emptyDisplayedStats() {
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

function getDisplayedPlayerStats(player) {
  return player?.gameStats || player?.seasonStats || emptyDisplayedStats();
}

function qocPctFromMap(qoc) {
  const total = Object.values(qoc || {}).reduce((sum, value) => sum + value, 0);
  const out = {};

  for (const key of Object.keys(qoc || {})) {
    out[key] = total > 0 ? ((qoc[key] / total) * 100).toFixed(1) : "0.0";
  }

  return out;
}

function getDisplayedPitcherName(state, side) {
  return (
    state?.activePitchers?.[side]?.name ||
    (side === "away" ? state?.awayTeam?.startingPitcher?.name : state?.homeTeam?.startingPitcher?.name) ||
    "-"
  );
}

function buildPlayerStatsTable(team) {
  const players = team?.lineup || [];

  if (!players.length) {
    return '<div class="empty-note">選手データがありません。</div>';
  }

  return `
    <table>
      <thead>
        <tr>
          <th>打者</th>
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
        </tr>
      </thead>
      <tbody>
        ${players
          .map(
            (player) => `
              <tr>
                <td>${player.name}</td>
                <td>${getDisplayedPlayerStats(player).PA}</td>
                <td>${getDisplayedPlayerStats(player).AB}</td>
                <td>${getDisplayedPlayerStats(player).H}</td>
                <td>${getDisplayedPlayerStats(player).doubles}</td>
                <td>${getDisplayedPlayerStats(player).triples}</td>
                <td>${getDisplayedPlayerStats(player).HR}</td>
                <td>${getDisplayedPlayerStats(player).BB}</td>
                <td>${getDisplayedPlayerStats(player).K}</td>
                <td>${getDisplayedPlayerStats(player).RBI}</td>
                <td>${getDisplayedPlayerStats(player).R}</td>
                <td>${safeAvg(getDisplayedPlayerStats(player).H, getDisplayedPlayerStats(player).AB)}</td>
              </tr>
            `
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function buildQoCTable(title, qoc, pct) {
  const rows = ["Weak", "Topped", "Under", "Flare", "Solid", "Barrel"];

  return `
    <div class="mini-table-title">${title}</div>
    <table>
      <thead>
        <tr>
          <th>QoC</th>
          <th>回数</th>
          <th>割合</th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .map(
            (key) => `
              <tr>
                <td>${key}</td>
                <td>${qoc?.[key] || 0}</td>
                <td>${pct?.[key] || "0.0"}%</td>
              </tr>
            `
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function buildGameSummaryTable(state) {
  const away = state?.box?.away || {};
  const home = state?.box?.home || {};

  return `
    <table>
      <thead>
        <tr>
          <th>項目</th>
          <th>${state.awayTeam.name}</th>
          <th>${state.homeTeam.name}</th>
        </tr>
      </thead>
      <tbody>
        <tr><td>得点</td><td>${state.score.away}</td><td>${state.score.home}</td></tr>
        <tr><td>安打</td><td>${away.hits || 0}</td><td>${home.hits || 0}</td></tr>
        <tr><td>二塁打</td><td>${away.doubles || 0}</td><td>${home.doubles || 0}</td></tr>
        <tr><td>三塁打</td><td>${away.triples || 0}</td><td>${home.triples || 0}</td></tr>
        <tr><td>本塁打</td><td>${away.hr || 0}</td><td>${home.hr || 0}</td></tr>
        <tr><td>四球</td><td>${away.walks || 0}</td><td>${home.walks || 0}</td></tr>
        <tr><td>三振</td><td>${away.strikeouts || 0}</td><td>${home.strikeouts || 0}</td></tr>
        <tr><td>インプレー凡退</td><td>${away.outsInPlay || 0}</td><td>${home.outsInPlay || 0}</td></tr>
      </tbody>
    </table>
  `;
}

function buildSeasonSummaryTable(season) {
  if (!season) {
    return '<div class="empty-note">まだシーズン結果がありません。</div>';
  }

  return `
    <table>
      <thead>
        <tr>
          <th>項目</th>
          <th>${season.awayName}</th>
          <th>${season.homeName}</th>
        </tr>
      </thead>
      <tbody>
        <tr><td>勝利数</td><td>${season.awayWins}</td><td>${season.homeWins}</td></tr>
        <tr><td>平均得点</td><td>${season.awayRPG}</td><td>${season.homeRPG}</td></tr>
        <tr><td>AVG</td><td>${season.awayRates.avg}</td><td>${season.homeRates.avg}</td></tr>
        <tr><td>OBP</td><td>${season.awayRates.obp}</td><td>${season.homeRates.obp}</td></tr>
        <tr><td>SLG</td><td>${season.awayRates.slg}</td><td>${season.homeRates.slg}</td></tr>
        <tr><td>OPS</td><td>${season.awayRates.ops}</td><td>${season.homeRates.ops}</td></tr>
      </tbody>
    </table>
  `;
}

function buildSeasonPlayerStatsTable(players) {
  if (!players || !players.length) {
    return '<div class="empty-note">まだシーズン結果がありません。</div>';
  }

  return `
    <table>
      <thead>
        <tr>
          <th>打者</th>
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
        </tr>
      </thead>
      <tbody>
        ${players
          .map(
            (player) => `
              <tr>
                <td>${player.name}</td>
                <td>${getDisplayedPlayerStats(player).PA}</td>
                <td>${getDisplayedPlayerStats(player).AB}</td>
                <td>${getDisplayedPlayerStats(player).H}</td>
                <td>${getDisplayedPlayerStats(player).doubles}</td>
                <td>${getDisplayedPlayerStats(player).triples}</td>
                <td>${getDisplayedPlayerStats(player).HR}</td>
                <td>${getDisplayedPlayerStats(player).BB}</td>
                <td>${getDisplayedPlayerStats(player).K}</td>
                <td>${getDisplayedPlayerStats(player).RBI}</td>
                <td>${getDisplayedPlayerStats(player).R}</td>
                <td>${safeAvg(getDisplayedPlayerStats(player).H, getDisplayedPlayerStats(player).AB)}</td>
              </tr>
            `
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function renderCountLights(state, dom) {
  const ballLights = [1, 2, 3];
  const strikeLights = [1, 2];
  const outLights = [1, 2, 3];

  if (dom.ballLights) {
    dom.ballLights.innerHTML = ballLights
      .map((n) => `<span class="count-light ball ${state.balls >= n ? "on" : ""}"></span>`)
      .join("");
  }

  if (dom.strikeLights) {
    dom.strikeLights.innerHTML = strikeLights
      .map((n) => `<span class="count-light strike ${state.strikes >= n ? "on" : ""}"></span>`)
      .join("");
  }

  if (dom.outLights) {
    dom.outLights.innerHTML = outLights
      .map((n) => `<span class="count-light out ${state.outs >= n ? "on" : ""}"></span>`)
      .join("");
  }
}

function renderHeaderBases(state, dom) {
  if (dom.headerBase1) dom.headerBase1.classList.toggle("on", Boolean(state.bases.first));
  if (dom.headerBase2) dom.headerBase2.classList.toggle("on", Boolean(state.bases.second));
  if (dom.headerBase3) dom.headerBase3.classList.toggle("on", Boolean(state.bases.third));
}

function renderZone(state, dom) {
  if (!dom.zoneGrid) return;

  const lastPitch = state.presentation?.lastPitch || {};
  const hitRow = Number.isInteger(lastPitch.zoneRow) ? lastPitch.zoneRow : null;
  const hitCol = Number.isInteger(lastPitch.zoneCol) ? lastPitch.zoneCol : null;

  const cells = [];
  for (let row = 0; row < 5; row += 1) {
    for (let col = 0; col < 5; col += 1) {
      const isStrikeZone = row >= 1 && row <= 3 && col >= 1 && col <= 3;
      const isHit = row === hitRow && col === hitCol;
      cells.push(
        `<div class="zone-cell ${isStrikeZone ? "strike-zone" : "ball-zone"} ${isHit ? "hit" : ""}"></div>`
      );
    }
  }

  dom.zoneGrid.innerHTML = cells.join("");

  if (dom.zoneText) {
    const pitchType = lastPitch.pitchType || "-";
    const course = lastPitch.course || "-";
    const resultText = lastPitch.resultText || "-";
    dom.zoneText.textContent = `${pitchType} / ${course} / ${resultText}`;
  }
}

export function renderGameCore(state, dom) {
  if (dom.awayName) dom.awayName.textContent = state.awayTeam.name;
  if (dom.homeName) dom.homeName.textContent = state.homeTeam.name;
  if (dom.awayPitcher) dom.awayPitcher.textContent = getDisplayedPitcherName(state, "away");
  if (dom.homePitcher) dom.homePitcher.textContent = getDisplayedPitcherName(state, "home");
  if (dom.awayScore) dom.awayScore.textContent = state.score.away;
  if (dom.homeScore) dom.homeScore.textContent = state.score.home;
  if (dom.broadcastInning) dom.broadcastInning.textContent = formatInningText(state);
  if (dom.broadcastStatus) dom.broadcastStatus.textContent = `${state.outs}アウト・${formatBasesLine(state.bases)}`;
  if (dom.inningText) dom.inningText.textContent = formatInningText(state);
  if (dom.outsText) dom.outsText.textContent = `${state.outs}アウト`;
  if (dom.countText) dom.countText.textContent = `${state.balls}-${state.strikes}`;
  if (dom.basesText) dom.basesText.textContent = formatBasesLine(state.bases);
  if (dom.currentBatterText) dom.currentBatterText.textContent = state.presentation?.currentBatterName || "-";
  if (dom.currentPitcherText) dom.currentPitcherText.textContent = state.presentation?.currentPitcherName || "-";
  if (dom.firstRunnerText) dom.firstRunnerText.textContent = `一塁走者: ${formatRunner(state.bases.first)}`;
  if (dom.secondRunnerText) dom.secondRunnerText.textContent = `二塁走者: ${formatRunner(state.bases.second)}`;
  if (dom.thirdRunnerText) dom.thirdRunnerText.textContent = `三塁走者: ${formatRunner(state.bases.third)}`;

  renderCountLights(state, dom);
  renderHeaderBases(state, dom);
}

export function renderPitchPresentation(state, dom) {
  renderZone(state, dom);
}

export function renderLineups(state, dom) {
  if (!dom.lineupBody) return;

  const rows = [];
  for (let i = 0; i < 9; i += 1) {
    const away = state.awayTeam.lineup[i];
    const home = state.homeTeam.lineup[i];

    rows.push(`
      <tr>
        <td>
          <strong>${i + 1}. ${away.name}</strong><br>
          C${away.ratings.contact} / P${away.ratings.power} / E${away.ratings.eye}
        </td>
        <td>
          <strong>${i + 1}. ${home.name}</strong><br>
          C${home.ratings.contact} / P${home.ratings.power} / E${home.ratings.eye}
        </td>
      </tr>
    `);
  }

  dom.lineupBody.innerHTML = rows.join("");
}

export function clearLog(dom) {
  if (dom.log) dom.log.textContent = "";
}

export function appendLog(dom, text) {
  if (!dom.log) return;
  const line = document.createElement("div");
  line.className = "log-line";
  line.textContent = text;
  dom.log.appendChild(line);
  dom.log.scrollTop = dom.log.scrollHeight;
}

export function renderTuningGameTables(state, dom) {
  if (dom.tuningGameSummaryTable) {
    dom.tuningGameSummaryTable.innerHTML = buildGameSummaryTable(state);
  }

  if (dom.tuningAwayPlayerStatsTable) {
    dom.tuningAwayPlayerStatsTable.innerHTML = buildPlayerStatsTable(state.awayTeam);
  }

  if (dom.tuningHomePlayerStatsTable) {
    dom.tuningHomePlayerStatsTable.innerHTML = buildPlayerStatsTable(state.homeTeam);
  }

  if (dom.tuningAwayQoCTable) {
    dom.tuningAwayQoCTable.innerHTML = buildQoCTable(
      `${state.awayTeam.name} QoC`,
      state.box.away.qoc,
      qocPctFromMap(state.box.away.qoc)
    );
  }

  if (dom.tuningHomeQoCTable) {
    dom.tuningHomeQoCTable.innerHTML = buildQoCTable(
      `${state.homeTeam.name} QoC`,
      state.box.home.qoc,
      qocPctFromMap(state.box.home.qoc)
    );
  }

  if (dom.tuningCurrentScore) {
    dom.tuningCurrentScore.textContent = `${state.awayTeam.name} ${state.score.away} - ${state.score.home} ${state.homeTeam.name}`;
  }

  if (dom.tuningCurrentState) {
    dom.tuningCurrentState.textContent = `${formatInningText(state)} / ${state.outs}アウト / ${formatBasesLine(state.bases)}`;
  }
}

export function renderTuningSeasonTables(season, dom) {
  if (dom.tuningSeasonHeadline) {
    dom.tuningSeasonHeadline.textContent = season ? `${season.games}試合シミュレーション` : "シーズン結果";
  }

  if (dom.tuningSeasonGamesValue) {
    dom.tuningSeasonGamesValue.textContent = season ? String(season.games) : "-";
  }

  if (dom.tuningSeasonRecordValue) {
    dom.tuningSeasonRecordValue.textContent = season
      ? `${season.awayName} ${season.awayWins}勝 - ${season.homeWins}勝 ${season.homeName}`
      : "-";
  }

  if (dom.tuningSeasonSummaryTable) {
    dom.tuningSeasonSummaryTable.innerHTML = buildSeasonSummaryTable(season);
  }

  if (dom.tuningSeasonAwayQoCTable) {
    dom.tuningSeasonAwayQoCTable.innerHTML = season
      ? buildQoCTable(`${season.awayName} シーズンQoC`, season.away.qoc, season.awayQoCPct)
      : '<div class="empty-note">まだシーズン結果がありません。</div>';
  }

  if (dom.tuningSeasonHomeQoCTable) {
    dom.tuningSeasonHomeQoCTable.innerHTML = season
      ? buildQoCTable(`${season.homeName} シーズンQoC`, season.home.qoc, season.homeQoCPct)
      : '<div class="empty-note">まだシーズン結果がありません。</div>';
  }

  if (dom.tuningSeasonAwayPlayerStatsTable) {
    dom.tuningSeasonAwayPlayerStatsTable.innerHTML = buildSeasonPlayerStatsTable(season?.awayPlayers || []);
  }

  if (dom.tuningSeasonHomePlayerStatsTable) {
    dom.tuningSeasonHomePlayerStatsTable.innerHTML = buildSeasonPlayerStatsTable(season?.homePlayers || []);
  }
}