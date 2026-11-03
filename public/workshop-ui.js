import {
  fusionQuote,
  fusionContribution,
  chanceText,
  FUSION_RESULTS,
  FUSION_DOWNGRADES,
  FUSION_TIER_RULES,
} from "./fusion-rules.js";
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
    if (slot === -1 || slot === undefined)
      return "All five slots are filled. Remove a material to select another card.";
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
    if (pickerSlot !== null) pickerSlot = freeSlot() ?? -1;
    changedBoard();
  }
  function remove(index) {
    board = board.filter((m) => m.slot !== index);
    if (pickerSlot !== null) pickerSlot = freeSlot() ?? -1;
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
      rarity:
        outcomeView === "stay"
          ? odds.baseline
          : (
              [...odds.outcomes, ...odds.downgrades].find(
                (o) => o.outcome === outcomeView,
              ) || odds.outcomes[0]
            ).rarity,
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
      !spec.odds.outcomes.some((o) => o.outcome === outcomeView) ||
      !c ||
      c.rarity !== spec.upgraded ||
      outcomeData.eligibleTotal < 2
    )
      throw Error("Choose an available upgrade target.");
    target = c;
  }
  function renderOutcomes(odds) {
    if (!odds) return "";
    const spec = outcomeSpec(),
      data = outcomeData,
      canTarget =
        odds.outcomes.some((o) => o.outcome === outcomeView) &&
        spec.rarity === odds.upgraded &&
        data?.eligibleTotal > 1;
    const targetChance =
      odds.outcomes
        .filter((o) => o.rarity === odds.upgraded)
        .reduce((sum, o) => sum + o.chance, 0) / 2;
    return `<section class="fusion-outcomes"><div class="section-head"><div><h2>Target Card</h2><p class="form-hint">Choose a target from the +1-tier pool. It has a 50% chance when that result tier rolls. Tier probabilities stay unchanged.</p></div>${target ? btn("Clear Target", "fusion-target-clear", "", "secondary") : ""}</div>${target ? `<div class="fusion-target-selected tier-${rarityClass(target.rarity)}">${image(target)}<div><strong>${e(target.name)}</strong><p>${e(target.rarity)} · 50% in its result tier · ${chanceText(targetChance)} overall</p></div></div>` : '<p class="form-hint">No target selected: result cards are chosen uniformly within their tier.</p>'}<div class="fusion-outcome-controls"><div class="tabs">${[...odds.outcomes, ...odds.downgrades].map((o) => `<button class="tab ${outcomeView === o.outcome ? "active" : ""}" data-action="fusion-outcome-view" data-view="${o.outcome}">${o.label} · ${e(o.rarity)}</button>`).join("")}<button class="tab ${outcomeView === "stay" ? "active" : ""}" data-action="fusion-outcome-view" data-view="stay">Same Tier · ${e(odds.baseline)}</button></div><input id="fusion-outcome-search" class="search" aria-label="Search possible fusion outcomes" placeholder="Search possible outcomes…" value="${e(outcomeQuery)}"></div>${data ? `<p class="form-hint">${n(data.total)} matching ${e(spec.rarity)} cards · ${e(poolLabel())}${outcomeView === "stay" ? " · same-tier results remain uniform" : data.eligibleTotal === 1 ? " · only one eligible card in this tier" : ""}</p><div class="fusion-outcome-grid">${data.cards.map((c) => `<button type="button" class="collect-card fusion-target-card tier-${rarityClass(c.rarity)} ${target?.id === c.id ? "target-selected" : ""}" data-action="fusion-target" data-id="${e(c.id)}" aria-pressed="${target?.id === c.id}" ${canTarget ? "" : "disabled"}>${image(c)}<strong>${e(c.name)}</strong><small>${e(c.kind === "character" ? "Character" : "Seiyuu")} · ${e(c.rarity)}</small></button>`).join("") || '<p class="form-hint">No matching outcomes. Try another search.</p>'}</div><div class="toolbar space-top">${btn("← Previous", "fusion-outcome-prev", data.page <= 1 ? "disabled" : "", "secondary")}<span class="subtext">Page ${data.page} of ${Math.max(1, Math.ceil(data.total / data.limit))}</span>${btn("Next →", "fusion-outcome-next", !data.hasMore ? "disabled" : "", "secondary")}</div>` : '<p class="form-hint">Loading possible outcomes…</p>'}</section>`;
  }
  function oddsHTML(odds) {
    return `<div class="fusion-odds"><div><small>BASELINE</small><strong>${e(odds?.baseline || "—")}</strong></div><div><small>SUCCESS CHANCE</small><strong>${chanceText(odds?.upgrade || 0)}</strong></div><div><small>SAME-TIER REROLL</small><strong>${chanceText(odds?.stay ?? 0)}</strong></div><div><small>DOWNGRADE</small><strong>${chanceText(odds?.downgrade || 0)}</strong></div></div>${odds ? `<p class="form-hint">Overall: ${[...odds.outcomes, ...odds.downgrades].map((o) => e(o.label) + " · " + e(o.rarity) + " " + chanceText(o.chance)).join(" · ")}</p>` : ""}`;
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
      return `<div class="page-intro"><div><h1>A New Kind of Possibility.</h1><p>Fuse your cards into a random replacement.</p></div></div>${h.empty("Your Fusion Board Is Waiting.", "Sign in to select cards from your collection.", btn("Sign in", "account"))}`;
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
        const p = fusionContribution(
          c,
          m?.level || 1,
          odds?.baseline || c.rarity,
        );
        const value =
          p.upgrade -
          (selected[odds?.anchor]?.slot === i ? odds.contribution : 0);
        contribution =
          chanceText(value) +
          " contribution" +
          (selected[odds?.anchor]?.slot === i ? " · baseline" : "");
      } catch {}
      return `<article class="fusion-slot tier-${rarityClass(c.rarity)}"><button class="fusion-slot-pick" data-action="fusion-pick" data-index="${i}" aria-label="Change material in slot ${i + 1}: ${e(c.name)}"><div class="fusion-portrait">${image(c)}${gradeBadge(c)}<span class="level-tag">Lv. ${m?.level || "?"}</span></div><strong>${e(c.name)}</strong><small>${e(contribution)}</small></button><button class="text-button" data-action="fusion-remove" data-index="${i}">Remove ×</button></article>`;
    }).join("");
    const label =
      lastResult?.outcome === "stay"
        ? "Same-Tier Reroll"
        : [...FUSION_RESULTS, ...FUSION_DOWNGRADES].find(
            (o) => o.outcome === lastResult?.outcome,
          )?.label;
    const result = lastResult
      ? `<section class="fusion-result" role="status"><span class="eyebrow">FUSION RESULT</span><h2>${e(label || "Fusion Complete")} · ${e(lastResult.grade || lastResult.cards[0]?.rarity || "")}</h2><p>${e(lastResult.message)}</p><div class="fusion-reward">${lastResult.cards[0] ? cardHTML(lastResult.cards[0], null, { copies: 1, level: 1, preview: true }) : ""}</div><button class="text-button" data-action="fusion-dismiss">Dismiss Result</button></section>`
      : "";
    return `<div class="page-intro"><div><h1>A New Kind of Possibility.</h1><p>Fuse up to five cards for a chance to upgrade.</p></div><a class="text-button" href="#collection">Back to My Collection ↗</a></div>${result}<section class="fusion-panel"><div class="section-head"><h2>Your Fusion Board</h2><button class="text-button" data-action="fusion-clear">Clear Board</button></div><p class="form-hint">Click a slot to select multiple materials. Nothing is consumed until you fuse.</p><div class="fusion-board">${slots}</div><p class="fusion-pool"><strong>Result Pool:</strong> ${poolLabel()}</p>${oddsHTML(odds)}<p class="form-hint">One invested copy sets the baseline. Extra copies add 35%–48% by baseline rarity; each tier below halves the contribution. Upgrade caps range from 55%–70%. Excess contribution shifts stay chance into downgrade risk.</p><p class="fusion-warning">All selected materials are consumed. Results are Lv. 1. On upgrade: +1 tier (90%), +2 (9%), +3 (1%). On downgrade: −1 tier (90%), −2 (9%), −3 (1%). Results stop at D and AG. At D, a downgrade returns D.</p>${error ? `<p class="form-error" role="alert">${e(error)}</p>` : ""}${btn("Review Fusion · " + board.length + " Card" + (board.length === 1 ? "" : "s"), "fusion-run", !odds || error || !odds.upgrade ? "disabled" : "", "mint")}</section>${renderOutcomes(odds)}<details class="rarity-guide"><summary>Fusion Chances</summary><p><table><thead><tr><th>Baseline</th><th>Per Extra Same-Tier Copy</th><th>Upgrade Cap</th></tr></thead><tbody>${FUSION_TIER_RULES.map((r) => `<tr><td>${r.rarity}</td><td>${chanceText(r.contribution)}</td><td>${chanceText(r.cap)}</td></tr>`).join("")}</tbody></table><p>Stay starts at 30%. Every 4 percentage points of contribution beyond the cap transfers 1 point from stay to downgrade, up to 20 points. Remaining probability is downgrade. Enhanced cards count as their invested copies; one copy is reserved for the baseline.</p></p><p>AG and Pending cards cannot be materials. Character-only materials return characters; seiyuu-only materials return seiyuus; mixed materials use both pools.</p></details>`;
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
    let selected = [],
      currentOdds = null,
      pickerError = "";
    try {
      selected = models();
      if (selected.length) currentOdds = fusionQuote(selected);
    } catch (error) {
      pickerError = error.message;
    }
    const summary = `<section class="fusion-picker-selection" aria-label="Selected Fusion Materials"><div class="section-head"><h3>${board.length} / 5 Cards Selected</h3><strong class="fusion-picker-chance" role="status">${chanceText(currentOdds?.upgrade || 0)} Success</strong></div>${currentOdds ? oddsHTML(currentOdds) : ""}<div class="fusion-picker-selected">${selected.map((m) => `<button type="button" class="fusion-picker-selected-card tier-${rarityClass(m.rarity)}" data-action="fusion-picker-remove" data-index="${m.slot}" aria-label="Remove ${e(m.name)} from Slot ${m.slot + 1}">${image(m)}<span>${e(m.name)}<small>Lv. ${m.level} · ${e(m.rarity)}</small></span><b aria-hidden="true">×</b></button>`).join("") || '<p class="form-hint">No materials selected.</p>'}</div>${pickerError ? `<p class="form-error" role="alert">${e(pickerError)}</p>` : ""}</section>`;
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

    return `<section class="fusion-picker-dialog" role="dialog" aria-modal="true" aria-labelledby="fusion-picker-title" tabindex="-1"><div class="section-head"><div><span class="eyebrow">FUSION MATERIALS</span><h2 id="fusion-picker-title">Choose Fusion Materials</h2></div><button class="text-button" data-action="fusion-picker-close" aria-label="Close material picker">Close ×</button></div><p class="form-hint">Choose an extra level-1 copy or your enhanced base card. ${board.some((m) => m.slot === pickerSlot) ? "Your first selection replaces this slot, then fills the remaining empty slots." : "Keep selecting cards to fill empty slots. Cards are consumed only when you press Fuse."}</p>${summary}<div class="section-head"><h2>Choose Your Materials</h2><span class="subtext">${n(inventory.length)} matching cards</span></div><div class="fusion-filters"><input class="search" id="fusion-search" aria-label="Search fusion materials" placeholder="Search names or anime…" value="${e(query)}"><label>Type<select id="fusion-kind"><option value="">All card types</option><option value="character" ${kind === "character" ? "selected" : ""}>Characters</option><option value="seiyuu" ${kind === "seiyuu" ? "selected" : ""}>Seiyuus</option></select></label><label>Rarity<select id="fusion-rarity"><option value="">All rarities</option>${["AG", "Ubers", "SSS", "SS", "S", "A", "B", "C", "D", "Pending"].map((r) => `<option value="${r}" ${grade === r ? "selected" : ""}>${r}</option>`).join("")}</select></label></div><div class="card-grid fusion-material-grid">${choices || h.empty("No Matching Cards.", "Collect cards or change your filters.")}</div><div class="toolbar space-top">${btn("Done · " + board.length + " Selected", "fusion-picker-close", "", "mint")}${btn("← Previous", "fusion-prev", page <= 1 ? "disabled" : "", "secondary")}<span class="subtext">Page ${page} of ${max}</span>${btn("Next →", "fusion-next", page >= max ? "disabled" : "", "secondary")}</div><p class="form-hint">Result pool follows your materials: characters only, seiyuus only, or both when mixed. Check upgrade, stay and downgrade chances before confirming. Extra material beyond the cap increases downgrade risk.</p></section>`;
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
    confirmation: (body) =>
      '<h2>Confirm Card Fusion</h2><p>Consume these materials permanently and receive one Lv. 1 result. Dismissing the result cannot undo a confirmed fusion.</p><ul class="fusion-confirm-materials">' +
      body.cards
        .map(
          (m) =>
            "<li><strong>" +
            e(cardBy(m.card).name) +
            "</strong><span>" +
            e(m.expectedRarity) +
            " · Lv. " +
            m.expectedLevel +
            "</span></li>",
        )
        .join("") +
      "</ul>" +
      oddsHTML(body.expectedOdds) +
      (body.targetCard
        ? "<p>Target: " + e(cardBy(body.targetCard).name) + "</p>"
        : "") +
      '<form id="fusion-confirm-form" class="stack"><input type="hidden" name="reviewed" value="' +
      e(JSON.stringify(body)) +
      '"><div class="form-error" role="alert"></div><button type="submit" class="button mint">Confirm & Consume ' +
      body.cards.length +
      " Card" +
      (body.cards.length === 1 ? "" : "s") +
      '</button><button type="button" class="button secondary" data-close-dialog>Cancel</button></form>',
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
