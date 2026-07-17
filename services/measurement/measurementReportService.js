import { SMOOTHING_CONFIG } from "../evLaOutcomeService.js";

export const MEASUREMENT_REPORT_SCHEMA_VERSION = 2;
export const MEASUREMENT_ALLOWED_SOURCES = Object.freeze([
  "ev_la_smoothed",
  "ev_la_neighbor",
]);

function safeDivide(numerator, denominator) {
  return denominator > 0 ? numerator / denominator : 0;
}

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

function formatInnings(outs) {
  return `${Math.floor(outs / 3)}.${outs % 3}`;
}

function aggregatePitchers(rows = []) {
  const totals = rows.reduce(
    (result, pitcher) => {
      for (const key of [
        "pitches",
        "BF",
        "outsRecorded",
        "H",
        "HR",
        "BB",
        "K",
        "swingingK",
        "lookingK",
      ]) {
        result[key] += Number(pitcher?.[key]) || 0;
      }
      return result;
    },
    {
      pitcherCount: rows.length,
      pitches: 0,
      BF: 0,
      outsRecorded: 0,
      H: 0,
      HR: 0,
      BB: 0,
      K: 0,
      swingingK: 0,
      lookingK: 0,
    }
  );
  return {
    ...totals,
    inningsPitched: formatInnings(totals.outsRecorded),
    WHIP: safeDivide(totals.H + totals.BB, totals.outsRecorded / 3),
    KPct: safeDivide(totals.K, totals.BF),
    BBPct: safeDivide(totals.BB, totals.BF),
  };
}

