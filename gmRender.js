import {
  getGMStandings,
  getGMInbox,
  getPendingDecisions,
  getLastDayResults,
  getTransactions,
} from "./gmEngine.js";

function safeNum(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function formatMoney(value) {
  return `$${Number(value || 0).toLocaleString()}`;
}

function badgeClass(style) {
  if (style === "positive") return "positive";
  if (style === "negative") return "negative";
  return "neutral";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function decisionTypeLabel(type) {
  switch (type) {
    case "trade_offer":
      return "トレード提案";
    case "promotion_recommendation":
      return "昇格提案";
    case "injury_report":
      return "負傷報告";
    default:
      return type || "decision";
  }
}

function inboxTypeLabel(type) {
  switch (type) {
    case "system":
      return "system";
    case "decision":
      return "decision";
    case "decision_result":
      return "result";
    case "day_result":
      return "day";
    case "transaction":
      return "transaction";
    default:
      return type || "message";
  }
}

function buildPendingCardsHtml(cards) {
  if (!cards.length) {
    return '<div class="empty-note">現在、判断待ちカードはありません。</div>';
  }

  return cards
    .map(
      (card) => `
        <article class="decision-card">
          <div class="decision-type">${escapeHtml(
            decisionTypeLabel(card.type)
          )}</div>
          <div class="decision-title">${escapeHtml(card.title || "Decision")}</div>
          <div class="decision-body">${escapeHtml(card.body || "")}</div>
          <div class="decision-actions">
            ${(card.options || [])
              .map(
                (option) => `
                  <button
                    class="decision-btn ${badgeClass(option.style)}"
                    data-decision-id="${escapeHtml(card.id)}"
                    data-action-key="${escapeHtml(option.key)}"
                  >
                    ${escapeHtml(option.label)}
                  </button>
                `
              )
              .join("")}
          </div>
        </article>
      `
    )
    .join("");
}

function buildInboxHtml(messages) {
  if (!messages.length) {
    return '<div class="empty-note">まだメッセージがありません。</div>';
  }

  return messages
    .map(
      (message) => `
        <article class="inbox-card ${escapeHtml(message.type || "system")}">
          <div class="inbox-title-row">
            <strong class="inbox-title">${escapeHtml(message.title || "Inbox")}</strong>
            <span class="inbox-badge">${escapeHtml(
              inboxTypeLabel(message.type)
            )}</span>
          </div>
          <div class="inbox-body">${escapeHtml(message.body || "")}</div>
        </article>
      `
    )
    .join("");
}

function buildStandingsHtml(rows, controlledTeamName) {
  if (!rows.length) {
    return '<div class="empty-note">順位表データがありません。</div>';
  }

  return `
    <table>
      <thead>
        <tr>
          <th>球団</th>
          <th>W</th>
          <th>L</th>
          <th>PCT</th>
          <th>GB</th>
          <th>RS</th>
          <th>RA</th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .map(
            (row) => `
              <tr class="${row.team === controlledTeamName ? "highlight-row" : ""}">
                <td>${escapeHtml(row.team)}</td>
                <td>${safeNum(row.W)}</td>
                <td>${safeNum(row.L)}</td>
                <td>${escapeHtml(row.PCT)}</td>
                <td>${escapeHtml(row.GB)}</td>
                <td>${safeNum(row.RS)}</td>
                <td>${safeNum(row.RA)}</td>
              </tr>
            `
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function buildLastResultsHtml(results, controlledTeamName) {
  if (!results.length) {
    return '<div class="empty-note">まだ試合結果がありません。</div>';
  }

  return results
    .map((result) => {
      const isControlled =
        result.away?.name === controlledTeamName ||
        result.home?.name === controlledTeamName;

      const winnerText =
        result.winner === "away"
          ? `Winner: ${result.away?.name || "-"}`
          : result.winner === "home"
          ? `Winner: ${result.home?.name || "-"}`
          : "Winner: Tie";

      return `
        <article class="summary-card ${isControlled ? "result-focus" : ""}">
          <div class="summary-label">${result.status === "final" ? "Final" : "Game"}</div>
          <div class="summary-value">
            ${escapeHtml(result.away?.name || "-")} ${safeNum(result.score?.away)} -
            ${safeNum(result.score?.home)} ${escapeHtml(result.home?.name || "-")}
          </div>
          <div class="summary-sub">
            ${safeNum(result.inning, 0)}回${result.half === "top" ? "表" : "裏"}終了 / ${escapeHtml(
              winnerText
            )}
          </div>
        </article>
      `;
    })
    .join("");
}

function buildRosterTable(players, kind) {
  if (!players.length) {
    return '<div class="empty-note">対象選手がいません。</div>';
  }

  return `
    <table>
      <thead>
        <tr>
          <th>選手</th>
          <th>タイプ</th>
          <th>能力</th>
        </tr>
      </thead>
      <tbody>
        ${players
          .map((player) => {
            const ratings = player?.ratings || {};
            const ratingText =
              kind === "pitcher" || player?.type === "pitcher"
                ? `CTRL ${safeNum(ratings.control)} / STUFF ${safeNum(ratings.stuff)}`
                : `CON ${safeNum(ratings.contact)} / POW ${safeNum(ratings.power)} / EYE ${safeNum(ratings.eye)}`;

            return `
              <tr>
                <td>${escapeHtml(player?.name || "-")}</td>
                <td>${escapeHtml(player?.type || "-")}</td>
                <td>${escapeHtml(ratingText)}</td>
              </tr>
            `;
          })
          .join("")}
      </tbody>
    </table>
  `;
}

function buildFreeAgentHtml(players) {
  if (!players.length) {
    return '<div class="empty-note">FA候補はいません。</div>';
  }

  return `
    <table>
      <thead>
        <tr>
          <th>選手</th>
          <th>タイプ</th>
          <th>契約額</th>
          <th>想定価値</th>
        </tr>
      </thead>
      <tbody>
        ${players
          .map(
            (player) => `
              <tr>
                <td>${escapeHtml(player.name)}</td>
                <td>${escapeHtml(player.type)}</td>
                <td>${formatMoney(player.contractCost)}</td>
                <td>${safeNum(player.expectedValue)}</td>
              </tr>
            `
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function transactionLabel(type) {
  switch (type) {
    case "sign":
      return "FA契約";
    case "trade":
      return "トレード";
    case "upgrade_lineup":
      return "昇格";
    default:
      return "取引";
  }
}

function transactionClass(type) {
  switch (type) {
    case "sign":
      return "positive";
    case "trade":
      return "neutral";
    case "upgrade_lineup":
      return "positive";
    default:
      return "neutral";
  }
}

function buildTransactionsHtml(transactions) {
  if (!transactions.length) {
    return '<div class="empty-note">まだトランザクションはありません。</div>';
  }

  return transactions
    .map(
      (tx) => `
        <article class="inbox-card ${transactionClass(tx.type)}">
          <div class="inbox-title-row">
            <strong class="inbox-title">${escapeHtml(transactionLabel(tx.type))}</strong>
            <span class="inbox-badge">${escapeHtml(tx.type || "transaction")}</span>
          </div>
          <div class="inbox-body">${escapeHtml(tx.text || "")}</div>
        </article>
      `
    )
    .join("");
}

export function renderGMPage(dom, gmState) {
  const pendingCards = getPendingDecisions(gmState);
  const inbox = getGMInbox(gmState);
  const standings = getGMStandings(gmState);
  const lastResults = getLastDayResults(gmState);
  const transactions = getTransactions(gmState);

  if (dom.gmStatusPill) {
    dom.gmStatusPill.textContent = pendingCards.length > 0 ? "判断待ち" : "進行可能";
    dom.gmStatusPill.className = `status-pill ${
      pendingCards.length > 0 ? "warning" : "ok"
    }`;
  }

  if (dom.gmTeamName) dom.gmTeamName.textContent = gmState.controlledTeamName || "-";
  if (dom.gmDayValue) dom.gmDayValue.textContent = String(gmState.day);
  if (dom.gmBudgetValue) dom.gmBudgetValue.textContent = formatMoney(gmState.budget?.cash || 0);
  if (dom.gmPayrollValue) dom.gmPayrollValue.textContent = formatMoney(gmState.budget?.payroll || 0);
  if (dom.gmPendingValue) dom.gmPendingValue.textContent = String(pendingCards.length);

  if (dom.gmPendingCards) {
    dom.gmPendingCards.innerHTML = buildPendingCardsHtml(pendingCards);
  }

  if (dom.gmInbox) {
    dom.gmInbox.innerHTML = buildInboxHtml(inbox);
  }

  if (dom.gmStandings) {
    dom.gmStandings.innerHTML = buildStandingsHtml(
      standings,
      gmState.controlledTeamName
    );
  }

  if (dom.gmLastResults) {
    dom.gmLastResults.innerHTML = buildLastResultsHtml(
      lastResults,
      gmState.controlledTeamName
    );
  }

  if (dom.gmRosterLineup) {
    dom.gmRosterLineup.innerHTML = buildRosterTable(
      gmState.roster?.lineup || [],
      "batter"
    );
  }

  if (dom.gmRosterBench) {
    dom.gmRosterBench.innerHTML = buildRosterTable(
      gmState.roster?.bench || [],
      "batter"
    );
  }

  if (dom.gmFreeAgents) {
    dom.gmFreeAgents.innerHTML = buildFreeAgentHtml(gmState.freeAgents || []);
  }

  if (dom.gmTransactions) {
    dom.gmTransactions.innerHTML = buildTransactionsHtml(transactions);
  }
}