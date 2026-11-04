// Commas separate name parts rather than becoming required search punctuation.
// Compile once per search, including when filtering large catalogue pools.
export function searchTerms(query = "") {
  return [
    ...new Set(
      String(query ?? "")
        .slice(0, 100)
        .toLowerCase()
        .split(/[\s,]+/u)
        .filter(Boolean),
    ),
  ];
}
export function searchMatcher(query = "") {
  const terms = searchTerms(query);
  return (value) => {
    const text = (
      Array.isArray(value)
        ? value.filter(Boolean).join(" ")
        : String(value ?? "")
    ).toLowerCase();
    return terms.every((term) => text.includes(term));
  };
}
export const cardSearchText = (c) =>
  [c.name, c.series, c.series_romaji, c.series_english]
    .filter(Boolean)
    .join(" ");
