import { getMeasurementModelLimitations } from "../services/measurement/measurementReportService.js";

function setText(element, value) {
  if (element) element.textContent = String(value ?? "-");
}

function formatNumber(value, digits = 3) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "0";
  return Number.isInteger(number) ? String(number) : number.toFixed(digits);
}

function formatPct(value) {
  return `${(Number(value || 0) * 100).toFixed(2)}%`;
}

function renderTable(container, headers, rows) {
  if (!container) return;
  const table = document.createElement("table");
  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");

  for (const header of headers) {
    const th = document.createElement("th");
    th.textContent = header;
    headerRow.append(th);
  }

  thead.append(headerRow);
  table.append(thead);
  const tbody = document.createElement("tbody");

  for (const row of rows) {
    const tr = document.createElement("tr");
    for (const value of row) {
      const td = document.createElement("td");
      td.textContent = String(value ?? "-");
      tr.append(td);
    }
    tbody.append(tr);
  }

  table.append(tbody);
  container.replaceChildren(table);
}

function renderKpis(container, summary) {
  if (!container) return;
  if (!summary) {
    container.replaceChildren();
    return;
  }

  const combined = summary.results.combined;
  const metrics = summary.battedBallMetrics;
  const discipline = summary.plateDiscipline?.combined || {};
  const profile = summary.battingProfiles?.combined || {};
  const values = [
    ["Completed", summary.run.completedGames],
    ["Runs / Team", formatNumber(combined.averageRuns, 2)],
    ["AVG", formatNumber(combined.AVG)],
    ["OBP", formatNumber(combined.OBP)],
    ["SLG", formatNumber(combined.SLG)],
    ["OPS", formatNumber(combined.OPS)],
    ["BB%", formatPct(combined.BBPct)],
    ["K%", formatPct(combined.KPct)],
    ["HR%", formatPct(combined.HRPct)],
    ["Pitches", formatNumber(discipline.pitches)],
    ["HardHit%", formatPct(profile.hardHitPct)],
    ["Avg EV", `${formatNumber(metrics.averageExitVelocity, 2)} mph`],
    ["Avg LA", `${formatNumber(metrics.averageLaunchAngle, 2)} deg`],
  ];

  const fragment = document.createDocumentFragment();
  for (const [label, value] of values) {
    const item = document.createElement("div");
    item.className = "measurement-kpi";
    const labelElement = document.createElement("div");
    labelElement.className = "measurement-kpi-label";
    labelElement.textContent = label;
    const valueElement = document.createElement("div");
    valueElement.className = "measurement-kpi-value";
    valueElement.textContent = String(value);
    item.append(labelElement, valueElement);
    fragment.append(item);
  }
  container.replaceChildren(fragment);
}

function renderTeamResults(container, summary) {
  if (!summary) {
    container?.replaceChildren();
    return;
  }
  const results = summary.results;
  const rows = [
    ["G", "G", false],
    ["Wins", "wins", false],
    ["Runs", "runs", false],
    ["Runs/Game/Team", "averageRuns", false],
    ["PA", "PA", false],
    ["AB", "AB", false],
    ["H", "H", false],
    ["1B", "singles", false],
    ["2B", "doubles", false],
    ["3B", "triples", false],
    ["HR", "HR", false],
    ["BB", "BB", false],
    ["K", "K", false],
    ["Swinging K", "swingingK", false],
    ["Looking K", "lookingK", false],
    ["XBH", "XBH", false],
    ["RBI", "RBI", false],
    ["TB", "totalBases", false],
    ["AVG", "AVG", false],
    ["OBP", "OBP", false],
    ["SLG", "SLG", false],
    ["OPS", "OPS", false],
    ["ISO", "ISO", false],
    ["BABIP", "BABIP", false],
    ["BB%", "BBPct", true],
    ["K%", "KPct", true],
    ["HR%", "HRPct", true],
  ].map(([label, key, percentage]) => [
    label,
    percentage ? formatPct(results.away[key]) : formatNumber(results.away[key]),
    percentage ? formatPct(results.home[key]) : formatNumber(results.home[key]),
    percentage
      ? formatPct(results.combined[key])
      : formatNumber(results.combined[key]),
  ]);
  renderTable(container, ["Item", "Away", "Home", "Combined"], rows);
}

function renderSideMetrics(container, data, rows) {
  renderTable(
    container,
    ["Item", "Away", "Home", "Combined"],
    rows.map(([label, key, percentage, child]) => {
      const display = (side) => {
        const raw = child ? data?.[side]?.[key]?.[child] : data?.[side]?.[key];
        return percentage ? formatPct(raw) : formatNumber(raw);
      };
      return [label, display("away"), display("home"), display("combined")];
    })
  );
}

