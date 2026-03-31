import { applyRouteVisibility, wireRouteEvents } from "./appRouter.js";

export function createPageRouter({
  routeDom,
  getCurrentPage,
  setCurrentPageState,
  renderCurrentPage,
  saveRootState,
  gmDeskPageController,
  statsPageController,
  tuningPageController,
}) {
  function setPage(pageName) {
    setCurrentPageState(pageName);
    applyRouteVisibility(routeDom, pageName);
    renderCurrentPage();
    saveRootState();
  }

  function wireEvents() {
    wireRouteEvents(routeDom, {
      onShowGM: () => setPage("gm"),
      onShowStats: () => setPage("stats"),
      onShowTuning: () => setPage("tuning"),
      onJumpToStats: () => setPage("stats"),
    });

    gmDeskPageController.wireEvents({
      onStatsChanged() {
        saveRootState();
        if (getCurrentPage() === "stats") {
          statsPageController.render();
        }
      },
    });

    statsPageController.wireEvents();
    tuningPageController.wireEvents();

    window.addEventListener("beforeunload", saveRootState);
  }

  function applyInitialPage() {
    const currentPage = getCurrentPage();
    const initialPage =
      currentPage === "stats" || currentPage === "tuning"
        ? currentPage
        : "gm";

    applyRouteVisibility(routeDom, initialPage);
    renderCurrentPage();
  }

  return {
    setPage,
    wireEvents,
    applyInitialPage,
  };
}