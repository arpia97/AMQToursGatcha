import { collectionView, collectionPage } from "./card-display.js";
import { RARITIES, SHOP_PRICES, instantSalePrice } from "./card-values.js";

export function shopSellPage(inventory, cardBy, options, kind) {
  return collectionPage(
    collectionView(inventory, cardBy, {
      kind,
      query: options.query,
      rarity: options.rarity,
      sort: options.sort,
    }),
    options.page,
    24,
  );
}

export function createShopUI(h, ui) {
  const {
    escape: e,
    number: n,
    btn,
    cardBy,
    image,
    gradeBadge,
    rarityClass,
    rarity,
    series,
    empty,
    profileURL,
    getState,
  } = h;
  function listingCard(l, weekly = false) {
    const s = getState(),
      c = cardBy(l.card),
      mine = l.seller === s.me?.id;
    const shortfall = s.me ? Math.max(0, l.price - s.me.balance) : 0;
    const action = weekly ? "shop-buy" : "buy-listing";
    const control = mine
      ? btn(
          "Withdraw listing",
          "cancel-listing",
          `data-id="${l.id}" data-venue="shop"`,
          "secondary",
        )
      : btn(
          !s.me
            ? "Sign in to buy"
            : shortfall
              ? "Need " + n(shortfall) + " more"
              : "Buy card →",
          action,
          `data-id="${l.id}" ${shortfall ? "disabled" : ""}`,
          "mint",
        );
    return `<article class="collect-card tier-${rarityClass(c.rarity)} rarity-${rarity(l.level || 1)}"><div class="portrait">${image(c)}${gradeBadge(c)}${l.level > 1 ? `<span class="level-tag">LV. ${l.level}</span>` : ""}</div><div class="card-body"><div class="card-name">${e(c.name)}</div><div class="card-series">${e(series(c))}</div><p class="form-hint">${weekly ? "Weekly selection · 1 shared copy" : `By <a href="${profileURL(l.seller)}">${e(l.seller_name || (mine ? s.me.name : l.seller))}</a> · Lv. ${l.level}`}</p><div class="card-price"><span class="coin">✦</span> ${n(l.price)}</div>${control}</div></article>`;
  }
  function sell() {
    const s = getState();
    if (!s.me)
      return empty(
        "Your cards have a next chapter.",
        "Sign in to sell cards instantly or list them for another collector.",
        btn("Sign in", "shop-sign-in", "", "mint"),
      );
    const f = ui.shopSell,
      data = shopSellPage(s.inventory, cardBy, f, ui.tab());
    f.page = data.page;
    const pages = Math.max(1, Math.ceil(data.total / 24));
    const controls = `<div class="shop-controls">${h.tabs()}<input id="shop-search" class="search ${f.query && !data.total ? "no-results" : ""}" aria-label="Search cards to sell" aria-invalid="${!!f.query && !data.total}" placeholder="Search your cards…" value="${e(f.query)}"><label>Rarity<select id="shop-rarity"><option value="">All rarities</option>${[
      ...RARITIES,
    ]
      .reverse()
      .concat("Pending")
      .map((r) => `<option ${f.rarity === r ? "selected" : ""}>${r}</option>`)
      .join("")}</select></label><label>Sort by<select id="shop-sort">${[
      ["rarity", "Rarity · highest first"],
      ["name", "Alphabetical · A–Z"],
      ["level", "Enhancement level"],
      ["copies", "Most copies"],
    ]
      .map(
        ([value, label]) =>
          `<option value="${value}" ${f.sort === value ? "selected" : ""}>${label}</option>`,
      )
      .join("")}</select></label></div>`;
    const pager = `<div class="toolbar shop-pager">${btn("← Previous", "shop-sell-prev", data.page === 1 ? "disabled" : "", "secondary")}<label>Page <input id="shop-sell-page" aria-label="Go to sell cards page" type="number" min="1" max="${pages}" value="${data.page}"></label><span class="subtext">of ${n(pages)} · ${n(data.total)} ${data.total === 1 ? "card" : "cards"}</span>${btn("Next →", "shop-sell-next", data.hasMore ? "" : "disabled", "secondary")}</div>`;
    return `<div class="section-head"><h2>Sell your cards</h2><span class="subtext">Instant credits or your own asking price</span></div><p class="subtext">Sell to the shop for 50% of the rarity price, or list a card for another player to buy. Enhanced sale values account for every card invested. Listed cards are held until sold or withdrawn.</p>${controls}${pager}${
      data.items.length
        ? `<div class="card-grid shop-card-grid">${data.items
            .map((item) => {
              const c = item.c,
                extra = item.copies > 1,
                level = extra ? 1 : item.level;
              return `<article class="collect-card tier-${rarityClass(c.rarity)} rarity-${rarity(item.level)}"><div class="portrait">${image(c)}${gradeBadge(c)}<span class="level-tag">LV. ${item.level}</span></div><div class="card-body"><div class="card-name">${e(c.name)}</div><div class="card-series">${e(series(c))}</div><p class="form-hint">${n(item.copies)} ${item.copies === 1 ? "copy" : "copies"} · ${extra ? "extra Lv. 1 copy selected" : "your Lv. " + item.level + " card"}</p><div class="shop-sell-actions">${btn("Sell now · ✦ " + n(instantSalePrice(c, level)), "instant-sell", `data-id="${e(c.id)}"`, "secondary")}${btn("List for sale", "sell-card", `data-id="${e(c.id)}"`, "mint")}</div></div></article>`;
            })
            .join("")}</div>`
        : empty(
            s.inventory.length
              ? "No matching cards."
              : "Your collection is empty.",
            s.inventory.length
              ? "Try another card type, search or rarity."
              : "Buy a card or open a pack to get started.",
          )
    }${pages > 1 ? pager.replace('id="shop-sell-page"', 'id="shop-sell-page-bottom"') : ""}`;
  }
  function render() {
    const s = getState(),
      weekly = s.shop || [],
      market = ui.marketData || { items: [] },
      own = (s.myListings || []).filter((l) => l.venue === "shop");
    const section = ["buy", "sell", "market", "listings"].includes(
      ui.shopSection,
    )
      ? ui.shopSection
      : "buy";
    const header = `<div class="page-intro"><div><h1>Find it. Trade it. Make it yours.</h1><p>Buy a favourite, sell a spare, or trade with another collector.</p></div><span class="pill">${s.me ? "✦ " + n(s.me.balance) + " AVAILABLE" : "COLLECTOR SHOP"}</span></div><div class="tabs shop-sections" role="group" aria-label="Shop sections">${[
      ["buy", "Buy cards"],
      ["sell", "Sell cards"],
      ["market", "Player marketplace"],
      ["listings", "Your listings" + (own.length ? " · " + own.length : "")],
    ]
      .map(
        ([id, label]) =>
          `<button class="tab ${section === id ? "active" : ""}" data-action="shop-section" data-section="${id}" aria-pressed="${section === id}">${label}</button>`,
      )
      .join("")}</div>`;
    if (section === "sell") return header + sell();
    if (section === "listings")
      return (
        header +
        `<div class="section-head"><h2>Your marketplace listings</h2>${btn("List another card", "shop-section", 'data-section="sell"', "secondary")}</div><p class="subtext">You set the price and receive the full amount when a card sells. Withdraw any unsold listing to return the card to your collection.</p>${!s.me ? empty("Sign in to manage your listings.", "Your sales and cards stay linked to your AMQ Tours account.", btn("Sign in", "shop-sign-in", "", "mint")) : own.length ? `<div class="card-grid space-top">${own.map((l) => listingCard(l)).join("")}</div>` : empty("No cards listed yet.", "Choose a card in Sell cards and set your asking price.")}`
      );
    if (section === "market")
      return (
        header +
        `<div class="section-head"><h2>Player marketplace</h2>${btn("Sell a card", "shop-section", 'data-section="sell"', "secondary")}</div><p class="subtext">Buy directly from another collector at their asking price. No listing fee or selling fee. Enhanced purchases keep the higher of the purchased and existing levels; the other copy becomes an extra.</p>${h.tabs()}${market.items.length ? `<div class="card-grid space-top">${market.items.map((l) => listingCard(l)).join("")}</div>` : empty("No cards listed for this type.", "Be the first to offer a card from your collection.")}${h.pager("market", ui.marketPage, market.hasMore)}`
      );
    return (
      header +
      `<div class="section-head"><h2>This week’s shop</h2><span class="subtext">${h.countdown(weekly[0]?.ends || h.nextWeeklyReset(s.now), "Shop resets in ", true, "Restocking…")}</span></div><p class="subtext">Ten cards from the character and seiyuu pools. Each has one shared copy; every purchase brings in a new random card immediately.</p><details class="shop-price-guide"><summary>Shop prices and selling values</summary><div class="table-wrap"><table><thead><tr><th>Rarity</th><th>Buy price</th><th>Sell at Lv. 1</th></tr></thead><tbody>${RARITIES.map((r) => `<tr><td>${r}</td><td>✦ ${n(SHOP_PRICES[r])}</td><td>✦ ${n(SHOP_PRICES[r] / 2)}</td></tr>`).join("")}</tbody></table></div><p class="form-hint">Pending uses D prices. Enhanced sale value multiplies by invested copies: Lv. 2 ×2, Lv. 3 ×4, Lv. 4 ×8, and so on. Shop purchase prices are fixed when a card enters stock. Player marketplace sellers choose their own prices.</p></details>${weekly.length ? `<div class="card-grid shop-card-grid">${weekly.map((l) => listingCard(l, true)).join("")}</div>` : empty("Restocking soon.", "The shop opens once at least ten cards are available.")}`
    );
  }
  return { render };
}
