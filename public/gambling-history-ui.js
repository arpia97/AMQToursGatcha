export function gameDisplayName(game) {
  return (
    {
      mahjong: "Mahjong",
      "horse-racing": "Horse Racing",
      horse: "Horse Racing",
      faceting: "Gem Faceting",
      gem: "Gem Faceting",
      roulette: "Roulette",
      blackjack67: "67 Blackjack",
      blackjack: "67 Blackjack",
      climb: "Mountain Climbing",
    }[game] || game
  );
}

export function formatOutcomeSummary(game, o, escape = String, number = String) {
  if (!o || typeof o !== "object") return "Completed";
  if (game === "mahjong") {
    if (o.status === "won") {
      const pts = o.result?.points ? number(o.result.points) + " pts" : "";
      const han = o.result?.han ? o.result.han + " han" : "";
      return "Tsumo" + (han || pts ? " · " + [han, pts].filter(Boolean).join(" ") : "");
    }
    if (o.status === "ended") return "Ended";
    if (o.status === "exhausted") {
      return o.tenpai === true
        ? "Tenpai · Fee Refunded"
        : o.tenpai === false
          ? "Not Tenpai"
          : "Exhausted";
    }
    return o.status || "Completed";
  }
  if (game === "roulette") {
    const choice = o.choice ? o.choice[0].toUpperCase() + o.choice.slice(1) : "";
    const colour = o.colour ? o.colour[0].toUpperCase() + o.colour.slice(1) : "";
    const pocket = o.pocket != null ? "#" + o.pocket : "";
    return `Bet: ${choice || "?"} · Result: ${[colour, pocket].filter(Boolean).join(" ")}`;
  }
  if (game === "climb") {
    const h = o.height != null ? o.height + "m" : "0m";
    const moves = Array.isArray(o.moves) ? o.moves.length : 0;
    return `Final Height: ${h} (${moves}/10 routes)`;
  }
  if (game === "blackjack67" || game === "blackjack") {
    const res = o.result;
    const label =
      res === "blackjack"
        ? "Natural Blackjack (5:2)"
        : res === "dealer-blackjack"
          ? "Dealer Blackjack"
          : res === "win"
            ? "Won Hand"
            : res === "push"
              ? "Push (Tied)"
              : res === "bust"
                ? "Bust (Over 67)"
                : res === "loss"
                  ? "Dealer Won"
                  : res || "Completed";
    return `Result: ${label}`;
  }
  if (game === "faceting" || game === "gem") {
    const good = Array.isArray(o.good) ? o.good.filter(Boolean).length : 0;
    const bad = Array.isArray(o.bad) ? o.bad.filter(Boolean).length : 0;
    return `${good}/10 Brilliance · ${bad}/10 Fractures`;
  }
  if (game === "horse-racing" || game === "horse") {
    const winnerIdx = o.winner;
    const runnerName =
      Array.isArray(o.runners) && o.runners[winnerIdx]?.name
        ? o.runners[winnerIdx].name
        : "";
    const winStr =
      winnerIdx != null
        ? `Winner: #${winnerIdx + 1}${runnerName ? " (" + escape(runnerName) + ")" : ""}`
        : "Race finished";
    return `${winStr} · ${o.payout > 0 ? "Tickets Paid" : "No Winning Tickets"}`;
  }
  return "Completed";
}

export function gamblingHistoryModalHTML(
  data,
  loading,
  selectedGame = "all",
  { escape: e = String, number: n = String } = {},
) {
  const g = selectedGame || "all";
  const tabs = [
    ["all", "All Games"],
    ["mahjong", "Mahjong"],
    ["horse", "Horse Racing"],
    ["gem", "Gem Faceting"],
    ["roulette", "Roulette"],
    ["blackjack", "67 Blackjack"],
    ["climb", "Mountain Climbing"],
  ];

  const headerHTML =
    '<div class="section-head"><div><h2>Gambling History</h2><p>Latest rounds across all Pachinko games. Visible only to you.</p></div></div>' +
    '<div class="tabs gambling-history-tabs" role="group" aria-label="Game Filter">' +
    tabs
      .map(
        ([id, label]) =>
          `<button class="tab ${g === id || (id === "horse" && g === "horse-racing") || (id === "gem" && g === "faceting") || (id === "blackjack" && g === "blackjack67") ? "active" : ""}" data-action="gambling-history-filter" data-game="${id}" aria-pressed="${g === id}">${label}</button>`,
      )
      .join("") +
    "</div>";

  if (loading) {
    return (
      headerHTML +
      '<p class="subtext" role="status">Loading gambling history…</p>'
    );
  }

  const items = data?.items || [];
  if (!items.length) {
    return (
      headerHTML +
      '<p class="subtext">No completed rounds found for this game yet. Play a round to add it here!</p>'
    );
  }

  const listHTML =
    '<div class="gambling-history-list">' +
    items
      .map((item) => {
        const net = item.net;
        const summary = formatOutcomeSummary(item.game, item.outcome, e, n);
        const dateStr = item.at ? new Date(item.at).toLocaleString() : "";
        return (
          '<div class="gambling-history-entry">' +
          '<div class="gambling-history-header">' +
          '<div class="gambling-history-main">' +
          `<span class="gambling-game-badge game-${item.game}">${e(gameDisplayName(item.game))}</span>` +
          `<strong>Round #${item.id}</strong>` +
          `<span class="gambling-history-date">${e(dateStr)}</span>` +
          "</div>" +
          `<span class="gambling-net ${net >= 0 ? "ledger-positive" : "ledger-negative"}">${net > 0 ? "+" : ""}${n(net)} ✦ Net</span>` +
          "</div>" +
          '<div class="gambling-history-body">' +
          `<span class="gambling-summary">${summary}</span>` +
          `<span class="subtext">Stake ✦ ${n(item.stake)} · Payout ✦ ${n(item.payout)}</span>` +
          "</div>" +
          "</div>"
        );
      })
      .join("") +
    "</div>";

  const page = data?.page || 1;
  const hasMore = !!data?.hasMore;
  const pagerHTML =
    '<div class="toolbar">' +
    `<button class="button secondary" data-action="gambling-history-prev" ${page <= 1 ? "disabled" : ""}>← Previous</button>` +
    `<span class="subtext">Page ${page}</span>` +
    `<button class="button secondary" data-action="gambling-history-next" ${!hasMore ? "disabled" : ""}>Next →</button>` +
    "</div>";

  return headerHTML + listHTML + pagerHTML;
}
