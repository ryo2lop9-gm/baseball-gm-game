function clone(value) {
  return structuredClone(value);
}

export function createInboxMessage(type, title, body, payload = {}) {
  return {
    id: crypto.randomUUID(),
    type,
    title,
    body,
    payload,
    isRead: false,
  };
}

export function prependInboxMessage(next, type, title, body, payload = {}) {
  next.inbox = next.inbox || [];
  next.inbox.unshift(createInboxMessage(type, title, body, payload));
  return next;
}

export function appendGMInboxNote(
  prevGMState,
  title,
  body,
  type = "system",
  payload = {}
) {
  const next = clone(prevGMState);
  prependInboxMessage(next, type, title, body, payload);
  return next;
}

export function addDecisionCardsToInbox(next, cards) {
  const decisionMessages = (cards || []).map((card) =>
    createInboxMessage(
      "decision",
      card.title,
      card.body,
      {
        decisionId: card.id,
        type: card.type,
        day: card.day,
      }
    )
  );

  next.inbox = [...decisionMessages, ...(next.inbox || [])];
  return next;
}