function renderGameDistribution(container, distribution) {
  renderTable(container, ["Metric", "Value"], [
    ["Games", distribution?.games || 0],
    ["Average run differential", formatNumber(distribution?.averageRunDifferential)],
    ["One-run game%", formatPct(distribution?.oneRunGamePct)],
    ["Shutout team-game%", formatPct(distribution?.shutoutPct)],
    ["Extra-inning%", formatPct(distribution?.extraInningPct)],
    ["Average final inning", formatNumber(distribution?.averageFinalInning)],
    ["Away win%", formatPct(distribution?.awayWinPct)],
    ["Home win%", formatPct(distribution?.homeWinPct)],
    ["Walk-off%", formatPct(distribution?.walkOffPct)],
    [
      "Score P10 / P50 / P90",
      `${formatNumber(distribution?.score?.combined?.p10)} / ${formatNumber(distribution?.score?.combined?.p50)} / ${formatNumber(distribution?.score?.combined?.p90)}`,
    ],
  ]);
}

function renderPlateDiscipline(container, data) {
  renderSideMetrics(container, data, [
    ["Pitches", "pitches"],
    ["PA", "PA"],
    ["Zone%", "zonePct", true],
    ["Swing%", "swingPct", true],
    ["Z-Swing%", "zSwingPct", true],
    ["Chase%", "chasePct", true],
    ["Contact%", "contactPct", true],
    ["Z-Contact%", "zoneContactPct", true],
    ["Chase Contact%", "chaseContactPct", true],
    ["Whiff%", "whiffPct", true],
    ["Called Strike%", "calledStrikePct", true],
    ["Foul%", "foulPct", true],
    ["BIP/Pitch", "bipPerPitch", true],
    ["CSW%", "cswPct", true],
    ["First-pitch Strike%", "firstPitchStrikePct", true],
  ]);
}

function renderBattedProfile(container, data) {
  renderSideMetrics(container, data, [
    ["BIP", "BIP"],
    ["Average EV", "averageExitVelocity"],
    ["Max EV", "exitVelocity", false, "max"],
    ["EV P90", "exitVelocity", false, "p90"],
    ["Average LA", "averageLaunchAngle"],
    ["LA P50", "launchAngle", false, "p50"],
    ["GB%", "GBPct", true],
    ["LD%", "LDPct", true],
    ["FB%", "FBPct", true],
    ["PU%", "PUPct", true],
    ["AIR%", "AIRPct", true],
    ["HR/FB", "homeRunPerFlyBall", true],
    ["HardHit%", "hardHitPct", true],
    ["SweetSpot%", "sweetSpotPct", true],
  ]);
}

function renderPitchBreakdown(container, group) {
  const rows = Object.entries(group?.combined || {}).map(([key, value]) => [
    key,
    value.pitches || 0,
    formatPct(value.zonePct),
    formatPct(value.swingPct),
    formatPct(value.chasePct),
    formatPct(value.contactPct),
    formatPct(value.whiffPct),
    formatPct(value.cswPct),
    value.fairBattedBalls || 0,
    formatNumber(value.AVG),
    formatNumber(value.SLG),
  ]);
  renderTable(
    container,
    ["Group", "Pitches", "Zone%", "Swing%", "Chase%", "Contact%", "Whiff%", "CSW%", "BIP", "AVG", "SLG"],
    rows
  );
}

function renderPitchTypeBreakdown(container, group) {
  const rows = Object.entries(group?.combined || {}).map(([key, value]) => [
    key,
    value.pitches || 0,
    formatPct(value.usagePct),
    formatPct(value.zonePct),
    formatPct(value.swingPct),
    formatPct(value.chasePct),
    formatPct(value.contactPct),
    formatPct(value.whiffPct),
    value.PA || 0,
    formatNumber(value.AVG),
    formatNumber(value.SLG),
  ]);
  renderTable(
    container,
    ["Pitch Type", "Pitches", "Usage%", "Zone%", "Swing%", "Chase%", "Contact%", "Whiff%", "PA", "AVG", "SLG"],
    rows
  );
}

function renderCourseBreakdown(container, group) {
  const rows = Object.entries(group?.combined || {}).map(([key, value]) => [
    key,
    value.pitches || 0,
    value.batted?.BIP || 0,
    formatNumber(value.batted?.averageExitVelocity, 2),
    formatNumber(value.batted?.averageLaunchAngle, 2),
    formatPct(value.batted?.rates?.out),
    formatPct(value.batted?.rates?.single),
    formatPct(value.batted?.rates?.double),
    formatPct(value.batted?.rates?.triple),
    formatPct(value.batted?.rates?.homeRun),
  ]);
  renderTable(
    container,
    ["Course", "Pitches", "BIP", "Avg EV", "Avg LA", "Out%", "1B%", "2B%", "3B%", "HR%"],
    rows
  );
}

