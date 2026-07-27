import {
  MEASUREMENT_PITCH_LOCATION_DISPLAY_ORDERS,
  getMeasurementDefinitions,
  getMeasurementModelLimitations,
} from "../services/measurement/measurementReportService.js?v=codex12-4";

export const PITCH_LOCATION_ATTACK_REGION_ORDER =
  MEASUREMENT_PITCH_LOCATION_DISPLAY_ORDERS.attackRegion;
export const PITCH_LOCATION_ATTACK_REGION_DETAIL_ORDER =
  MEASUREMENT_PITCH_LOCATION_DISPLAY_ORDERS.attackRegionDetail;
export const PITCH_LOCATION_MEATBALL_ORDER =
  MEASUREMENT_PITCH_LOCATION_DISPLAY_ORDERS.meatball;
export const PITCH_LOCATION_COURSE_ORDER =
  MEASUREMENT_PITCH_LOCATION_DISPLAY_ORDERS.locationCourse;

const PITCH_LOCATION_KPI_DEFINITIONS = Object.freeze([
  {
    key: "geometricZonePct",
    label: "Geometric Zone%",
    definition: "actualIsZone基準",
  },
  { key: "heartPct", label: "Heart%", definition: "Heart領域への投球割合" },
  {
    key: "shadowPct",
    label: "Shadow / Edge%",
    definition: "Shadow%とEdge%は同じ値",
  },
  {
    key: "shadowInPct",
    label: "Shadow-In%",
    definition: "ゾーン内側のShadow",
  },
  {
    key: "shadowOutPct",
    label: "Shadow-Out%",
    definition: "ゾーン外側のShadow",
  },
  {
    key: "chasePct",
    label: "Chase%",
    definition: "ゾーン外球へのスイング率",
  },
  {
    key: "chaseRegionPct",
    label: "Chase Region%",
    definition: "CHASE領域への投球割合",
  },
  { key: "wastePct", label: "Waste%", definition: "Waste領域への投球割合" },
  {
    key: "meatballPct",
    label: "Meatball%",
    definition: "Heartの中央部分集合",
  },
]);

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function clampUnit(value) {
  return Math.min(1, Math.max(0, finiteNumber(value)));
}

function setText(element, value) {
  if (element) element.textContent = String(value ?? "-");
}

function formatNumber(value, digits = 3) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "0";
  return Number.isInteger(number) ? String(number) : number.toFixed(digits);
}

function formatPct(value) {
  return `${(finiteNumber(value) * 100).toFixed(2)}%`;
}

function formatOptional(value, format = "rate", signed = false) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) {
    return "-";
  }
  const number = Number(value);
  const sign = signed && number > 0 ? "+" : "";
  return format === "rate"
    ? `${sign}${(number * 100).toFixed(2)}%`
    : `${sign}${number.toFixed(3)}`;
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

export function buildPitchLocationKpiData(pitchLocation = {}) {
  return PITCH_LOCATION_KPI_DEFINITIONS.map(({ key, label, definition }) => ({
    key,
    label,
    definition,
    away: finiteNumber(pitchLocation?.away?.[key]),
    home: finiteNumber(pitchLocation?.home?.[key]),
    combined: finiteNumber(pitchLocation?.combined?.[key]),
  }));
}

export function buildLocationGridCellData(locationGrid = {}) {
  const combined = locationGrid?.combined || {};
  const cells = [];
  let maximumPitchPct = 0;

  for (let row = 0; row <= 4; row += 1) {
    for (let col = 0; col <= 4; col += 1) {
      const key = `r${row}c${col}`;
      const line = combined[key] || {};
      const pitchPct = Math.max(0, finiteNumber(line.pitchPct));
      maximumPitchPct = Math.max(maximumPitchPct, pitchPct);
      cells.push({
        key,
        row,
        col,
        pitches: Math.max(0, finiteNumber(line.pitches)),
        pitchPct,
        swingPct: finiteNumber(line.swingPct),
        isGeometricZone: row >= 1 && row <= 3 && col >= 1 && col <= 3,
      });
    }
  }

  return cells.map((cell) => ({
    ...cell,
    colorIntensity:
      maximumPitchPct > 0 ? clampUnit(cell.pitchPct / maximumPitchPct) : 0,
  }));
}

