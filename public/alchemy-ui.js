import { routeHref } from "./site-navigation.js";
import { quantityInput } from "./quantity-input.js";
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
    inspectedKey = null,
    picker = null,
    query = "",
    kind = "",
    wishlistOnly = false,
    hideProtected = false,
    hideTradeables = false,
    grade = "",
    page = 1,
    targetTier = "D",
    targetData = null,
    lastResult = null,
    drawRevealed = false;
  const bopIcon = (className = "") =>
    '<img class="alchemy-bop-icon ' + className + '" src="community-cards/bop.webp" alt="" width="24" height="24">';
  const cards = new Map();
  let selectionId = 0;
  const keyed = (entry) => ({ ...entry, key: String(++selectionId) });
  const inspectedIndex = () => Math.max(0, selected.findIndex((entry) => entry.key === inspectedKey));
  const count = (id, variant) =>
    selected.filter((entry) => entry.card === id && entry.variant === variant)
      .length;
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
    const next = [
      ...selected,
      keyed({ card: entry.card, variant: entry.variant }),
    ];
    materials(next);
    selected = next;
  }
  function moveTo(index, position) {
    if (
      !Number.isInteger(index) ||
      !Number.isInteger(position) ||
      !selected[index] ||
      position < 0 ||
      position >= selected.length ||
      index === position
    )
      return false;
    const next = [...selected],
      [entry] = next.splice(index, 1);
    next.splice(position, 0, entry);
    materials(next);
    selected = next;
    return true;
  }
  function move(index, direction) {
    return [-1, 1].includes(direction) && moveTo(index, index + direction);
  }
  function toggle(entry, confirmed = false) {
    if (count(entry.card, entry.variant)) {
      selected = selected.filter(
        (i) => i.card !== entry.card || i.variant !== entry.variant,
      );
      return true;
    }
    const item = getState().inventory.find((i) => i.card === entry.card);
    if (entry.variant === "card" && item?.level > 1 && !confirmed) {
      materials([...selected, entry]);
      return false;
    }
    add(entry);
    return true;
  }
  function setExtras(id, quantity) {
    if (!Number.isInteger(quantity) || quantity < 0)
      throw Error("Choose a whole number of extra copies.");
    const current = count(id, "extra");
    let next = [...selected];
    if (quantity < current) {
      let remove = current - quantity;
      for (let i = next.length - 1; i >= 0 && remove; i--)
        if (next[i].card === id && next[i].variant === "extra") {
          next.splice(i, 1);
          remove--;
        }
    } else
      for (let i = current; i < quantity; i++)
        next.push(keyed({ card: id, variant: "extra" }));
    materials(next);
    selected = next;
  }
  function queueHTML(editable = true, showEmpty = false) {
    if (!selected.length && !showEmpty) return "";
    let queue;
    try { queue = materials(); }
    catch(error) { return '<p class="form-error">'+e(error.message)+'</p>'+btn("Clear Selection","alchemy-material-clear","","secondary"); }
    return '<section class="alchemy-queue"><div class="section-head"><h3>Selected Cards <span>· '+selected.length+'/100</span></h3>'+
      (editable ? btn("Choose Cards","alchemy-material-open","","text-button") : '') +
      '</div><ol class="alchemy-queue-list alchemy-sort-grid alchemy-compact-list" aria-label="Refinement Order">'+
      (queue.length ? queue.map((m,index)=>{
        const key=selected[index].key;
        return '<li class="alchemy-sort-card alchemy-compact-item '+(m.lucky?'is-lucky ':'')+(index===0?'is-next ':'')+(editable && index===inspectedIndex()?'is-inspected':'')+'" '+
          (editable ? 'data-alchemy-sort-card="'+key+'" draggable="true"' : '')+'><div class="alchemy-order-number">'+
          (editable ? '<button type="button" class="alchemy-drag-handle" draggable="true" data-alchemy-handle="'+key+'" aria-label="Move '+e(m.name)+'">⠿</button>' : '')+
          '<strong>#'+(index+1)+'</strong></div>'+
          (editable ? '<button type="button" class="alchemy-queue-inspect" data-action="alchemy-inspect" data-key="'+key+'" aria-pressed="'+(index===inspectedIndex())+'" aria-label="Inspect '+e(m.name)+'">' : '<div class="alchemy-queue-inspect">')+
          '<span class="alchemy-queue-thumb">'+image(m)+'</span><span class="alchemy-queue-info"><strong class="alchemy-queue-name" title="'+e(m.name)+'">'+e(m.name)+'</strong><small class="alchemy-queue-source">'+e(h.series ? h.series(m) : m.series || (m.kind==='seiyuu'?'Voice Actor':''))+'</small><span class="alchemy-queue-meta"><span class="grade-badge grade-'+rarityClass(m.rarity)+'">'+e(m.rarity)+'</span><span>'+ (m.variant==='extra'?'Extra Copy':levelLabel(m.level))+'</span>'+
          (m.lucky?'<span class="alchemy-lucky-label">✦ Lucky</span>':'')+'<b>'+n(m.baseXP)+' Base XP</b></span><small class="alchemy-refinement-number">Refinement #'+m.next+'</small></span>'+(editable ? '</button>' : '</div>')+
          (editable ? btn('×','alchemy-remove','data-index="'+index+'" aria-label="Remove '+e(m.name)+'"','text-button alchemy-queue-remove') : '')+'</li>';
      }).join('') : '<li class="alchemy-queue-empty">Choose cards to build your refinement order.</li>')+
      '</ol><div class="alchemy-queue-footer"><span>Drag or use arrow keys to reorder</span><span>✦ Lucky Every Sixth</span></div></section>';
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
  function drawRequest(rarity, currency = "xp", review = false) {
    if (!data) throw Error("Wait for alchemy progress to load.");
    const t = ALCHEMY_TIERS.find((t) => t.rarity === rarity);
    const guaranteed = currency === "bop";
    if (!t) throw Error("Choose a valid alchemy tier.");
    const target = card(data.targets[rarity]);
    const warnMissing = review && !data.targets[rarity];
    if (!warnMissing && guaranteed && (!target || target.rarity !== rarity))
      throw Error("Choose a valid target before spending bop XP.");
    if (!warnMissing && (guaranteed ? data.bopXP || 0 : data.xp) < t.cost)
      throw Error(guaranteed ? "Not enough bop XP for this target." : "Not enough alchemy XP for this tier.");
    return {
      action: "alchemy-draw",
      ...(guaranteed ? { currency: "bop" } : {}),
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
      const guaranteed = body.currency === "bop";
      if (guaranteed && !target) return (
        '<section class="fusion-review-form"><h2 id="fusion-review-title">No Target Selected</h2>' +
        '<div class="notice warm" role="alert">Choose a target first. bop cannot draw a random card, and no XP will be spent.</div>' +
        '<div class="fusion-review-actions">' + btn("Choose Target", "alchemy-target-open", 'data-rarity="' + e(body.rarity) + '"', "mint") +
        '<button type="button" class="button secondary" data-action="alchemy-close">nope</button></div></section>'
      );
      details =
        "<p>Spend <strong>" + (guaranteed ? bopIcon() : "") +
        n(tier.cost) + (guaranteed ? " bop XP" : " XP") +
        "</strong> for one Lv. 1 " + e(tier.rarity) + " card.</p>" +
        (target
          ? '<div class="alchemy-review-material">' + image(target) +
            "<div><strong>" + e(target.name) + "</strong><p>" +
            (guaranteed ? "100% Guaranteed Target" : "50% Target Chance · Remaining Cards Share the Other 50%") +
            "</p></div></div>"
          : '<div class="notice warm" role="alert"><strong>No Target Selected</strong><p>This draw will be random and will not earn bop XP.</p></div>') +
        (guaranteed ? "<p>Your normal XP stays unchanged.</p>"
          : "<p>Unused XP stays in your pool.</p>" +
            (target ? "<p>A missed target returns 10% of this cost as bop XP.</p>" : ""));
      label = guaranteed ? "bop" : "Spend " + n(tier.cost) + (target ? " XP & Draw" : " XP & Draw Randomly");
    }
    return (
      '<form id="alchemy-confirm-form" class="fusion-review-form"><h2 id="fusion-review-title">' +
      (body.action === "alchemy-feed"
        ? "Confirm Refinement"
        : body.currency === "bop" ? "Do you really want to bop this card?" : "Confirm Alchemy Draw") +
      '</h2><div class="fusion-review-details">' +
      details +
      '</div><input type="hidden" name="reviewed" value="' +
      e(JSON.stringify(body)) +
      '"><div class="form-error" role="alert"></div><div class="fusion-review-actions"><button type="submit" class="button mint" ' +
      (body.action === "alchemy-draw" && body.currency !== "bop" && data.xp < ALCHEMY_TIERS.find(t => t.rarity === body.rarity).cost ? "disabled" : "") + ">" +
      label +
      '</button><button type="button" class="button secondary" data-action="alchemy-close">' + (body.currency === "bop" ? "nope" : "Cancel") + '</button></div></form>'
    );
  }
  function refinementResult() {
    if (lastResult?.refinements)
      return (
        '<section class="fusion-review-form alchemy-refinement-result alchemy-batch-result"><h2 id="fusion-review-title">Refinement Results</h2><ol class="alchemy-result-list" aria-label="Refinement Results">' +
        lastResult.refinements
          .map(
            (r, i) =>
              '<li class="alchemy-result-row alchemy-result-' +
              e(r.outcome) +
              '"><div class="alchemy-result-portrait">' +
              image({ ...card(r.material.id), ...r.material }) +
              '</div><div class="alchemy-result-copy"><strong>' +
              (i + 1) +
              ". " +
              e(r.material.name) +
              "</strong><small>" +
              e(r.label) +
              (r.lucky ? " · ✦ Lucky Refinement" : "") +
              '</small></div><strong class="alchemy-result-xp">+' +
              n(r.xpGained) +
              " XP</strong></li>",
          )
          .join("") +
        '</ol><p class="alchemy-result-total"><strong>+' +
        n(lastResult.xpGained) +
        " XP</strong><span>Pool: " +
        n(data.xp) +
        ' XP</span></p><div class="fusion-review-actions">' +
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
      '"><h2 id="fusion-review-title">' + (lastResult.currency === "bop" ? "bop Draw" : "Alchemy Draw") + '</h2><p>' +
      (lastResult.currency === "bop" ? bopIcon() + n(lastResult.bopXPSpent) + " bop XP" : n(lastResult.xpSpent) + " XP") +
      ' Spent · Your card is safely in your collection.</p><div class="alchemy-draw-stage ' +
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
      (drawRevealed && lastResult.bopXPGained
        ? '<p class="alchemy-bop-rebate" role="status">' + bopIcon() + "+" + n(lastResult.bopXPGained) + " bop XP · Target Miss</p>" : "") +
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
      if (selected.length) m = materials()[inspectedIndex()];
    } catch (err) {
      error = err.message;
    }
    const quote = m || refinementQuote("D", 1, data.refinements);
    const feed = '<section class="alchemy-refinery alchemy-compact-refinery '+(data.nextLucky?'is-lucky':'')+'">'+
      '<div class="section-head"><div><span class="eyebrow">REFINEMENT '+n(data.nextRefinement)+'</span><h2>'+(data.nextLucky?'Lucky Refinement':'Refine Selected Cards')+'</h2></div><div class="alchemy-balances"><strong class="alchemy-xp">'+n(data.xp)+' XP</strong><div class="alchemy-bop-balance" title="Earn 10% of a normal draw’s XP cost when it misses your selected target.">'+bopIcon()+'<div><strong>'+n(data.bopXP||0)+'</strong><span>bop XP</span></div></div></div></div>'+
      '<div class="alchemy-workspace"><div class="alchemy-queue-pane">'+queueHTML(true,true)+'</div><aside class="alchemy-refine-summary"><div class="section-head"><h3>Selected Card</h3><span class="alchemy-next-tag">'+(m?'#'+(inspectedIndex()+1)+' · ':'')+(quote.lucky?'✦ Lucky':'Standard')+'</span></div>'+
      '<button type="button" class="alchemy-next-material" data-action="alchemy-material-open">'+(m?'<span class="alchemy-next-thumb">'+image(m)+'</span><span><strong>'+e(m.name)+'</strong><small>'+e(m.rarity)+' · '+levelLabel(m.level)+'</small></span>':'<span>＋ Choose Cards</span>')+'</button>'+
      '<div class="alchemy-compact-odds">'+quote.outcomes.map(o=>'<div class="alchemy-odds-row"><span>'+o.label+' <small>'+o.chance+'%</small></span><strong>'+(m?'+'+n(o.xp)+' XP':o.multiplier+'× XP')+'</strong><div class="alchemy-odds-track"><i style="width:'+o.chance+'%"></i></div></div>').join('')+'</div><p class="form-hint">'+
      (m?'Base: '+n(m.baseXP)+' XP · '+n(m.investment)+' invested cop'+(m.investment===1?'y':'ies')+'. Enhanced cards count all invested copies.':'Every sixth refinement boosts Great Success and Erig chances fivefold.')+'</p>'+
      (quote.lucky?'<p class="alchemy-lucky-message">✦ A lucky energy engulfs the room.</p>':'<p class="alchemy-lucky-message">'+(5-(data.refinements%6))+' normal refinement'+(data.refinements%6===4?'':'s')+' before the next lucky surge.</p>')+
      '<div class="alchemy-refine-actions">'+btn('Review Refinement →','alchemy-refine',!m||error?'disabled':'','mint')+btn('Auto Refine','alchemy-auto','','secondary')+(m?btn('Clear Selection','alchemy-material-clear','','text-button'):'')+(error?'<p class="form-error">'+e(error)+'</p>':'')+'</div></aside></div></section>';
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
            (targetId && (data.xp < t.cost || !valid) ? "disabled" : ""),
          "mint",
        ) +
        '<button type="button" class="alchemy-bop-button" data-action="alchemy-draw-review" data-currency="bop" data-rarity="' + t.rarity +
        '" title="' + e(valid ? "Get " + target.name + " guaranteed for " + n(t.cost) + " bop XP" : "Choose a target to use bop XP") +
        '" aria-label="' + e(t.rarity + " guaranteed target · " + n(t.cost) + " bop XP") + '" ' +
        (targetId && (!valid || (data.bopXP || 0) < t.cost) ? "disabled" : "") + ">" + bopIcon() + "<span>bop</span></button></div>" +
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
      '<div class="page-intro"><div><h1>Card Alchemy</h1><p>Refine your cards. Build XP. Draw your favourites.</p></div><a href="' + routeHref("collection") + '" class="text-button">My Collection ↗</a></div>' +
      feed +
      '<div class="section-head"><h2>Your Alchemy Targets</h2><span class="subtext">One Shared XP Pool · Unused XP Is Kept</span></div><div class="alchemy-tier-grid">' +
      tiers +
      '</div><details class="rarity-guide"><summary>Alchemy Rules</summary><h3>Refinement System</h3><ul><li><strong>Cost &amp; Material:</strong> Consumes one selected card per attempt to add XP (protected or locked cards cannot be used).</li><li><strong>Standard Rates:</strong> 90% Success (1× XP), 9% Great Success (2× XP), 1% Erig (5× XP).</li><li><strong>Bonus Rates (Every 6th Attempt):</strong> 50% Success (1× XP), 45% Great Success (2× XP), 5% Erig (5× XP).</li></ul><h3>Draw Mechanics</h3><ul><li><strong>Target Selected:</strong> The chosen character/seiyuu has a 50% chance to drop; all other cards of that rarity split the remaining 50%.</li><li><strong>No Target Selected:</strong> Draws are split equally among all cards of the selected rarity.</li><li><strong>Single-Card Tiers:</strong> If a tier has only 1 card, it is 100% guaranteed.</li><li><strong>Output:</strong> All drawn cards start at Level 1.</li></ul><h3>bop XP</h3><ul><li>A normal XP draw that misses your selected target returns 10% of its XP cost as bop XP.</li><li>Spend bop XP equal to a tier’s normal draw cost to receive its selected target at 100%.</li><li>Untargeted draws and bop draws do not earn bop XP.</li></ul><div class="table-wrap"><table><thead><tr><th>Rarity</th><th>Lv. 1 XP</th><th>Draw Cost</th></tr></thead><tbody>' +
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
              (!hideTradeables || !i.for_trade) &&
              (!kind || i.c.kind === kind) &&
              (!grade || i.c.rarity === grade) &&
              matches(cardSearchText(i.c)),
          )
          .sort((a, b) => cardComparator("rarity")(a.c, b.c))
          .flatMap((i) => [
            ...(i.copies > 1
              ? [{ ...i, variant: "extra", displayLevel: 1 }]
              : []),
            { ...i, variant: "card", displayLevel: i.level },
          ]);
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
        const queued = count(c.id, item.variant),
          disabled =
            !!item.protected ||
            (!queued && selected.length >= 100) ||
            !ALCHEMY_TIERS.some((t) => t.rarity === c.rarity);
        return (
          '<article class="alchemy-material-choice ' +
          (queued ? "is-selected" : "") +
          '"><button type="button" class="alchemy-material-toggle" data-action="alchemy-material-select" data-id="' +
          e(c.id) +
          '" data-variant="' +
          item.variant +
          '" aria-pressed="' +
          !!queued +
          '" ' +
          (disabled ? "disabled" : "") +
          ' aria-label="' +
          (queued ? "Deselect " : "Select ") +
          e(c.name) +
          " " +
          (item.variant === "extra" ? "Extra Copy" : levelLabel(item.level)) +
          '">' +
          cardHTML(c, null, { preview: true, level: item.displayLevel }) +
          '<span class="alchemy-selection-mark">' +
          (queued ? "✓ Selected" : "Select Card") +
          "</span></button><small>" +
          (item.variant === "extra"
            ? "Extra Copies · Lv. 1"
            : levelLabel(item.level) + " · Base Card") +
          (item.protected ? " · Protected" : "") +
          "</small>" +
          (item.variant === "extra" && queued
            ? '<label class="alchemy-copy-count">Copies<input type="number" min="0" max="' +
              Math.min(item.copies - 1, 100 - selected.length + queued) +
              '" value="' +
              queued +
              '" data-alchemy-extras="' +
              e(c.id) +
              '" aria-label="Extra Copies of ' +
              e(c.name) +
              '"></label>'
            : "") +
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
          ">Hide Protected Cards</label>" +
          '<label class="alchemy-wishlist-filter" title="Hide cards marked for trade"><input id="alchemy-hide-tradeables" type="checkbox" ' +
          (hideTradeables ? "checked" : "") + ">Hide Tradeables</label>"
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
    toggle,
    setExtras,
    inspect: (key) => {
      if (!selected.some((entry) => entry.key === key)) return false;
      inspectedKey = key;
      return true;
    },
    orderKeys: () => selected.map((i) => i.key),
    moveKey: (key, to) =>
      moveTo(
        selected.findIndex((i) => i.key === key),
        to,
      ),
    dropKey: (key, target, after) => {
      const ids = selected.filter((i) => i.key !== key).map((i) => i.key),
        index = ids.indexOf(target);
      return (
        index >= 0 &&
        moveTo(
          selected.findIndex((i) => i.key === key),
          index + (after ? 1 : 0),
        )
      );
    },
    autoSelect: (count, maxRarity) => {
      selected = autoRefinementPlan(
        getState().inventory,
        card,
        count,
        maxRarity,
        data?.refinements || 0,
      ).map(keyed);
    },
    autoForm: () =>
      '<section class="fusion-review-form"><h2 id="fusion-review-title">Auto Refine</h2><p>Uses unprotected cards only. Lowest rarities go first on normal attempts; the highest available rarity is saved for each lucky attempt. Review the ordered selection before confirming.</p><form id="alchemy-auto-form" class="stack">' +
      quantityInput({
        id: "alchemy-auto-quantity",
        name: "count",
        label: "Cards to Use",
        min: 1,
        max: 100,
        value: 10,
      }) +
      '<label>Maximum Rarity<select name="maxRarity">' +
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
      if (field === "hideTradeables") hideTradeables = value === true;
      if (field === "grade") grade = value;
      page = 1;
    },
    next: () => page++,
    prev: () => (page = Math.max(1, page - 1)),
  };
}
