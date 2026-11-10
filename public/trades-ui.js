import { cardFrameClass, cardAura, enhancementBadge } from "./card-frames.js";
import { levelLabel } from "./card-values.js";
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
    series,
    empty,
    profileURL,
    getState,
  } = h;
  let picker = null;
  const card = (id, level, extra = 0) => {
    const c = cardBy(id);
    return `<div class="collect-card trade-card-mini tier-${rarityClass(c.rarity)} ${cardFrameClass(level)}">${cardAura(level)}${image(c)}<div><strong>${e(c.name)}</strong><span>${e(c.kind === "seiyuu" ? "Seiyuu" : "Character")} · ${e(c.rarity || "Pending")} · ${enhancementBadge(level)}${extra ? ` · +${n(extra)} Spares` : ""}</span><small>${e(series(c))}</small></div></div>`;
  };
  const offerCards = (o) =>
    o.cards?.length ? o.cards : [{ card: o.card, level: o.level }];
  const offer = (o) =>
    '<div class="trade-offer-cards"><p class="form-hint">' +
    offerCards(o).length +
    " " +
    (offerCards(o).length === 1 ? "Card" : "Cards") +
    "</p>" +
    offerCards(o)
      .map((c) => card(c.card, c.level, c.extra_copies))
      .join("") +
    "</div>";
  function render() {
    const s = getState(),
      data = ui.tradeData,
      view = ui.tradeView || "browse";
    const query = ui.tradeQuery || "",
      noResults = !!query && data?.query === query.trim() && !data.items.length;
    const head = `<div class="section-head"><h2>Card Trades</h2>${btn("List a Card", "trade-new", "", "mint")}</div><p class="subtext">Offer up to 10 card copies for one listed card. The lister chooses an offer. All cards are held until the trade ends; withdrawing returns your cards. No credit fee.</p><div class="tabs trade-views" role="group" aria-label="Trade views">${[
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
      .join(
        "",
      )}${btn("Refresh", "trade-refresh", "", "secondary")}</div><div class="trade-search"><input type="search" id="trade-search" class="search ${noResults ? "no-results" : ""}" maxlength="100" aria-label="Search Trades" aria-invalid="${noResults}" placeholder="Search cards, anime or collectors…" value="${e(query)}">${query ? btn("Clear Search", "trade-search-clear", "", "secondary") : ""}<label class="trade-wishlist-filter"><input id="trade-wishlist-only" type="checkbox" ${ui.tradeWishlistOnly ? "checked" : ""} ${!s.me ? "disabled" : ""}>My Wishlist Only</label>${view === "listings" ? `<label class="trade-wishlist-filter"><input id="trade-hide-completed" type="checkbox" ${ui.tradeHideCompleted ? "checked" : ""} ${!s.me ? "disabled" : ""}>Hide Completed Trades</label>` : ""}</div>`;
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
        return `<article class="trade-listing"><header><a href="${profileURL(l.seller)}">${e(l.seller_name)}</a><span class="pill">${e(open ? "Open" : l.status === "completed" ? "Traded" : "Cancelled")}</span></header>${card(l.card, l.level)}${l.extra_copies ? `<p class="form-hint">Includes ${n(l.extra_copies)} spare copies.</p>` : ""}<div class="trade-listing-actions"><span class="subtext">${n(l.offer_count)} ${l.offer_count === 1 ? "offer" : "offers"}</span>${open ? (mine ? btn("Cancel Listing", "trade-cancel", `data-id="${l.id}"`, "secondary") : ownOffer ? btn("Withdraw Offer", "trade-withdraw", `data-id="${ownOffer.id}"`, "secondary") : btn("Make an Offer", "trade-make", `data-id="${l.id}"`, "mint")) : ""}</div>${l.offers.length ? `<details class="trade-offers" ${mine ? "open" : ""}><summary>${mine ? "Review Offers" : "Your Offer History"}</summary>${l.offers.map((o) => `<div class="trade-offer"><div class="trade-offer-heading"><a href="${profileURL(o.proposer)}">${e(o.proposer_name)}</a><span>${e(o.status === "open" ? "Awaiting Decision" : o.status === "accepted" ? "Accepted" : o.status[0].toUpperCase() + o.status.slice(1))}</span></div>${offer(o)}${mine && open && o.status === "open" ? `<div class="trade-offer-actions">${btn("Accept Trade", "trade-accept", `data-id="${o.id}"`, "mint")}${btn("Decline", "trade-decline", `data-id="${o.id}"`, "secondary")}</div>` : ""}</div>`).join("")}</details>` : ""}</article>`;
      })
      .join("");
    return (
      head +
      (content
        ? `<div class="trade-listings">${content}</div>`
        : empty(
            query
              ? "No Matching Trades."
              : view === "browse"
                ? "No Open Trades Yet."
                : view === "listings"
                  ? "No Trade Listings Yet."
                  : "No Offers Yet.",
            query
              ? "Try another card name, anime or collector, or clear your search."
              : "List a card or make an offer to another collector.",
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
      bundle: [],
    };
  }
  function choose(id) {
    const item = getState().inventory.find(
      (i) => i.card === id && !i.protected,
    );
    if (!item) throw Error("This card is no longer available to trade.");
    if (picker.listing) {
      if (picker.bundle.length >= 10)
        throw Error("You can offer up to 10 card copies.");
      const used = picker.bundle.filter((c) => c.card === id),
        extra = used.filter((c) => c.variant === "extra").length;
      if (used.length >= item.copies)
        throw Error("All available copies are already in your offer.");
      const variant = extra < item.copies - 1 ? "extra" : "card";
      picker.bundle.push({
        card: id,
        variant,
        expectedLevel: variant === "extra" ? 1 : item.level,
      });
      return;
    }
    picker.selected = {
      card: id,
      variant: item.copies > 1 ? "extra" : "card",
      expectedLevel: item.copies > 1 ? 1 : item.level,
    };
  }
  function variant(value, index = null) {
    if (index !== null) {
      const selected = picker.bundle[index],
        item = getState().inventory.find((i) => i.card === selected?.card);
      if (!item || !["extra", "card"].includes(value))
        throw Error("Choose an available copy.");
      const others = picker.bundle.filter(
        (c, i) => i !== index && c.card === item.card,
      );
      if (
        (value === "card" && others.some((c) => c.variant === "card")) ||
        (value === "extra" &&
          others.filter((c) => c.variant === "extra").length >= item.copies - 1)
      )
        throw Error("That copy is already included in your offer.");
      picker.bundle[index] = {
        card: item.card,
        variant: value,
        expectedLevel: value === "extra" ? 1 : item.level,
      };
      return;
    }
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
    if (
      !picker ||
      picker.owner !== getState().me?.id ||
      (picker.listing ? !picker.bundle.length : !picker.selected)
    )
      throw Error("Choose a card from your current account.");
    return {
      action: picker.listing ? "trade-offer" : "trade-list",
      body: picker.listing
        ? {
            listing: picker.listing.id,
            cards: picker.bundle.map((c) => ({ ...c })),
          }
        : { ...picker.selected },
    };
  }
  function renderPicker() {
    const s = getState(),
      selected = picker.selected;
    const intro = `<h2>${picker.listing ? "Build Your Offer" : "List a Card for Trade"}</h2>${picker.listing ? `<p class="subtext">You want</p>${card(picker.listing.card, picker.listing.level)}` : ""}`;
    if (selected && !picker.listing) {
      const item = s.inventory.find((i) => i.card === selected.card);
      return (
        intro +
        `<form id="trade-card-form" class="stack"><p class="subtext">${picker.listing ? "You offer" : "Your listing"}</p>${card(selected.card, selected.expectedLevel)}<label>Copy to Trade<select id="trade-copy"><option value="card" ${selected.variant === "card" ? "selected" : ""}>Base Card · ${levelLabel(item.level)}</option>${item.copies > 1 ? `<option value="extra" ${selected.variant === "extra" ? "selected" : ""}>Spare Copy · Lv. 1</option>` : ""}</select></label><p class="form-hint">This copy leaves your inventory while held. Enhancement levels transfer. If a recipient already owns the same card, the higher level is kept and all invested copies are preserved as spares.</p><div class="form-error" role="alert"></div><div class="trade-confirm-actions">${btn("Choose Another Card", "trade-picker-back", 'type="button"', "secondary")}<button type="submit" class="button mint">${picker.listing ? "Send Offer" : "List for Trade"}</button></div></form>`
      );
    }
    const bundle = picker.bundle;
    const basket = picker.listing
      ? '<section class="trade-bundle" aria-label="Your Offer"><div class="section-head"><h3>Your Offer</h3><span class="subtext">' +
        bundle.length +
        " / 10 Cards</span></div>" +
        bundle
          .map((c, index) => {
            const item = s.inventory.find((i) => i.card === c.card),
              others = bundle.filter(
                (other, i) => i !== index && other.card === c.card,
              );
            return (
              '<div class="trade-bundle-item">' +
              card(c.card, c.expectedLevel) +
              '<div class="trade-bundle-controls"><label>Copy<select data-trade-copy-index="' +
              index +
              '" aria-label="Copy ' +
              (index + 1) +
              ' to Trade"><option value="card" ' +
              (c.variant === "card" ? "selected" : "") +
              " " +
              (others.some((c) => c.variant === "card") ? "disabled" : "") +
              ">Base · " +
              levelLabel(item.level) +
              "</option>" +
              (item.copies > 1
                ? '<option value="extra" ' +
                  (c.variant === "extra" ? "selected" : "") +
                  " " +
                  (others.filter((c) => c.variant === "extra").length >=
                  item.copies - 1
                    ? "disabled"
                    : "") +
                  ">Spare · Lv. 1</option>"
                : "") +
              "</select></label>" +
              btn(
                "Remove",
                "trade-remove",
                'type="button" data-index="' +
                  index +
                  '" aria-label="Remove ' +
                  e(cardBy(c.card).name) +
                  " Copy " +
                  (index + 1) +
                  '"',
                "secondary",
              ) +
              "</div></div>"
            );
          })
          .join("") +
        (bundle.length
          ? ""
          : '<p class="subtext">Choose cards below. Click the same card again to add another available copy.</p>') +
        '<form id="trade-card-form"><p class="form-hint">The full bundle is held until accepted, declined or withdrawn. Enhanced cards retain their levels; duplicate arrivals keep the higher level and preserve invested copies as spares.</p><div class="form-error" role="alert"></div><button type="submit" class="button mint" ' +
        (bundle.length ? "" : "disabled") +
        ">Send Offer · " +
        bundle.length +
        " " +
        (bundle.length === 1 ? "Card" : "Cards") +
        "</button></form></section>"
      : "";
    const available = (i) =>
      i.copies -
      (picker.listing ? bundle.filter((c) => c.card === i.card).length : 0);
    const items = (picker.kind ? [picker.kind] : ["character", "seiyuu"])
      .flatMap((kind) =>
        collectionView(
          s.inventory.filter((i) => !i.protected && available(i) > 0),
          cardBy,
          { query: picker.query, kind, sort: "rarity" },
        ),
      )
      .sort((a, b) => cardComparator("rarity")(a.c, b.c));
    const data = collectionPage(items, picker.page, 12);
    picker.page = data.page;
    return (
      intro +
      basket +
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
        )}</select></div><div class="trade-picker-grid">${data.items.map((i) => `<button type="button" class="trade-picker-card" data-action="trade-card" data-id="${e(i.card)}" ${picker.listing && bundle.length >= 10 ? "disabled" : ""}>${card(i.card, i.level)}<span>${n(available(i))} ${available(i) === 1 ? "copy" : "copies"} available</span></button>`).join("") || "<p>No Available Cards Match.</p>"}</div><div class="toolbar">${btn("← Previous", "trade-picker-prev", data.page <= 1 ? "disabled" : "", "secondary")}<span class="subtext">Page ${data.page}</span>${btn("Next →", "trade-picker-next", data.hasMore ? "" : "disabled", "secondary")}</div>`
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
    offer,
    remove: (index) => {
      if (Number.isInteger(index) && index >= 0 && index < picker.bundle.length)
        picker.bundle.splice(index, 1);
    },
  };
}
