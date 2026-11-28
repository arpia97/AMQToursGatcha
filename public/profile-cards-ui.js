import { cardFavoriteFlag, cardQuickActions } from "./card-quick-actions.js";
import { collectorsButton } from "./card-collectors.js";
import { reverseCardSortOptions } from "./card-display.js";
import { RARITIES } from "./card-values.js";
export function wishlistButton(card, wishlist, escape, state) {
  return cardQuickActions(card, {wishlist: wishlist.includes(card.id), favorite: cardFavoriteFlag(state,card.id)}, escape);
}
export function profileCardTabs(view, friendControl = "") {
  return (
    '<div class="profile-card-controls"><nav class="tabs profile-card-tabs" aria-label="Player Profile Views">' +
    [
      ["overview", "Overview"],
      ["collection", "Collection"],
      ["favorites", "Favorites"],
      ["wishlist", "Wishlist"],
      ["listings", "Listed"],
      ["quiz", "Quiz"],
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
    "</nav>" + friendControl + "</div>"
  );
}
function profileCollectionControls(
  filters = {},
  e,
  { own = false, canWishlist = false, view = "collection", ownershipHidden = false, signedIn = false } = {},
) {
  const isWishlist = view === "wishlist";
  const title = isWishlist ? "Wishlist" : view === "favorites" ? "Favorites" : "Collection";
  const prefix = "profile-" + view;
  const kind = ["character", "seiyuu", "both"].includes(filters.kind)
      ? filters.kind
      : "both",
    query = filters.query || "",
    rarity = filters.rarity || "",
    role = kind === "character" ? filters.role || "" : "",
    sort = filters.sort || "custom";
  const sorts = reverseCardSortOptions([
    ["custom", view === "favorites" ? "Collection Order" : "Custom Order"],
    ["collected", "Newest First"],
    ["rarity", "Rarity · Highest First"],
    ...(!isWishlist ? [["level", "Enhancement · Highest First"], ["copies", "Most Copies"]] : []),
    ["name", "Alphabetical · A–Z"],
    ["name-desc", "Alphabetical · Z–A"],
    ...(kind === "character" ? [["role", "Role · Main First"]] : []),
  ]);
  return (
    '<div class="filters collection-toolbar-main profile-collection-toolbar"><div class="tabs profile-collection-tabs" role="group" aria-label="'+title+' Card Type">' +
    [
      ["character", "Characters"],
      ["seiyuu", "Seiyuus"],
      ["both", "Both"],
    ]
      .map(
        ([id, label]) =>
          '<button type="button" class="tab ' +
          (kind === id ? "active" : "") +
          '" data-action="'+prefix+'-kind" data-kind="' +
          id +
          '" aria-pressed="' +
          (kind === id) +
          '">' +
          label +
          "</button>",
      )
      .join("") +
    '</div><input type="search" class="search" id="'+prefix+'-search" aria-label="Search '+title+'" placeholder="Search '+title+'…" value="' +
    e(query) +
    '"><div class="catalog-refinements sort-control"><label>Sort By<select id="'+prefix+'-sort">' +
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
    '</select></label></div><div class="catalog-refinements"><label>Rarity<select id="'+prefix+'-rarity"><option value="">All Rarities</option>' +
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
      ? '<label>Character Role<select id="'+prefix+'-role"><option value="">All Roles</option><option value="main" ' +
        (role === "main" ? "selected" : "") +
        '>Main</option><option value="supporting" ' +
        (role === "supporting" ? "selected" : "") +
        ">Supporting</option></select></label>"
      : "") +
    '<div class="collection-checkboxes" role="group" aria-label="'+title+' Filters">' +
    (!isWishlist && !own && canWishlist
      ? '<label class="check-label profile-collection-wishlist-toggle"><input type="checkbox" id="'+prefix+'-wishlist" ' +
        (filters.wishlist ? "checked" : "") +
        "> My Wishlist Only</label>"
      : "") +
    (isWishlist
      ? '<div class="wishlist-ownership-options">'+[
          ["unowned", "exclude-owned", "Exclude Owned"],
          ["owned", "owned-only", "Owned Only"],
        ].map(([value,id,label]) => {
          const reason = value === "owned"
            ? (signedIn ? "" : "Sign in to filter by the cards you own")
            : (ownershipHidden ? "This collection is private" : "");
          return '<label class="check-label"><input type="checkbox" name="wishlist-ownership" id="'+prefix+'-'+id+'" value="'+value+'" '+
            (filters.ownership === value && !reason ? 'checked' : '')+' '+
            (reason ? 'disabled title="'+e(reason)+'"' : '')+'> '+label+'</label>';
        }).join('')+'</div></div>'
      : '<label class="check-label profile-collection-tradeable-toggle"><input type="checkbox" id="'+prefix+'-tradeable" '+(filters.tradeable ? 'checked' : '')+'> Tradeable Only</label></div>') +
    '<button type="button" class="text-button" data-action="clear-'+prefix+'-filters">Clear Filters</button></div></div>'
  );
}
export function profileCardPanel(
  data,
  { cardBy, cardHTML, escape: e, number: n, own, wishlist, state, collectionFilters, wishlistFilters = {} },
) {
  if (!data) return '<p class="notice">Loading Cards…</p>';
  const title = {collection:"Collection",favorites:"Favorites",wishlist:"Wishlist",listings:"Active Listings"}[data.view];
  const inventoryView = data.view === "collection" || data.view === "favorites";
  if (data.hidden && inventoryView) {
    return '<section class="profile-card-panel"><div class="section-head"><h2>'+title+'</h2></div><p class="notice">This collector’s collection is private.</p></section>';
  }
  const wishKind = data.kind || "both";
  const filteredWishlist = wishlistFilters.query?.trim() || wishlistFilters.rarity || wishlistFilters.role || wishlistFilters.ownership || wishlistFilters.favoritesOnly;
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
          " →</button>" +
          collectorsButton(c, e) + wishlistButton(c, wishlist, e, state)
        : collectorsButton(c, e) + wishlistButton(c, wishlist, e, state);
      return cardHTML(
        c,
        null,
        {
          preview: true,
          level: row.level,
          portrait: row.portrait,
          mineStatus: row.mineStatus,
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
    '<section class="profile-card-panel"><div class="section-head' +
    (data.view === "wishlist" ? " profile-wishlist-header" : "") +
    '"><h2>' +
    title +
    "</h2>" +
    (own && data.view === "collection" && totalOwned > 1
      ? '<button type="button" class="text-button" data-action="collection-arrange" aria-pressed="false">Arrange Collection</button>'
      : own && data.view === "wishlist" && wishKind === "both" && wishlist.length > 1
        ? '<button class="text-button" data-action="wishlist-arrange" aria-pressed="false">Arrange Wishlist</button>'
        : "") +
    "</div>" +
    (data.view === "wishlist" ? profileCollectionControls({...wishlistFilters,kind:wishKind},e,{view:"wishlist",ownershipHidden:data.ownershipHidden,signedIn:!!state?.me}) : '') +
    (inventoryView
      ? profileCollectionControls(collectionFilters, e, {
          own,
          view: data.view,
          canWishlist: !own && Boolean(wishlist),
        })
      : "") +
    (tiles
      ? '<div class="card-grid">' + tiles + "</div>"
      : '<p class="notice">' +
        (data.view === "wishlist"
          ? filteredWishlist ? "No Matching Wishlisted Cards." : wishKind === "both"
            ? "No wishlisted cards yet."
            : wishKind === "seiyuu"
              ? "No wishlisted seiyuus yet."
              : "No wishlisted characters yet."
          : data.view === "favorites"
            ? "No Favorite Cards in This View."
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
