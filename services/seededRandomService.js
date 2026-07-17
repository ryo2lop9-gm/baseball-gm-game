export const DEFAULT_MEASUREMENT_SEED = 123456789;

export function normalizeSeed(value, fallback = DEFAULT_MEASUREMENT_SEED) {
  const number = Number(value);
  const safeValue = Number.isFinite(number) ? Math.trunc(number) : fallback;
  return safeValue >>> 0;
}

export function createSeededRandom(seed = DEFAULT_MEASUREMENT_SEED) {
  let state = normalizeSeed(seed);

  return function seededRandom() {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
