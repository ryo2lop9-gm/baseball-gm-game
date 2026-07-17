export function createRouteDom() {
  return {
    gmPage: document.getElementById("gmPage"),
    statsPage: document.getElementById("statsPage"),
    tuningPage: document.getElementById("tuningPage"),
    measurementPage: document.getElementById("measurementPage"),

    showGMPageBtn: document.getElementById("showGMPageBtn"),
    showStatsPageBtn: document.getElementById("showStatsPageBtn"),
    showTuningPageBtn: document.getElementById("showTuningPageBtn"),
    showMeasurementPageBtn: document.getElementById("showMeasurementPageBtn"),
    jumpToStatsBtn: document.getElementById("jumpToStatsBtn"),
  };
}

export function applyRouteVisibility(routeDom, pageName) {
  if (routeDom.gmPage) routeDom.gmPage.classList.toggle("active", pageName === "gm");
  if (routeDom.statsPage) routeDom.statsPage.classList.toggle("active", pageName === "stats");
  if (routeDom.tuningPage) routeDom.tuningPage.classList.toggle("active", pageName === "tuning");
  if (routeDom.measurementPage) routeDom.measurementPage.classList.toggle("active", pageName === "measurement");

  if (routeDom.showGMPageBtn) routeDom.showGMPageBtn.classList.toggle("active", pageName === "gm");
  if (routeDom.showStatsPageBtn) routeDom.showStatsPageBtn.classList.toggle("active", pageName === "stats");
  if (routeDom.showTuningPageBtn) routeDom.showTuningPageBtn.classList.toggle("active", pageName === "tuning");
  if (routeDom.showMeasurementPageBtn) routeDom.showMeasurementPageBtn.classList.toggle("active", pageName === "measurement");
}

export function wireRouteEvents(routeDom, handlers) {
  routeDom.showGMPageBtn?.addEventListener("click", handlers.onShowGM);
  routeDom.showStatsPageBtn?.addEventListener("click", handlers.onShowStats);
  routeDom.showTuningPageBtn?.addEventListener("click", handlers.onShowTuning);
  routeDom.showMeasurementPageBtn?.addEventListener("click", handlers.onShowMeasurement);
  routeDom.jumpToStatsBtn?.addEventListener("click", handlers.onJumpToStats);
}