function buildPitchingSummary(pitchers = {}) {
  const away = aggregatePitchers(pitchers.away);
  const home = aggregatePitchers(pitchers.home);
  return {
    away,
    home,
    combined: aggregatePitchers([
      ...(pitchers.away || []),
      ...(pitchers.home || []),
    ]),
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

export function getMeasurementDefinitions() {
  return {
    rateDenominators: {
      AVG: "H / AB",
      OBP: "(H + BB) / PA; HBP and SF are not modeled",
      SLG: "total bases / AB",
      OPS: "OBP + SLG",
      ISO: "SLG - AVG",
      BABIP: "(H - HR) / (AB - K - HR)",
      BBPct: "BB / PA",
      KPct: "K / PA",
      zonePct: "zone pitches / all pitches",
      swingPct: "swings / all pitches",
      zSwingPct: "zone swings / zone pitches",
      chasePct: "out-of-zone swings / out-of-zone pitches",
      contactPct: "contacts / swings",
      zoneContactPct: "zone contacts / zone swings",
      chaseContactPct: "out-of-zone contacts / out-of-zone swings",
      whiffPct: "whiffs / swings",
      cswPct: "(called strikes + whiffs) / all pitches",
      firstPitchStrikePct: "result strikes on 0-0 pitches / 0-0 pitches",
    },
    pitchAttribution:
      "Every pitch is attached to its pre-pitch count. A terminal pitch also receives the PA outcome.",
    pitchResultStrike:
      "Called strikes, swinging strikes, fouls, and fair balls in play count as result strikes.",
    battedBallClasses: {
      GB: "launch angle < 10 degrees",
      LD: "10 <= launch angle < 25 degrees",
      FB: "25 <= launch angle < 50 degrees",
      PU: "launch angle >= 50 degrees",
      AIR: "FB + PU",
      hardHit: "exit velocity >= 95 mph",
      sweetSpot: "8 <= launch angle <= 32 degrees",
    },
    evBands: "<70; 70-79.9; 80-89.9; 90-94.9; 95-99.9; 100-104.9; 105+ (lower bound inclusive except the first band)",
    laBands: "<-10; -10 to <0; 0 to <10; 10 to <25; 25 to <50; 50+ (lower bound inclusive except the first band)",
    percentileMethod:
      "Approximate nearest-rank percentiles from deterministic sparse histograms; raw events are not retained.",
    qoc:
      "QoC is an EV/LA-derived analysis label only and does not drive batted-ball outcomes.",
  };
}

export function getMeasurementModelLimitations() {
  return {
    unavailableMetrics: [
      {
        metric: "Direction / spray angle",
        reason: "Direction is not implemented in the current batted-ball model.",
      },
      {
        metric: "Timing and jammed contact",
        reason: "No stable event fields exist yet for timing or jammed contact.",
      },
      {
        metric: "Official Statcast Barrel%",
        reason: "QoC Barrel is a game analysis label, not the official Statcast barrel definition.",
      },
      {
        metric: "HBP, SF, SH, interference",
        reason: "These plate-appearance outcomes are not modeled.",
      },
      {
        metric: "SB, CS and advanced baserunning",
        reason: "The current event stream does not expose runner-attempt details.",
      },
      {
        metric: "Defensive OAA and fielding breakdowns",
        reason: "Direction, landing point, hang time, and fielder events are not implemented.",
      },
      {
        metric: "ERA, ER, FIP and pitcher decisions",
        reason: "Earned-run attribution and pitcher-of-record events are not modeled.",
      },
      {
        metric: "wOBA and wRC+",
        reason: "No season/run-environment coefficients are defined for the simulation report.",
      },
    ],
    interpretationNotes: [
      "A game with multiple pitchers contributes one G to each pitcher who appeared.",
      "Pitcher innings are reconstructed from strikeouts plus outs in play.",
      "Zero-denominator rates are reported as 0 instead of non-finite values.",
    ],
  };
}

export function buildMeasurementReportObject({
  summary,
  teams,
  generatedAt = new Date().toISOString(),
}) {
  const results = summary?.results || {};
  const pitchers = summary?.pitchers || { away: [], home: [] };
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
    definitions: getMeasurementDefinitions(),
    modelLimitations: getMeasurementModelLimitations(),
    results,
    gameDistribution: summary?.gameDistribution || {},
    plateDiscipline: summary?.plateDiscipline || {},
    batting: results,
    pitching: buildPitchingSummary(pitchers),
    players: summary?.players || { away: [], home: [] },
    pitchers,
    battedBallMetrics: summary?.battedBallMetrics || {},
    battedBallProfiles: summary?.battingProfiles || {},
    breakdowns: summary?.breakdowns || {},
    smoothingDiagnostics: summary?.smoothingDiagnostics || {},
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
  return lineup.reduce(
    (sum, player) => sum + (Number(player?.ratings?.[key]) || 0),
    0
  ) / lineup.length;
}

function firstPitchVelocity(pitcher) {
  const fourSeam = pitcher?.pitchMix?.fourSeam;
  return fourSeam && typeof fourSeam === "object"
    ? Number(fourSeam.velocity) || 0
    : 0;
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
    ["G", "G"], ["Wins", "wins"], ["Runs", "runs"],
    ["Runs/Game/Team", "averageRuns"], ["PA", "PA"], ["AB", "AB"],
    ["H", "H"], ["1B", "singles"], ["2B", "doubles"],
    ["3B", "triples"], ["HR", "HR"], ["XBH", "XBH"], ["BB", "BB"],
    ["K", "K"], ["Swinging K", "swingingK"], ["Looking K", "lookingK"],
    ["RBI", "RBI"], ["TB", "totalBases"], ["AVG", "AVG"], ["OBP", "OBP"],
    ["SLG", "SLG"], ["OPS", "OPS"], ["ISO", "ISO"], ["BABIP", "BABIP"],
    ["BB%", "BBPct", true], ["K%", "KPct", true], ["HR%", "HRPct", true],
    ["XBH/H", "XBHPerH", true],
  ];
  return [
    "| Item | Away | Home | Combined |",
    "| --- | ---: | ---: | ---: |",
    ...rows.map(([label, key, pct]) => {
      const display = (side) => pct
        ? formatPct(results?.[side]?.[key])
        : formatNumber(results?.[side]?.[key]);
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
      ([key, value]) => `| ${mdCell(key)} | ${value.count || 0} | ${formatPct(value.pct)} |`
    ),
  ];
}

function plateDisciplineTable(data) {
  const rows = [
    ["Pitches", "pitches"], ["PA", "PA"], ["Zone%", "zonePct", true],
    ["Swing%", "swingPct", true], ["Z-Swing%", "zSwingPct", true],
    ["Chase%", "chasePct", true], ["Contact%", "contactPct", true],
    ["Z-Contact%", "zoneContactPct", true], ["Chase Contact%", "chaseContactPct", true],
    ["Whiff%", "whiffPct", true], ["Called Strike%", "calledStrikePct", true],
    ["Foul%", "foulPct", true], ["BIP/Pitch", "bipPerPitch", true],
    ["CSW%", "cswPct", true], ["First-pitch Strike%", "firstPitchStrikePct", true],
  ];
  return [
    "| Item | Away batting | Home batting | Combined |",
    "| --- | ---: | ---: | ---: |",
    ...rows.map(([label, key, pct]) => {
      const value = (side) => pct
        ? formatPct(data?.[side]?.[key])
        : formatNumber(data?.[side]?.[key]);
      return `| ${label} | ${value("away")} | ${value("home")} | ${value("combined")} |`;
    }),
  ];
}

function battedProfileTable(data) {
  const rows = [
    ["BIP", "BIP"], ["Average EV", "averageExitVelocity"],
    ["Max EV", "exitVelocity", false, "max"], ["Average LA", "averageLaunchAngle"],
    ["GB%", "GBPct", true], ["LD%", "LDPct", true], ["FB%", "FBPct", true],
    ["PU%", "PUPct", true], ["AIR%", "AIRPct", true],
    ["HR/FB", "homeRunPerFlyBall", true], ["HardHit%", "hardHitPct", true],
    ["SweetSpot%", "sweetSpotPct", true],
  ];
  return [
    "| Item | Away | Home | Combined |",
    "| --- | ---: | ---: | ---: |",
    ...rows.map(([label, key, pct, child]) => {
      const value = (side) => {
        const raw = child ? data?.[side]?.[key]?.[child] : data?.[side]?.[key];
        return pct ? formatPct(raw) : formatNumber(raw);
      };
      return `| ${label} | ${value("away")} | ${value("home")} | ${value("combined")} |`;
    }),
  ];
}

function groupedPitchTable(title, group) {
  return [
    `## ${title}`,
    "",
    "| Group | Pitches | Zone% | Swing% | Chase% | Contact% | Whiff% | CSW% | BIP | AVG | SLG |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...Object.entries(group?.combined || {}).map(([key, value]) =>
      `| ${mdCell(key)} | ${value.pitches || 0} | ${formatPct(value.zonePct)} | ${formatPct(value.swingPct)} | ${formatPct(value.chasePct)} | ${formatPct(value.contactPct)} | ${formatPct(value.whiffPct)} | ${formatPct(value.cswPct)} | ${value.fairBattedBalls || 0} | ${formatNumber(value.AVG)} | ${formatNumber(value.SLG)} |`
    ),
  ];
}

function groupedPitchTypeTable(group) {
  return [
    "## Pitch Type Breakdown",
    "",
    "| Pitch Type | Pitches | Usage% | Zone% | Swing% | Chase% | Contact% | Whiff% | PA | AVG | SLG |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...Object.entries(group?.combined || {}).map(([key, value]) =>
      `| ${mdCell(key)} | ${value.pitches || 0} | ${formatPct(value.usagePct)} | ${formatPct(value.zonePct)} | ${formatPct(value.swingPct)} | ${formatPct(value.chasePct)} | ${formatPct(value.contactPct)} | ${formatPct(value.whiffPct)} | ${value.PA || 0} | ${formatNumber(value.AVG)} | ${formatNumber(value.SLG)} |`
    ),
  ];
}

