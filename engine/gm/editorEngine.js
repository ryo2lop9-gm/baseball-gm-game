function safeNum(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

const DEFAULT_PITCH_VELOCITIES = {
  fourSeam: 94.5,
  slider: 85.5,
  curve: 79.0,
  fork: 86.2,
};

function getPitchMixValue(pitcher, pitchType) {
  const value = pitcher?.pitchMix?.[pitchType];
  if (typeof value === "number") {
    return {
      usage: value,
      velocity: DEFAULT_PITCH_VELOCITIES[pitchType],
    };
  }
  if (value && typeof value === "object") {
    return {
      usage: safeNum(value.usage, 0),
      velocity: safeNum(value.velocity, DEFAULT_PITCH_VELOCITIES[pitchType]),
    };
  }
  return {
    usage: 0,
    velocity: DEFAULT_PITCH_VELOCITIES[pitchType],
  };
}

function ensureEditablePitchMix(pitcher) {
  const current = pitcher.pitchMix || {};
  pitcher.pitchMix = {};

  for (const pitchType of ["fourSeam", "slider", "curve", "fork"]) {
    const normalized = getPitchMixValue({ pitchMix: current }, pitchType);
    pitcher.pitchMix[pitchType] = {
      usage: normalized.usage,
      velocity: normalized.velocity,
    };
  }

  return pitcher.pitchMix;
}

function readVelocityInput(input, fallback) {
  return clamp(safeNum(input?.value, fallback), 50, 110);
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
  const isPitcher = type === "pitcher";

  if (dom.editorBatterFields) dom.editorBatterFields.hidden = isPitcher;
  if (dom.editorPitcherFields) dom.editorPitcherFields.hidden = !isPitcher;
  for (const input of [
    dom.editorContactInput,
    dom.editorPowerInput,
    dom.editorEyeInput,
  ]) {
    if (input) input.disabled = isPitcher;
  }
  for (const input of [
    dom.editorControlInput,
    dom.editorStuffInput,
    dom.editorFourSeamVeloInput,
    dom.editorSliderVeloInput,
    dom.editorCurveVeloInput,
    dom.editorForkVeloInput,
  ]) {
    if (input) input.disabled = !isPitcher;
  }

  if (dom.editorNameInput) dom.editorNameInput.value = entity?.name || "";

  if (dom.editorContactInput) dom.editorContactInput.value = type === "batter" ? safeNum(ratings.contact) : "";
  if (dom.editorPowerInput) dom.editorPowerInput.value = type === "batter" ? safeNum(ratings.power) : "";
  if (dom.editorEyeInput) dom.editorEyeInput.value = type === "batter" ? safeNum(ratings.eye) : "";

  if (dom.editorControlInput) dom.editorControlInput.value = isPitcher ? safeNum(ratings.control) : "";
  if (dom.editorStuffInput) dom.editorStuffInput.value = isPitcher ? safeNum(ratings.stuff) : "";

  const fourSeam = getPitchMixValue(entity, "fourSeam");
  const slider = getPitchMixValue(entity, "slider");
  const curve = getPitchMixValue(entity, "curve");
  const fork = getPitchMixValue(entity, "fork");

  if (dom.editorFourSeamVeloInput) dom.editorFourSeamVeloInput.value = isPitcher ? fourSeam.velocity : "";
  if (dom.editorSliderVeloInput) dom.editorSliderVeloInput.value = isPitcher ? slider.velocity : "";
  if (dom.editorCurveVeloInput) dom.editorCurveVeloInput.value = isPitcher ? curve.velocity : "";
  if (dom.editorForkVeloInput) dom.editorForkVeloInput.value = isPitcher ? fork.velocity : "";
}

export function applyEditorFormToRoster(dom, rosterBundle) {
  const nextBundle = structuredClone(rosterBundle);
  const side = dom.editorSideSelect?.value || "away";
  const roster = side === "away" ? nextBundle.awayRoster : nextBundle.homeRoster;
  const type = dom.editorPlayerTypeSelect?.value || "batter";
  const slot = safeNum(dom.editorSlotSelect?.value, 0);

  if (type === "pitcher") {
    if (!roster.rotation || !roster.rotation[0]) return nextBundle;

    const pitcher = roster.rotation[0];

    pitcher.name =
      (dom.editorNameInput?.value || "").trim() || pitcher.name;

    pitcher.ratings.control = clamp(
      safeNum(dom.editorControlInput?.value, pitcher.ratings.control),
      1,
      100
    );
    pitcher.ratings.stuff = clamp(
      safeNum(dom.editorStuffInput?.value, pitcher.ratings.stuff),
      1,
      100
    );

    const pitchMix = ensureEditablePitchMix(pitcher);
    pitchMix.fourSeam.velocity = readVelocityInput(
      dom.editorFourSeamVeloInput,
      pitchMix.fourSeam.velocity
    );
    pitchMix.slider.velocity = readVelocityInput(
      dom.editorSliderVeloInput,
      pitchMix.slider.velocity
    );
    pitchMix.curve.velocity = readVelocityInput(
      dom.editorCurveVeloInput,
      pitchMix.curve.velocity
    );
    pitchMix.fork.velocity = readVelocityInput(
      dom.editorForkVeloInput,
      pitchMix.fork.velocity
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
