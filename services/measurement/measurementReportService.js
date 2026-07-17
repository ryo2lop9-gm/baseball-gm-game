import { SMOOTHING_CONFIG } from "../evLaOutcomeService.js";

export const MEASUREMENT_REPORT_SCHEMA_VERSION = 1;
export const MEASUREMENT_ALLOWED_SOURCES = Object.freeze([
  "ev_la_smoothed",
  "ev_la_neighbor",
]);

function sanitizeValue(value) {
  if (value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (Array.isArray(value)) return value.map(sanitizeValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, sanitizeValue(entry)])
    );
  }
  return value;
}

function summarizePitcher(pitcher) {
  return {
    name: pitcher?.name || "-",
    ratings: { ...(pitcher?.ratings || {}) },
    pitchMix: structuredClone(pitcher?.pitchMix || {}),
  };
}

function summarizeTeam(team) {
  return {
    name: team?.name || "-",
    lineupSize: Array.isArray(team?.lineup) ? team.lineup.length : 0,
    lineup: (team?.lineup || []).map((player) => ({
      name: player?.name || "-",
      ratings: { ...(player?.ratings || {}) },
    })),
    startingPitcher: summarizePitcher(team?.startingPitcher),
    bullpenCount: Array.isArray(team?.bullpen) ? team.bullpen.length : 0,
  };
}

export function getMeasurementEngineConfig() {
  const localStage = SMOOTHING_CONFIG.searchStages.find(
    (stage) => stage.mode === "local"
  );
  const expandedStages = SMOOTHING_CONFIG.searchStages.filter(
    (stage) => stage.mode === "expanded"
  );

  return {
    outcomeModel: "ev_la_lookup",
    allowedSources: [...MEASUREMENT_ALLOWED_SOURCES],
    evBandwidth: SMOOTHING_CONFIG.evBandwidth,
    laBandwidth: SMOOTHING_CONFIG.laBandwidth,
    priorStrength: SMOOTHING_CONFIG.priorStrength,
    localRange: {
      evRadius: localStage?.evRadius ?? 0,
      laRadius: localStage?.laRadius ?? 0,
    },
    expandedRanges: expandedStages.map((stage) => ({
      evRadius: stage.evRadius,
      laRadius: stage.laRadius,
    })),
    localMinNeighborCells: localStage?.minNeighborCells ?? 0,
    localMinESS: localStage?.minEffectiveSampleSize ?? 0,
    expandedMinNeighborCells: expandedStages.map(
      (stage) => stage.minNeighborCells
    ),
    expandedMinESS: expandedStages.map(
      (stage) => stage.minEffectiveSampleSize
    ),
    distantMinNeighborCells: SMOOTHING_CONFIG.distantMinNeighborCells,
    distantMinESS: SMOOTHING_CONFIG.distantMinEffectiveSampleSize,
    distantMaxNeighborCells: SMOOTHING_CONFIG.distantMaxNeighborCells,
    negativeLaDirectHomeRun: false,
  };
}

export function buildMeasurementReportObject({
  summary,
  teams,
  generatedAt = new Date().toISOString(),
}) {
  return sanitizeValue({
    reportSchemaVersion: MEASUREMENT_REPORT_SCHEMA_VERSION,
    reportType: "baseball_gm_high_speed_measurement",
    generatedAt,
    status: summary?.status || "error",
    partial: summary?.status === "cancelled",
    run: summary?.run || {},
    teams: {
      away: summarizeTeam(teams?.away),
      home: summarizeTeam(teams?.home),
    },
    engineConfig: getMeasurementEngineConfig(),
    results: summary?.results || {},
    battedBallMetrics: summary?.battedBallMetrics || {},
    qoc: summary?.qoc || {},
    diagnostics: summary?.diagnostics || {},
    simulationErrors: summary?.simulationErrors || [],
  });
}

export function buildMeasurementJson(options) {
  return JSON.stringify(buildMeasurementReportObject(options), null, 2);
}

