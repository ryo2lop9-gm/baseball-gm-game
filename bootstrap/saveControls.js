function formatSavedAt(value) {
  if (!value) return "未保存";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "未保存";

  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");

  return `${yyyy}/${mm}/${dd} ${hh}:${mi}:${ss}`;
}

export function createSaveControls({
  routeDom,
  getLastSavedAt,
  clearPersistedState,
  onResetConfirmed,
}) {
  function updateSaveStatusLabel() {
    const label = document.getElementById("saveStatusLabel");
    if (!label) return;
    label.textContent = `最終保存: ${formatSavedAt(getLastSavedAt())}`;
  }

  function ensureSaveControls() {
    const host =
      routeDom?.showTuningPageBtn?.parentElement ||
      document.querySelector(".tabbar");

    if (!host) return;

    if (!document.getElementById("resetPersistedStateBtn")) {
      const resetBtn = document.createElement("button");
      resetBtn.id = "resetPersistedStateBtn";
      resetBtn.type = "button";
      resetBtn.textContent = "保存削除";
      resetBtn.title =
        "localStorage の保存データを削除して初期状態に戻します";

      resetBtn.addEventListener("click", () => {
        const ok = window.confirm(
          "保存データを削除して初期状態に戻します。よろしいですか？"
        );
        if (!ok) return;

        clearPersistedState();
        onResetConfirmed();
      });

      host.appendChild(resetBtn);
    }

    if (!document.getElementById("saveStatusLabel")) {
      const saveLabel = document.createElement("div");
      saveLabel.id = "saveStatusLabel";
      saveLabel.style.display = "inline-flex";
      saveLabel.style.alignItems = "center";
      saveLabel.style.padding = "10px 14px";
      saveLabel.style.borderRadius = "10px";
      saveLabel.style.background = "rgba(255,255,255,0.06)";
      saveLabel.style.border = "1px solid rgba(255,255,255,0.08)";
      saveLabel.style.color = "var(--muted)";
      saveLabel.style.fontWeight = "700";
      saveLabel.style.fontSize = "12px";
      host.appendChild(saveLabel);
    }

    updateSaveStatusLabel();
  }

  return {
    ensureSaveControls,
    updateSaveStatusLabel,
  };
}