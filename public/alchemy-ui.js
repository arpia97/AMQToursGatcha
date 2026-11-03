import { ALCHEMY_TIERS, refinementQuote } from "./alchemy-rules.js";
import { rarityClass, cardComparator } from "./card-display.js";
export function createAlchemyUI(h) {
  const {
    escape: e,
    number: n,
    getState,
    cardBy,
    image,
    gradeBadge,
    cardHTML,
    btn,
  } = h;
  let data = null,
    selected = null,
    picker = null,
    query = "",
    kind = "",
    grade = "",
    page = 1,
    targetTier = "D",
    targetData = null,
    lastResult = null;
  const cards = new Map();
  const remember = (list) => {
    for (const c of list || []) cards.set(c.id, c);
  };
  const card = (id) => cards.get(id) || cardBy(id);
  function update(value) {
    data = value;
    remember(value.cards);
  }
  async function load(api) {
    if (!getState().me) return null;
    const value = await api("alchemy");
    update(value.alchemyState);
    if (picker === "target") await loadTargets(api);
    return { cards: [...cards.values()] };
  }
  async function loadTargets(api) {
    const snapshot = JSON.stringify([targetTier, kind, query, page]);
    const p = new URLSearchParams({
      rarity: targetTier,
      kind: kind || "mixed",
      q: query,
      page,
    });
    const value = await api("alchemy-targets?" + p);
    if (
      snapshot !== JSON.stringify([targetTier, kind, query, page]) ||
      picker !== "target"
    )
      return null;
    targetData = value;
    page = value.page;
    remember(value.cards);
    return value;
  }
  function material() {
    if (!selected) throw Error("Choose one card to refine.");
    const item = getState().inventory.find((i) => i.card === selected.card),
      c = card(selected.card);
    if (!item || !c)
      throw Error("This material is no longer owned. Choose another card.");
    if (item.protected) throw Error("This card is protected.");
    if (selected.variant === "extra" && item.copies < 2)
      throw Error("There is no extra copy available.");
    const level = selected.variant === "extra" ? 1 : item.level;
    return {
      ...c,
      level,
      variant: selected.variant,
      ...refinementQuote(c.rarity, level, data?.refinements || 0),
    };
  }
  function add(entry) {
    const previous = selected;
    selected = { card: entry.card, variant: entry.variant };
    try {
      material();
    } catch (error) {
      selected = previous;
      throw error;
    }
  }
  function request() {
    const m = material();
    if (!data) throw Error("Wait for alchemy progress to load.");
    return {
      action: "alchemy-feed",
      card: m.id,
      variant: m.variant,
      expectedRarity: m.rarity,
      expectedLevel: m.level,
      expectedVersion: data.version,
    };
  }
  function drawRequest(rarity) {
    if (!data) throw Error("Wait for alchemy progress to load.");
    const t = ALCHEMY_TIERS.find((t) => t.rarity === rarity);
    if (!t || data.xp < t.cost)
      throw Error("Not enough alchemy XP for this tier.");
    return {
      action: "alchemy-draw",
      rarity,
      targetCard: data.targets[rarity] || null,
      expectedVersion: data.version,
    };
  }
  function targetRequest(id = null, rarity = targetTier) {
    return { rarity, card: id, expectedVersion: data.version };
  }
  function confirmation(body) {
    let details = "",
      label = "";
    if (body.action === "alchemy-feed") {
      const m = material();
      details =
        '<div class="alchemy-review-material">' +
        image(m) +
        "<div><strong>" +
        e(m.name) +
        "</strong><p>" +
        e(m.rarity) +
        " · Lv. " +
        m.level +
        " · " +
        n(m.investment) +
        " Invested Copies</p></div></div><p>This consumes one selected card. " +
        (m.lucky ? "A lucky energy engulfs the room. " : "") +
        '</p><div class="alchemy-chances">' +
        m.outcomes
          .map(
            (o) =>
              "<div><strong>" +
              o.chance +
              "%</strong><span>" +
              o.label +
              "</span><b>+" +
              n(o.xp) +
              " XP</b></div>",
          )
          .join("") +
        "</div>";
      label = "Refine & Consume Card";
    } else {
      const tier = ALCHEMY_TIERS.find((t) => t.rarity === body.rarity),
        target = body.targetCard ? card(body.targetCard) : null;
      details =
        "<p>Spend <strong>" +
        n(tier.cost) +
        " XP</strong> for one Lv. 1 " +
        e(tier.rarity) +
        " card.</p>" +
        (target
          ? '<div class="alchemy-review-material">' +
            image(target) +
            "<div><strong>" +
            e(target.name) +
            "</strong><p>50% Target Chance · Remaining Cards Share the Other 50%</p></div></div>"
          : "<p>No target selected. Draw a random card from both catalogues at this rarity.</p>") +
        "<p>Unused XP stays in your pool.</p>";
      label = "Spend " + n(tier.cost) + " XP & Draw";
    }
    return (
      '<form id="alchemy-confirm-form" class="fusion-review-form"><h2 id="fusion-review-title">' +
      (body.action === "alchemy-feed"
        ? "Confirm Refinement"
        : "Confirm Alchemy Draw") +
      '</h2><div class="fusion-review-details">' +
      details +
      '</div><input type="hidden" name="reviewed" value="' +
      e(JSON.stringify(body)) +
      '"><div class="form-error" role="alert"></div><div class="fusion-review-actions"><button type="submit" class="button mint">' +
      label +
      '</button><button type="button" class="button secondary" data-action="alchemy-close">Cancel</button></div></form>'
    );
  }
  function refinementResult() {
    if (!lastResult?.material) return "";
    const r = lastResult;
    return (
      '<section class="fusion-review-form alchemy-refinement-result alchemy-' +
      e(r.outcome) +
      '"><h2 id="fusion-review-title">' +
      e(r.label) +
      '</h2><div class="fusion-review-details" role="status"><div class="alchemy-review-material">' +
      image({ ...card(r.material.id), ...r.material }) +
      "<div><strong>" +
      e(r.material.name) +
      "</strong><p>" +
      e(r.material.rarity) +
      " · Lv. " +
      r.material.level +
      " · " +
      r.multiplier +
      "× XP" +
      (r.lucky ? " · Lucky Refinement" : "") +
      '</p></div></div><p class="alchemy-xp">+' +
      n(r.xpGained) +
      " XP</p><p>Your Pool: <strong>" +
      n(data.xp) +
      ' XP</strong></p></div><div class="fusion-review-actions"><button type="button" class="button mint" data-action="alchemy-close">Done</button></div></section>'
    );
  }
  function resultHTML() {
    const drawn = lastResult?.cards?.[0];
    if (!drawn) return "";
    return (
      '<section class="alchemy-result" role="status"><div class="section-head"><div><span class="eyebrow">ALCHEMY DRAW</span><h2>' +
      e(drawn.name) +
      "</h2></div>" +
      btn("Dismiss", "alchemy-dismiss", "", "secondary") +
      "</div><p>" +
      e(lastResult.rarity) +
      " · " +
      n(lastResult.xpSpent) +
      " XP" +
      (lastResult.targetHit ? " · Target Card!" : "") +
      '</p><div class="alchemy-drawn-card">' +
      cardHTML(drawn, null, { copies: 1, level: 1, preview: true }) +
      "</div></section>"
    );
  }
  function render() {
    if (!getState().me)
      return (
        '<div class="page-intro"><div><h1>Card Alchemy</h1><p>Refine your cards. Build XP. Draw your favourites.</p></div></div>' +
        h.empty(
          "Your Alchemy Pool Is Waiting.",
          "Sign in to refine cards and save targets.",
          btn("Sign In", "account"),
        )
      );
    if (!data) return '<div class="loading">Preparing Your Alchemy Pool…</div>';
    let m = null,
      error = "";
    try {
      if (selected) m = material();
    } catch (err) {
      error = err.message;
    }
    const quote = m || refinementQuote("D", 1, data.refinements);
    const feed =
      '<section class="alchemy-refinery ' +
      (data.nextLucky ? "is-lucky" : "") +
      '"><div class="section-head"><div><span class="eyebrow">REFINEMENT ' +
      n(data.nextRefinement) +
      "</span><h2>" +
      (data.nextLucky ? "Lucky Refinement" : "Refine One Card") +
      '</h2></div><strong class="alchemy-xp">' +
      n(data.xp) +
      " XP</strong></div>" +
      (data.nextLucky
        ? '<p class="alchemy-lucky-message">✦ A lucky energy engulfs the room.</p>'
        : '<p class="form-hint">' +
          (5 - (data.refinements % 6)) +
          " normal refinement" +
          (data.refinements % 6 === 4 ? "" : "s") +
          " before the next lucky surge.</p>") +
      '<div class="alchemy-feed-row"><button type="button" class="alchemy-material-slot ' +
      (m ? "tier-" + rarityClass(m.rarity) : "empty-slot") +
      '" data-action="alchemy-material-open">' +
      (m
        ? image(m) +
          "<strong>" +
          e(m.name) +
          "</strong><span>" +
          e(m.rarity) +
          " · Lv. " +
          m.level +
          "</span>"
        : "<span>＋</span><strong>Choose One Card</strong>") +
      '</button><div class="alchemy-feed-details"><div class="alchemy-chances">' +
      quote.outcomes
        .map(
          (o) =>
            "<div><strong>" +
            o.chance +
            "%</strong><span>" +
            o.label +
            "</span><b>" +
            (m ? "+" + n(o.xp) + " XP" : o.multiplier + "× XP") +
            "</b></div>",
        )
        .join("") +
      '</div><p class="form-hint">' +
      (m
        ? "Base: " +
          n(m.baseXP) +
          " XP · " +
          n(m.investment) +
          " invested cop" +
          (m.investment === 1 ? "y" : "ies") +
          ". Enhanced cards count all invested copies."
        : "Every sixth refinement boosts Great Success and Erig chances fivefold.") +
      "</p>" +
      btn(
        "Review Refinement →",
        "alchemy-refine",
        !m || error ? "disabled" : "",
        "mint",
      ) +
      (m
        ? btn("Clear Selection", "alchemy-material-clear", "", "secondary")
        : "") +
      (error ? '<p class="form-error">' + e(error) + "</p>" : "") +
      "</div></div></section>";
    const tiers = ALCHEMY_TIERS.map((t) => {
      const targetId = data.targets[t.rarity],
        target = targetId ? card(targetId) : null,
        valid = target && target.rarity === t.rarity;
      return (
        '<article class="collect-card alchemy-tier tier-' +
        rarityClass(t.rarity) +
        '"><div class="section-head"><h3>' +
        t.rarity +
        "</h3><strong>" +
        n(t.cost) +
        ' XP</strong></div><div class="alchemy-target">' +
        (valid
          ? image(target) +
            "<div><strong>" +
            e(target.name) +
            "</strong><small>50% Target Chance</small></div>"
          : '<div class="alchemy-no-target">' +
            (targetId
              ? "Target Changed Rarity · Choose Again"
              : "Random Draw · No Target") +
            "</div>") +
        '</div><progress max="' +
        t.cost +
        '" value="' +
        Math.min(t.cost, data.xp) +
        '" aria-label="' +
        t.rarity +
        ' Draw Progress"></progress><small>' +
        n(Math.min(t.cost, data.xp)) +
        " / " +
        n(t.cost) +
        ' XP</small><div class="alchemy-tier-actions">' +
        btn(
          valid ? "Change Target" : "Choose Target",
          "alchemy-target-open",
          'data-rarity="' + t.rarity + '"',
          "secondary",
        ) +
        btn(
          "Draw Card",
          "alchemy-draw-review",
          'data-rarity="' +
            t.rarity +
            '" ' +
            (data.xp < t.cost || (targetId && !valid) ? "disabled" : ""),
          "mint",
        ) +
        "</div>" +
        (targetId
          ? btn(
              "Clear Target",
              "alchemy-target-clear",
              'data-rarity="' + t.rarity + '"',
              "text-button",
            )
          : "") +
        "</article>"
      );
    }).join("");
    return (
      '<div class="page-intro"><div><h1>Card Alchemy</h1><p>Refine your cards. Build XP. Draw your favourites.</p></div><a href="#collection" class="text-button">My Collection ↗</a></div>' +
      resultHTML() +
      feed +
      '<div class="section-head"><h2>Your Alchemy Targets</h2><span class="subtext">One Shared XP Pool · Unused XP Is Kept</span></div><div class="alchemy-tier-grid">' +
      tiers +
      '</div><details class="rarity-guide"><summary>Alchemy Rules</summary><h3>Refinement System</h3><ul><li><strong>Cost &amp; Material:</strong> Consumes one selected card per attempt to add XP (protected or locked cards cannot be used).</li><li><strong>Standard Rates:</strong> 90% Success (1× XP), 9% Great Success (2× XP), 1% Erig (5× XP).</li><li><strong>Bonus Rates (Every 6th Attempt):</strong> 50% Success (1× XP), 45% Great Success (2× XP), 5% Erig (5× XP).</li></ul><h3>Draw Mechanics</h3><ul><li><strong>Target Selected:</strong> The chosen character/seiyuu has a 50% chance to drop; all other cards of that rarity split the remaining 50%.</li><li><strong>No Target Selected:</strong> Draws are split equally among all cards of the selected rarity.</li><li><strong>Single-Card Tiers:</strong> If a tier has only 1 card, it is 100% guaranteed.</li><li><strong>Output:</strong> All drawn cards start at Level 1.</li></ul><div class="table-wrap"><table><thead><tr><th>Rarity</th><th>Lv. 1 XP</th><th>Draw Cost</th></tr></thead><tbody>' +
      ALCHEMY_TIERS.map(
        (t) =>
          "<tr><td>" +
          t.rarity +
          "</td><td>" +
          n(t.xp) +
          "</td><td>" +
          n(t.cost) +
          "</td></tr>",
      ).join("") +
      "</tbody></table></div></details>"
    );
  }
  function renderPicker() {
    if (!picker) return "";
    const targetMode = picker === "target";
    let items = targetMode
      ? targetData?.cards || []
      : getState()
          .inventory.map((i) => ({ ...i, c: card(i.card) }))
          .filter(
            (i) =>
              i.c &&
              (!kind || i.c.kind === kind) &&
              (!grade || i.c.rarity === grade) &&
              [i.c.name, i.c.series, i.c.series_romaji, i.c.series_english]
                .filter(Boolean)
                .join(" ")
                .toLowerCase()
                .includes(query.toLowerCase()),
          )
          .sort((a, b) => cardComparator("rarity")(a.c, b.c));
    const total = targetMode ? targetData?.total || 0 : items.length,
      max = Math.max(1, Math.ceil(total / (targetMode ? 12 : 24)));
    page = Math.min(page, max);
    if (!targetMode) items = items.slice((page - 1) * 24, page * 24);
    const choices = items
      .map((item) => {
        const c = targetMode ? item : item.c;
        if (targetMode)
          return (
            '<button type="button" class="alchemy-target-choice" data-action="alchemy-target-select" data-id="' +
            e(c.id) +
            '">' +
            cardHTML(c) +
            "<span>Select Target</span></button>"
          );
        const choice = (variant, level) => {
          let disabled =
            !!item.protected ||
            !ALCHEMY_TIERS.some((t) => t.rarity === c.rarity);
          return (
            '<button type="button" class="button secondary" data-action="alchemy-material-select" data-id="' +
            e(c.id) +
            '" data-variant="' +
            variant +
            '" ' +
            (disabled ? "disabled" : "") +
            ">" +
            (variant === "extra"
              ? "Use Extra · Lv. 1"
              : "Use Card · Lv. " + level) +
            "</button>"
          );
        };
        return (
          '<article class="alchemy-material-choice">' +
          cardHTML(c) +
          "<small>Lv. " +
          item.level +
          " · " +
          (item.copies - 1) +
          " Extra Copies" +
          (item.protected ? " · Protected" : "") +
          "</small>" +
          (item.copies > 1 ? choice("extra", 1) : "") +
          choice("card", item.level) +
          "</article>"
        );
      })
      .join("");
    return (
      '<section class="fusion-picker-dialog" role="dialog" aria-modal="true" aria-labelledby="fusion-picker-title" tabindex="-1"><div class="section-head"><h2 id="fusion-picker-title">' +
      (targetMode
        ? "Choose Your " + e(targetTier) + " Target"
        : "Choose One Refinement Card") +
      "</h2>" +
      btn("Close ×", "alchemy-close", "", "text-button") +
      '</div><div class="fusion-filters"><input class="search" id="fusion-search" aria-label="Search Alchemy Cards" placeholder="Search cards or anime…" value="' +
      e(query) +
      '"><label>Type<select id="fusion-kind"><option value="">Characters + Seiyuus</option><option value="character" ' +
      (kind === "character" ? "selected" : "") +
      '>Characters</option><option value="seiyuu" ' +
      (kind === "seiyuu" ? "selected" : "") +
      ">Seiyuus</option></select></label>" +
      (!targetMode
        ? '<label>Rarity<select id="fusion-rarity"><option value="">All Rarities</option>' +
          ALCHEMY_TIERS.map(
            (t) =>
              "<option " +
              (grade === t.rarity ? "selected" : "") +
              ">" +
              t.rarity +
              "</option>",
          ).join("") +
          "</select></label>"
        : "") +
      '</div><p class="form-hint">' +
      n(total) +
      " Matching Cards" +
      (targetMode
        ? " · A saved target receives 50% of this tier’s draw chance."
        : " · Nothing is consumed until you confirm a refinement.") +
      '</p><div class="card-grid ' +
      (targetMode ? "alchemy-target-grid" : "alchemy-material-grid") +
      '">' +
      (choices || '<p class="notice">No matching cards.</p>') +
      '</div><div class="toolbar space-top">' +
      btn(
        "← Previous",
        "alchemy-prev",
        page <= 1 ? "disabled" : "",
        "secondary",
      ) +
      "<span>Page " +
      page +
      " of " +
      max +
      "</span>" +
      btn(
        "Next →",
        "alchemy-next",
        page >= max ? "disabled" : "",
        "secondary",
      ) +
      "</div></section>"
    );
  }
  return {
    load,
    loadTargets,
    update,
    render,
    renderPicker,
    add,
    request,
    drawRequest,
    targetRequest,
    confirmation,
    refinementResult,
    complete: (r) => {
      update(r.alchemyState);
      remember(r.cards);
      lastResult = r;
      if (r.material) selected = null;
    },
    clear: () => (selected = null),
    dismiss: () => (lastResult = null),
    pickerOpen: () => !!picker,
    pickerMode: () => picker,
    openPicker: (mode = "material", rarity = null) => {
      picker = mode;
      targetTier = rarity || targetTier;
      query = "";
      kind = "";
      page = 1;
      targetData = null;
    },
    closePicker: () => (picker = null),
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
