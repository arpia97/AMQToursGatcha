import {
  collectionView,
  collectionPage,
  cardComparator,
} from "./card-display.js";

export function createTradesUI(h, ui) {
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
  let picker = null;
  const card = (id, level) => {
    const c = cardBy(id);
    return `<div class="collect-card trade-card-mini tier-${rarityClass(c.rarity)} rarity-${rarity(level)}">${image(c)}<div><strong>${e(c.name)}</strong><span>${e(c.kind === "seiyuu" ? "Seiyuu" : "Character")} · ${e(c.rarity || "Pending")} · Lv. ${level}</span><small>${e(series(c))}</small></div></div>`;
  };
  function render() {
    const s = getState(),
      data = ui.tradeData,
      view = ui.tradeView || "browse";
    const head = `<div class="section-head"><h2>Card Trades</h2>${btn("List a Card", "trade-new", "", "mint")}</div><p class="subtext">Offer one card for another. The lister chooses an offer. Both cards are held until the trade ends; withdrawing returns your card. No credit fee.</p><div class="tabs trade-views" role="group" aria-label="Trade views">${[
      ["browse", "Browse Trades"],
      ["listings", "Your Trade Listings"],
      ["offers", "Your Offers"],
    ]
      .map(([id, label]) =>
        btn(
          label,
          "trade-view",
          `data-view="${id}" aria-pressed="${view === id}"`,
          view === id ? "mint" : "secondary",
        ),
      )
      .join("")}${btn("Refresh", "trade-refresh", "", "secondary")}</div>`;
    if (!s.me && view !== "browse")
      return (
        head +
        empty(
          "Sign In to See Your Trades.",
          "",
          btn("Sign In", "shop-sign-in", "", "mint"),
        )
      );
    if (!data)
      return head + '<p class="subtext" role="status">Loading trades…</p>';
    const content = data.items
      .map((l) => {
        const mine = s.me?.id === l.seller,
          open = l.status === "open",
          ownOffer = l.offers.find(
            (o) => o.proposer === s.me?.id && o.status === "open",
          );
        return `<article class="trade-listing"><header><a href="${profileURL(l.seller)}">${e(l.seller_name)}</a><span class="pill">${e(open ? "Open" : l.status === "completed" ? "Traded" : "Cancelled")}</span></header>${card(l.card, l.level)}<div class="trade-listing-actions"><span class="subtext">${n(l.offer_count)} ${l.offer_count === 1 ? "offer" : "offers"}</span>${open ? (mine ? btn("Cancel Listing", "trade-cancel", `data-id="${l.id}"`, "secondary") : ownOffer ? btn("Withdraw Offer", "trade-withdraw", `data-id="${ownOffer.id}"`, "secondary") : btn("Offer a Card", "trade-make", `data-id="${l.id}"`, "mint")) : ""}</div>${l.offers.length ? `<details class="trade-offers" ${mine ? "open" : ""}><summary>${mine ? "Review Offers" : "Your Offer History"}</summary>${l.offers.map((o) => `<div class="trade-offer"><div class="trade-offer-heading"><a href="${profileURL(o.proposer)}">${e(o.proposer_name)}</a><span>${e(o.status === "open" ? "Awaiting Decision" : o.status === "accepted" ? "Accepted" : o.status[0].toUpperCase() + o.status.slice(1))}</span></div>${card(o.card, o.level)}${mine && open && o.status === "open" ? `<div class="trade-offer-actions">${btn("Accept Trade", "trade-accept", `data-id="${o.id}"`, "mint")}${btn("Decline", "trade-decline", `data-id="${o.id}"`, "secondary")}</div>` : ""}</div>`).join("")}</details>` : ""}</article>`;
      })
      .join("");
    return (
      head +
      (content
        ? `<div class="trade-listings">${content}</div>`
        : empty(
            view === "browse"
              ? "No Open Trades Yet."
              : view === "listings"
                ? "No Trade Listings Yet."
                : "No Offers Yet.",
            "List a card or make an offer to another collector.",
          )) +
      `<div class="toolbar space-top">${btn("← Previous", "trade-prev", data.page <= 1 ? "disabled" : "", "secondary")}<span class="subtext">Page ${data.page}</span>${btn("Next →", "trade-next", data.hasMore ? "" : "disabled", "secondary")}</div>`
    );
  }
  function openPicker(listing = null) {
    if (!getState().me) throw Error("Sign in to trade cards.");
    picker = {
      owner: getState().me.id,
      listing,
      query: "",
      kind: "",
      page: 1,
      selected: null,
    };
  }
  function choose(id) {
    const item = getState().inventory.find(
      (i) => i.card === id && !i.protected,
    );
    if (!item) throw Error("This card is no longer available to trade.");
    picker.selected = {
      card: id,
      variant: item.copies > 1 ? "extra" : "card",
      expectedLevel: item.copies > 1 ? 1 : item.level,
    };
  }
  function variant(value) {
    const item = getState().inventory.find(
      (i) => i.card === picker.selected?.card,
    );
    if (
      !item ||
      !["extra", "card"].includes(value) ||
      (value === "extra" && item.copies < 2)
    )
      throw Error("Choose an available copy.");
    picker.selected = {
      card: item.card,
      variant: value,
      expectedLevel: value === "extra" ? 1 : item.level,
    };
  }
  function filter(key, value) {
    if (picker && ["query", "kind", "page"].includes(key)) {
      picker[key] = value;
      if (key !== "page") picker.page = 1;
    }
  }
  function payload() {
    if (!picker?.selected || picker.owner !== getState().me?.id)
      throw Error("Choose a card from your current account.");
    return {
      action: picker.listing ? "trade-offer" : "trade-list",
      body: {
        ...picker.selected,
        ...(picker.listing ? { listing: picker.listing.id } : {}),
      },
    };
  }
  function renderPicker() {
    const s = getState(),
      selected = picker.selected;
    const intro = `<h2>${picker.listing ? "Offer a Card" : "List a Card for Trade"}</h2>${picker.listing ? `<p class="subtext">You want</p>${card(picker.listing.card, picker.listing.level)}` : ""}`;
    if (selected) {
      const item = s.inventory.find((i) => i.card === selected.card);
      return (
        intro +
        `<form id="trade-card-form" class="stack"><p class="subtext">${picker.listing ? "You offer" : "Your listing"}</p>${card(selected.card, selected.expectedLevel)}<label>Copy to Trade<select id="trade-copy"><option value="card" ${selected.variant === "card" ? "selected" : ""}>Base Card · Lv. ${item.level}</option>${item.copies > 1 ? `<option value="extra" ${selected.variant === "extra" ? "selected" : ""}>Spare Copy · Lv. 1</option>` : ""}</select></label><p class="form-hint">This copy leaves your inventory while held. Enhancement levels transfer. If a recipient already owns the same card, the higher level is kept and the other copy becomes a Lv. 1 spare.</p><div class="form-error" role="alert"></div><div class="trade-confirm-actions">${btn("Choose Another Card", "trade-picker-back", 'type="button"', "secondary")}<button type="submit" class="button mint">${picker.listing ? "Send Offer" : "List for Trade"}</button></div></form>`
      );
    }
    const items = (picker.kind ? [picker.kind] : ["character", "seiyuu"])
      .flatMap((kind) =>
        collectionView(
          s.inventory.filter((i) => !i.protected),
          cardBy,
          { query: picker.query, kind, sort: "rarity" },
        ),
      )
      .sort((a, b) => cardComparator("rarity")(a.c, b.c));
    const data = collectionPage(items, picker.page, 12);
    picker.page = data.page;
    return (
      intro +
      `<p class="form-hint">Protected cards are excluded.</p><div class="trade-picker-filters"><input id="trade-picker-query" class="search" aria-label="Search Trade Cards" placeholder="Search your cards…" value="${e(picker.query)}"><select id="trade-picker-kind" aria-label="Card Type">${[
        ["", "All Cards"],
        ["character", "Characters"],
        ["seiyuu", "Seiyuus"],
      ]
        .map(
          ([v, l]) =>
            `<option value="${v}" ${picker.kind === v ? "selected" : ""}>${l}</option>`,
        )
        .join(
          "",
        )}</select></div><div class="trade-picker-grid">${data.items.map((i) => `<button type="button" class="trade-picker-card" data-action="trade-card" data-id="${e(i.card)}">${card(i.card, i.level)}<span>${n(i.copies)} ${i.copies === 1 ? "copy" : "copies"}</span></button>`).join("") || "<p>No Available Cards Match.</p>"}</div><div class="toolbar">${btn("← Previous", "trade-picker-prev", data.page <= 1 ? "disabled" : "", "secondary")}<span class="subtext">Page ${data.page}</span>${btn("Next →", "trade-picker-next", data.hasMore ? "" : "disabled", "secondary")}</div>`
    );
  }
  const back = () => {
    picker.selected = null;
  };
  const turn = (delta) => {
    picker.page = Math.max(1, picker.page + delta);
  };
  return {
    render,
    openPicker,
    renderPicker,
    choose,
    variant,
    filter,
    payload,
    back,
    turn,
    card,
  };
}
