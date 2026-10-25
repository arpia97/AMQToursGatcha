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
  const rank = (tile % 9) + 1,
    suit = Math.floor(tile / 9);
  let art;
  if (tile >= 27) {
    art =
      tile === 31
        ? '<rect x="13" y="20" width="30" height="40" rx="3" fill="none" stroke="#3d617a" stroke-width="3"/>'
        : `<text x="28" y="55" text-anchor="middle" font-size="34" font-family="serif" font-weight="700" fill="${tile === 32 ? "#197957" : tile === 33 ? "#b82c3b" : "#263344"}">${["東", "南", "西", "北", "", "發", "中"][tile - 27]}</text>`;
  } else if (suit === 0) {
    art = `<text x="28" y="35" text-anchor="middle" font-size="27" font-family="serif" font-weight="700" fill="#263344">${["一", "二", "三", "四", "五", "六", "七", "八", "九"][rank - 1]}</text><text x="28" y="64" text-anchor="middle" font-size="25" font-family="serif" fill="#b82c3b">萬</text>`;
  } else {
    const patterns = [
      [],
      [[28, 42]],
      [
        [28, 27],
        [28, 56],
      ],
      [
        [16, 23],
        [28, 42],
        [40, 61],
      ],
      [
        [16, 25],
        [40, 25],
        [16, 59],
        [40, 59],
      ],
      [
        [16, 23],
        [40, 23],
        [28, 42],
        [16, 61],
        [40, 61],
      ],
      [
        [16, 23],
        [40, 23],
        [16, 42],
        [40, 42],
        [16, 61],
        [40, 61],
      ],
      [
        [16, 19],
        [28, 29],
        [40, 39],
        [16, 53],
        [40, 53],
        [16, 67],
        [40, 67],
      ],
      [
        [16, 19],
        [40, 19],
        [16, 34],
        [40, 34],
        [16, 50],
        [40, 50],
        [16, 65],
        [40, 65],
      ],
      [
        [14, 22],
        [28, 22],
        [42, 22],
        [14, 42],
        [28, 42],
        [42, 42],
        [14, 62],
        [28, 62],
        [42, 62],
      ],
    ];
    art = patterns[rank]
      .map(([x, y], i) =>
        suit === 1
          ? `<circle cx="${x}" cy="${y}" r="${rank === 1 ? 14 : 6}" fill="none" stroke="${i % 3 === 1 ? "#b82c3b" : "#345f91"}" stroke-width="3"/><circle cx="${x}" cy="${y}" r="2" fill="#263344"/>`
          : `<path d="M${x - 3} ${y - 6}h6v12h-6z" fill="${i % 3 === 2 ? "#b82c3b" : "#197957"}"/><path d="M${x - 5} ${y}h10" stroke="#eceddd" stroke-width="1.5"/>`,
      )
      .join("");
  }
  return `<svg viewBox="0 0 56 80" aria-hidden="true">${art}<text x="5" y="10" font-size="7" fill="#526274" font-family="sans-serif">${tile < 27 ? rank + "mps"[suit] : ["E", "S", "W", "N", "Wh", "G", "R"][tile - 27]}</text></svg>`;
}
export function mahjongScoreHTML(score, e, n) {
  return `<div class="mj-score"><div class="mj-score-total"><span>${score.limit ? e(score.limit) : score.han + " han · " + score.fu + " fu"}</span><strong>✦ ${n(score.payout)}</strong><small>credits on tsumo</small></div><div class="mj-yaku">${score.yaku.map((y) => `<span>${e(y.name)}<b>${y.yakuman ? y.yakuman + "× yakuman" : y.han + " han"}</b></span>`).join("")}<small>${score.payments.map((p) => e(p.seat) + " " + n(p.amount)).join(" · ")}</small></div></div>`;
}
export function createMahjongUI({ getState, escape: e, number: n }) {
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
  return {
    select(index) {
      const g = current();
      if (g?.status === "active" && index >= 0 && index < 14) selected = index;
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
        <div class="mj-actions">${active ? `<div><strong>${selected === null ? "Select a tile to discard." : e(tileName(g.hand[selected])) + " selected"}</strong><p>${g.score ? "You can claim tsumo, or keep drawing for a different hand." : g.remaining ? "The selected tile leaves your hand and a new one is drawn." : "No replacements remain."}</p></div><div class="mj-action-buttons">${g.score ? `<button class="button mint" data-action="mahjong-tsumo" ${attrs}>Tsumo · ✦ ${n(g.score.payout)}</button>` : ""}<button class="button secondary" data-action="mahjong-discard" ${attrs} data-index="${selected ?? ""}" ${selected === null || !g.remaining || s.me.balance < MAHJONG_DISCARD ? "disabled" : ""}>Discard & draw · ✦ ${n(MAHJONG_DISCARD)}</button><button class="text-button" data-action="mahjong-end" ${attrs}>End hand</button></div>` : `<div><strong>${g?.status === "won" ? "Your winnings are in your wallet." : g ? "Start a fresh hand whenever you’re ready." : "Pay once to receive 14 tiles and a random seat."}</strong><p>${g ? "Each new hand gets a fresh wall and random seat." : "East is always the round wind. Your hand is saved between visits."}</p></div><button class="button mint" data-action="mahjong-start" ${s.me && s.me.balance < MAHJONG_START ? "disabled" : ""}>${s.me ? "New hand · ✦ " + n(MAHJONG_START) : "Sign in to play"}</button>`}</div>
        ${g?.score ? `<section class="mj-winning" aria-label="${g.status === "won" ? "Winning score" : "Available tsumo score"}">${mahjongScoreHTML(g.score, e, n)}</section>` : ""}
        ${g?.discards.length ? `<details class="mj-discards"><summary>Discarded tiles · ${g.discards.length}</summary><div>${g.discards.map((t) => `<span class="mj-tile" role="img" aria-label="${e(tileName(t))}" title="${e(tileName(t))}">${tileFace(t)}</span>`).join("")}</div></details>` : ""}</section>
        <details class="mj-rules"><summary>Rules & scoring</summary><p>This is a solo draw-and-replace game using Japanese Riichi hand evaluation. Start for ${n(MAHJONG_START)} credits; each replacement costs ${n(MAHJONG_DISCARD)}. Select a tile, then choose Discard & draw. A valid closed self-draw shows the Tsumo button. You may keep drawing instead.</p><p>Random seat each hand; East round. Tsumo pays the total normally collected from three opponents, with dealer scoring when seated East. Han, fu, yaku, dora and limit hands determine credits. No honba or riichi sticks. No red fives; one dora indicator. Counted and multiple yakuman enabled; no kiriage mangan.</p><p>The 136-tile set reserves 14 dead-wall tiles and 39 unseen opponent tiles, leaving 69 replacements after your opening draw. Discards never return. The last live tile can score haitei. There are no opponent turns, calls, kans, riichi declaration or heavenly/earthly hand bonus in this solo variant. Seven pairs and thirteen orphans count. Ending a hand or exhausting the wall gives no refund; a final winning draw can still be claimed. Refreshing resumes your hand.</p><p>All entry and replacement costs and winnings count toward net gambling rankings. Winnings do not increase Cumulative earned credits. <a href="https://github.com/kobalab/majiang-core" target="_blank" rel="noopener">Scoring library</a> · <a href="vendor/mahjong-LICENSE.txt" target="_blank" rel="noopener">MIT license</a>.</p></details>`;
    },
  };
}
