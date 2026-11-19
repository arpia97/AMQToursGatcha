import { rarityRank, cardComparator, reverseCardSortOptions } from "./card-display.js";
export const MARKET_SORTS = reverseCardSortOptions([
  ["newest", "Newest First"],
  ["oldest", "Oldest First"],
  ["rarity", "Rarity · Highest First"],
  ["rarity-low", "Rarity · Lowest First"],
  ["wishlist", "My Wishlist First"],
  ["price-low", "Price · Lowest First"],
  ["price-high", "Price · Highest First"],
  ["level", "Enhancement · Highest First"],
  ["name", "Name · A–Z"],
  ["ending", "Ending Soon"],
]);
export function marketSortControl(
  sort = "newest",
  wishlistOnly = false,
  signedIn = false,
  auction = false,
  query = "",
  noResults = false,
  friendsOnly = false,
  rarity = "",
  types = "",
) {
  const escape = (s) =>
    String(s).replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  return (
    '<div class="market-sort-controls">' + types + '<input class="search ' +
    (query && noResults ? "no-results" : "") +
    '" id="market-search" type="search" aria-label="Search player ' +
    (auction ? "auctions" : "marketplace") +
    '" placeholder="Search cards, anime or sellers…" maxlength="100" value="' +
    escape(query) +
    '" aria-invalid="' +
    !!(query && noResults) +
    '"><label>Sort By<select id="market-sort" aria-label="Sort player ' +
    (auction ? "auctions" : "marketplace") +
    '">' +
    MARKET_SORTS.filter(([v]) => auction || !v.startsWith("ending"))
      .map(
        ([v, label]) =>
          '<option value="' +
          v +
          '" ' +
          (v === sort ? "selected" : "") +
          " " +
          (v === "wishlist" && !signedIn ? "disabled" : "") +
          ">" +
          label +
          "</option>",
      )
      .join("") +
    '</select></label><label>Rarity<select id="market-rarity"><option value="">All Rarities</option>' +
    ["AG","Ubers","SSS","SS","S","A","B","C","D","Pending"].map(tier => '<option' + (tier === rarity ? " selected" : "") + '>' + tier + '</option>').join("") +
    '</select></label><label class="check-label"><input type="checkbox" id="market-wishlist-only" ' +
    (wishlistOnly ? "checked" : "") +
    " " +
    (!signedIn ? "disabled" : "") +
    '> My Wishlist Only</label><label class="check-label"><input type="checkbox" id="market-friends-only" ' +
    (friendsOnly ? 'checked' : '') + ' ' + (!signedIn ? 'disabled' : '') + '> Friends Only</label></div>'
  );
}
export function sortMarketItems(rows, cards, sort) {
  const rank = (l) => rarityRank(cards.get(l.card) || {});
  const price = (l) => l.price ?? (l.bid || l.reserve || 1);
  return [...rows].sort((a, b) => {
    let d =
      sort === "oldest"
        ? a.id - b.id
        : sort === "rarity"
          ? rank(a) - rank(b)
          : sort === "rarity-low"
            ? cardComparator("rarity-low")(cards.get(a.card)||{},cards.get(b.card)||{})
            : sort === "wishlist"
              ? Number(b.is_wishlisted) - Number(a.is_wishlisted)
              : sort === "price-low"
                ? price(a) - price(b)
                : sort === "price-high"
                  ? price(b) - price(a)
                  : sort === "level" || sort === "level-low"
                    ? (b.level - a.level) * (sort === "level-low" ? -1 : 1)
                    : sort === "name" || sort === "name-desc"
                      ? (sort === "name-desc" ? -1 : 1) * String(cards.get(a.card)?.name || "").localeCompare(
                          String(cards.get(b.card)?.name || ""),
                          "en",
                        )
                      : sort === "ending" || sort === "ending-last"
                        ? (a.ends - b.ends) * (sort === "ending-last" ? -1 : 1)
                        : b.id - a.id;
    return d || b.id - a.id;
  });
}