function mdCell(value) {
  return String(value ?? "-")
    .replaceAll("|", "\\|")
    .replaceAll("\n", " ");
}

function formatNumber(value, digits = 3) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "0";
  return Number.isInteger(number) ? String(number) : number.toFixed(digits);
}

function formatPct(value) {
  return `${(Number(value || 0) * 100).toFixed(2)}%`;
}

function averageRating(lineup, key) {
  if (!lineup?.length) return 0;
  return (
    lineup.reduce(
      (sum, player) => sum + (Number(player?.ratings?.[key]) || 0),
      0
    ) / lineup.length
  );
}

function firstPitchVelocity(pitcher) {
  const fourSeam = pitcher?.pitchMix?.fourSeam;
  if (fourSeam && typeof fourSeam === "object") {
    return Number(fourSeam.velocity) || 0;
  }
  return 0;
}

function teamConditionLines(label, team) {
  return [
    `- ${label}Team: ${mdCell(team.name)}`,
    `- ${label}LineupSize: ${team.lineupSize}`,
    `- ${label}AverageContact: ${formatNumber(averageRating(team.lineup, "contact"), 2)}`,
    `- ${label}AveragePower: ${formatNumber(averageRating(team.lineup, "power"), 2)}`,
    `- ${label}AverageEye: ${formatNumber(averageRating(team.lineup, "eye"), 2)}`,
    `- ${label}Starter: ${mdCell(team.startingPitcher.name)}`,
    `- ${label}StarterControl: ${formatNumber(team.startingPitcher.ratings.control)}`,
    `- ${label}StarterStuff: ${formatNumber(team.startingPitcher.ratings.stuff)}`,
    `- ${label}StarterFourSeamVelocity: ${formatNumber(firstPitchVelocity(team.startingPitcher), 1)}`,
  ];
}

function resultTable(results) {
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
    ["Total Bases", "totalBases", false],
    ["AVG", "AVG", false],
    ["OBP", "OBP", false],
    ["SLG", "SLG", false],
    ["OPS", "OPS", false],
    ["BB%", "BBPct", true],
    ["K%", "KPct", true],
    ["HR%", "HRPct", true],
  ];

  return [
    "| Item | Away | Home | Combined |",
    "| --- | ---: | ---: | ---: |",
    ...rows.map(([label, key, pct]) => {
      const display = (side) =>
        pct ? formatPct(results[side]?.[key]) : formatNumber(results[side]?.[key]);
      return `| ${label} | ${display("away")} | ${display("home")} | ${display("combined")} |`;
    }),
  ];
}

function distributionTable(title, distribution) {
  return [
    `## ${title}`,
    "",
    `| ${title} | count | pct |`,
    "| --- | ---: | ---: |",
    ...Object.entries(distribution || {}).map(
      ([key, value]) =>
        `| ${mdCell(key)} | ${value.count || 0} | ${formatPct(value.pct)} |`
    ),
  ];
}