function renderBattedBreakdown(container, group) {
  const rows = Object.entries(group?.combined || {}).map(([key, value]) => [
    key,
    value.BIP || 0,
    formatNumber(value.averageExitVelocity, 2),
    formatNumber(value.averageLaunchAngle, 2),
    formatPct(value.rates?.out),
    formatPct(value.rates?.single),
    formatPct(value.rates?.double),
    formatPct(value.rates?.triple),
    formatPct(value.rates?.homeRun),
  ]);
  renderTable(
    container,
    ["Group", "BIP", "Avg EV", "Avg LA", "Out%", "1B%", "2B%", "3B%", "HR%"],
    rows
  );
}

function renderOutcomeBreakdowns(container, breakdowns) {
  if (!container) return;
  const fragment = document.createDocumentFragment();
  for (const [label, group] of [
    ["QoC", breakdowns?.qoc],
    ["Source", breakdowns?.source],
    ["Sample Quality", breakdowns?.sampleQuality],
    ["Neighbor Mode", breakdowns?.neighborMode],
    ["Expansion Level", breakdowns?.expansionLevel],
  ]) {
    const heading = document.createElement("h4");
    heading.textContent = label;
    const tableHost = document.createElement("div");
    renderBattedBreakdown(tableHost, group);
    fragment.append(heading, tableHost);
  }
  container.replaceChildren(fragment);
}

function renderPitchQualityBreakdowns(container, breakdowns) {
  if (!container) return;
  const fragment = document.createDocumentFragment();
  for (const [label, group] of [
    ["Strike Type", breakdowns?.strikeType],
    ["Ball Type", breakdowns?.ballType],
    ["Mistake", breakdowns?.mistake],
    ["Drift", breakdowns?.drift],
  ]) {
    const heading = document.createElement("h4");
    heading.textContent = label;
    const tableHost = document.createElement("div");
    renderPitchBreakdown(tableHost, group);
    fragment.append(heading, tableHost);
  }
  container.replaceChildren(fragment);
}

function renderSmoothingPercentiles(container, data) {
  const rows = Object.entries(data?.combined || {}).map(([key, value]) => [
    key,
    value.count || 0,
    formatNumber(value.average),
    formatNumber(value.standardDeviation),
    formatNumber(value.min),
    formatNumber(value.p10),
    formatNumber(value.p25),
    formatNumber(value.p50),
    formatNumber(value.p75),
    formatNumber(value.p90),
    formatNumber(value.p95),
    formatNumber(value.max),
  ]);
  renderTable(
    container,
    ["Metric", "N", "Mean", "SD", "Min", "P10", "P25", "P50", "P75", "P90", "P95", "Max"],
    rows
  );
}

function renderPlayers(container, players) {
  const rows = ["away", "home"].flatMap((side) =>
    (players?.[side] || []).map((player) => [
      side,
      player.lineupOrder,
      player.name,
      player.PA,
      formatNumber(player.AVG),
      formatNumber(player.OBP),
      formatNumber(player.SLG),
      formatNumber(player.OPS),
      player.HR,
      formatPct(player.BBPct),
      formatPct(player.KPct),
      formatNumber(player.averageExitVelocity, 2),
      formatPct(player.hardHitPct),
    ])
  );
  renderTable(
    container,
    ["Side", "#", "Player", "PA", "AVG", "OBP", "SLG", "OPS", "HR", "BB%", "K%", "Avg EV", "HardHit%"],
    rows
  );
}

function renderPitchers(container, pitchers) {
  const rows = ["away", "home"].flatMap((side) =>
    (pitchers?.[side] || []).map((pitcher) => [
      side,
      pitcher.name,
      pitcher.role,
      pitcher.pitches,
      pitcher.BF,
      pitcher.inningsPitched,
      pitcher.H,
      pitcher.HR,
      pitcher.BB,
      pitcher.K,
      formatPct(pitcher.KPct),
      formatPct(pitcher.BBPct),
      formatNumber(pitcher.WHIP),
    ])
  );
  renderTable(
    container,
    ["Team", "Pitcher", "Role", "Pitches", "BF", "IP", "H", "HR", "BB", "K", "K%", "BB%", "WHIP"],
    rows
  );
}

