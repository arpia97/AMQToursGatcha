import { searchMatcher, cardSearchText } from "./search.js";
import { cardFrameClass, cardAura } from "./card-frames.js";
import { levelLabel, ENHANCEMENT_REVISION } from "./card-values.js";
import {
  ALCHEMY_TIERS,
  refinementQuote,
  refinementQueue,
  autoRefinementPlan,
} from "./alchemy-rules.js";
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
    selected = [],
    picker = null,
    query = "",
    kind = "",
    wishlistOnly = false,
    hideProtected = false,
    grade = "",
    page = 1,
    targetTier = "D",
    targetData = null,
    lastResult = null,
    drawRevealed = false;
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
    const snapshot = JSON.stringify([
      getState().me?.id,
      targetTier,
      kind,
      query,
      page,
      wishlistOnly,
    ]);
    const p = new URLSearchParams({
      rarity: targetTier,
      kind: kind || "mixed",
      q: query,
      page,
      wishlist: wishlistOnly ? "1" : "0",
    });
    const value = await api("alchemy-targets?" + p);
    if (
      snapshot !==
        JSON.stringify([
          getState().me?.id,
          targetTier,
          kind,
          query,
          page,
          wishlistOnly,
        ]) ||
      picker !== "target"
    )
      return null;
    targetData = value;
    page = value.page;
    remember(value.cards);
    return value;
  }
  function materials(entries = selected) {
    return refinementQueue(
      entries,
      getState().inventory,
      card,
      data?.refinements || 0,
    );
  }
  function material() {
    if (!selected.length) throw Error("Choose cards to refine.");
    return materials()[0];
  }
  function add(entry) {
    const next = [...selected, { card: entry.card, variant: entry.variant }];
    materials(next);
    selected = next;
  }
  function move(index, direction) {
    const other = index + direction;
    if (
      !Number.isInteger(index) ||
      ![-1, 1].includes(direction) ||
      !selected[index] ||
      !selected[other]
    )
      return;
    const next = [...selected];
    [next[index], next[other]] = [next[other], next[index]];
    materials(next);
    selected = next;
  }
  function queueHTML(editable = true) {
    if (!selected.length)
      return '<p class="form-hint">Select cards to build your order. Every sixth refinement is lucky.</p>';
    let queue;
    try {
      queue = materials();
    } catch (error) {
      return (
        '<p class="form-error">' +
        e(error.message) +
        "</p>" +
        btn("Clear Selection", "alchemy-material-clear", "", "secondary")
      );
    }
    return (
      '<section class="alchemy-queue"><div class="section-head"><h3>Selected Cards · ' +
      selected.length +
      '/100</h3></div><ol class="alchemy-queue-list">' +
      queue
        .map(
          (m, index) =>
            '<li class="' +
            (m.lucky ? "is-lucky" : "") +
            '">' +
            image(m) +
            "<div><strong>" +
            (index + 1) +
            ". " +
            e(m.name) +
            "</strong><small>Refinement #" +
            m.next +
            " · " +
            e(m.rarity) +
            " · " +
            levelLabel(m.level) +
            (m.lucky ? " · ✦ LUCKY" : "") +
            "</small></div>" +
            (editable
              ? '<div class="alchemy-order-actions">' +
                btn(
                  "↑",
                  "alchemy-move",
                  'data-index="' +
                    index +
                    '" data-direction="-1" aria-label="Move ' +
                    e(m.name) +
                    ' earlier" ' +
                    (!index ? "disabled" : ""),
                  "secondary",
                ) +
                btn(
                  "↓",
                  "alchemy-move",
                  'data-index="' +
                    index +
                    '" data-direction="1" aria-label="Move ' +
                    e(m.name) +
                    ' later" ' +
                    (index === queue.length - 1 ? "disabled" : ""),
                  "secondary",
                ) +
                btn(
                  "×",
                  "alchemy-remove",
                  'data-index="' +
                    index +
                    '" aria-label="Remove ' +
                    e(m.name) +
                    ' from selection"',
                  "secondary",
                ) +
                "</div>"
              : "") +
            "</li>",
        )
        .join("") +
      "</ol></section>"
    );
  }
  function request() {
    const m = material();
    if (!data) throw Error("Wait for alchemy progress to load.");
    if (selected.length > 1)
      return {
        action: "alchemy-feed",
        enhancementRevision: ENHANCEMENT_REVISION,
        materials: materials().map((m) => ({
          card: m.id,
          variant: m.variant,
          expectedRarity: m.rarity,
          expectedLevel: m.level,
        })),
        expectedVersion: data.version,
      };
    return {
      action: "alchemy-feed",
      enhancementRevision: ENHANCEMENT_REVISION,
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
    if (body.action === "alchemy-feed" && body.materials) {
      details =
        queueHTML(false) +
        "<p>Consume all selected cards in the displayed order. Each card gets a separate roll. Normal: 90% Success, 9% Great Success, 1% Erig. Lucky: 50%, 45%, 5%.</p>";
      label = "Refine & Consume " + selected.length + " Cards";
    } else if (body.action === "alchemy-feed") {
      const m = material();
      details =
        '<div class="alchemy-review-material">' +
        image(m) +
        "<div><strong>" +
        e(m.name) +
        "</strong><p>" +
        e(m.rarity) +
        " · " +
        levelLabel(m.level) +
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
    if (lastResult?.refinements)
      return (
        '<section class="fusion-review-form alchemy-refinement-result"><h2 id="fusion-review-title">Refinement Results</h2><ol class="alchemy-queue-list">' +
        lastResult.refinements
          .map(
            (r, i) =>
              "<li>" +
              image({ ...card(r.material.id), ...r.material }) +
              "<div><strong>" +
              (i + 1) +
              ". " +
              e(r.material.name) +
              "</strong><small>" +
              e(r.label) +
              (r.lucky ? " · ✦ Lucky Refinement" : "") +
              " · +" +
              n(r.xpGained) +
              " XP</small></div></li>",
          )
          .join("") +
        '</ol><p class="alchemy-xp">+' +
        n(lastResult.xpGained) +
        " XP · Pool: " +
        n(data.xp) +
        ' XP</p><div class="fusion-review-actions">' +
        btn("Done", "alchemy-close", "", "mint") +
        "</div></section>"
      );
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
      " · " +
      levelLabel(r.material.level) +
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
  function drawResult() {
    const drawn = lastResult?.cards?.[0];
    if (!drawn) return "";
    const tier = rarityClass(lastResult.rarity || drawn.rarity);
    return (
      '<section class="fusion-review-form alchemy-draw-popup tier-' +
      tier +
      '"><h2 id="fusion-review-title">Alchemy Draw</h2><p>' +
      n(lastResult.xpSpent) +
      ' XP Spent · Your card is safely in your collection.</p><div class="alchemy-draw-stage ' +
      (drawRevealed ? "is-unsealed" : "") +
      '">' +
      (drawRevealed
        ? '<div class="alchemy-draw-revealed">' +
          cardHTML(drawn, null, { copies: 1, level: 1, preview: true }) +
          "</div>"
        : '<button type="button" class="alchemy-draw-seal" data-action="alchemy-draw-reveal" aria-label="Reveal Your Alchemy Card"><span class="alchemy-seal-symbol" aria-hidden="true">✦</span><strong>AMQ TOURS</strong><span>ALCHEMY</span><small>Click to Reveal</small></button>') +
      "</div>" +
      (drawRevealed && lastResult.targetHit
        ? '<p class="alchemy-target-hit" role="status">✦ Target Card!</p>'
        : "") +
      '<div class="fusion-review-actions"><button type="button" class="button mint" data-action="alchemy-close">Done</button></div></section>'
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
      if (selected.length) m = material();
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
      (data.nextLucky ? "Lucky Refinement" : "Refine Selected Cards") +
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
      queueHTML() +
      '<div class="alchemy-feed-row"><button type="button" class="alchemy-material-slot ' +
      (m
        ? "tier-" + rarityClass(m.rarity) + " " + cardFrameClass(m.level)
        : "empty-slot") +
      '" data-action="alchemy-material-open">' +
      (m
        ? cardAura(m.level) +
          image(m) +
          "<strong>" +
          e(m.name) +
          "</strong><span>" +
          e(m.rarity) +
          " · " +
          levelLabel(m.level) +
          "</span>"
        : "<span>＋</span><strong>Choose Cards</strong>") +
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
      btn("Auto Refine", "alchemy-auto", "", "secondary") +
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
  function renderPicker(resultsOnly = false) {
    if (!picker) return "";
    const targetMode = picker === "target",
      matches = searchMatcher(query);
    let items = targetMode
      ? targetData?.cards || []
      : getState()
          .inventory.map((i) => ({ ...i, c: card(i.card) }))
          .filter(
            (i) =>
              i.c &&
              (!hideProtected || !i.protected) &&
              (!kind || i.c.kind === kind) &&
              (!grade || i.c.rarity === grade) &&
              matches(cardSearchText(i.c)),
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
            cardHTML(c, null, { preview: true }) +
            "<span>Select Target</span></button>"
          );
        const choice = (variant, level) => {
          const queued = selected.filter((entry) => entry.card === c.id);
          let disabled =
            !!item.protected ||
            selected.length >= 100 ||
            (variant === "card"
              ? queued.some((entry) => entry.variant === "card")
              : queued.filter((entry) => entry.variant === "extra").length >=
                item.copies - 1) ||
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
              ? "Add Extra · Lv. 1"
              : "Add Card · " + levelLabel(level)) +
            "</button>"
          );
        };
        return (
          '<article class="alchemy-material-choice">' +
          cardHTML(c, null, { preview: true }) +
          "<small>" +
          levelLabel(item.level) +
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
    const results =
      '<p class="form-hint">' +
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
      "</div>";
    if (resultsOnly) return results;
    return (
      '<section class="fusion-picker-dialog" role="dialog" aria-modal="true" aria-labelledby="fusion-picker-title" tabindex="-1"><div class="section-head"><h2 id="fusion-picker-title">' +
      (targetMode
        ? "Choose Your " + e(targetTier) + " Target"
        : "Choose Refinement Cards") +
      "</h2>" +
      btn("Close ×", "alchemy-close", "", "text-button") +
      "</div>" +
      (!targetMode
        ? '<div id="alchemy-picker-queue">' +
          queueHTML() +
          "</div>" +
          btn("Done Selecting", "alchemy-close", "", "mint")
        : "") +
      '<div class="fusion-filters ' +
      (targetMode ? "alchemy-target-filters" : "") +
      '"><input class="search" id="fusion-search" aria-label="Search Alchemy Cards" placeholder="Search cards or anime…" value="' +
      e(query) +
      '">' +
      (targetMode ? '<div class="alchemy-type-filter">' : "") +
      '<label>Type<select id="fusion-kind"><option value="">Characters + Seiyuus</option><option value="character" ' +
      (kind === "character" ? "selected" : "") +
      '>Characters</option><option value="seiyuu" ' +
      (kind === "seiyuu" ? "selected" : "") +
      ">Seiyuus</option></select></label>" +
      (targetMode
        ? '<label class="alchemy-wishlist-filter"><input id="alchemy-wishlist" type="checkbox" ' +
          (wishlistOnly ? "checked" : "") +
          ">Wishlist</label></div>"
        : "") +
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
          '</select></label><label class="alchemy-wishlist-filter"><input id="alchemy-hide-protected" type="checkbox" ' +
          (hideProtected ? "checked" : "") +
          ">Hide Protected Cards</label>"
        : "") +
      '</div><div id="alchemy-picker-results">' +
      results +
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
    move,
    autoSelect: (count, maxRarity) => {
      selected = autoRefinementPlan(
        getState().inventory,
        card,
        count,
        maxRarity,
        data?.refinements || 0,
      );
    },
    autoForm: () =>
      '<section class="fusion-review-form"><h2 id="fusion-review-title">Auto Refine</h2><p>Uses unprotected cards only. Lowest rarities go first on normal attempts; the highest available rarity is saved for each lucky attempt. Review the ordered selection before confirming.</p><form id="alchemy-auto-form" class="stack"><label>Cards to Use<input type="number" name="count" min="1" max="100" value="10" required></label><label>Maximum Rarity<select name="maxRarity">' +
      ALCHEMY_TIERS.map(
        (t) =>
          "<option" +
          (t.rarity === "D" ? " selected" : "") +
          ">" +
          t.rarity +
          "</option>",
      ).join("") +
      '</select></label><div class="form-error" role="alert"></div><button type="submit" class="button mint">Review Auto Refinement →</button></form></section>',
    queueHTML,
    remove: (index) => {
      if (Number.isInteger(index) && index >= 0) selected.splice(index, 1);
    },
    request,
    drawRequest,
    targetRequest,
    confirmation,
    refinementResult,
    drawResult,
    revealDraw: () => {
      if (!lastResult?.cards?.length || drawRevealed) return false;
      drawRevealed = true;
      return true;
    },
    complete: (r) => {
      update(r.alchemyState);
      remember(r.cards);
      lastResult = r;
      drawRevealed = false;
      if (r.material || r.refinements) selected = [];
    },
    clear: () => (selected = []),
    dismiss: () => (lastResult = null),
    pickerOpen: () => !!picker,
    pickerMode: () => picker,
    openPicker: (mode = "material", rarity = null) => {
      picker = mode;
      targetTier = rarity || targetTier;
      query = "";
      kind = "";
      wishlistOnly = false;
      page = 1;
      targetData = null;
    },
    closePicker: () => (picker = null),
    filter: (field, value) => {
      if (field === "query") query = value;
      if (field === "kind") kind = value;
      if (field === "wishlist") wishlistOnly = value === true;
      if (field === "hideProtected") hideProtected = value === true;
      if (field === "grade") grade = value;
      page = 1;
    },
    next: () => page++,
    prev: () => (page = Math.max(1, page - 1)),
  };
}
