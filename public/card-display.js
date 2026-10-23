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
