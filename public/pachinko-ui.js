import { GEM_CLICK_PRICE, gemCounts, gemValue } from "./gem-rules.js";
export function createPachinkoUI({
  getState,
  escape: e,
  number: n,
  ui,
  mahjong,
  horse,
}) {
  const button = (label, action, attrs = "", disabled = false) =>
    `<button class="button secondary" data-action="${action}" ${attrs} ${disabled ? "disabled" : ""}>${label}</button>`;
  function gem() {
    const s = getState(),
      g = s.gem,
      active = g?.status === "active",
      counts = g ? gemCounts(g) : { good: 0, bad: 0 };
    const nodes = (row) =>
      Array.from({ length: 10 }, (_, i) => {
        const value = g?.[row]?.[i],
          label = value === undefined ? "Uncut" : value ? "Success" : "Miss";
        return `<span class="facet-node ${value === undefined ? "uncut" : value ? "success" : "miss"} ${row}" role="img" aria-label="Node ${i + 1}: ${label}" title="${label}">${value === undefined ? "◇" : value ? "◆" : "×"}</span>`;
      }).join("");
    const attrs = g ? `data-game="${g.id}" data-version="${g.version}"` : "";
    return `<section class="facet-panel"><div class="section-head"><div><span class="eyebrow">GEM FACETING</span><h2>${g?.status === "complete" ? "Your gem is complete." : "Find the brilliance within."}</h2><p>Choose where to cut. Every success changes your next chance.</p></div><div class="facet-chance"><small>NEXT SUCCESS CHANCE</small><strong>${g?.chance ?? 75}%</strong></div></div><div class="facet-gem" aria-hidden="true">◇</div><div class="facet-row good"><div><h3>Brilliance <span>+ value</span></h3><small>${counts.good} successes · ${g?.good.length ?? 0}/10 cut</small></div><div class="facet-nodes">${nodes("good")}</div>${button("Facet · ✦ " + n(GEM_CLICK_PRICE), "gem-facet", attrs + ' data-row="good"', !active || g.good.length >= 10 || s.me.balance < GEM_CLICK_PRICE)}</div><div class="facet-row bad"><div><h3>Fractures <span>− value</span></h3><small>${counts.bad} fractures · ${g?.bad.length ?? 0}/10 cut</small></div><div class="facet-nodes">${nodes("bad")}</div>${button("Facet · ✦ " + n(GEM_CLICK_PRICE), "gem-facet", attrs + ' data-row="bad"', !active || g.bad.length >= 10 || s.me.balance < GEM_CLICK_PRICE)}</div>${g?.last ? `<p class="facet-last" role="status">${g.last.success ? (g.last.row === "good" ? "Brilliance set." : "A fracture formed.") : g.last.row === "good" ? "The cut missed." : "Fracture avoided."} That cut had a ${g.last.chance}% success chance.</p>` : ""}<div class="facet-summary ${g?.status === "complete" ? "complete" : ""}"><div><small>${g?.status === "complete" ? "GEM PAYOUT" : "VALUE AT CURRENT COUNTS"}</small><strong>✦ ${n(gemValue(counts.good, counts.bad))}</strong></div><div><small>SPENT</small><strong>✦ ${n(g?.cost ?? 0)}</strong></div>${g?.status !== "complete" ? `<div><small>${active ? "NODES REMAINING" : "TOTAL COST FOR 20 CUTS"}</small><strong>${active ? 20 - g.good.length - g.bad.length : "✦ " + n(GEM_CLICK_PRICE * 20)}</strong></div>` : ""}</div>${!active ? `<div class="facet-start"><p>${g ? "Your " + n(g.payout) + "-credit payout has been added to your wallet. Net result: " + (g.payout - g.cost > 0 ? "+" : "") + n(g.payout - g.cost) + "." : "Starting a gem is free. Each of its 20 cuts costs 50 credits."}</p>${button(s.me ? (g ? "Start another gem" : "Start a gem") : "Sign in to facet", "gem-start")}</div>` : '<p class="form-hint">Finish all 20 nodes to receive the payout automatically. Your gem is saved between visits; cuts cannot be undone and a new gem starts after completion.</p>'}</section><details class="mj-rules"><summary>Faceting rules & payouts</summary><p>Success starts at 75%. Every success, on either row, lowers the next chance by 10 percentage points (minimum 25%). Every miss increases it by 10 points (maximum 75%). Brilliance successes increase value; Fracture successes reduce it.</p><p>Each cut costs 50 credits, so a complete 20-node gem costs 1,000. Payout = 45 × (Brilliance successes² − Fracture successes²), with a minimum of 0. The final cut pays automatically. Examples: 6 Brilliance/4 Fractures pays 900; 7/3 pays 1,800; 8/2 pays 2,700; 10/0 pays 4,500. These are gross payouts; subtract 1,000 for the net result.</p></details>`;
  }
  function coin() {
    const s = getState(),
      r = ui.coinResult;
    return `<section class="coin-panel"><div class="coin-emblem" aria-hidden="true">◑</div><span class="eyebrow">COIN FLIP</span><h2>One coin. Your call.</h2><p>Heads or tails, with a 50% chance for either side.</p><form id="coin-form" class="stack"><label>Your call<select name="choice"><option value="heads">Heads</option><option value="tails">Tails</option></select></label><label>Your bet (credits)<input name="stake" type="number" min="1" max="${Math.min(1000000, s.me?.balance ?? 1000000)}" step="1" value="${Math.min(100, s.me?.balance ?? 100)}" required></label><button class="button mint" type="submit" ${s.me && s.me.balance < 1 ? "disabled" : ""}>${s.me ? "Flip the coin" : "Sign in to play"}</button></form><p class="form-hint">Bet 1–1,000,000 credits, within your balance. A win pays 1.75× your bet, including the bet; decimals round down. A loss pays 0. For example, a 3-credit winning bet pays 5 credits.</p>${r ? `<div class="coin-result" role="status"><h3>${e(r.outcome[0].toUpperCase() + r.outcome.slice(1))}</h3><strong class="${r.net >= 0 ? "ledger-positive" : "ledger-negative"}">${r.net > 0 ? "+" : ""}${n(r.net)} net credits</strong><p>Bet ✦ ${n(r.stake)} · Payout ✦ ${n(r.payout)}</p></div>` : ""}</section>`;
  }
  return {
    render() {
      const selected = ["mahjong", "gem", "coin", "horse"].includes(
        ui.pachinkoGame,
      )
        ? ui.pachinkoGame
        : "mahjong";
      return `<div class="page-intro"><div><h1>Pachinko</h1><p>Feeling lucky?</p></div></div><nav class="pachinko-games" aria-label="Pachinko games">${[
        ["mahjong", "Mahjong"],
        ["horse", "Horse Racing"],
        ["gem", "Gem faceting"],
        ["coin", "Coin flip"],
      ]
        .map(
          ([id, label]) =>
            `<button class="${id === selected ? "active" : ""}" data-action="pachinko-game" data-game="${id}" aria-pressed="${id === selected}">${label}</button>`,
        )
        .join(
          "",
        )}<span>More games to come</span></nav>${selected === "mahjong" ? mahjong() : selected === "gem" ? gem() : selected === "horse" ? horse() : coin()}`;
    },
  };
}