function groupedCourseTable(group) {
  return [
    "## Course Breakdown",
    "",
    "| Course | Pitches | BIP | Avg EV | Avg LA | Out% | 1B% | 2B% | 3B% | HR% |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...Object.entries(group?.combined || {}).map(([key, value]) =>
      `| ${mdCell(key)} | ${value.pitches || 0} | ${value.batted?.BIP || 0} | ${formatNumber(value.batted?.averageExitVelocity, 2)} | ${formatNumber(value.batted?.averageLaunchAngle, 2)} | ${formatPct(value.batted?.rates?.out)} | ${formatPct(value.batted?.rates?.single)} | ${formatPct(value.batted?.rates?.double)} | ${formatPct(value.batted?.rates?.triple)} | ${formatPct(value.batted?.rates?.homeRun)} |`
    ),
  ];
}

function groupedBattedTable(title, group) {
  return [
    `## ${title}`,
    "",
    "| Group | BIP | Avg EV | Avg LA | Out% | 1B% | 2B% | 3B% | HR% |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...Object.entries(group?.combined || {}).map(([key, value]) =>
      `| ${mdCell(key)} | ${value.BIP || 0} | ${formatNumber(value.averageExitVelocity, 2)} | ${formatNumber(value.averageLaunchAngle, 2)} | ${formatPct(value.rates?.out)} | ${formatPct(value.rates?.single)} | ${formatPct(value.rates?.double)} | ${formatPct(value.rates?.triple)} | ${formatPct(value.rates?.homeRun)} |`
    ),
  ];
}

