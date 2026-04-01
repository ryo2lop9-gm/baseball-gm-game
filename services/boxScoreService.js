export function addQoCToBox(state, qoc, { currentSide }) {
  if (typeof currentSide !== "function") return;

  const side = currentSide(state);
  if (!state.box?.[side]?.qoc) return;

  state.box[side].qoc[qoc] = (state.box[side].qoc[qoc] || 0) + 1;
}