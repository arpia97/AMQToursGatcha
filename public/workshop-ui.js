import { fusionQuote, fusionContribution, chanceText } from "./fusion-rules.js";
import { cardComparator, rarityClass } from "./card-display.js";

export function createWorkshop(h) {
  let board = [],
    pickerSlot = null,
    lastResult = null,
    query = "",
    kind = "",
    grade = "",
    page = 1,
    target = null,
    outcomeView = "upgrade",
    outcomeQuery = "",
    outcomePage = 1,
    outcomeData = null,
    outcomeKey = "",
    outcomeLoaded = 0;
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
    if (item.protected)
      throw Error("This card is protected. Unprotect it before fusion.");
    const c = cardBy(entry.card);
    return {
      ...c,
      card: c.id,
      variant: entry.variant,
      slot: entry.slot,
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
  function candidateBoard(entry, slot) {
    if (!Number.isInteger(slot) || slot < 0 || slot > 4)
      throw Error("Choose an available fusion slot.");
    return [...board.filter((m) => m.slot !== slot), { ...entry, slot }].sort(
      (a, b) => a.slot - b.slot,
    );
  }
  function freeSlot() {
    return [0, 1, 2, 3, 4].find((i) => !board.some((m) => m.slot === i));
  }
  function canAdd(entry, slot = pickerSlot ?? freeSlot()) {
    try {
      fusionQuote(models(candidateBoard(entry, slot)));
      return "";
    } catch (err) {
      return err.message;
    }
  }
  function add(entry, slot = pickerSlot ?? freeSlot()) {
    const reason = canAdd(entry, slot);
    if (reason) throw Error(reason);
    board = candidateBoard(entry, slot);
    changedBoard();
  }
  function remove(index) {
    board = board.filter((m) => m.slot !== index);
    changedBoard();
  }
  function clear() {
    board = [];
    lastResult = null;
    pickerSlot = null;
    target = null;
    outcomeData = null;
    outcomeKey = "";
    outcomeView = "upgrade";
    outcomeQuery = "";
    outcomePage = 1;
  }
  function openPicker(index) {
    if (!Number.isInteger(index) || index < 0 || index > 4)
      throw Error("Choose a fusion slot.");
    pickerSlot = index;
    page = 1;
  }
  function poolLabel() {
    const kinds = new Set(board.map((m) => cardBy(m.card).kind));
    return kinds.size === 1
      ? kinds.has("character")
        ? "Characters only"
        : "Seiyuus only"
      : kinds.size
        ? "Characters + seiyuus"
        : "Choose a material";
  }
  function outcomeSpec() {
    if (!board.length) return null;
    const cards = models(),
      odds = fusionQuote(cards),
      kinds = [...new Set(cards.map((c) => c.kind))];
    return {
      rarity: outcomeView === "stay" ? odds.baseline : odds.upgraded,
      upgraded: odds.upgraded,
      kind: kinds.length === 1 ? kinds[0] : "mixed",
      odds,
    };
  }
  function changedBoard() {
    outcomePage = 1;
    outcomeKey = "";
    outcomeData = null;
    try {
      const spec = outcomeSpec();
      if (
        !spec ||
        (target &&
          (target.rarity !== spec.upgraded ||
            (spec.kind !== "mixed" && target.kind !== spec.kind)))
      )
        target = null;
    } catch {
      target = null;
    }
  }
  async function loadOutcomes(api) {
    let spec;
    try {
      spec = outcomeSpec();
    } catch {
      return null;
    }
    if (!spec) return null;
    const key = JSON.stringify([
      spec.rarity,
      spec.kind,
      outcomeQuery,
      outcomePage,
    ]);
    if (key === outcomeKey && Date.now() - outcomeLoaded < 30000)
      return outcomeData;
    const params = new URLSearchParams({
      rarity: spec.rarity,
      kind: spec.kind,
      q: outcomeQuery,
      page: outcomePage,
    });
    const data = await api("fusion-outcomes?" + params);
    const current = outcomeSpec();
    if (
      !current ||
      JSON.stringify([
        current.rarity,
        current.kind,
        outcomeQuery,
        outcomePage,
      ]) !== key
    )
      return null;
    outcomeData = data;
    outcomePage = data.page;
    outcomeKey = JSON.stringify([
      spec.rarity,
      spec.kind,
      outcomeQuery,
      data.page,
    ]);
    outcomeLoaded = Date.now();
    return data;
  }
  function chooseTarget(id) {
    if (!id) {
      target = null;
      return;
    }
    const spec = outcomeSpec(),
      c = outcomeData?.cards.find((c) => c.id === id);
    if (
      outcomeView !== "upgrade" ||
      !c ||
      c.rarity !== spec.upgraded ||
      outcomeData.eligibleTotal < 2
    )
      throw Error("Choose an available upgrade target.");
    target = c;
  }
  function renderOutcomes(odds) {
    if (!odds) return "";
    const data = outcomeData,
      canTarget = outcomeView === "upgrade" && data?.eligibleTotal > 1;
    return `<section class="fusion-outcomes"><div class="section-head"><div><h2>Target Card</h2><p class="form-hint">Choose an upgrade outcome. Your target has exactly a 50% chance if fusion upgrades; the other 50% draws a different eligible card.</p></div>${target ? btn("Clear target", "fusion-target-clear", "", "secondary") : ""}</div>${target ? `<div class="fusion-target-selected tier-${rarityClass(target.rarity)}">${image(target)}<div><strong>${e(target.name)}</strong><p>${e(target.rarity)} · 50% on upgrade${odds.upgrade ? " · " + chanceText(odds.upgrade / 2) + " overall" : " · add a second material to enable upgrades"}</p></div></div>` : '<p class="form-hint">No target selected: upgraded cards are chosen uniformly.</p>'}<div class="fusion-outcome-controls"><div class="tabs"><button class="tab ${outcomeView === "upgrade" ? "active" : ""}" data-action="fusion-outcome-view" data-view="upgrade">Upgrade · ${e(odds.upgraded)}</button><button class="tab ${outcomeView === "stay" ? "active" : ""}" data-action="fusion-outcome-view" data-view="stay">Same tier · ${e(odds.baseline)}</button></div><input id="fusion-outcome-search" class="search" aria-label="Search possible fusion outcomes" placeholder="Search possible outcomes…" value="${e(outcomeQuery)}"></div>${data ? `<p class="form-hint">${n(data.total)} matching ${e(outcomeView === "upgrade" ? odds.upgraded : odds.baseline)} cards · ${e(poolLabel())}${outcomeView === "stay" ? " · same-tier results remain uniform" : data.eligibleTotal === 1 ? " · only one possible upgrade; that card is already guaranteed on an upgrade" : ""}</p><div class="fusion-outcome-grid">${data.cards.map((c) => `<button type="button" class="collect-card fusion-target-card tier-${rarityClass(c.rarity)} ${target?.id === c.id ? "target-selected" : ""}" data-action="fusion-target" data-id="${e(c.id)}" aria-pressed="${target?.id === c.id}" ${canTarget ? "" : "disabled"}>${image(c)}<strong>${e(c.name)}</strong><small>${e(c.kind === "character" ? "Character" : "Seiyuu")} · ${e(c.rarity)}</small></button>`).join("") || '<p class="form-hint">No matching outcomes. Try another search.</p>'}</div><div class="toolbar space-top">${btn("← Previous", "fusion-outcome-prev", data.page <= 1 ? "disabled" : "", "secondary")}<span class="subtext">Page ${data.page} of ${Math.max(1, Math.ceil(data.total / data.limit))}</span>${btn("Next →", "fusion-outcome-next", !data.hasMore ? "disabled" : "", "secondary")}</div>` : '<p class="form-hint">Loading possible outcomes…</p>'}</section>`;
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
      ...(target && expectedOdds.upgrade ? { targetCard: target.id } : {}),
    };
  }
  function complete(result) {
    board = [];
    lastResult = result;
    pickerSlot = null;
    target = null;
    outcomeData = null;
    outcomeKey = "";
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
      const entry = board.find((m) => m.slot === i),
        m = selected.find((m) => m.slot === i);
      if (!entry)
        return `<button class="fusion-slot empty-slot" data-action="fusion-pick" data-index="${i}" aria-label="Choose material for slot ${i + 1}"><span>＋</span><small>SLOT ${i + 1}</small></button>`;
      const c = m || cardBy(entry.card);
      let contribution = "Unavailable";
      try {
        const p = fusionContribution(c, m?.level || 1);
        contribution =
          chanceText(p.stay) + " stay · " + chanceText(p.upgrade) + " upgrade";
      } catch {}
      return `<article class="fusion-slot tier-${rarityClass(c.rarity)}"><button class="fusion-slot-pick" data-action="fusion-pick" data-index="${i}" aria-label="Change material in slot ${i + 1}: ${e(c.name)}"><div class="fusion-portrait">${image(c)}${gradeBadge(c)}<span class="level-tag">Lv. ${m?.level || "?"}</span></div><strong>${e(c.name)}</strong><small>${e(contribution)}</small></button><button class="text-button" data-action="fusion-remove" data-index="${i}">Remove ×</button></article>`;
    }).join("");
    const result = lastResult
      ? `<section class="fusion-result ${lastResult.outcome === "break" ? "broken" : ""}" role="status"><span class="eyebrow">${lastResult.outcome === "upgrade" ? "A RARER POSSIBILITY" : lastResult.outcome === "stay" ? "A NEW FACE" : "THE FUSION BROKE"}</span><h2>${lastResult.outcome === "upgrade" ? "Upgraded to " + e(lastResult.odds.upgraded) + "!" : lastResult.outcome === "stay" ? "A new " + e(lastResult.odds.baseline) + " card." : "The materials were consumed."}</h2><p>${e(lastResult.message)}</p>${lastResult.cards.length ? `<div class="fusion-reward">${cardHTML(lastResult.cards[0], null, { copies: 1, level: 1, preview: true })}</div>` : '<div class="broken-sigil" aria-hidden="true">✧</div>'}<button class="text-button" data-action="fusion-dismiss">Dismiss result</button></section>`
      : "";
    return `<div class="page-intro"><div><h1>A new kind of possibility.</h1><p>Fuse up to five cards for a chance to upgrade.</p></div><a class="text-button" href="#collection">Back to My collection ↗</a></div>${result}<section class="fusion-panel"><div class="section-head"><h2>Your fusion board</h2><button class="text-button" data-action="fusion-clear">Clear board</button></div><p class="form-hint">Click a slot to choose or replace a material. Nothing is consumed until you fuse.</p><div class="fusion-board">${slots}</div><p class="fusion-pool"><strong>Result pool:</strong> ${poolLabel()}</p><div class="fusion-odds"><div><small>BASELINE</small><strong>${e(odds?.baseline || "—")}</strong></div><div><small>STAY${odds ? " · " + e(odds.baseline) : ""}</small><strong>${chanceText(odds?.stay || 0)}</strong></div><div><small>UPGRADE${odds ? " · " + e(odds.upgraded) : ""}</small><strong>${chanceText(odds?.upgrade || 0)}</strong></div><div><small>BREAK</small><strong>${chanceText(odds?.break ?? 10000)}</strong></div></div><p class="form-hint">${board.length === 1 ? "One card can stay or break. Add a second card to enable upgrades." : "Baseline: Highest rarity card. Upgrade: One tier higher."} Odds from all cards add together.</p><p class="fusion-warning">Every selected copy is consumed regardless of the results. A successful fusion draws one random Lv. 1 card of the result rarity.</p>${error ? `<p class="form-error" role="alert">${e(error)}</p>` : ""}${btn("Fuse & consume " + board.length + " card" + (board.length === 1 ? "" : "s"), "fusion-run", !odds || error ? "disabled" : "", "mint")}</section>${renderOutcomes(odds)}<details class="rarity-guide"><summary>Fusion chances per level-1 card</summary><table class="fusion-rules"><thead><tr><th>Rarity</th><th>Stay</th><th>Upgrade</th></tr></thead><tbody>${[
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
      )}</tbody></table><p>Upgrade needs at least two materials. AG and Pending cannot be used. Boards over 100% stay + upgrade are blocked. For example, Lv. 2 D contributes 1.5% stay and 0.75% upgrade; Lv. 3 D contributes 2% and 1%. Enhancement affects odds, not the baseline.</p></details>`;
  }
  function renderPicker() {
    if (pickerSlot === null) return "";
    let inventory = getState()
      .inventory.map((i) => ({ ...i, c: cardBy(i.card) }))
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

    return `<section class="fusion-picker-dialog" role="dialog" aria-modal="true" aria-labelledby="fusion-picker-title" tabindex="-1"><div class="section-head"><div><span class="eyebrow">FUSION MATERIALS</span><h2 id="fusion-picker-title">Choose a material · Slot ${pickerSlot + 1}</h2></div><button class="text-button" data-action="fusion-picker-close" aria-label="Close material picker">Close ×</button></div><p class="form-hint">Choose an extra level-1 copy or your enhanced base card. ${board.some((m) => m.slot === pickerSlot) ? "Your current slot is replaced only when you select a card." : "Cards are consumed only when you press Fuse."}</p><div class="section-head"><h2>Choose your materials</h2><span class="subtext">${n(inventory.length)} matching cards</span></div><div class="fusion-filters"><input class="search" id="fusion-search" aria-label="Search fusion materials" placeholder="Search names or anime…" value="${e(query)}"><label>Type<select id="fusion-kind"><option value="">All card types</option><option value="character" ${kind === "character" ? "selected" : ""}>Characters</option><option value="seiyuu" ${kind === "seiyuu" ? "selected" : ""}>Seiyuus</option></select></label><label>Rarity<select id="fusion-rarity"><option value="">All rarities</option>${["AG", "Ubers", "SSS", "SS", "S", "A", "B", "C", "D", "Pending"].map((r) => `<option value="${r}" ${grade === r ? "selected" : ""}>${r}</option>`).join("")}</select></label></div><div class="card-grid fusion-material-grid">${choices || h.empty("No matching cards.", "Collect cards or change your filters.")}</div><div class="toolbar space-top">${btn("← Previous", "fusion-prev", page <= 1 ? "disabled" : "", "secondary")}<span class="subtext">Page ${page} of ${max}</span>${btn("Next →", "fusion-next", page >= max ? "disabled" : "", "secondary")}</div><p class="form-hint">Result pool follows your materials: characters only, seiyuus only, or both when mixed. Boards over 100% are blocked.</p></section>`;
  }
  return {
    render,
    renderPicker,
    loadOutcomes,
    chooseTarget,
    outcomeFilter: (field, value) => {
      if (field === "view") outcomeView = value;
      if (field === "query") outcomeQuery = value;
      outcomePage = field === "page" ? Math.max(1, outcomePage + value) : 1;
      outcomeKey = "";
    },
    openPicker,
    closePicker: () => {
      pickerSlot = null;
    },
    pickerOpen: () => pickerSlot !== null,
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
