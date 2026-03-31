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
  const payroll = calcRosterPayroll(gmState?.roster || {});
  const total = Number(gmState?.budget?.total || 0);
  const currentBudget = gmState?.budget || {};

  return {
    ...gmState,
    budget: {
      ...currentBudget,
      total,
      payroll,
      cash: Math.max(0, total - payroll),
    },
  };
}