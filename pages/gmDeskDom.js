export function getGMDeskDom() {
  return {
    gmPage: document.getElementById("gmPage"),

    gmStatusPill: document.getElementById("gmStatusPill"),
    gmTeamName: document.getElementById("gmTeamName"),
    gmDayValue: document.getElementById("gmDayValue"),
    gmBudgetValue: document.getElementById("gmBudgetValue"),
    gmPayrollValue: document.getElementById("gmPayrollValue"),
    gmPendingValue: document.getElementById("gmPendingValue"),

    gmAdvanceDayBtn: document.getElementById("gmAdvanceDayBtn"),
    gmAdvanceWeekBtn: document.getElementById("gmAdvanceWeekBtn"),
    gmNewSeasonBtn: document.getElementById("gmNewSeasonBtn"),

    gmPendingCards: document.getElementById("gmPendingCards"),
    gmInbox: document.getElementById("gmInbox"),

    gmStandings: document.getElementById("gmStandings"),
    gmLastResults: document.getElementById("gmLastResults"),

    gmRosterLineup: document.getElementById("gmRosterLineup"),
    gmRosterBench: document.getElementById("gmRosterBench"),

    gmFreeAgents: document.getElementById("gmFreeAgents"),
    gmTransactions: document.getElementById("gmTransactions"),
  };
}