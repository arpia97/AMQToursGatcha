import { collectorsButton } from "./card-collectors.js";
import { RARITIES } from "./card-values.js";
export function wishlistButton(card, wishlist, e) {
  const wanted = wishlist.includes(card.id);
  return (
    '<button type="button" class="text-button wishlist-button ' +
    (wanted ? "is-selected" : "") +
    '" data-action="wishlist-toggle" data-id="' +
    e(card.id) +
    '" aria-pressed="' +
    wanted +
    '">' +
    (wanted ? "♥ Wishlisted" : "♡ Wishlist") +
    "</button>"
  );
}
export function profileCardTabs(view) {
  return (
    '<nav class="tabs profile-card-tabs" aria-label="Player Profile Views">' +
    [
      ["overview", "Overview"],
      ["collection", "Collection"],
      ["wishlist", "Wishlist"],
      ["listings", "Listed"],
    ]
      .map(
        ([id, label]) =>
          '<button type="button" class="tab ' +
          (view === id ? "active" : "") +
          '" data-action="profile-cards-view" data-view="' +
          id +
          '">' +
          label +
          "</button>",
      )
      .join("") +
    "</nav>"
  );
}
function profileCollectionControls(
  filters = {},
  e,
  { own = false, canWishlist = false } = {},
) {
  const kind = ["character", "seiyuu", "both"].includes(filters.kind)
      ? filters.kind
      : "both",
    query = filters.query || "",
    rarity = filters.rarity || "",
    role = kind === "character" ? filters.role || "" : "",
    sort = filters.sort || "custom";
  const sorts = [
    ["custom", "Custom Order"],
    ["collected", "Collection Date · Newest"],
    ["rarity", "Rarity · Highest First"],
    ["level", "Enhancement · Highest First"],
    ["copies", "Most Copies"],
    ["name", "Alphabetical · A–Z"],
    ["name-desc", "Alphabetical · Z–A"],
    ...(kind === "character" ? [["role", "Role · Main First"]] : []),
  ];
  return (
    '<div class="filters collection-toolbar-main profile-collection-toolbar"><div class="tabs profile-collection-tabs" role="group" aria-label="Collection Card Type">' +
    [
      ["character", "Characters"],
      ["seiyuu", "Seiyuus"],
      ["both", "Both"],
    ]
      .map(
        ([id, label]) =>
          '<button type="button" class="tab ' +
          (kind === id ? "active" : "") +
          '" data-action="profile-collection-kind" data-kind="' +
          id +
          '" aria-pressed="' +
          (kind === id) +
          '">' +
          label +
          "</button>",
      )
      .join("") +
    '</div><input type="search" class="search" id="profile-collection-search" aria-label="Search Collection" placeholder="Search Collection…" value="' +
    e(query) +
    '"><div class="catalog-refinements sort-control"><label>Sort By<select id="profile-collection-sort">' +
    sorts
      .map(
        ([id, label]) =>
          '<option value="' +
          id +
          '" ' +
          (sort === id ? "selected" : "") +
          ">" +
          label +
          "</option>",
      )
      .join("") +
    '</select></label></div><div class="catalog-refinements"><label>Rarity<select id="profile-collection-rarity"><option value="">All Rarities</option>' +
    [...RARITIES, "Pending"]
      .map(
        (r) =>
          '<option value="' +
          r +
          '" ' +
          (rarity === r ? "selected" : "") +
          ">" +
          r +
          "</option>",
      )
      .join("") +
    "</select></label>" +
    (kind === "character"
      ? '<label>Character Role<select id="profile-collection-role"><option value="">All Roles</option><option value="main" ' +
        (role === "main" ? "selected" : "") +
        '>Main</option><option value="supporting" ' +
        (role === "supporting" ? "selected" : "") +
        ">Supporting</option></select></label>"
      : "") +
    (!own && canWishlist
      ? '<label class="check-label profile-collection-wishlist-toggle"><input type="checkbox" id="profile-collection-wishlist" ' +
        (filters.wishlist ? "checked" : "") +
        "> My Wishlist Only</label>"
      : "") +
    (!own
      ? '<label class="check-label profile-collection-tradeable-toggle"><input type="checkbox" id="profile-collection-tradeable" ' +
        (filters.tradeable ? "checked" : "") +
        "> Tradeable Only</label>"
      : "") +
    '<button type="button" class="text-button" data-action="clear-profile-collection-filters">Clear Filters</button></div></div>'
  );
}
export function profileCardPanel(
  data,
  { cardBy, cardHTML, escape: e, number: n, own, wishlist, collectionFilters },
) {
  if (!data) return '<p class="notice">Loading Cards…</p>';
  const tiles = data.rows
    .map((row) => {
      const c = cardBy(row.card);
      if (!c) return "";
      const venue = row.venue,
        label =
          venue === "sale"
            ? "Marketplace"
            : venue === "auction"
              ? "Auction"
              : "Trade";
      const actions = venue
        ? '<p class="profile-listing-label">' +
          label +
          (row.extra_copies ? " · +" + n(row.extra_copies) + " Spares" : "") +
          (venue !== "trade" ? " · ✦ " + n(row.price) : "") +
          '</p><button type="button" class="button secondary" data-action="profile-venue" data-venue="' +
          venue +
          '">View ' +
          label +
          " →</button>"
        : collectorsButton(c, e) + wishlistButton(c, wishlist, e);
      return cardHTML(
        c,
        null,
        {
          preview: true,
          level: row.level,
          ownerFlags: {
            protectedCard: !!row.protected,
            wishlisted: data.view === "wishlist" || !!row.wishlisted,
            forTrade: !!row.for_trade,
          },
        },
        actions,
      );
    })
    .join("");
  const totalOwned = data.total ?? data.rows.length;
  return (
    '<section class="profile-card-panel"><div class="section-head"><h2>' +
    (data.view === "collection"
      ? "Collection"
      : data.view === "wishlist"
        ? "Wishlist"
        : "Active Listings") +
    "</h2>" +
    (own && data.view === "collection" && totalOwned > 1
      ? '<button type="button" class="text-button" data-action="collection-arrange" aria-pressed="false">Arrange Collection</button>'
      : own && data.view === "wishlist" && wishlist.length > 1
        ? '<button class="text-button" data-action="wishlist-arrange" aria-pressed="false">Arrange Wishlist</button>'
        : "") +
    "</div>" +
    (data.view === "collection"
      ? profileCollectionControls(collectionFilters, e, {
          own,
          canWishlist: !own && Boolean(wishlist),
        })
      : "") +
    (tiles
      ? '<div class="card-grid">' + tiles + "</div>"
      : '<p class="notice">' +
        (data.view === "wishlist"
          ? "No wishlisted cards yet."
          : data.view === "collection"
            ? totalOwned > 0
              ? "No matching cards in this collection."
              : "No cards in this collection yet."
            : "No active shop, auction or trade listings.") +
        "</p>") +
    '<div class="toolbar space-top"><button class="button secondary" data-action="profile-cards-page" data-page="' +
    (data.page - 1) +
    '" ' +
    (data.page <= 1 ? "disabled" : "") +
    ">← Previous</button><span>Page " +
    data.page +
    '</span><button class="button secondary" data-action="profile-cards-page" data-page="' +
    (data.page + 1) +
    '" ' +
    (!data.hasMore ? "disabled" : "") +
    ">Next →</button></div></section>"
  );
}
