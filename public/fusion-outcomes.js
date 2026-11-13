import { searchMatcher, cardSearchText } from "./search.js";
import { RARITIES } from "./card-values.js";
import { cardComparator } from "./card-display.js";

const invalid = (message) => Object.assign(new Error(message), { status: 400 });
export function fusionOutcomesPage(
  cards,
  { rarity, kind = "mixed", query = "", page = 1 },
  searchText = cardSearchText,
) {
  if (
    !RARITIES.includes(rarity) ||
    !["mixed", "character", "seiyuu"].includes(kind)
  )
    throw invalid("Choose a fusion result rarity and card type.");
  if (!Number.isSafeInteger(page) || page < 1 || page > 10000)
    throw invalid("Choose a valid outcomes page.");
  const eligible = cards.filter(
    (c) => c.rarity === rarity && (kind === "mixed" || c.kind === kind),
  );
  const matches = searchMatcher(query);
  const matching = eligible
    .filter((c) => matches(searchText(c)))
    .sort(cardComparator("name"));
  const limit = 12;
  page = Math.min(page, Math.max(1, Math.ceil(matching.length / limit)));
  return {
    cards: matching.slice((page - 1) * limit, page * limit),
    page,
    limit,
    total: matching.length,
    eligibleTotal: eligible.length,
    hasMore: matching.length > page * limit,
  };
}
