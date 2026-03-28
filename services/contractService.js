import { GM_CONFIG } from "../config/gmConfig.js";
import { calcSimplePlayerValue } from "./playerValueService.js";

export function calcSuggestedSalary(player) {
  const value = calcSimplePlayerValue(player);
  return Math.max(
    GM_CONFIG.MIN_SALARY,
    Math.round(value * GM_CONFIG.SALARY_MULTIPLIER)
  );
}

export function calcRosterPayroll(rosterState) {
  const lineup = rosterState?.lineup || [];
  const bench = rosterState?.bench || [];
  const rotation = rosterState?.rotation || [];
  const bullpen = rosterState?.bullpen || [];

  const players = [...lineup, ...bench, ...rotation, ...bullpen];
  return players.reduce((sum, player) => sum + calcSuggestedSalary(player), 0);
}

export function recalcBudgetState(gmState) {
  gmState.budget.payroll = calcRosterPayroll(gmState.roster);
  gmState.budget.cash = Math.max(0, gmState.budget.total - gmState.budget.payroll);
  return gmState;
}