function smoothingPercentileTable(data) {
  return [
    "| Metric | N | Mean | SD | Min | P10 | P25 | P50 | P75 | P90 | P95 | Max |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...Object.entries(data?.combined || {}).map(([key, value]) =>
      `| ${mdCell(key)} | ${value.count || 0} | ${formatNumber(value.average)} | ${formatNumber(value.standardDeviation)} | ${formatNumber(value.min)} | ${formatNumber(value.p10)} | ${formatNumber(value.p25)} | ${formatNumber(value.p50)} | ${formatNumber(value.p75)} | ${formatNumber(value.p90)} | ${formatNumber(value.p95)} | ${formatNumber(value.max)} |`
    ),
  ];
}

function playerTable(players) {
  return [
    "| Side | # | Player | PA | AVG | OBP | SLG | OPS | HR | BB% | K% | Avg EV | HardHit% |",
    "| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...["away", "home"].flatMap((side) => (players?.[side] || []).map((player) =>
      `| ${side} | ${player.lineupOrder} | ${mdCell(player.name)} | ${player.PA} | ${formatNumber(player.AVG)} | ${formatNumber(player.OBP)} | ${formatNumber(player.SLG)} | ${formatNumber(player.OPS)} | ${player.HR} | ${formatPct(player.BBPct)} | ${formatPct(player.KPct)} | ${formatNumber(player.averageExitVelocity, 2)} | ${formatPct(player.hardHitPct)} |`
    )),
  ];
}

function pitcherTable(pitchers) {
  return [
    "| Team | Pitcher | Role | Pitches | BF | IP | H | HR | BB | K | K% | BB% | WHIP |",
    "| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...["away", "home"].flatMap((side) => (pitchers?.[side] || []).map((pitcher) =>
      `| ${side} | ${mdCell(pitcher.name)} | ${mdCell(pitcher.role)} | ${pitcher.pitches} | ${pitcher.BF} | ${pitcher.inningsPitched} | ${pitcher.H} | ${pitcher.HR} | ${pitcher.BB} | ${pitcher.K} | ${formatPct(pitcher.KPct)} | ${formatPct(pitcher.BBPct)} | ${formatNumber(pitcher.WHIP)} |`
    )),
  ];
}

function gameDistributionTable(distribution) {
  return [
    "| Metric | Value |",
    "| --- | ---: |",
    `| Games | ${distribution?.games || 0} |`,
    `| Average run differential | ${formatNumber(distribution?.averageRunDifferential)} |`,
    `| One-run game% | ${formatPct(distribution?.oneRunGamePct)} |`,
    `| Shutout team-game% | ${formatPct(distribution?.shutoutPct)} |`,
    `| Extra-inning% | ${formatPct(distribution?.extraInningPct)} |`,
    `| Average final inning | ${formatNumber(distribution?.averageFinalInning)} |`,
    `| Away win% | ${formatPct(distribution?.awayWinPct)} |`,
    `| Home win% | ${formatPct(distribution?.homeWinPct)} |`,
    `| Walk-off% | ${formatPct(distribution?.walkOffPct)} |`,
    `| Score P10 / P50 / P90 | ${formatNumber(distribution?.score?.combined?.p10)} / ${formatNumber(distribution?.score?.combined?.p50)} / ${formatNumber(distribution?.score?.combined?.p90)} |`,
  ];
}

