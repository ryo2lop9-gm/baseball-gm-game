import {
  calcSimplePlayerValue,
  getPlayerExpectedValue,
} from "../../services/playerValueService.js";
import {
  pickWeakestLineupPlayer,
  pickBestBenchBatter,
  pickBestFreeAgent,
} from "../../services/rosterDecisionService.js";

export const GM_DECISION_TYPES = Object.freeze({
  TRADE_OFFER: "trade_offer",
  PROMOTION_RECOMMENDATION: "promotion_recommendation",
  INJURY_REPORT: "injury_report",
});

export const GM_DECISION_ACTIONS = Object.freeze({
  TRADE_ACCEPT: "accept",
  TRADE_REJECT: "reject",
  PROMOTION_ACCEPT: "promote",
  PROMOTION_HOLD: "hold",
  INJURY_REPLACE: "replace",
  INJURY_WAIT: "wait",
});

function clone(value) {
  return structuredClone(value);
}

function random() {
  return Math.random();
}

function buildDecisionCard({
  type,
  day,
  title,
  body,
  severity = "normal",
  payload = {},
  options = [],
}) {
  return {
    id: crypto.randomUUID(),
    type,
    day,
    title,
    body,
    severity,
    payload: clone(payload),
    options: clone(options),
    status: "pending",
  };
}

function createDecisionOption(key, label, style = "neutral") {
  return {
    key,
    label,
    style,
  };
}

function getControlledTeamResultOfLastDay(gmState) {
  const teamName = gmState?.controlledTeamName;
  const results = gmState?.league?.lastDayResults || [];

  return (
    results.find(
      (result) =>
        result?.away?.name === teamName || result?.home?.name === teamName
    ) || null
  );
}

function getControlledTeamScoreDiff(result, teamName) {
  if (!result || !teamName) return 0;

  const isAway = result?.away?.name === teamName;
  const isHome = result?.home?.name === teamName;

  if (!isAway && !isHome) return 0;

  const myScore = isAway ? result?.score?.away || 0 : result?.score?.home || 0;
  const oppScore = isAway ? result?.score?.home || 0 : result?.score?.away || 0;

  return myScore - oppScore;
}

function shouldGenerateTradeCard(gmState) {
  const scoreDiff = getControlledTeamScoreDiff(
    getControlledTeamResultOfLastDay(gmState),
    gmState?.controlledTeamName
  );

  if (scoreDiff <= -3) return random() < 0.55;
  if (scoreDiff < 0) return random() < 0.35;
  return random() < 0.18;
}

function shouldGeneratePromotionCard(gmState) {
  const benchCandidate = pickBestBenchBatter(gmState?.roster);
  if (!benchCandidate) return false;

  const weakest = pickWeakestLineupPlayer(gmState?.roster);
  if (!weakest) return false;

  const gap =
    calcSimplePlayerValue(benchCandidate) - calcSimplePlayerValue(weakest);

  if (gap >= 18) return random() < 0.75;
  if (gap >= 10) return random() < 0.45;
  return random() < 0.12;
}

function shouldGenerateInjuryCard() {
  return random() < 0.16;
}

function buildTradeDecisionCard(gmState) {
  const outgoing = pickWeakestLineupPlayer(gmState?.roster);
  const incoming = pickBestFreeAgent(
    gmState?.freeAgents,
    (player) => player?.type !== "pitcher"
  );

  if (!outgoing || !incoming) return null;

  const outgoingValue = calcSimplePlayerValue(outgoing);
  const incomingValue = getPlayerExpectedValue(incoming);
  const delta = incomingValue - outgoingValue;

  const title = delta >= 8 ? "他球団経由の補強提案" : "トレード打診";

  const body =
    `${outgoing.name} を放出し、${incoming.name} を獲得する提案です。` +
    ` 戦力差の目安: ${delta >= 0 ? "+" : ""}${delta}`;

  return buildDecisionCard({
    type: GM_DECISION_TYPES.TRADE_OFFER,
    day: gmState?.day || 1,
    title,
    body,
    severity: delta >= 8 ? "high" : "normal",
    payload: {
      give: {
        name: outgoing.name,
        id: outgoing?.profile?.id || outgoing?.name,
        value: outgoingValue,
      },
      receive: {
        id: incoming.id,
        name: incoming.name,
        type: incoming.type,
        value: incomingValue,
        contractCost: incoming.contractCost || 0,
      },
    },
    options: [
      createDecisionOption(
        GM_DECISION_ACTIONS.TRADE_ACCEPT,
        "承認する",
        "positive"
      ),
      createDecisionOption(
        GM_DECISION_ACTIONS.TRADE_REJECT,
        "見送る",
        "negative"
      ),
    ],
  });
}

