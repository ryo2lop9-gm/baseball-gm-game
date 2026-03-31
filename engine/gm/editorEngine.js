function safeNum(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function fillEditorSlotOptions(dom) {
  if (!dom.editorSlotSelect || !dom.editorPlayerTypeSelect) return;

  const type = dom.editorPlayerTypeSelect.value || "batter";

  if (type === "pitcher") {
    dom.editorSlotSelect.innerHTML = `<option value="0">先発投手</option>`;
    dom.editorSlotSelect.disabled = true;
    return;
  }

  dom.editorSlotSelect.disabled = false;
  dom.editorSlotSelect.innerHTML = Array.from({ length: 9 }, (_, index) => {
    return `<option value="${index}">${index + 1}番</option>`;
  }).join("");
}

export function getSelectedRosterBundleSide(dom, rosterBundle) {
  const side = dom.editorSideSelect?.value || "away";
  return side === "away" ? rosterBundle.awayRoster : rosterBundle.homeRoster;
}

export function getSelectedEditableEntity(dom, rosterBundle) {
  const roster = getSelectedRosterBundleSide(dom, rosterBundle);
  const type = dom.editorPlayerTypeSelect?.value || "batter";
  const slot = safeNum(dom.editorSlotSelect?.value, 0);

  if (type === "pitcher") {
    return roster?.rotation?.[0] || null;
  }

  return roster?.lineup?.[slot] || null;
}

export function loadEditorFormFromEntity(dom, entity) {
  const ratings = entity?.ratings || {};
  const type = dom.editorPlayerTypeSelect?.value || "batter";

  if (dom.editorNameInput) dom.editorNameInput.value = entity?.name || "";

  if (dom.editorContactInput) dom.editorContactInput.value = type === "batter" ? safeNum(ratings.contact) : "";
  if (dom.editorPowerInput) dom.editorPowerInput.value = type === "batter" ? safeNum(ratings.power) : "";
  if (dom.editorEyeInput) dom.editorEyeInput.value = type === "batter" ? safeNum(ratings.eye) : "";

  if (dom.editorControlInput) dom.editorControlInput.value = type === "pitcher" ? safeNum(ratings.control) : "";
  if (dom.editorStuffInput) dom.editorStuffInput.value = type === "pitcher" ? safeNum(ratings.stuff) : "";
}

export function applyEditorFormToRoster(dom, rosterBundle) {
  const nextBundle = structuredClone(rosterBundle);
  const side = dom.editorSideSelect?.value || "away";
  const roster = side === "away" ? nextBundle.awayRoster : nextBundle.homeRoster;
  const type = dom.editorPlayerTypeSelect?.value || "batter";
  const slot = safeNum(dom.editorSlotSelect?.value, 0);

  if (type === "pitcher") {
    if (!roster.rotation || !roster.rotation[0]) return nextBundle;

    roster.rotation[0].name =
      (dom.editorNameInput?.value || "").trim() || roster.rotation[0].name;

    roster.rotation[0].ratings.control = clamp(
      safeNum(dom.editorControlInput?.value, roster.rotation[0].ratings.control),
      1,
      100
    );
    roster.rotation[0].ratings.stuff = clamp(
      safeNum(dom.editorStuffInput?.value, roster.rotation[0].ratings.stuff),
      1,
      100
    );

    return nextBundle;
  }

  if (!roster.lineup || !roster.lineup[slot]) return nextBundle;

  roster.lineup[slot].name =
    (dom.editorNameInput?.value || "").trim() || roster.lineup[slot].name;

  roster.lineup[slot].ratings.contact = clamp(
    safeNum(dom.editorContactInput?.value, roster.lineup[slot].ratings.contact),
    1,
    100
  );
  roster.lineup[slot].ratings.power = clamp(
    safeNum(dom.editorPowerInput?.value, roster.lineup[slot].ratings.power),
    1,
    100
  );
  roster.lineup[slot].ratings.eye = clamp(
    safeNum(dom.editorEyeInput?.value, roster.lineup[slot].ratings.eye),
    1,
    100
  );

  return nextBundle;
}