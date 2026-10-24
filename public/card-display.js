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
  const role = (c) => ({ main: 0, supporting: 1, unknown: 2 })[c.role] ?? 2;
  return (a, b) => {
    let d = 0;
    if (sort === "rarity")
      d =
        rarityRank(a) - rarityRank(b) ||
        (b.favorites ?? -1) - (a.favorites ?? -1);
    if (sort === "favorites") d = (b.favorites ?? -1) - (a.favorites ?? -1);
    if (sort === "role") d = role(a) - role(b);
    if (sort === "newest")
      d =
        (Number(String(b.id).match(/\d+$/)?.[0]) || 0) -
        (Number(String(a.id).match(/\d+$/)?.[0]) || 0);
    if (sort === "name-desc") return -name(a, b);
    return d || name(a, b);
  };
}
