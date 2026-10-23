export function createFeatures(h, ui) {
  const {
    escape: e,
    number: n,
    btn,
    cardHTML,
    cardBy,
    image,
    gradeBadge,
    rarity,
    series,
    empty,
    remaining,
    profileURL,
    getState,
  } = h;
  const pager = (prefix, page, more) =>
    `<div class="toolbar space-top">${btn("← Previous", prefix + "-prev", page <= 1 ? "disabled" : "", "secondary")}<span class="subtext">Page ${page}</span>${btn("Next →", prefix + "-next", more ? "" : "disabled", "secondary")}</div>`;
  const readCard = (id, level = 1) => {
    const c = cardBy(id);
    return `<article class="collect-card rarity-${rarity(level)}"><div class="portrait">${image(c)}${gradeBadge(c)}<span class="level-tag">LV. ${level}</span></div><div class="card-body"><div class="card-name">${e(c.name)}</div><div class="card-series">${e(series(c))}</div></div></article>`;
  };
  function profileExtras(p, own) {
    const favorites = p.showcase || [],
      completion = p.completion || {};
    return `<section class="profile-featured"><div class="section-head"><div><span class="eyebrow">THE PRIZED COLLECTION</span><h2>${own ? "Your favourites, front and centre." : "Collector’s favourites"}</h2></div>${own ? '<a class="text-button" href="#collection">Choose showcase cards ↗</a>' : ""}</div>${favorites.length ? `<div class="showcase-grid">${favorites.map((c) => readCard(c.card, c.level)).join("")}</div>` : empty(own ? "The spotlight is yours." : "No favourites showcased yet.", own ? "Choose up to six favourites from your collection to display here." : "This collector has not selected showcase cards.")}</section><section class="completion-panel"><div class="section-head"><h2>Collection completion</h2><span class="subtext">Unique cards · includes cards currently listed for sale</span></div><div class="two-col">${[
      "character",
      "seiyuu",
    ]
      .map((kind) => {
        const c = completion[kind] || { owned: 0, total: 0, percent: 0 };
        return `<div><div class="completion-label"><strong>${kind === "character" ? "Characters" : "Seiyuus"}</strong><span>${n(c.owned)} / ${n(c.total)} · ${Number(c.percent).toFixed(2)}%</span></div><progress aria-label="${kind} collection completion" value="${c.owned}" max="${Math.max(1, c.total)}"></progress></div>`;
      })
      .join(
        "",
      )}</div><p class="form-hint">The total grows as the catalogue import continues. Duplicates count once.</p></section>`;
  }
  function filters() {
    return `<div class="catalog-refinements"><label>Rarity<select id="filter-rarity"><option value="">All rarities</option>${["AG", "Ubers", "SSS", "SS", "S", "A", "B", "C", "D", "Pending"].map((r) => `<option value="${r}" ${ui.filters.rarity === r ? "selected" : ""}>${r}</option>`).join("")}</select></label>${ui.tab() === "character" ? `<label>Character role<select id="filter-role"><option value="">All roles</option><option value="main" ${ui.filters.role === "main" ? "selected" : ""}>Main</option><option value="supporting" ${ui.filters.role === "supporting" ? "selected" : ""}>Supporting</option></select></label>` : ""}<button class="text-button" data-action="clear-filters">Clear filters</button></div>`;
  }
  function shop() {
    const s = getState(),
      kind = ui.tab(),
      weekly = (s.shop || []).filter((x) => x.kind === kind),
      market = ui.marketData || { items: [] };
    const shopCard = (l, weekly = false) => {
      const c = cardBy(l.card),
        mine = l.seller === s.me?.id;
      return `<article class="collect-card rarity-${rarity(l.level || 1)}"><div class="portrait">${image(c)}${gradeBadge(c)}${l.level > 1 ? `<span class="level-tag">LV. ${l.level}</span>` : ""}</div><div class="card-body"><div class="card-name">${e(c.name)}</div><div class="card-series">${e(series(c))}</div><p class="form-hint">${weekly ? `Weekly selection · ${l.buyer ? "sold out" : "1 in stock"}` : `By <a href="${profileURL(l.seller)}">${e(l.seller_name)}</a> · Lv. ${l.level}`}</p><div class="card-price"><span class="coin">✦</span> ${n(l.price)}</div>${weekly ? btn(l.buyer ? "Sold out" : "Buy card →", "shop-buy", `data-id="${l.id}" ${l.buyer ? "disabled" : ""}`, "secondary") : mine ? btn("Withdraw listing", "cancel-listing", `data-id="${l.id}" data-venue="shop"`, "secondary") : btn("Buy from collector →", "buy-listing", `data-id="${l.id}"`, "secondary")}</div></article>`;
    };
    return `<div class="page-intro"><div><h1>A new week. New favourites.</h1><p>Handpicked by chance. Add a known card to your collection.</p></div><span class="pill">PROVISIONAL SHOP</span></div>${h.tabs()}<div class="section-head"><h2>This week’s shop</h2><span class="subtext">${weekly.length ? remaining(weekly[0].ends) : "Refreshes Monday, 09:00 KST"}</span></div><div class="notice">Five characters and five seiyuus each week. Each card has one shared copy available at a fixed price. Prices are provisional and locked for the week.</div>${weekly.length ? `<div class="card-grid space-top">${weekly.map((l) => shopCard(l, true)).join("")}</div>` : empty("Restocking soon.", "The weekly selection appears once at least five cards are available.")}<div class="section-head"><h2>User Marketplace</h2><a href="#collection" class="text-button">Sell a card from your collection ↗</a></div><p class="subtext">Buy directly from another collector. No selling fee during this provisional launch.</p>${market.items.length ? `<div class="card-grid space-top">${market.items.map((l) => shopCard(l)).join("")}</div>` : empty("The stalls are ready.", "List an extra copy or an enhanced card from My collection.")}${pager("market", ui.marketPage, market.hasMore)}<p class="form-hint space-top">Enhanced purchases keep the higher of the purchased and existing card levels; the other copy becomes an extra.</p>`;
  }
  function userAuctions() {
    const data = ui.marketData || { items: [] };
    return `<div class="section-head"><h2>User Auctions</h2><a href="#collection" class="text-button">Auction one of your cards ↗</a></div><p class="subtext">Credits are held when bidding. Sellers receive payment when the timer ends; winners claim their card here. Unsold cards return automatically.</p>${data.items.length ? `<div class="card-grid space-top">${data.items.map((a) => cardHTML(cardBy(a.card), a)).join("")}</div>` : empty("Your collection could be someone’s favourite.", "List a card from My collection for up to seven days, with an optional buyout.")}${pager("market", ui.marketPage, data.hasMore)}`;
  }
  function ranks() {
    const data = ui.rankData || { rows: [] },
      metric = ui.metric;
    const labels = {
      earned: [
        "Cumulative",
        "Earned credits",
        "Daily bonuses, host rewards, and pick’em winnings. Purchases, refunds, trading, and gambling do not increase this total.",
      ],
      balance: [
        "Richest Players",
        "Available credits",
        "Current available wallet balance. Credits held in auction bids are excluded.",
      ],
      gambling_won: [
        "Best Gamblers",
        "Winning profit",
        "Cumulative profit on winning bets, excluding returned stakes.",
      ],
      gambling_lost: [
        "Biggest Losers",
        "Credits lost",
        "Cumulative credits lost on losing bets. Wins do not erase this total.",
      ],
    };
    return `<div class="page-intro"><div><h1>Every collector has a story.</h1><p>Earn it, save it, or try your luck.</p></div></div><div class="tabs ranking-tabs">${Object.entries(
      labels,
    )
      .map(
        ([id, [label]]) =>
          `<button class="tab ${metric === id ? "active" : ""}" data-action="rank-metric" data-metric="${id}">${label}</button>`,
      )
      .join(
        "",
      )}</div><div class="notice">${labels[metric][2]}</div>${data.rows.length ? `<div class="table-wrap space-top"><table><thead><tr><th>RANK</th><th>COLLECTOR</th><th>${e(labels[metric][1].toUpperCase())}</th></tr></thead><tbody>${data.rows.map((p, i) => `<tr><td><span class="rank-number ${(p.rank || i + 1) <= 3 ? "top" : ""}">${String(p.rank || (ui.rankPage - 1) * 50 + i + 1).padStart(2, "0")}</span></td><td><a class="player-cell" href="${profileURL(p.id)}"><span class="mini-avatar">${e(p.name.slice(0, 2).toUpperCase())}</span>${e(p.name)} ${p.id === getState().me?.id ? '<span class="you-label">YOU</span>' : ""}</a></td><td class="money">✦ ${n(p.value)}</td></tr>`).join("")}</tbody></table></div>` : empty("A place on the board is waiting.", "Only collectors with a positive total in this category are listed.")}${pager("ranks", ui.rankPage, data.hasMore)}`;
  }
  function gambling() {
    return `<div class="page-intro"><div><h1>A little luck. A few credits.</h1><p>Three simple games while the arcade takes shape.</p></div><span class="pill">CREDITS ONLY</span></div><div class="notice">Bets: 10–10,000 credits. Payouts below include your stake and round down to whole credits. Gambling does not increase Cumulative earnings.</div><div class="game-grid space-top">${[
      [
        "coin",
        "◑",
        "Coin flip",
        "Pick heads or tails. A fair coin, one call.",
        "50% win chance · 1.9× payout",
        '<label>Your call<select name="choice"><option value="heads">Heads</option><option value="tails">Tails</option></select></label>',
      ],
      [
        "dice",
        "⚄",
        "High / Low",
        "One die. Low is 1–3; High is 4–6.",
        "50% win chance · 1.9× payout",
        '<label>Your call<select name="choice"><option value="low">Low · 1, 2, 3</option><option value="high">High · 4, 5, 6</option></select></label>',
      ],
      [
        "seven",
        "♢",
        "Lucky seven",
        "Two dice. Hit a total of seven to win.",
        "1 in 6 win chance · 5.4× payout",
        '<p class="form-hint">Any pair adding to seven wins.</p>',
      ],
    ]
      .map(
        ([game, symbol, title, copy, odds, choice]) =>
          `<article class="game-panel"><div class="game-symbol">${symbol}</div><h2>${title}</h2><p>${copy}</p><strong class="game-odds">${odds}</strong><form class="stack space-top gambling-form"><input type="hidden" name="game" value="${game}">${choice}<label>Bet (credits)<input type="number" name="stake" min="10" max="10000" step="1" value="50" required></label><button class="button secondary" type="submit">Play ${title.toLowerCase()} →</button></form></article>`,
      )
      .join(
        "",
      )}</div><p class="form-hint space-top">Coin flip and High / Low return 95% on average; Lucky seven returns 90%, before rounding. These are long-run averages, not a promised result.</p>`;
  }
  function catalogPager(data, page) {
    const totalPages =
      data?.total == null ? null : Math.max(1, Math.ceil(data.total / 40));
    const first = Math.max(1, page - 3),
      last =
        totalPages == null
          ? page + (data?.hasMore ? 3 : 0)
          : Math.min(totalPages, page + 3);
    const pages = [
      ...new Set([
        1,
        ...Array.from(
          { length: Math.max(0, last - first + 1) },
          (_, i) => first + i,
        ),
        ...(totalPages ? [totalPages] : []),
      ]),
    ].sort((a, b) => a - b);
    return `<div class="toolbar catalog-pager">${btn("← Previous", "catalog-prev", page <= 1 ? "disabled" : "", "secondary")}<label>Page<input id="catalog-page-input" type="number" min="1" max="${totalPages || 10000}" value="${page}" aria-label="Go to catalogue page"></label><label>Select page<select id="catalog-page-select" aria-label="Select catalogue page">${pages.map((p) => `<option value="${p}" ${p === page ? "selected" : ""}>${p}</option>`).join("")}</select></label><span class="subtext">${totalPages ? "of " + n(totalPages) + " · " + n(data.total) + " cards" : "Matching pages · enter a page to jump"}</span>${btn("Next →", "catalog-next", data?.hasMore ? "" : "disabled", "secondary")}</div>`;
  }
  function animeCollection() {
    const data = ui.animeData || { series: [] };
    return `<section class="anime-completion"><div class="section-head"><div><span class="eyebrow">ONE STORY AT A TIME</span><h2>Your anime collection</h2></div><span class="pill">${data.series.filter((x) => x.owned === x.total).length} completed on this page</span></div><p class="subtext">Unique character cards by their primary anime. Includes cards listed for sale; duplicates count once. ${data.indexing ? "The catalogue index is still catching up." : ""}</p>${data.series.length ? `<div class="anime-progress-grid">${data.series.map((c) => `<article class="anime-progress-card ${c.owned === c.total ? "complete" : ""}"><span class="eyebrow">${c.owned === c.total ? "COLLECTION COMPLETE" : "IN PROGRESS"}</span><h3>${e(series({ ...c, series: c.series_romaji }))}</h3><div class="completion-label"><strong>${n(c.owned)} / ${n(c.total)} characters</strong><span>${Math.round((c.owned * 100) / c.total)}%</span></div><progress aria-label="${e(series({ ...c, series: c.series_romaji }))} completion" value="${c.owned}" max="${c.total}"></progress></article>`).join("")}</div>` : empty("Every story starts with one character.", "Collect character cards to start your anime progress board.")}${pager("anime", ui.animePage || 1, data.hasMore)}</section>`;
  }
  return {
    filters,
    profileExtras,
    shop,
    userAuctions,
    ranks,
    gambling,
    pager,
    catalogPager,
    animeCollection,
  };
}
