function ensureNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

export function calcSimplePlayerValue(player) {
  const contact = ensureNumber(player?.ratings?.contact, 0);
  const power = ensureNumber(player?.ratings?.power, 0);
  const eye = ensureNumber(player?.ratings?.eye, 0);
  const control = ensureNumber(player?.ratings?.control, 0);
  const stuff = ensureNumber(player?.ratings?.stuff, 0);

  return contact + power + eye + control + stuff;
}

export function getPlayerExpectedValue(player) {
  return ensureNumber(player?.expectedValue, calcSimplePlayerValue(player));
}