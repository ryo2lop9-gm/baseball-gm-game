export function getStatsDom() {
  return {
    statsPage: document.getElementById("statsPage"),

    statsRecordedDaysValue: document.getElementById("statsRecordedDaysValue"),
    statsTeamsValue: document.getElementById("statsTeamsValue"),
    statsPlayersValue: document.getElementById("statsPlayersValue"),
    statsCurrentTeamValue: document.getElementById("statsCurrentTeamValue"),

    statsTeamFilter: document.getElementById("statsTeamFilter"),
    statsScopeFilter: document.getElementById("statsScopeFilter"),
    statsSortKey: document.getElementById("statsSortKey"),
    statsSearchInput: document.getElementById("statsSearchInput"),
    statsMinPAInput: document.getElementById("statsMinPAInput"),

    statsPlayersTable: document.getElementById("statsPlayersTable"),
    statsTeamSummaryTable: document.getElementById("statsTeamSummaryTable"),
    statsLeadersBox: document.getElementById("statsLeadersBox"),
  };
}