import { RARITIES } from "./card-values.js";
import { cardComparator } from "./card-display.js";

const invalid = (message) => Object.assign(new Error(message), { status: 400 });
export function fusionOutcomesPage(
  cards,
  { rarity, kind = "mixed", query = "", page = 1 },
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
  const q = String(query).trim().toLowerCase().slice(0, 100);
  const matching = eligible
    .filter((c) =>
      [c.name, c.series, c.series_romaji, c.series_english]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q),
    )
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

export function fusionTarget(pool, id) {
  if (id == null || id === "") return null;
  const target = typeof id === "string" && pool?.find((c) => c.id === id);
  if (!target)
    throw Object.assign(
      new Error(
        "The target is no longer an eligible upgrade. Choose a target again.",
      ),
      { status: 409 },
    );
  if (pool.length < 2)
    throw Object.assign(
      new Error(
        "This tier has only one possible upgrade. Fuse without a target to receive that card on an upgrade.",
      ),
      { status: 409 },
    );
  return target;
}

export function drawFusionResult(pool, target, rand) {
  if (!target) return pool[rand(pool.length)];
  if (rand(2) === 0) return target;
  const index = pool.findIndex((c) => c.id === target.id),
    choice = rand(pool.length - 1);
  return pool[choice >= index ? choice + 1 : choice];
}
