import { MAHJONG_START, MAHJONG_DISCARD, WINDS } from "./mahjong-rules.js";

export function tileName(tile) {
  if (tile >= 27)
    return [
      "East wind",
      "South wind",
      "West wind",
      "North wind",
      "White dragon",
      "Green dragon",
      "Red dragon",
    ][tile - 27];
  return (
    (tile % 9) +
    1 +
    " of " +
    ["characters", "dots", "bamboo"][Math.floor(tile / 9)]
  );
}
export function tileFace(tile) {
  const name =
    tile < 27
      ? (tile % 9) + 1 + "mps"[Math.floor(tile / 9)]
      : ["e", "s", "w", "n", "haku", "hatsu", "chun"][tile - 27];
  return (
    '<img class="mj-tile-art" src="mahjong-tiles/' +
    name +
    '.svg" alt="" aria-hidden="true" width="45" height="67" draggable="false">'
  );
}
export function mahjongScoreHTML(score, e, n) {
  return `<div class="mj-score"><div class="mj-score-total"><span>${score.limit ? e(score.limit) : score.han + " han · " + score.fu + " fu"}</span><strong>✦ ${n(score.payout)}</strong><small>credits on tsumo</small></div><div class="mj-yaku">${score.yaku.map((y) => `<span>${e(y.name)}<b>${y.yakuman ? y.yakuman + "× yakuman" : y.han + " han"}</b></span>`).join("")}<small>${score.payments.map((p) => e(p.seat) + " " + n(p.amount)).join(" · ")}</small></div></div>`;
}
export function createMahjongUI({
  getState,
  escape: e,
  number: n,
  getHistory = () => ({ open: false }),
}) {
  let selected = null,
    seen = "";
  function current() {
    const g = getState()?.mahjong;
    const key = g ? g.id + ":" + g.version : "";
    if (key !== seen) {
      selected = null;
      seen = key;
    }
    return g;
  }
  function historyHTML() {
    const h = getHistory(),
      data = h.data;
    const tileList = (tiles) =>
      tiles
        .map(
          (t) =>
            '<span class="mj-tile" role="img" aria-label="' +
            e(tileName(t)) +
            '" title="' +
            e(tileName(t)) +
            '">' +
            tileFace(t) +
            "</span>",
        )
        .join("");
    return (
      '<section class="mj-history" aria-label="Your Mahjong hand history"><div class="section-head"><div><h2>Your hand history</h2><p>Previous hands, costs and winnings. Visible only to you.</p></div><button class="button secondary" data-action="mahjong-history" aria-expanded="' +
      !!h.open +
      '">' +
      (h.open ? "Hide history" : "View history") +
      "</button></div>" +
      (h.open
        ? (!data
            ? "<p>Loading your hands…</p>"
            : data.items.length
              ? data.items
                  .map(
                    (row) =>
                      '<details class="mj-history-entry"><summary><span><strong>Hand #' +
                      row.id +
                      "</strong><small>" +
                      e(new Date(row.at).toLocaleString()) +
                      " · " +
                      e(WINDS[row.seat] || "Unknown seat") +
                      '</small></span><span class="mj-history-status">' +
                      e(
                        {
                          won: "Tsumo",
                          ended: "Ended",
                          exhausted: "Exhausted",
                        }[row.status] || row.status,
                      ) +
                      '</span><span class="' +
                      (row.net >= 0 ? "ledger-positive" : "ledger-negative") +
                      '">' +
                      (row.net > 0 ? "+" : "") +
                      n(row.net) +
                      ' net</span></summary><div class="mj-history-detail"><p>Spent ✦ ' +
                      n(row.cost) +
                      " · Won ✦ " +
                      n(row.payout) +
                      " · " +
                      n(row.discardCount) +
                      " discards</p>" +
                      (row.hand.length
                        ? '<div class="mj-history-tiles" aria-label="Final hand">' +
                          tileList(row.hand) +
                          "</div>"
                        : "<p>Tile details were not recorded for this older hand.</p>") +
                      (row.indicator != null
                        ? '<div class="mj-history-dora"><span>Dora indicator</span><span class="mj-tile" role="img" aria-label="' +
                          e(tileName(row.indicator)) +
                          '">' +
                          tileFace(row.indicator) +
                          "</span></div>"
                        : "") +
                      (row.result ? mahjongScoreHTML(row.result, e, n) : "") +
                      (row.discards.length
                        ? '<h3>Discarded tiles</h3><div class="mj-history-discards">' +
                          tileList(row.discards) +
                          "</div>"
                        : "") +
                      "</div></details>",
                  )
                  .join("")
              : "<p>No completed hands yet. Finish or end a hand to add it here.</p>") +
          '<div class="toolbar"><button class="button secondary" data-action="mahjong-history-prev" ' +
          (!data || data.page <= 1 ? "disabled" : "") +
          ">← Previous</button><span>Page " +
          (data?.page || 1) +
          '</span><button class="button secondary" data-action="mahjong-history-next" ' +
          (!data?.hasMore ? "disabled" : "") +
          ">Next →</button></div>"
        : "") +
      "</section>"
    );
  }
  return {
    select(index) {
      const g = current();
      if (
        g?.status !== "active" ||
        !Number.isInteger(index) ||
        index < 0 ||
        index >= 14
      )
        return null;
      if (selected === index) {
        if (!g.remaining)
          throw Error("The wall is empty. Claim tsumo or end this hand.");
        if (getState().me.balance < MAHJONG_DISCARD)
          throw Error(
            "Not enough credits to discard. You need " +
              n(MAHJONG_DISCARD) +
              ".",
          );
        selected = null;
        return { game: g.id, version: g.version, index };
      }
      selected = index;
      return null;
    },
    render() {
      const s = getState(),
        g = current(),
        active = g?.status === "active";
      const attrs = g ? `data-game="${g.id}" data-version="${g.version}"` : "";
      const hand = g?.hand || [
        0, 1, 2, 12, 13, 14, 24, 25, 26, 27, 27, 27, 31, 31,
      ];
      const tile = (t, i) =>
        `<${active ? "button" : "span"} class="mj-tile ${selected === i ? "selected" : ""} ${i === 13 ? "mj-drawn" : ""}" ${active ? `type="button" data-action="mahjong-select" data-index="${i}" aria-pressed="${selected === i}" aria-label="Select ${e(tileName(t))}, tile ${i + 1}"` : `role="img" aria-label="${e(tileName(t))}"`} title="${e(tileName(t))}">${tileFace(t)}</${active ? "button" : "span"}>`;
      return `<div class="page-intro"><div><h1>A seat at the table.</h1><p>Build your hand. Choose your moment.</p></div><span class="pill">GAME ROOM</span></div>
        <div class="mj-games"><button class="mj-game-tab active" aria-current="page">麻雀 <span>Mahjong</span></button><span class="mj-more">More games in the future</span></div>
        <section class="mj-table" aria-label="Mahjong table"><div class="mj-table-head"><div><span class="eyebrow">SOLO RIICHI MAHJONG</span><h2>${!g ? "Your next hand awaits." : g.status === "won" ? "Tsumo!" : g.status === "exhausted" ? "The wall is empty." : g.status === "ended" ? "Hand ended." : "Make your next move."}</h2></div><div class="mj-winds"><span>ROUND <b>東 East</b></span><span>YOUR SEAT <b>${g ? ["東", "南", "西", "北"][g.seat] + " " + WINDS[g.seat] + (g.seat === 0 ? " · Dealer" : "") : "Random"}</b></span></div></div>
        <div class="mj-middle"><div><span class="eyebrow">${g ? "DORA INDICATOR" : "HOW TO PLAY"}</span>${g ? `<span class="mj-tile mj-indicator" role="img" aria-label="Dora indicator: ${e(tileName(g.indicator))}" title="Dora indicator: ${e(tileName(g.indicator))}">${tileFace(g.indicator)}</span>` : `<p>Four groups and a pair.<br>Or a special winning hand.</p>`}</div><div class="mj-centre-mark" aria-hidden="true">麻雀</div><div class="mj-stats">${g ? `<span>REPLACEMENTS LEFT <b>${g.remaining}</b></span><span>SPENT <b>✦ ${n(g.cost)}</b></span>${g.status !== "active" ? `<span>NET RESULT <b class="${g.payout - g.cost >= 0 ? "ledger-positive" : "ledger-negative"}">${g.payout - g.cost > 0 ? "+" : ""}${n(g.payout - g.cost)}</b></span>` : `<span>DISCARDED <b>${g.discards.length}</b></span>`}` : `<span>START A HAND <b>✦ ${n(MAHJONG_START)}</b></span><span>DISCARD & DRAW <b>✦ ${n(MAHJONG_DISCARD)}</b></span>`}</div></div>
        <div class="mj-hand ${!g ? "mj-preview-hand" : ""}" aria-label="${g ? "Your 14 tiles" : "Example hand"}">${hand.map(tile).join("")}</div>
        <div class="mj-actions">${active ? `<div><strong>${selected === null ? "Select a tile to discard." : e(tileName(g.hand[selected])) + " selected"}</strong><p>${g.score ? "Claim tsumo, or click your selected tile again to discard for " + n(MAHJONG_DISCARD) + " credits." : g.remaining ? "Click a tile to select it, then click it again to discard for " + n(MAHJONG_DISCARD) + " credits." : "No replacements remain."}</p></div><div class="mj-action-buttons">${g.score ? `<button class="button mint" data-action="mahjong-tsumo" ${attrs}>Tsumo · ✦ ${n(g.score.payout)}</button>` : ""}<button class="button secondary" data-action="mahjong-discard" ${attrs} data-index="${selected ?? ""}" ${selected === null || !g.remaining || s.me.balance < MAHJONG_DISCARD ? "disabled" : ""}>Discard & draw · ✦ ${n(MAHJONG_DISCARD)}</button><button class="text-button" data-action="mahjong-end" ${attrs}>End hand</button></div>` : `<div><strong>${g?.status === "won" ? "Your winnings are in your wallet." : g ? "Start a fresh hand whenever you’re ready." : "Pay once to receive 14 tiles and a random seat."}</strong><p>${g ? "Each new hand gets a fresh wall and random seat." : "East is always the round wind. Your hand is saved between visits."}</p></div><button class="button mint" data-action="mahjong-start" ${s.me && s.me.balance < MAHJONG_START ? "disabled" : ""}>${s.me ? "New hand · ✦ " + n(MAHJONG_START) : "Sign in to play"}</button>`}</div>
        ${g?.score ? `<section class="mj-winning" aria-label="${g.status === "won" ? "Winning score" : "Available tsumo score"}">${mahjongScoreHTML(g.score, e, n)}</section>` : ""}
        ${g ? `<section class="mj-discards" aria-label="Discarded tiles this hand"><div class="mj-discard-head"><h3>Discarded tiles</h3><span>${g.discards.length} this hand</span></div>${g.discards.length ? `<div class="mj-discard-tiles">${g.discards.map((t) => `<span class="mj-tile" role="img" aria-label="${e(tileName(t))}" title="${e(tileName(t))}">${tileFace(t)}</span>`).join("")}</div>` : "<p>No tiles discarded yet.</p>"}</section>` : ""}</section>
        ${s.me ? historyHTML() : ""}

        <details class="mj-rules"><summary>Rules & scoring</summary><p>This is a solo draw-and-replace game using Japanese Riichi hand evaluation. Start for ${n(MAHJONG_START)} credits; each replacement costs ${n(MAHJONG_DISCARD)}. Click a tile once to select it, then click the same tile again to discard and pay the replacement fee. You can also use the Discard & draw button. A valid closed self-draw shows the Tsumo button. You may keep drawing instead.</p><p>Random seat each hand; East round. Tsumo pays the total normally collected from three opponents, with dealer scoring when seated East. Han, fu, yaku, dora and limit hands determine credits. No honba or riichi sticks. No red fives; one dora indicator. Counted and multiple yakuman enabled; no kiriage mangan.</p><p>The 136-tile set reserves 14 dead-wall tiles and 39 unseen opponent tiles, leaving 69 replacements after your opening draw. Discards never return. The last live tile can score haitei. There are no opponent turns, calls, kans, riichi declaration or heavenly/earthly hand bonus in this solo variant. Seven pairs and thirteen orphans count. Ending a hand or exhausting the wall gives no refund; a final winning draw can still be claimed. Refreshing resumes your hand.</p><p>All entry and replacement costs and winnings count toward net gambling rankings. Winnings do not increase Cumulative earned credits. <a href="https://github.com/kobalab/majiang-core" target="_blank" rel="noopener">Scoring library</a> · <a href="vendor/mahjong-LICENSE.txt" target="_blank" rel="noopener">MIT license</a>.</p></details>`;
    },
  };
}
