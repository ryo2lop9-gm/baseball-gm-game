export function createTransaction(type, text, payload = {}) {
  return {
    id: crypto.randomUUID(),
    type,
    text,
    payload,
    dayStamp: Date.now(),
  };
}