function renderLimitations(container) {
  if (!container) return;
  const limitations = getMeasurementModelLimitations();
  const list = document.createElement("ul");
  for (const item of limitations.unavailableMetrics) {
    const line = document.createElement("li");
    line.textContent = `${item.metric}: ${item.reason}`;
    list.append(line);
  }
  for (const note of limitations.interpretationNotes) {
    const line = document.createElement("li");
    line.textContent = `Note: ${note}`;
    list.append(line);
  }
  container.replaceChildren(list);
}

function renderAdvancedDiagnostics(dom, summary) {
  if (!summary) {
    for (const container of [
      dom.gameDistribution,
      dom.plateDiscipline,
      dom.battedProfile,
      dom.countBreakdown,
      dom.pitchTypeBreakdown,
      dom.velocityBandBreakdown,
      dom.courseBreakdown,
      dom.qualityBreakdowns,
      dom.evBandBreakdown,
      dom.laBandBreakdown,
      dom.outcomeBreakdowns,
      dom.smoothingPercentiles,
      dom.players,
      dom.pitchers,
    ]) {
      container?.replaceChildren();
    }
    renderLimitations(dom.limitations);
    return;
  }
  renderGameDistribution(dom.gameDistribution, summary.gameDistribution);
  renderPlateDiscipline(dom.plateDiscipline, summary.plateDiscipline);
  renderBattedProfile(dom.battedProfile, summary.battingProfiles);
  renderPitchBreakdown(dom.countBreakdown, summary.breakdowns?.count);
  renderPitchTypeBreakdown(dom.pitchTypeBreakdown, summary.breakdowns?.pitchType);
  renderPitchBreakdown(dom.velocityBandBreakdown, summary.breakdowns?.velocityBand);
  renderCourseBreakdown(dom.courseBreakdown, summary.breakdowns?.course);
  renderPitchQualityBreakdowns(dom.qualityBreakdowns, summary.breakdowns);
  renderBattedBreakdown(dom.evBandBreakdown, summary.breakdowns?.evBand);
  renderBattedBreakdown(dom.laBandBreakdown, summary.breakdowns?.laBand);
  renderOutcomeBreakdowns(dom.outcomeBreakdowns, summary.breakdowns);
  renderSmoothingPercentiles(dom.smoothingPercentiles, summary.smoothingDiagnostics);
  renderPlayers(dom.players, summary.players);
  renderPitchers(dom.pitchers, summary.pitchers);
  renderLimitations(dom.limitations);
}

function renderDistribution(container, distribution) {
  const rows = Object.entries(distribution || {}).map(([key, value]) => [
    key,
    value.count,
    formatPct(value.pct),
  ]);
  renderTable(container, ["Category", "Count", "Pct"], rows);
}

function renderSmoothing(dom, summary) {
  if (!summary) {
    for (const container of [
      dom.smoothingSummary,
      dom.sourceTable,
      dom.sampleQualityTable,
      dom.neighborModeTable,
      dom.neighborOutcomes,
    ]) {
      container?.replaceChildren();
    }
    return;
  }

  const metrics = summary.battedBallMetrics;
  renderTable(dom.smoothingSummary, ["Metric", "Value"], [
    ["Fair batted balls", metrics.fairBattedBalls],
    ["Average EV", `${formatNumber(metrics.averageExitVelocity, 3)} mph`],
    ["Average LA", `${formatNumber(metrics.averageLaunchAngle, 3)} deg`],
    ["EV range", `${formatNumber(metrics.exitVelocityMin, 1)} - ${formatNumber(metrics.exitVelocityMax, 1)}`],
    ["LA range", `${formatNumber(metrics.launchAngleMin, 1)} - ${formatNumber(metrics.launchAngleMax, 1)}`],
    ["Negative LA", `${metrics.negativeLACount} / ${formatPct(metrics.negativeLAPct)}`],
    ["Average targetWeight", formatNumber(metrics.averageTargetWeight, 6)],
    ["Average target batted balls", formatNumber(metrics.averageTargetBattedBalls, 3)],
    ["Average neighbor ESS", formatNumber(metrics.averageNeighborEffectiveSampleSize, 3)],
    ["Negative LA HR constraint", metrics.physicalConstraints.negative_launch_angle_no_direct_home_run],
  ]);
  renderDistribution(dom.sourceTable, metrics.source);
  renderDistribution(dom.sampleQualityTable, metrics.sampleQuality);
  renderDistribution(dom.neighborModeTable, metrics.neighborMode);

  const outcomeRows = Object.entries(metrics.neighborModeOutcomes || {}).map(
    ([mode, value]) => [
      mode,
      value.fairBattedBalls,
      formatPct(value.rates.out),
      formatPct(value.rates.single),
      formatPct(value.rates.double),
      formatPct(value.rates.triple),
      formatPct(value.rates.homeRun),
    ]
  );
  renderTable(
    dom.neighborOutcomes,
    ["Mode", "BIP", "Out%", "1B%", "2B%", "3B%", "HR%"],
    outcomeRows
  );
}

