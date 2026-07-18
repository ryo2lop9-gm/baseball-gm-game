import {
  createDefaultTeams,
  createGmBasicReferenceValidationTeams,
  createMlbAverageValidationTeams,
} from "../models/teamModels.js?v=codex11-2";
import { createInitialGameState } from "../state/gameState.js";
import {
  createRosterState,
  buildTeamFromRoster,
} from "../engine/gm/rosterEngine.js";

export const TUNING_VALIDATION_PRESETS = Object.freeze({
  custom: Object.freeze({ id: "custom", label: "カスタム" }),
  mlbAverageVsPower: Object.freeze({
    id: "mlb_average_vs_power_pitching",
    label: "平均打線 vs パワー投手",
  }),
  gmBasicSymmetricReference: Object.freeze({
    id: "gm_basic_symmetric_reference",
    label: "GM基礎参考・対称MLB基準",
  }),
});

function createRosterBundleFromTeams(
  teams,
  validationPreset = TUNING_VALIDATION_PRESETS.custom
) {
  return {
    validationPreset: validationPreset.id,
    validationPresetLabel: validationPreset.label,
    awayMeta: { name: teams.away.name },
    homeMeta: { name: teams.home.name },
    awayRoster: createRosterState(teams.away),
    homeRoster: createRosterState(teams.home),
  };
}

export function createTuningBootstrap() {
  function createDefaultRosterBundle() {
    return createRosterBundleFromTeams(createDefaultTeams());
  }

  function createMlbValidationRosterBundle() {
    return createRosterBundleFromTeams(
      createMlbAverageValidationTeams(),
      TUNING_VALIDATION_PRESETS.mlbAverageVsPower
    );
  }

  function createGmBasicReferenceRosterBundle() {
    return createRosterBundleFromTeams(
      createGmBasicReferenceValidationTeams(),
      TUNING_VALIDATION_PRESETS.gmBasicSymmetricReference
    );
  }

  function buildCurrentTuningTeams(rosterBundle) {
    return {
      away: buildTeamFromRoster(rosterBundle.awayMeta, rosterBundle.awayRoster),
      home: buildTeamFromRoster(rosterBundle.homeMeta, rosterBundle.homeRoster),
    };
  }

  function createFreshTuningGame(rosterBundle) {
    const teams = buildCurrentTuningTeams(rosterBundle);
    return createInitialGameState(teams.away, teams.home);
  }

  return {
    createDefaultRosterBundle,
    createMlbValidationRosterBundle,
    createGmBasicReferenceRosterBundle,
    buildCurrentTuningTeams,
    createFreshTuningGame,
  };
}
