import { rarityRank } from "./card-display.js";
export const MARKET_SORTS = [
  ["newest", "Newest First"],
  ["oldest", "Oldest First"],
  ["rarity", "Rarity · Highest First"],
  ["rarity-low", "Rarity · Lowest First"],
  ["wishlist", "My Wishlist First"],
  ["price-low", "Price · Lowest First"],
  ["price-high", "Price · Highest First"],
  ["level", "Enhancement Level"],
  ["name", "Name · A–Z"],
  ["ending", "Ending Soon"],
];
export function marketSortControl(
  sort = "newest",
  wishlistOnly = false,
  signedIn = false,
  auction = false,
  query = "",
  noResults = false,
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
    '<div class="market-sort-controls"><input class="search ' +
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
    MARKET_SORTS.filter(([v]) => auction || v !== "ending")
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
    '</select></label><label class="check-label"><input type="checkbox" id="market-wishlist-only" ' +
    (wishlistOnly ? "checked" : "") +
    " " +
    (!signedIn ? "disabled" : "") +
    "> My Wishlist Only</label></div>"
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
            ? rank(b) - rank(a)
            : sort === "wishlist"
              ? Number(b.is_wishlisted) - Number(a.is_wishlisted)
              : sort === "price-low"
                ? price(a) - price(b)
                : sort === "price-high"
                  ? price(b) - price(a)
                  : sort === "level"
                    ? b.level - a.level
                    : sort === "name"
                      ? String(cards.get(a.card)?.name || "").localeCompare(
                          String(cards.get(b.card)?.name || ""),
                          "en",
                        )
                      : sort === "ending"
                        ? a.ends - b.ends
                        : b.id - a.id;
    return d || b.id - a.id;
  });
}
