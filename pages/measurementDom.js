export function getMeasurementDom() {
  return {
    measurementPage: document.getElementById("measurementPage"),
    gameCountInput: document.getElementById("measurementGameCountInput"),
    seedInput: document.getElementById("measurementSeedInput"),
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

    status: document.getElementById("measurementStatus"),
    progress: document.getElementById("measurementProgress"),
    progressText: document.getElementById("measurementProgressText"),
    completedGames: document.getElementById("measurementCompletedGames"),
    failedGames: document.getElementById("measurementFailedGames"),
    elapsed: document.getElementById("measurementElapsed"),
    gamesPerSecond: document.getElementById("measurementGamesPerSecond"),

    kpis: document.getElementById("measurementKpis"),
    teamResults: document.getElementById("measurementTeamResults"),
    smoothingSummary: document.getElementById("measurementSmoothingSummary"),
    sourceTable: document.getElementById("measurementSourceTable"),
    sampleQualityTable: document.getElementById("measurementSampleQualityTable"),
    neighborModeTable: document.getElementById("measurementNeighborModeTable"),
    neighborOutcomes: document.getElementById("measurementNeighborOutcomes"),
    qocTable: document.getElementById("measurementQoCTable"),
    diagnostics: document.getElementById("measurementDiagnostics"),
    simulationErrors: document.getElementById("measurementSimulationErrors"),

    copyMarkdownButton: document.getElementById("measurementCopyMarkdownBtn"),
    copyJsonButton: document.getElementById("measurementCopyJsonBtn"),
    shareTextarea: document.getElementById("measurementShareTextarea"),
    copyStatus: document.getElementById("measurementCopyStatus"),
  };
}
