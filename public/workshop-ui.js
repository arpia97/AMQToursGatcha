import { fusionQuote, fusionContribution, chanceText } from "./fusion-rules.js";
import { cardComparator, rarityClass } from "./card-display.js";

export function createWorkshop(h) {
  let board = [],
    lastResult = null,
    query = "",
    kind = "",
    grade = "",
    page = 1;
  const {
    escape: e,
    number: n,
    cardBy,
    cardHTML,
    image,
    gradeBadge,
    btn,
    getState,
  } = h;
  function material(entry) {
    const item = getState().inventory.find((i) => i.card === entry.card);
    if (!item)
      throw Error(
        "A selected card is no longer owned. Remove it from the board.",
      );
    const c = cardBy(entry.card);
    return {
      ...c,
      card: c.id,
      variant: entry.variant,
      level: entry.variant === "extra" ? 1 : item.level,
    };
  }
  function models(entries = board) {
    const counts = new Map();
    return entries.map((entry) => {
      const m = material(entry),
        item = getState().inventory.find((i) => i.card === entry.card),
        key = m.card + ":" + m.variant;
      const used = (counts.get(key) || 0) + 1;
      counts.set(key, used);
      if (used > (m.variant === "extra" ? item.copies - 1 : 1))
        throw Error(
          "A selected copy is no longer available. Remove it from the board.",
        );
      return m;
    });
  }
  function canAdd(entry) {
    try {
      fusionQuote(models([...board, entry]));
      return "";
    } catch (err) {
      return err.message;
    }
  }
  function add(entry) {
    const reason = canAdd(entry);
    if (reason) throw Error(reason);
    board.push({ ...entry });
  }
  function remove(index) {
    if (Number.isInteger(index) && index >= 0 && index < board.length)
      board.splice(index, 1);
  }
  function clear() {
    board = [];
    lastResult = null;
  }
  function request() {
    const cards = models(),
      expectedOdds = fusionQuote(cards);
    return {
      cards: cards.map((m) => ({
        card: m.card,
        variant: m.variant,
        expectedRarity: m.rarity || "Pending",
        expectedLevel: m.level,
      })),
      expectedOdds,
    };
  }
  function complete(result) {
    board = [];
    lastResult = result;
  }
  function render() {
    const state = getState();
    if (!state.me)
      return `<div class="page-intro"><div><h1>A new kind of possibility.</h1><p>Fuse your cards into a random replacement.</p></div></div>${h.empty("Your fusion board is waiting.", "Sign in to select cards from your collection.", btn("Sign in", "account"))}`;
    let odds = null,
      error = "",
      selected = [];
    try {
      selected = models();
      if (board.length) odds = fusionQuote(selected);
    } catch (err) {
      error = err.message;
    }
    const slots = Array.from({ length: 5 }, (_, i) => {
      const entry = board[i],
        m = selected[i];
      if (!entry)
        return `<div class="fusion-slot empty-slot"><span>＋</span><small>SLOT ${i + 1}</small></div>`;
      const c = m || cardBy(entry.card);
      let contribution = "Unavailable";
      try {
        const p = fusionContribution(c, m?.level || 1);
        contribution =
          chanceText(p.stay) + " stay · " + chanceText(p.upgrade) + " upgrade";
      } catch {}
      return `<article class="fusion-slot tier-${rarityClass(c.rarity)}"><div class="fusion-portrait">${image(c)}${gradeBadge(c)}<span class="level-tag">Lv. ${m?.level || "?"}</span></div><strong>${e(c.name)}</strong><small>${e(contribution)}</small><button class="text-button" data-action="fusion-remove" data-index="${i}">Remove ×</button></article>`;
    }).join("");
    let inventory = state.inventory
      .map((i) => ({ ...i, c: cardBy(i.card) }))
      .filter(
        (i) =>
          (!kind || i.c.kind === kind) &&
          (!grade || (i.c.rarity || "Pending") === grade) &&
          [i.c.name, i.c.series, i.c.series_romaji, i.c.series_english]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(query.toLowerCase()),
      )
      .sort((a, b) => cardComparator("rarity")(a.c, b.c));
    const max = Math.max(1, Math.ceil(inventory.length / 24));
    page = Math.min(page, max);
    const choices = inventory
      .slice((page - 1) * 24, page * 24)
      .map((item) => {
        const c = item.c;
        const choice = (variant, label) => {
          const reason = canAdd({ card: c.id, variant });
          return `<button class="button secondary" data-action="fusion-add" data-id="${e(c.id)}" data-variant="${variant}" ${reason ? "disabled" : ""} title="${e(reason || "Add to the board; it is consumed only when you fuse.")}">${label}</button>`;
        };
        return `<div class="fusion-material">${cardHTML(c)}<div class="fusion-material-actions"><p class="form-hint">Lv. ${item.level} · ${item.copies - 1} extra copies</p>${item.copies > 1 ? choice("extra", "Add extra · Lv. 1") : ""}${choice("card", "Add card · Lv. " + item.level)}${["AG", null, undefined, "Pending"].includes(c.rarity) ? '<small class="form-hint">' + (c.rarity === "AG" ? "AG is not a fusion material." : "Waiting for rarity classification.") + "</small>" : ""}</div></div>`;
      })
      .join("");
    const result = lastResult
      ? `<section class="fusion-result ${lastResult.outcome === "break" ? "broken" : ""}" role="status"><span class="eyebrow">${lastResult.outcome === "upgrade" ? "A RARER POSSIBILITY" : lastResult.outcome === "stay" ? "A NEW FACE" : "THE FUSION BROKE"}</span><h2>${lastResult.outcome === "upgrade" ? "Upgraded to " + e(lastResult.odds.upgraded) + "!" : lastResult.outcome === "stay" ? "A new " + e(lastResult.odds.baseline) + " card." : "The materials were consumed."}</h2><p>${e(lastResult.message)}</p>${lastResult.cards.length ? `<div class="fusion-reward">${cardHTML(lastResult.cards[0], null, { copies: 1, level: 1, preview: true })}</div>` : '<div class="broken-sigil" aria-hidden="true">✧</div>'}<button class="text-button" data-action="fusion-dismiss">Dismiss result</button></section>`
      : "";
    return `<div class="page-intro"><div><h1>A new kind of possibility.</h1><p>Up to five cards. One fusion. A chance to go higher.</p></div><a class="text-button" href="#collection">Back to My collection ↗</a></div>${result}<section class="fusion-panel"><div class="section-head"><h2>Your fusion board</h2><button class="text-button" data-action="fusion-clear">Clear board</button></div><div class="fusion-board">${slots}</div><div class="fusion-odds"><div><small>BASELINE</small><strong>${e(odds?.baseline || "—")}</strong></div><div><small>STAY${odds ? " · " + e(odds.baseline) : ""}</small><strong>${chanceText(odds?.stay || 0)}</strong></div><div><small>UPGRADE${odds ? " · " + e(odds.upgraded) : ""}</small><strong>${chanceText(odds?.upgrade || 0)}</strong></div><div><small>BREAK</small><strong>${chanceText(odds?.break ?? 10000)}</strong></div></div><p class="form-hint">${board.length === 1 ? "One card can stay or break. Add a second card to enable upgrades." : "The highest printed rarity is the baseline. An upgrade is exactly one tier higher."} Each enhancement adds half a probability tier; above Ubers, contributions keep doubling per full tier. Odds from all cards add together.</p><p class="fusion-warning">Every selected copy is consumed, including enhanced cards, even if the fusion breaks. A successful fusion draws one random Lv. 1 character or seiyuu of the result rarity. Duplicates can appear.</p>${error ? `<p class="form-error" role="alert">${e(error)}</p>` : ""}${btn("Fuse & consume " + board.length + " card" + (board.length === 1 ? "" : "s"), "fusion-run", !odds || error ? "disabled" : "", "mint")}</section><details class="rarity-guide"><summary>Fusion chances per level-1 card</summary><table class="fusion-rules"><thead><tr><th>Rarity</th><th>Stay</th><th>Upgrade</th></tr></thead><tbody>${[
      "D",
      "C",
      "B",
      "A",
      "S",
      "SS",
      "SSS",
      "Ubers",
    ]
      .map((r) => {
        const p = fusionContribution({ rarity: r }, 1);
        return `<tr><td><span class="grade-inline grade-${rarityClass(r)}">${r}</span></td><td>${chanceText(p.stay)}</td><td>${chanceText(p.upgrade)}</td></tr>`;
      })
      .join(
        "",
      )}</tbody></table><p>Upgrade needs at least two materials. AG and Pending cannot be used. Boards over 100% stay + upgrade are blocked. For example, Lv. 2 D contributes 1.5% stay and 0.75% upgrade; Lv. 3 D contributes 2% and 1%. Enhancement affects odds, not the baseline.</p></details><div class="section-head"><h2>Choose your materials</h2><span class="subtext">${n(inventory.length)} matching cards</span></div><div class="fusion-filters"><input class="search" id="fusion-search" aria-label="Search fusion materials" placeholder="Search names or anime…" value="${e(query)}"><label>Type<select id="fusion-kind"><option value="">All card types</option><option value="character" ${kind === "character" ? "selected" : ""}>Characters</option><option value="seiyuu" ${kind === "seiyuu" ? "selected" : ""}>Seiyuus</option></select></label><label>Rarity<select id="fusion-rarity"><option value="">All rarities</option>${["AG", "Ubers", "SSS", "SS", "S", "A", "B", "C", "D", "Pending"].map((r) => `<option value="${r}" ${grade === r ? "selected" : ""}>${r}</option>`).join("")}</select></label></div><div class="card-grid fusion-material-grid">${choices || h.empty("No matching cards.", "Collect cards or change your filters.")}</div><div class="toolbar space-top">${btn("← Previous", "fusion-prev", page <= 1 ? "disabled" : "", "secondary")}<span class="subtext">Page ${page} of ${max}</span>${btn("Next →", "fusion-next", page >= max ? "disabled" : "", "secondary")}</div>`;
  }
  return {
    render,
    add,
    remove,
    clear,
    request,
    complete,
    dismiss: () => (lastResult = null),
    filter: (field, value) => {
      if (field === "query") query = value;
      if (field === "kind") kind = value;
      if (field === "grade") grade = value;
      page = 1;
    },
    next: () => page++,
    prev: () => (page = Math.max(1, page - 1)),
  };
}