export function buildMeasurementMarkdown(options) {
  const report = buildMeasurementReportObject(options);
  const {
    run, teams, engineConfig, results, battedBallMetrics, diagnostics,
    plateDiscipline, battedBallProfiles, breakdowns, smoothingDiagnostics,
    players, pitchers, gameDistribution, modelLimitations,
  } = report;
  const lines = [
    "# Baseball GM 高速計測レポート / High-Speed Measurement Report",
    "",
    ...(report.partial ? ["> 部分結果 / Partial result captured at cancellation.", ""] : []),
    "## 実行条件 / Run Conditions",
    "",
    `- reportSchemaVersion: ${report.reportSchemaVersion}`,
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
    "## エンジン設定 / Engine Configuration",
    "",
    `- outcomeModel: ${engineConfig.outcomeModel}`,
    `- allowedSources: ${engineConfig.allowedSources.join(", ")}`,
    `- evBandwidth: ${engineConfig.evBandwidth}`,
    `- laBandwidth: ${engineConfig.laBandwidth}`,
    `- priorStrength: ${engineConfig.priorStrength}`,
    `- localRange: EV +/-${engineConfig.localRange.evRadius}, LA +/-${engineConfig.localRange.laRadius}`,
    `- expandedRanges: ${engineConfig.expandedRanges.map((range) => `EV +/-${range.evRadius}, LA +/-${range.laRadius}`).join("; ")}`,
    `- negativeLaDirectHomeRun: ${engineConfig.negativeLaDirectHomeRun}`,
    "",
    "## 主要結果 / Team Batting Results",
    "",
    ...resultTable(results),
    "",
    "## Game Distribution",
    "",
    ...gameDistributionTable(gameDistribution),
    "",
    "## Plate Discipline",
    "",
    ...plateDisciplineTable(plateDiscipline),
    "",
    "## EV/LA Batted Ball Profile",
    "",
    ...battedProfileTable(battedBallProfiles),
    "",
    `- fairBattedBalls: ${battedBallMetrics.fairBattedBalls}`,
    `- averageEV: ${formatNumber(battedBallMetrics.averageExitVelocity, 3)}`,
    `- averageLA: ${formatNumber(battedBallMetrics.averageLaunchAngle, 3)}`,
    `- negativeLAPct: ${formatPct(battedBallMetrics.negativeLAPct)}`,
    `- averageTargetWeight: ${formatNumber(battedBallMetrics.averageTargetWeight, 6)}`,
    `- averageTargetBattedBalls: ${formatNumber(battedBallMetrics.averageTargetBattedBalls, 3)}`,
    `- averageNeighborESS: ${formatNumber(battedBallMetrics.averageNeighborEffectiveSampleSize, 3)}`,
    "",
    ...groupedPitchTable("Count Breakdown", breakdowns.count),
    "",
    ...groupedPitchTypeTable(breakdowns.pitchType),
    "",
    ...groupedPitchTable("Velocity Band Breakdown", breakdowns.velocityBand),
    "",
    ...groupedCourseTable(breakdowns.course),
    "",
    ...groupedPitchTable("Strike Type Breakdown", breakdowns.strikeType),
    "",
    ...groupedPitchTable("Ball Type Breakdown", breakdowns.ballType),
    "",
    ...groupedPitchTable("Mistake Breakdown", breakdowns.mistake),
    "",
    ...groupedPitchTable("Drift Breakdown", breakdowns.drift),
    "",
    ...groupedBattedTable("EV Band Breakdown", breakdowns.evBand),
    "",
    ...groupedBattedTable("LA Band Breakdown", breakdowns.laBand),
    "",
    ...groupedBattedTable("QoC Outcome Breakdown", breakdowns.qoc),
    "",
    ...groupedBattedTable("Source Outcome Breakdown", breakdowns.source),
    "",
    ...groupedBattedTable("Sample Quality Outcome Breakdown", breakdowns.sampleQuality),
    "",
    ...groupedBattedTable("Neighbor Mode Outcome Breakdown", breakdowns.neighborMode),
    "",
    "## Neighbor Mode別結果",
    "",
    "See Neighbor Mode Outcome Breakdown above for outcome rates by smoothing mode.",
    "",
    ...distributionTable("Source", battedBallMetrics.source),
    "",
    ...distributionTable("Sample Quality", battedBallMetrics.sampleQuality),
    "",
    ...distributionTable("Neighbor Mode", battedBallMetrics.neighborMode),
    "",
    "## Smoothing Percentiles",
    "",
    ...smoothingPercentileTable(smoothingDiagnostics),
    "",
    "## QoC",
    "",
    "| QoC | count | pct |",
    "| --- | ---: | ---: |",
    ...Object.entries(report.qoc.combined || {}).map(
      ([key, value]) => `| ${key} | ${value.count} | ${formatPct(value.pct)} |`
    ),
    "",
    "## Players",
    "",
    ...playerTable(players),
    "",
    "## Pitchers",
    "",
    ...pitcherTable(pitchers),
    "",
    "## 異常診断 / Diagnostics",
    "",
    "| Diagnostic | Count |",
    "| --- | ---: |",
    ...Object.entries(diagnostics || {}).map(([key, value]) => `| ${mdCell(key)} | ${formatNumber(value)} |`),
    `| simulationErrors | ${report.simulationErrors.length} |`,
    "",
    "## Model Limitations",
    "",
    ...modelLimitations.unavailableMetrics.map(
      ({ metric, reason }) => `- ${metric}: ${reason}`
    ),
    ...modelLimitations.interpretationNotes.map((note) => `- Note: ${note}`),
    "",
    "## AIへの確認依頼 / AI Review Request",
    "",
    "Please review run scoring and slash lines, plate discipline, EV/LA profile, pitch/count splits, smoothing modes, player/pitcher distributions, invariant diagnostics, and model limitations. Identify suspicious values and the next parameter to investigate without treating unavailable metrics as zero.",
  ];
  return lines.join("\n");
}
