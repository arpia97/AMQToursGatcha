const invalid = (message) => Object.assign(new Error(message), { status: 400 });
import { instantSalePrice } from "./card-values.js";
export const canUpgrade = (item) =>
  item.level < 20 && item.copies - 1 >= 2 ** (item.level - 1);
export function batchSaleQuote(inventory, cardBy, filters) {
  const {
    kind,
    rarity = "",
    role = "",
    query = "",
    mode = "extras",
    upgradable = false,
  } = filters;
  if (
    !["character", "seiyuu"].includes(kind) ||
    !["extras", "all"].includes(mode)
  )
    throw invalid("Choose a card type and sale mode.");
  const items = inventory
    .filter((i) => !i.protected && (!upgradable || canUpgrade(i)))
    .map((i) => ({ ...i, c: cardBy(i.card) }))
    .filter(
      ({ c }) =>
        c &&
        c.kind === kind &&
        (!rarity || (c.rarity || "Pending") === rarity) &&
        (kind !== "character" || !role || c.role === role) &&
        [c.name, c.series, c.series_romaji, c.series_english]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort((a, b) => a.card.localeCompare(b.card))
    .flatMap((i) => {
      const count = mode === "extras" ? i.copies - 1 : i.copies;
      if (!count) return [];
      return [
        {
          card: i.card,
          copies: i.copies,
          level: i.level,
          rarity: i.c.rarity || "Pending",
          count,
          price:
            instantSalePrice(i.c, 1) * (i.copies - 1) +
            (mode === "all" ? instantSalePrice(i.c, i.level) : 0),
        },
      ];
    });
  const selected = items.slice(0, 200);
  return {
    items: selected,
    total: selected.reduce((sum, i) => sum + i.price, 0),
    count: selected.reduce((sum, i) => sum + i.count, 0),
    hasMore: items.length > 200,
  };
}