export function buildMeasurementMarkdown(options) {
  const report = buildMeasurementReportObject(options);
  const { run, teams, engineConfig, results, battedBallMetrics, diagnostics } =
    report;
  const partialNotice = report.partial
    ? ["", "> このレポートはキャンセル時点までの部分結果です。"]
    : [];

  const lines = [
    "# Baseball GM 高速計測レポート",
    ...partialNotice,
    "",
    "## 実行条件",
    "",
    `- status: ${report.status}`,
    `- seed: ${run.seed}`,
    `- requestedGames: ${run.requestedGames}`,
    `- completedGames: ${run.completedGames}`,
    `- failedGames: ${run.failedGames}`,
    `- elapsedMs: ${formatNumber(run.elapsedMs, 2)}`,
    `- gamesPerSecond: ${formatNumber(run.gamesPerSecond, 2)}`,
    ...teamConditionLines("away", teams.away),
    ...teamConditionLines("home", teams.home),
    "",
    "## エンジン設定",
    "",
    `- outcomeModel: ${engineConfig.outcomeModel}`,
    `- allowedSources: ${engineConfig.allowedSources.join(", ")}`,
    `- evBandwidth: ${engineConfig.evBandwidth}`,
    `- laBandwidth: ${engineConfig.laBandwidth}`,
    `- priorStrength: ${engineConfig.priorStrength}`,
    `- localRange: EV +/-${engineConfig.localRange.evRadius}, LA +/-${engineConfig.localRange.laRadius}`,
    `- expandedRanges: ${engineConfig.expandedRanges
      .map((range) => `EV +/-${range.evRadius}, LA +/-${range.laRadius}`)
      .join("; ")}`,
    `- negativeLaDirectHomeRun: ${engineConfig.negativeLaDirectHomeRun}`,
    "",
    "## 主要結果",
    "",
    ...resultTable(results),
    "",
    "## EV/LA",
    "",
    `- fairBattedBalls: ${battedBallMetrics.fairBattedBalls}`,
    `- averageEV: ${formatNumber(battedBallMetrics.averageExitVelocity, 3)}`,
    `- averageLA: ${formatNumber(battedBallMetrics.averageLaunchAngle, 3)}`,
    `- negativeLACount: ${battedBallMetrics.negativeLACount}`,
    `- negativeLAPct: ${formatPct(battedBallMetrics.negativeLAPct)}`,
    `- averageTargetWeight: ${formatNumber(battedBallMetrics.averageTargetWeight, 6)}`,
    `- averageTargetBattedBalls: ${formatNumber(battedBallMetrics.averageTargetBattedBalls, 3)}`,
    `- averageNeighborESS: ${formatNumber(battedBallMetrics.averageNeighborEffectiveSampleSize, 3)}`,
    `- rawSums: ${JSON.stringify(battedBallMetrics.rawSums)}`,
    "",
    ...distributionTable("Source", battedBallMetrics.source),
    "",
    ...distributionTable("Sample Quality", battedBallMetrics.sampleQuality),
    "",
    ...distributionTable("Neighbor Mode", battedBallMetrics.neighborMode),
    "",
    "## Neighbor Mode別結果",
    "",
    "| mode | BIP | Out% | 1B% | 2B% | 3B% | HR% |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...Object.entries(battedBallMetrics.neighborModeOutcomes || {}).map(
      ([mode, value]) =>
        `| ${mode} | ${value.fairBattedBalls} | ${formatPct(value.rates.out)} | ${formatPct(value.rates.single)} | ${formatPct(value.rates.double)} | ${formatPct(value.rates.triple)} | ${formatPct(value.rates.homeRun)} |`
    ),
    "",
    "## QoC",
    "",
    "| QoC | count | pct |",
    "| --- | ---: | ---: |",
    ...Object.entries(report.qoc.combined || {}).map(
      ([key, value]) =>
        `| ${key} | ${value.count} | ${formatPct(value.pct)} |`
    ),
    "",
    "## 異常診断",
    "",
    `- unexpectedSourceCount: ${diagnostics.unexpectedSourceCount}`,
    `- unknownNeighborModeCount: ${diagnostics.unknownNeighborModeCount}`,
    `- unknownSampleQualityCount: ${diagnostics.unknownSampleQualityCount}`,
    `- invalidMeasurementEventCount: ${diagnostics.invalidMeasurementEventCount}`,
    `- negativeLaHomeRunCount: ${diagnostics.negativeLaHomeRunCount}`,
    `- simulationErrors: ${report.simulationErrors.length}`,
    "",
    "## AIへの確認依頼",
    "",
    "以下の観点で分析してください。",
    "",
    "1. 得点・AVG・OBP・SLG・OPSは妥当か",
    "2. BB%・K%・HR%は妥当か",
    "3. local / expanded / distantの使用率に問題がないか",
    "4. distant打球の結果分布が不自然でないか",
    "5. EV/LA平滑化が強すぎる、または弱すぎる兆候がないか",
    "6. 異常診断値が発生していないか",
    "7. 次に調整すべきパラメータは何か",
  ];

  return lines.join("\n");
}