export function buildPitchLocationBreakdownRows(group = {}, keys = null) {
  const combined = group?.combined || {};
  const orderedKeys = keys || Object.keys(combined);
  return orderedKeys.map((key) => {
    const line = combined[key] || {};
    return {
      key,
      pitches: Math.max(0, finiteNumber(line.pitches)),
      pitchPct: finiteNumber(line.pitchPct),
      zonePct: finiteNumber(line.zonePct),
      swingPct: finiteNumber(line.swingPct),
      contactPct: finiteNumber(line.contactPct),
      whiffPct: finiteNumber(line.whiffPct),
      cswPct: finiteNumber(line.cswPct),
      PA: Math.max(0, finiteNumber(line.PA)),
      AVG: finiteNumber(line.AVG),
      OBP: finiteNumber(line.OBP),
      SLG: finiteNumber(line.SLG),
      OPS: finiteNumber(line.OPS),
    };
  });
}

export function buildLocationGridBreakdownRows(locationGrid = {}) {
  const combined = locationGrid?.combined || {};
  return buildLocationGridCellData(locationGrid).map(({ key, row, col }) => {
    const line = combined[key] || {};
    return {
      key,
      row,
      col,
      pitches: Math.max(0, finiteNumber(line.pitches)),
      pitchPct: finiteNumber(line.pitchPct),
      swingPct: finiteNumber(line.swingPct),
      contactPct: finiteNumber(line.contactPct),
      whiffPct: finiteNumber(line.whiffPct),
      cswPct: finiteNumber(line.cswPct),
      AVG: finiteNumber(line.AVG),
      OPS: finiteNumber(line.OPS),
    };
  });
}

function renderPitchLocationKpis(container, pitchLocation) {
  if (!container) return;
  const fragment = document.createDocumentFragment();
  for (const metric of buildPitchLocationKpiData(pitchLocation)) {
    const card = document.createElement("article");
    card.className = "measurement-pitch-location-kpi";
    card.dataset.metric = metric.key;

    const label = document.createElement("div");
    label.className = "measurement-kpi-label";
    label.textContent = metric.label;

    const combined = document.createElement("div");
    combined.className = "measurement-pitch-location-value";
    combined.textContent = formatPct(metric.combined);

    const sides = document.createElement("div");
    sides.className = "measurement-pitch-location-sides";
    sides.textContent = `Away ${formatPct(metric.away)} / Home ${formatPct(metric.home)}`;

    const definition = document.createElement("div");
    definition.className = "section-note";
    definition.textContent = metric.definition;

    card.append(label, combined, sides, definition);
    fragment.append(card);
  }
  container.replaceChildren(fragment);
}

function renderPitchLocationCompatibility(container, pitchLocation) {
  if (!container) return;
  const compatibility = pitchLocation?.compatibility || {};
  const fragment = document.createDocumentFragment();
  const values = document.createElement("dl");
  values.className = "measurement-compatibility-values";

  for (const [label, value] of [
    ["activeLocationModel", compatibility.activeLocationModel || "unknown"],
    [
      "legacyGridCompatNoChaseByDesign",
      Boolean(compatibility.legacyGridCompatNoChaseByDesign),
    ],
    [
      "continuousLocationDistributionAvailable",
      Boolean(compatibility.continuousLocationDistributionAvailable),
    ],
  ]) {
    const term = document.createElement("dt");
    term.textContent = label;
    const description = document.createElement("dd");
    description.textContent = String(value);
    values.append(term, description);
  }
  fragment.append(values);

  if (
    compatibility.activeLocationModel === "legacy_grid_compat" &&
    compatibility.legacyGridCompatNoChaseByDesign === true
  ) {
    const note = document.createElement("p");
    note.className = "measurement-compatibility-note";
    note.textContent =
      "legacy_grid_compatは5×5セルから作った決定的な互換アンカーで、連続的なMLB投球位置分布ではありません。Chase Regionが0になるのは現在のアンカー設計上の正常動作であり、Chase%が0であることを意味しません。";
    fragment.append(note);
  }
  container.replaceChildren(fragment);
}

