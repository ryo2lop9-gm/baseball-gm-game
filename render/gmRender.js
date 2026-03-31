function safeNum(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function formatMoney(value) {
  return `$${Number(value || 0).toLocaleString()}`;
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

function buildPendingCardsHtml(cards) {
  if (!cards.length) {
    return `
      <div class="empty-state">
        現在、判断待ちカードはありません。
      </div>
    `;
  }

  return cards
    .map(
      (card) => `
        <article class="gm-card">
          <div class="gm-card__type">${escapeHtml(decisionTypeLabel(card.type))}</div>
          <h4 class="gm-card__title">${escapeHtml(card.title || "Decision")}</h4>
          <p class="gm-card__body">${escapeHtml(card.body || "")}</p>
          <div class="gm-card__actions">
            ${(card.options || [])
              .map(
                (option) => `
                  <button
                    type="button"
                    data-decision-id="${escapeHtml(card.id || "")}"
                    data-action-key="${escapeHtml(option.actionKey || "")}"
                  >
                    ${escapeHtml(option.label || "")}
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
    return `
      <div class="empty-state">
        まだメッセージがありません。
      </div>
    `;
  }

  return messages
    .map(
      (message) => `
        <article class="inbox-item">
          <div class="inbox-item__meta">
            <strong>${escapeHtml(message.title || "Inbox")}</strong>
            <span>${escapeHtml(inboxTypeLabel(message.type))}</span>
          </div>
          <p class="inbox-item__body">${escapeHtml(message.body || "")}</p>
        </article>
      `
    )
    .join("");
}

function buildStandingsHtml(rows, controlledTeamName) {
  if (!rows.length) {
    return `
      <div class="empty-state">
        順位表データがありません。
      </div>
    `;
  }

  return `
    <table class="gm-table">
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
          .map((row) => {
            const isControlled = row.team === controlledTeamName;
            return `
              <tr class="${isControlled ? "is-controlled-team" : ""}">
                <td>${escapeHtml(row.team)}</td>
                <td>${safeNum(row.W)}</td>
                <td>${safeNum(row.L)}</td>
                <td>${escapeHtml(row.PCT)}</td>
                <td>${escapeHtml(row.GB)}</td>
                <td>${safeNum(row.RS)}</td>
                <td>${safeNum(row.RA)}</td>
              </tr>
            `;
          })
          .join("")}
      </tbody>
    </table>
  `;
}

function buildLastResultsHtml(results, controlledTeamName) {
  if (!results.length) {
    return `
      <div class="empty-state">
        まだ試合結果がありません。
      </div>
    `;
  }

  return results
    .map((result) => {
      const isControlled =
        result.away?.name === controlledTeamName || result.home?.name === controlledTeamName;

      const winnerText =
        result.winner === "away"
          ? `Winner: ${result.away?.name || "-"}`
          : result.winner === "home"
          ? `Winner: ${result.home?.name || "-"}`
          : "Winner: Tie";

      return `
        <article class="result-item ${isControlled ? "is-controlled-game" : ""}">
          <div class="result-item__status">
            ${result.status === "final" ? "Final" : "Game"}
          </div>
          <div class="result-item__score">
            ${escapeHtml(result.away?.name || "-")}
            ${safeNum(result.score?.away)}
            -
            ${safeNum(result.score?.home)}
            ${escapeHtml(result.home?.name || "-")}
          </div>
          <div class="result-item__meta">
            ${safeNum(result.inning, 0)}回${result.half === "top" ? "表" : "裏"}終了 /
            ${escapeHtml(winnerText)}
          </div>
        </article>
      `;
    })
    .join("");
}

function buildRosterTable(players, kind) {
  if (!players.length) {
    return `
      <div class="empty-state">
        対象選手がいません。
      </div>
    `;
  }

  return `
    <table class="gm-table">
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
                : `CON ${safeNum(ratings.contact)} / POW ${safeNum(ratings.power)} / EYE ${safeNum(
                    ratings.eye
                  )}`;

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
    return `
      <div class="empty-state">
        FA候補はいません。
      </div>
    `;
  }

  return `
    <table class="gm-table">
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
                <td>${escapeHtml(player?.name || "-")}</td>
                <td>${escapeHtml(player?.type || "-")}</td>
                <td>${formatMoney(player?.contractCost || 0)}</td>
                <td>${safeNum(player?.expectedValue)}</td>
              </tr>
            `
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function buildTransactionsHtml(transactions) {
  if (!transactions.length) {
    return `
      <div class="empty-state">
        まだトランザクションはありません。
      </div>
    `;
  }

  return transactions
    .map(
      (tx) => `
        <article class="transaction-item">
          <div class="transaction-item__meta">
            <strong>${escapeHtml(transactionLabel(tx.type))}</strong>
            <span>${escapeHtml(tx.type || "transaction")}</span>
          </div>
          <p class="transaction-item__body">${escapeHtml(tx.text || "")}</p>
        </article>
      `
    )
    .join("");
}

export function renderGMPage(dom, viewModel) {
  if (dom.gmStatusPill) {
    dom.gmStatusPill.textContent = viewModel.statusText;
    dom.gmStatusPill.className = `status-pill ${viewModel.statusClass}`;
  }

  if (dom.gmTeamName) dom.gmTeamName.textContent = viewModel.controlledTeamName;
  if (dom.gmDayValue) dom.gmDayValue.textContent = String(viewModel.day);
  if (dom.gmBudgetValue) dom.gmBudgetValue.textContent = formatMoney(viewModel.budgetCash);
  if (dom.gmPayrollValue) dom.gmPayrollValue.textContent = formatMoney(viewModel.budgetPayroll);
  if (dom.gmPendingValue) dom.gmPendingValue.textContent = String(viewModel.pendingCount);

  if (dom.gmPendingCards) {
    dom.gmPendingCards.innerHTML = buildPendingCardsHtml(viewModel.pendingCards);
  }

  if (dom.gmInbox) {
    dom.gmInbox.innerHTML = buildInboxHtml(viewModel.inbox);
  }

  if (dom.gmStandings) {
    dom.gmStandings.innerHTML = buildStandingsHtml(
      viewModel.standings,
      viewModel.controlledTeamName
    );
  }

  if (dom.gmLastResults) {
    dom.gmLastResults.innerHTML = buildLastResultsHtml(
      viewModel.lastResults,
      viewModel.controlledTeamName
    );
  }

  if (dom.gmRosterLineup) {
    dom.gmRosterLineup.innerHTML = buildRosterTable(viewModel.rosterLineup, "batter");
  }

  if (dom.gmRosterBench) {
    dom.gmRosterBench.innerHTML = buildRosterTable(viewModel.rosterBench, "batter");
  }

  if (dom.gmFreeAgents) {
    dom.gmFreeAgents.innerHTML = buildFreeAgentHtml(viewModel.freeAgents);
  }

  if (dom.gmTransactions) {
    dom.gmTransactions.innerHTML = buildTransactionsHtml(viewModel.transactions);
  }
}