function buildPromotionDecisionCard(gmState) {
  const promoted = pickBestBenchBatter(gmState?.roster);
  const demoted = pickWeakestLineupPlayer(gmState?.roster);

  if (!promoted || !demoted) return null;
  if (
    (promoted?.profile?.id || promoted?.name) ===
    (demoted?.profile?.id || demoted?.name)
  ) {
    return null;
  }

  const gain =
    calcSimplePlayerValue(promoted) - calcSimplePlayerValue(demoted);

  return buildDecisionCard({
    type: GM_DECISION_TYPES.PROMOTION_RECOMMENDATION,
    day: gmState?.day || 1,
    title: "監督から昇格勧告",
    body:
      `${promoted.name} を先発ラインナップへ昇格し、` +
      `${demoted.name} をベンチへ下げる提案です。` +
      ` 期待改善値: ${gain >= 0 ? "+" : ""}${gain}`,
    severity: gain >= 12 ? "high" : "normal",
    payload: {
      promoted: {
        id: promoted?.profile?.id || promoted?.name,
        name: promoted.name,
        value: calcSimplePlayerValue(promoted),
      },
      demoted: {
        id: demoted?.profile?.id || demoted?.name,
        name: demoted.name,
        value: calcSimplePlayerValue(demoted),
      },
    },
    options: [
      createDecisionOption(
        GM_DECISION_ACTIONS.PROMOTION_ACCEPT,
        "昇格する",
        "positive"
      ),
      createDecisionOption(
        GM_DECISION_ACTIONS.PROMOTION_HOLD,
        "現状維持",
        "neutral"
      ),
    ],
  });
}

function buildInjuryDecisionCard(gmState) {
  const injured = pickWeakestLineupPlayer(gmState?.roster);
  if (!injured) return null;

  const replacementBench = pickBestBenchBatter(gmState?.roster);
  const replacementFA = pickBestFreeAgent(
    gmState?.freeAgents,
    (player) => player?.type !== "pitcher"
  );

  const suggestedReplacement = replacementBench || replacementFA || null;
  if (!suggestedReplacement) return null;

  const replacementSource = replacementBench ? "bench" : "free_agent";

  return buildDecisionCard({
    type: GM_DECISION_TYPES.INJURY_REPORT,
    day: gmState?.day || 1,
    title: "主力野手の負傷報告",
    body:
      `${injured.name} が離脱見込みです。` +
      `${suggestedReplacement.name} を代替案として提案します。`,
    severity: "high",
    payload: {
      injured: {
        id: injured?.profile?.id || injured?.name,
        name: injured.name,
        value: calcSimplePlayerValue(injured),
      },
      replacement: {
        id:
          suggestedReplacement?.id ||
          suggestedReplacement?.profile?.id ||
          suggestedReplacement?.name,
        name: suggestedReplacement.name,
        type: suggestedReplacement.type || "batter",
        source: replacementSource,
        contractCost: suggestedReplacement.contractCost || 0,
        value: getPlayerExpectedValue(suggestedReplacement),
      },
    },
    options: [
      createDecisionOption(
        GM_DECISION_ACTIONS.INJURY_REPLACE,
        "代替案を承認",
        "positive"
      ),
      createDecisionOption(
        GM_DECISION_ACTIONS.INJURY_WAIT,
        "様子を見る",
        "negative"
      ),
    ],
  });
}

export function generateDailyDecisionCards(gmState) {
  const cards = [];

  if (!gmState || gmState.isComplete) return cards;

  if (shouldGenerateTradeCard(gmState)) {
    const tradeCard = buildTradeDecisionCard(gmState);
    if (tradeCard) cards.push(tradeCard);
  }

  if (shouldGeneratePromotionCard(gmState)) {
    const promotionCard = buildPromotionDecisionCard(gmState);
    if (promotionCard) cards.push(promotionCard);
  }

  if (shouldGenerateInjuryCard()) {
    const injuryCard = buildInjuryDecisionCard(gmState);
    if (injuryCard) cards.push(injuryCard);
  }

  return cards;
}