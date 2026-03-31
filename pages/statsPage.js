import { getStatsDom } from "./statsDom.js";
import { renderStatsPage } from "../render/statsRender.js";

export function createStatsPageController({
  getAppState,
  getStatsIndex,
}) {
  const dom = getStatsDom();

  const state = {
    filters: {
      team: "all",
      sortKey: "OPS",
      search: "",
      minPA: 0,
      scope: "all",
    },
  };

  function render() {
    renderStatsPage(
      dom,
      getStatsIndex(),
      getAppState().gm?.controlledTeamName || "",
      state
    );
  }

  function handleFilterChange() {
    state.filters.team = dom.statsTeamFilter?.value || "all";
    state.filters.scope = dom.statsScopeFilter?.value || "all";
    state.filters.sortKey = dom.statsSortKey?.value || "OPS";
    state.filters.search = dom.statsSearchInput?.value || "";
    state.filters.minPA = Number(dom.statsMinPAInput?.value || 0);
    render();
  }

  function wireEvents() {
    dom.statsTeamFilter?.addEventListener("change", handleFilterChange);
    dom.statsScopeFilter?.addEventListener("change", handleFilterChange);
    dom.statsSortKey?.addEventListener("change", handleFilterChange);
    dom.statsSearchInput?.addEventListener("input", handleFilterChange);
    dom.statsMinPAInput?.addEventListener("input", handleFilterChange);
  }

  return {
    render,
    wireEvents,
    state,
  };
}