import { cardMatcher } from "./search.js";
import { canUpgrade } from "./card-management.js";
export function seriesTitle(card, mode = "romaji") {
  if (card.kind === "seiyuu") return card.series || "Voice actor";
  return mode === "english"
    ? card.series_english || card.series_romaji || card.series || "Anime"
    : card.series_romaji || card.series || card.series_english || "Anime";
}
export const rarityClass = (grade) =>
  ({
    AG: "ag",
    Ubers: "ubers",
    SSS: "sss",
    SS: "ss",
    S: "s",
    A: "a",
    B: "b",
    C: "c",
    D: "d",
  })[grade] || "pending";
export function popularityLabel(card) {
  if (card.raritySource === "community")
    return `Community card · ${card.rarity} rarity`;
  if (card.demoRarity)
    return "Illustrative demo rarity; not the live MAL ranking.";
  if (!card.rarity || card.favorites == null)
    return "MAL favorites have not been checked yet";
  return `${card.rarity === "AG" ? "Anything Goes (AG)" : card.rarity} · ${Number(card.favorites).toLocaleString("en-US")} MAL favorites · top ${Number(card.topPercent).toFixed(2)}% of ${Number(card.rankedPopulation).toLocaleString("en-US")} ranked ${card.kind === "seiyuu" ? "seiyuus" : "characters"}. Equal counts share an averaged rank and tier.`;
}

export const rarityOrder = [
  "AG",
  "Ubers",
  "SSS",
  "SS",
  "S",
  "A",
  "B",
  "C",
  "D",
  "Pending",
];
const nameCollator = new Intl.Collator("en", {
  sensitivity: "base",
  numeric: true,
});
export const rarityRank = (c) => {
  const i = rarityOrder.indexOf(c.rarity || "Pending");
  return i < 0 ? 9 : i;
};
export function cardComparator(sort = "name") {
  const name = (a, b) =>
    nameCollator.compare(String(a.name), String(b.name)) ||
    nameCollator.compare(String(a.id), String(b.id));
  const role = (c) => (sort === "role-supporting" ? { supporting:0, main:1, unknown:2 } : { main:0, supporting:1, unknown:2 })[c.role] ?? 2;
  return (a, b) => {
    let d = 0;
    if (sort === "rarity" || sort === "rarity-low")
      d =
        Number(rarityRank(a) === 9) - Number(rarityRank(b) === 9) ||
        (rarityRank(a) - rarityRank(b)) * (sort === "rarity-low" ? -1 : 1) ||
        (b.favorites ?? -1) - (a.favorites ?? -1);
    if (sort === "favorites" || sort === "favorites-low") d =
      Number(a.favorites == null) - Number(b.favorites == null) ||
      ((b.favorites ?? 0) - (a.favorites ?? 0)) * (sort === "favorites-low" ? -1 : 1);
    if (sort === "role" || sort === "role-supporting") d = role(a) - role(b);
    if (sort === "newest" || sort === "oldest")
      d =
        ((Number(String(b.id).match(/\d+$/)?.[0]) || 0) -
        (Number(String(a.id).match(/\d+$/)?.[0]) || 0)) * (sort === "oldest" ? -1 : 1);
    if (sort === "name-desc") return -name(a, b);
    return d || name(a, b);
  };
}
export const CATALOG_SORTS = ["name", "name-desc", "rarity", "rarity-low", "role", "role-supporting", "favorites", "favorites-low", "newest", "oldest"];
export const WISHLIST_SORTS = ["custom", "collected", "collected-oldest", "rarity", "rarity-low", "name", "name-desc", "role", "role-supporting"];
export const COLLECTION_SORTS = [...WISHLIST_SORTS, "level", "level-low", "copies", "copies-low"];
export const reverseCardSortOptions = (options) => options.flatMap(([id,label]) => {
  const opposite = {
    rarity:["rarity-low","Rarity · Lowest First"], level:["level-low","Enhancement · Lowest First"],
    copies:["copies-low","Fewest Copies"], collected:["collected-oldest",label.replace(/newest/gi,"Oldest")],
    newest:["oldest",label.replace(/newest/gi,"Oldest")], name:["name-desc","Alphabetical · Z–A"],
    role:["role-supporting","Role · Supporting First"], ending:["ending-last","Ending Latest"],
  }[id];
  return opposite && !options.some(([value])=>value===opposite[0]) ? [[id,label],opposite] : [[id,label]];
});

export function collectionView(
  inventory,
  cardBy,
  {
    kind = "both",
    query = "",
    rarity = "",
    role = "",
    strict = false,
    upgradable = false,
    hideProtected = false,
    tradeable = false,
    favoriteIds = null,
    sort = "rarity",
  } = {},
) {
  const matches = cardMatcher(query, strict);
  return inventory
    .filter(i => !favoriteIds || favoriteIds.has(i.card))
    .map((i) => ({ ...i, c: cardBy(i.card) }))
    .filter(
      ({ c, ...item }) =>
        c &&
        (!upgradable || canUpgrade(item)) &&
        (!hideProtected || !item.protected) &&
        (!tradeable || !!item.for_trade || !item.protected) &&
        (!kind || kind === "both" || c.kind === kind) &&
        (!rarity || (c.rarity || "Pending") === rarity) &&
        (kind !== "character" || !role || c.role === role) &&
        matches(c),
    )
    .sort((a, b) => {
      if (sort === "custom") {
        const aHas = a.position != null,
          bHas = b.position != null;
        if (aHas !== bHas) return aHas ? -1 : 1;
        if (aHas && a.position !== b.position) return a.position - b.position;
        return (
          (b.acquired_at || 0) - (a.acquired_at || 0) ||
          String(a.card).localeCompare(String(b.card))
        );
      }
      const order =
        sort === "collected" || sort === "collected-oldest"
          ? Number(!a.acquired_at)-Number(!b.acquired_at) || ((b.acquired_at || 0) - (a.acquired_at || 0)) * (sort === "collected-oldest" ? -1 : 1)
          : sort === "level" || sort === "level-low"
            ? (b.level - a.level) * (sort === "level-low" ? -1 : 1)
            : sort === "copies" || sort === "copies-low"
              ? (b.copies - a.copies) * (sort === "copies-low" ? -1 : 1)
              : cardComparator(sort)(a.c, b.c);
      return order || cardComparator("name")(a.c, b.c);
    });
}

export function collectionPage(items, requested = 1, limit = 40) {
  const pages = Math.max(1, Math.ceil(items.length / limit));
  const page = Math.min(
    pages,
    Math.max(1, Number.isSafeInteger(requested) ? requested : 1),
  );
  return {
    items: items.slice((page - 1) * limit, page * limit),
    page,
    total: items.length,
    hasMore: page < pages,
  };
}
export function animeProgressComparator(a, b) {
  return (
    b.owned * a.total - a.owned * b.total ||
    String(a.series_romaji).localeCompare(String(b.series_romaji)) ||
    String(a.series_key).localeCompare(String(b.series_key))
  );
}
