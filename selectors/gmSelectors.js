import {
  getGMStandings,
  getGMInbox,
  getPendingDecisions,
  getLastDayResults,
  getTransactions,
} from "../engine/gm/gmEngine.js";

export function buildGMViewModel(gmState) {
  const pendingCards = getPendingDecisions(gmState);
  const inbox = getGMInbox(gmState);
  const standings = getGMStandings(gmState);
  const lastResults = getLastDayResults(gmState);
  const transactions = getTransactions(gmState);

  return {
    controlledTeamName: gmState?.controlledTeamName || "-",
    day: Number(gmState?.day || 0),
    budgetCash: Number(gmState?.budget?.cash || 0),
    budgetPayroll: Number(gmState?.budget?.payroll || 0),
    pendingCount: pendingCards.length,
    statusText: pendingCards.length > 0 ? "判断待ち" : "進行可能",
    statusClass: pendingCards.length > 0 ? "warning" : "ok",

    pendingCards,
    inbox,
    standings,
    lastResults,
    transactions,

    rosterLineup: gmState?.roster?.lineup || [],
    rosterBench: gmState?.roster?.bench || [],
    freeAgents: gmState?.freeAgents || [],
  };
}