function renderLocationGrid(container, locationGrid) {
  if (!container) return;
  const fragment = document.createDocumentFragment();
  for (const cellData of buildLocationGridCellData(locationGrid)) {
    const cell = document.createElement("div");
    cell.className = `measurement-location-cell${
      cellData.isGeometricZone ? " geometric-zone-cell" : ""
    }`;
    cell.dataset.row = String(cellData.row);
    cell.dataset.col = String(cellData.col);
    cell.dataset.gridKey = cellData.key;
    cell.setAttribute("role", "gridcell");
    cell.style.setProperty(
      "--location-intensity",
      String(cellData.colorIntensity)
    );
    cell.style.backgroundColor = `rgba(37, 99, 235, ${(
      0.08 +
      cellData.colorIntensity * 0.62
    ).toFixed(3)})`;
    cell.setAttribute(
      "aria-label",
      `row ${cellData.row}, col ${cellData.col}: Pitch ${formatPct(
        cellData.pitchPct
      )}, n=${cellData.pitches}, Swing ${formatPct(cellData.swingPct)}`
    );

    const pitchPct = document.createElement("strong");
    pitchPct.textContent = formatPct(cellData.pitchPct);
    const pitches = document.createElement("span");
    pitches.textContent = `n=${cellData.pitches}`;
    const swingPct = document.createElement("span");
    swingPct.textContent = `Swing ${formatPct(cellData.swingPct)}`;
    cell.append(pitchPct, pitches, swingPct);
    fragment.append(cell);
  }
  container.replaceChildren(fragment);
}

function renderPitchLocationBreakdownTable(container, group, keys) {
  const rows = buildPitchLocationBreakdownRows(group, keys).map((row) => [
    row.key,
    row.pitches,
    formatPct(row.pitchPct),
    formatPct(row.zonePct),
    formatPct(row.swingPct),
    formatPct(row.contactPct),
    formatPct(row.whiffPct),
    formatPct(row.cswPct),
    row.PA,
    formatNumber(row.AVG),
    formatNumber(row.OBP),
    formatNumber(row.SLG),
    formatNumber(row.OPS),
  ]);
  renderTable(
    container,
    [
      "Group",
      "Pitches",
      "Pitch%",
      "Zone%",
      "Swing%",
      "Contact%",
      "Whiff%",
      "CSW%",
      "PA",
      "AVG",
      "OBP",
      "SLG",
      "OPS",
    ],
    rows
  );
}

function renderLocationGridBreakdownTable(container, locationGrid) {
  const rows = buildLocationGridBreakdownRows(locationGrid).map((row) => [
    row.key,
    row.row,
    row.col,
    row.pitches,
    formatPct(row.pitchPct),
    formatPct(row.swingPct),
    formatPct(row.contactPct),
    formatPct(row.whiffPct),
    formatPct(row.cswPct),
    formatNumber(row.AVG),
    formatNumber(row.OPS),
  ]);
  renderTable(
    container,
    [
      "Grid",
      "Row",
      "Col",
      "Pitches",
      "Pitch%",
      "Swing%",
      "Contact%",
      "Whiff%",
      "CSW%",
      "AVG",
      "OPS",
    ],
    rows
  );
}

