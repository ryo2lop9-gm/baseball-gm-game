export function getMeasurementDom() {
  return {
    measurementPage: document.getElementById("measurementPage"),
    gameCountInput: document.getElementById("measurementGameCountInput"),
    seedInput: document.getElementById("measurementSeedInput"),
    defenseCalibrationMode: document.getElementById(
      "measurementDefenseCalibrationMode"
    ),
    presetButtons: document.querySelectorAll("[data-measurement-games]"),
    startButton: document.getElementById("measurementStartBtn"),
    cancelButton: document.getElementById("measurementCancelBtn"),
    inputError: document.getElementById("measurementInputError"),

    awayTeam: document.getElementById("measurementAwayTeam"),
    homeTeam: document.getElementById("measurementHomeTeam"),
    awayStarter: document.getElementById("measurementAwayStarter"),
    homeStarter: document.getElementById("measurementHomeStarter"),
    lineupSize: document.getElementById("measurementLineupSize"),
    activeSeed: document.getElementById("measurementActiveSeed"),
    activeGameCount: document.getElementById("measurementActiveGameCount"),
    validationPreset: document.getElementById("measurementValidationPreset"),

    status: document.getElementById("measurementStatus"),
    progress: document.getElementById("measurementProgress"),
    progressText: document.getElementById("measurementProgressText"),
    completedGames: document.getElementById("measurementCompletedGames"),
    failedGames: document.getElementById("measurementFailedGames"),
    elapsed: document.getElementById("measurementElapsed"),
    gamesPerSecond: document.getElementById("measurementGamesPerSecond"),

    kpis: document.getElementById("measurementKpis"),
    referenceComparison: document.getElementById("measurementReferenceComparison"),
    referenceSource: document.getElementById("measurementReferenceSource"),
    contactDisposition: document.getElementById("measurementContactDisposition"),
    teamResults: document.getElementById("measurementTeamResults"),
    smoothingSummary: document.getElementById("measurementSmoothingSummary"),
    sourceTable: document.getElementById("measurementSourceTable"),
    sampleQualityTable: document.getElementById("measurementSampleQualityTable"),
    neighborModeTable: document.getElementById("measurementNeighborModeTable"),
    neighborOutcomes: document.getElementById("measurementNeighborOutcomes"),
    qocTable: document.getElementById("measurementQoCTable"),
    gameDistribution: document.getElementById("measurementGameDistribution"),
    plateDiscipline: document.getElementById("measurementPlateDiscipline"),
    pitchLocationKpis: document.getElementById("measurementPitchLocationKpis"),
    pitchLocationCompatibility: document.getElementById(
      "measurementPitchLocationCompatibility"
    ),
    locationGrid: document.getElementById("measurementLocationGrid"),
    attackRegionBreakdown: document.getElementById(
      "measurementAttackRegionBreakdown"
    ),
    attackRegionDetailBreakdown: document.getElementById(
      "measurementAttackRegionDetailBreakdown"
    ),
    meatballBreakdown: document.getElementById(
      "measurementMeatballBreakdown"
    ),
    locationCourseBreakdown: document.getElementById(
      "measurementLocationCourseBreakdown"
    ),
    locationGridBreakdown: document.getElementById(
      "measurementLocationGridBreakdown"
    ),
    locationModelBreakdown: document.getElementById(
      "measurementLocationModelBreakdown"
    ),
    battedProfile: document.getElementById("measurementBattedProfile"),
    countBreakdown: document.getElementById("measurementCountBreakdown"),
    pitchTypeBreakdown: document.getElementById("measurementPitchTypeBreakdown"),
    velocityBandBreakdown: document.getElementById("measurementVelocityBandBreakdown"),
    courseBreakdown: document.getElementById("measurementCourseBreakdown"),
    qualityBreakdowns: document.getElementById("measurementQualityBreakdowns"),
    evBandBreakdown: document.getElementById("measurementEvBandBreakdown"),
    laBandBreakdown: document.getElementById("measurementLaBandBreakdown"),
    outcomeBreakdowns: document.getElementById("measurementOutcomeBreakdowns"),
    smoothingPercentiles: document.getElementById("measurementSmoothingPercentiles"),
    players: document.getElementById("measurementPlayers"),
    pitchers: document.getElementById("measurementPitchers"),
    limitations: document.getElementById("measurementLimitations"),
    diagnostics: document.getElementById("measurementDiagnostics"),
    simulationErrors: document.getElementById("measurementSimulationErrors"),

    copyMarkdownButton: document.getElementById("measurementCopyMarkdownBtn"),
    copyJsonButton: document.getElementById("measurementCopyJsonBtn"),
    shareTextarea: document.getElementById("measurementShareTextarea"),
    copyStatus: document.getElementById("measurementCopyStatus"),
  };
}
