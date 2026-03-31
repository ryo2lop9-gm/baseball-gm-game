function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

export function buildGMViewModel(gmState) {
  const roster = gmState?.roster || {};
  const budget = gmState?.budget || {};
  const pendingCards = asArray(gmState?.pendingDecisions);
  const inbox = asArray(gmState?.inbox);
  const standings = asArray(gmState?.standings);
  const lastResults = asArray(gmState?.league?.lastDayResults);
  const transactions = asArray(gmState?.transactions);
  const controlledTeamName = gmState?.controlledTeamName || "-";

  return {
    controlledTeamName,
    day: asNumber(gmState?.day, 0),
    budgetCash: asNumber(budget.cash, 0),
    budgetPayroll: asNumber(budget.payroll, 0),
    pendingCount: pendingCards.length,
    statusText: pendingCards.length > 0 ? "判断待ち" : "進行可能",
    statusClass: pendingCards.length > 0 ? "warning" : "ok",

    pendingCards,
    inbox,
    standings,
    lastResults,
    transactions,

    rosterLineup: asArray(roster.lineup),
    rosterBench: asArray(roster.bench),
    freeAgents: asArray(gmState?.freeAgents),
  };
}