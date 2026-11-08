export function catalogueTabs(kind, recent = false) {
  return `<div class="tabs" role="group" aria-label="Catalogue Sections">${[
    ["character", "Characters"],
    ["seiyuu", "Seiyuus"],
    ["both", "Both"],
  ]
    .map(
      ([id, label]) =>
        `<button class="tab ${!recent && kind === id ? "active" : ""}" data-tab="${id}" aria-pressed="${!recent && kind === id}">${label}</button>`,
    )
    .join(
      "",
    )}<button class="tab ${recent ? "active" : ""}" data-action="catalog-recent" aria-pressed="${recent}">New Cards (24h)</button></div>`;
}
export function recentCardsView(data, { cardHTML, pager, number, empty }) {
  const list = data?.cards || [];
  return `<div class="notice">Characters and seiyuus first imported within the last 24 hours, newest first. Metadata and favorites updates do not count as new cards.</div><section class="collection-toolbar catalog-toolbar" aria-label="New Cards controls">${catalogueTabs("character", true)}${pager(data, data?.page || 1, "catalog-top")}</section><p class="subtext">${number(data?.total || 0)} new ${(data?.total || 0) === 1 ? "card" : "cards"} · Both Card Types</p><div class="card-grid collection-card-grid">${list.map((c) => cardHTML(c)).join("") || empty("No New Cards in the Last 24 Hours.", "Newly scraped cards appear here automatically. Import-time tracking starts with this update.")}</div><div class="collection-footer-pager">${pager(data, data?.page || 1)}</div>`;
}