function renderQoC(container, summary) {
  if (!summary) {
    container?.replaceChildren();
    return;
  }
  const rows = [];
  for (const side of ["away", "home", "combined"]) {
    for (const [qoc, value] of Object.entries(summary.qoc[side] || {})) {
      rows.push([side, qoc, value.count, formatPct(value.pct)]);
    }
  }
  renderTable(container, ["Side", "QoC", "Count", "Pct"], rows);
}

function renderDiagnostics(dom, summary) {
  if (!summary) {
    dom.diagnostics?.replaceChildren();
    dom.simulationErrors?.replaceChildren();
    return;
  }
  const entries = Object.entries(summary.diagnostics || {});
  renderTable(
    dom.diagnostics,
    ["Diagnostic", "Count"],
    entries.map(([key, value]) => [key, value])
  );
  const hasWarnings = entries.some(([, value]) => Number(value) > 0);
  dom.diagnostics?.classList.toggle("measurement-warning", hasWarnings);

  renderTable(
    dom.simulationErrors,
    ["Game", "Code", "Message"],
    (summary.simulationErrors || []).map((error) => [
      error.gameIndex,
      error.code,
      error.message,
    ])
  );
}

export function renderMeasurementPage(state, dom) {
  if (!dom.measurementPage) return;
  const isRunning = ["loading", "running", "cancelling"].includes(state.status);
  const attempts = state.completedGames + state.failedGames;
  const requestedGames = Math.max(0, state.requestedGames || 0);
  const progressPct = requestedGames > 0 ? attempts / requestedGames : 0;
  const teams = state.teams || {};

  setText(dom.awayTeam, teams.away?.name || "-");
  setText(dom.homeTeam, teams.home?.name || "-");
  setText(dom.awayStarter, teams.away?.startingPitcher?.name || "-");
  setText(dom.homeStarter, teams.home?.startingPitcher?.name || "-");
  setText(
    dom.lineupSize,
    `${teams.away?.lineup?.length || 0} / ${teams.home?.lineup?.length || 0}`
  );
  setText(dom.activeSeed, state.seed);
  setText(dom.activeGameCount, requestedGames || state.gameCount);

  setText(dom.status, state.status);
  dom.status?.classList.toggle("warning", state.status === "error");
  dom.status?.classList.toggle(
    "ok",
    state.status === "completed" || state.status === "cancelled"
  );
  if (dom.progress) {
    dom.progress.max = Math.max(1, requestedGames);
    dom.progress.value = attempts;
  }
  setText(dom.progressText, `${(progressPct * 100).toFixed(1)}%`);
  setText(dom.completedGames, state.completedGames);
  setText(dom.failedGames, state.failedGames);
  setText(dom.elapsed, `${formatNumber(state.elapsedMs / 1000, 2)} sec`);
  setText(dom.gamesPerSecond, formatNumber(state.gamesPerSecond, 2));
  setText(dom.inputError, state.errorMessage || "");

  if (dom.gameCountInput && !isRunning) dom.gameCountInput.value = state.gameCount;
  if (dom.seedInput && !isRunning) dom.seedInput.value = state.seed;
  if (dom.startButton) dom.startButton.disabled = isRunning;
  if (dom.cancelButton) dom.cancelButton.disabled = !isRunning || state.status === "cancelling";
  dom.presetButtons?.forEach((button) => {
    button.disabled = isRunning;
  });

  renderKpis(dom.kpis, state.summary);
  renderTeamResults(dom.teamResults, state.summary);
  renderSmoothing(dom, state.summary);
  renderQoC(dom.qocTable, state.summary);
  renderAdvancedDiagnostics(dom, state.summary);
  renderDiagnostics(dom, state.summary);

  const canShare = Boolean(state.markdown && state.json);
  if (dom.copyMarkdownButton) dom.copyMarkdownButton.disabled = !canShare;
  if (dom.copyJsonButton) dom.copyJsonButton.disabled = !canShare;
  if (dom.shareTextarea) {
    dom.shareTextarea.readOnly = true;
    dom.shareTextarea.value = state.sharePreview || "";
  }
  setText(dom.copyStatus, state.copyStatus || "");
}