export function renderPitchLocation(dom, summary) {
  const containers = [
    dom.pitchLocationKpis,
    dom.pitchLocationCompatibility,
    dom.locationGrid,
    dom.attackRegionBreakdown,
    dom.attackRegionDetailBreakdown,
    dom.meatballBreakdown,
    dom.locationCourseBreakdown,
    dom.locationGridBreakdown,
    dom.locationModelBreakdown,
  ];
  if (!summary) {
    for (const container of containers) container?.replaceChildren();
    return;
  }

  const breakdowns = summary.breakdowns || {};
  renderPitchLocationKpis(dom.pitchLocationKpis, summary.pitchLocation || {});
  renderPitchLocationCompatibility(
    dom.pitchLocationCompatibility,
    summary.pitchLocation || {}
  );
  renderLocationGrid(dom.locationGrid, breakdowns.locationGrid);
  renderPitchLocationBreakdownTable(
    dom.attackRegionBreakdown,
    breakdowns.attackRegion,
    PITCH_LOCATION_ATTACK_REGION_ORDER
  );
  renderPitchLocationBreakdownTable(
    dom.attackRegionDetailBreakdown,
    breakdowns.attackRegionDetail,
    PITCH_LOCATION_ATTACK_REGION_DETAIL_ORDER
  );
  renderPitchLocationBreakdownTable(
    dom.meatballBreakdown,
    breakdowns.meatball,
    PITCH_LOCATION_MEATBALL_ORDER
  );
  renderPitchLocationBreakdownTable(
    dom.locationCourseBreakdown,
    breakdowns.locationCourse,
    PITCH_LOCATION_COURSE_ORDER
  );
  renderLocationGridBreakdownTable(
    dom.locationGridBreakdown,
    breakdowns.locationGrid
  );
  renderPitchLocationBreakdownTable(
    dom.locationModelBreakdown,
    breakdowns.locationModel,
    null
  );
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

function renderReferenceComparison(dom, summary) {
  if (!summary) {
    dom.referenceComparison?.replaceChildren();
    dom.contactDisposition?.replaceChildren();
    setText(dom.referenceSource, "-");
    return;
  }

  const rows = (summary.referenceComparison || []).map((row) => [
    row.label,
    formatOptional(row.current, row.format),
    formatOptional(row.reference, row.format),
    formatOptional(row.difference, row.format, true),
    row.accuracy,
  ]);
  renderTable(
    dom.referenceComparison,
    ["指標", "現行結果", "2025 MLB参考", "差", "比較精度"],
    rows
  );
  const renderedRows = dom.referenceComparison?.querySelectorAll?.("tbody tr") || [];
  renderedRows.forEach((row, index) => {
    row.dataset.comparisonAccuracy =
      summary.referenceComparison?.[index]?.accuracy || "not_comparable";
  });

  const disposition = summary.contactDisposition || {};
  renderTable(dom.contactDisposition, ["Metric", "Count / Rate"], [
    ["Pitches", disposition.pitches],
    ["Swings", disposition.swings],
    ["Contacts", disposition.contacts],
    ["Fouls", disposition.fouls],
    ["Fair batted balls", disposition.fairBattedBalls],
    ["Contact/Pitch", formatPct(disposition.contactPerPitch)],
    ["Foul/Pitch", formatPct(disposition.foulPerPitch)],
    ["BIP/Pitch", formatPct(disposition.fairBattedBallPerPitch)],
    ["Foul/Contact", formatPct(disposition.foulPerContact)],
    ["Fair/Contact", formatPct(disposition.fairBattedBallPerContact)],
  ]);

  const source = summary.referenceBenchmark?.source || {};
  setText(dom.referenceSource, source.url || "-");
  if (dom.referenceSource?.tagName === "A" && source.url) {
    dom.referenceSource.href = source.url;
  }
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
    ["BB/K", "BBPerK", false],
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
    ["Pitches/PA", "pitchesPerPA"],
    ["Zone%", "zonePct", true],
    ["Result Strike%", "resultStrikePct", true],
    ["Swing%", "swingPct", true],
    ["Z-Swing%", "zSwingPct", true],
    ["Chase%", "chasePct", true],
    ["Contact%", "contactPct", true],
    ["Z-Contact%", "zoneContactPct", true],
    ["Chase Contact%", "chaseContactPct", true],
    ["Whiff%", "whiffPct", true],
    ["Called Strike%", "calledStrikePct", true],
    ["Called Ball%", "calledBallPct", true],
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
  if (!container) return;
  const battingRows = ["away", "home"].flatMap((side) =>
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
  const disciplineRows = ["away", "home"].flatMap((side) =>
    (players?.[side] || []).map((player) => [
      side,
      player.lineupOrder,
      player.name,
      formatNumber(player.pitchesPerPA, 2),
      formatPct(player.swingPct),
      formatPct(player.zSwingPct),
      formatPct(player.chasePct),
      formatPct(player.contactPct),
      formatPct(player.zoneContactPct),
      formatPct(player.chaseContactPct),
      formatPct(player.whiffPct),
      formatPct(player.calledStrikePct),
      formatPct(player.cswPct),
    ])
  );
  const fragment = document.createDocumentFragment();
  const battingHeading = document.createElement("h4");
  battingHeading.textContent = "Player Batting";
  const battingTable = document.createElement("div");
  renderTable(
    battingTable,
    ["Side", "#", "Player", "PA", "AVG", "OBP", "SLG", "OPS", "HR", "BB%", "K%", "Avg EV", "HardHit%"],
    battingRows
  );
  const disciplineHeading = document.createElement("h4");
  disciplineHeading.textContent = "Player Plate Discipline";
  const disciplineTable = document.createElement("div");
  renderTable(
    disciplineTable,
    ["Side", "#", "Player", "Pitches/PA", "Swing%", "Z-Swing%", "Chase%", "Contact%", "Zone Contact%", "Chase Contact%", "Whiff%", "Called Strike%", "CSW%"],
    disciplineRows
  );
  fragment.append(
    battingHeading,
    battingTable,
    disciplineHeading,
    disciplineTable
  );
  container.replaceChildren(fragment);
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
  const definitions = getMeasurementDefinitions();
  const limitations = getMeasurementModelLimitations();
  const fragment = document.createDocumentFragment();
  const definitionHeading = document.createElement("h4");
  definitionHeading.textContent = "Definitions";
  const definitionList = document.createElement("ul");
  for (const text of [
    definitions.courseBreakdown,
    definitions.zoneClassification,
    definitions.pitchLocation.geometricZonePct,
    definitions.pitchLocation.attackRegions,
    definitions.pitchLocation.shadowDetail,
    definitions.pitchLocation.meatball,
    definitions.pitchLocation.chaseVsChaseRegion,
    definitions.pitchLocation.courseVsLocationCourse,
    definitions.pitchLocation.legacyGridCompatibility,
    `AIR: ${definitions.battedBallClasses.AIR}`,
  ]) {
    const line = document.createElement("li");
    line.textContent = text;
    definitionList.append(line);
  }
  const limitationHeading = document.createElement("h4");
  limitationHeading.textContent = "Model Limitations";
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
  fragment.append(
    definitionHeading,
    definitionList,
    limitationHeading,
    list
  );
  container.replaceChildren(fragment);
}

function renderAdvancedDiagnostics(dom, summary) {
  if (!summary) {
    for (const container of [
      dom.gameDistribution,
      dom.plateDiscipline,
      dom.pitchLocationKpis,
      dom.pitchLocationCompatibility,
      dom.locationGrid,
      dom.attackRegionBreakdown,
      dom.attackRegionDetailBreakdown,
      dom.meatballBreakdown,
      dom.locationCourseBreakdown,
      dom.locationGridBreakdown,
      dom.locationModelBreakdown,
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
  renderPitchLocation(dom, summary);
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
  setText(
    dom.validationPreset,
    `${state.validationPreset?.label || "カスタム"} (${state.validationPreset?.id || "custom"})`
  );

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
  renderReferenceComparison(dom, state.summary);
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
