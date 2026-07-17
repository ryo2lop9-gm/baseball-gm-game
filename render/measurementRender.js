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
    ["TB", "totalBases", false],
    ["AVG", "AVG", false],
    ["OBP", "OBP", false],
    ["SLG", "SLG", false],
    ["OPS", "OPS", false],
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
