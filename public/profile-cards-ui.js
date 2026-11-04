export function wishlistButton(card, wishlist, e) {
  const wanted = wishlist.includes(card.id);
  return (
    '<button type="button" class="text-button wishlist-button ' +
    (wanted ? "is-selected" : "") +
    '" data-action="wishlist-toggle" data-id="' +
    e(card.id) +
    '" aria-pressed="' +
    wanted +
    '">' +
    (wanted ? "♥ Wishlisted" : "♡ Wishlist") +
    "</button>"
  );
}
export function profileCardTabs(view) {
  return (
    '<nav class="tabs profile-card-tabs" aria-label="Player Profile Views">' +
    [
      ["overview", "Overview"],
      ["wishlist", "Wishlist"],
      ["listings", "Listed"],
    ]
      .map(
        ([id, label]) =>
          '<button type="button" class="tab ' +
          (view === id ? "active" : "") +
          '" data-action="profile-cards-view" data-view="' +
          id +
          '">' +
          label +
          "</button>",
      )
      .join("") +
    "</nav>"
  );
}
export function profileCardPanel(
  data,
  { cardBy, cardHTML, escape: e, number: n, own, wishlist },
) {
  if (!data) return '<p class="notice">Loading Cards…</p>';
  const tiles = data.rows
    .map((row) => {
      const c = cardBy(row.card);
      if (!c) return "";
      const venue = row.venue,
        label =
          venue === "sale"
            ? "Marketplace"
            : venue === "auction"
              ? "Auction"
              : "Trade";
      const actions = venue
        ? '<p class="profile-listing-label">' +
          label +
          (row.extra_copies ? " · +" + n(row.extra_copies) + " Spares" : "") +
          (venue !== "trade" ? " · ✦ " + n(row.price) : "") +
          '</p><button type="button" class="button secondary" data-action="profile-venue" data-venue="' +
          venue +
          '">View ' +
          label +
          " →</button>"
        : wishlistButton(c, wishlist, e);
      return cardHTML(c, null, { preview: true, level: row.level }, actions);
    })
    .join("");
  return (
    '<section class="profile-card-panel"><div class="section-head"><h2>' +
    (data.view === "wishlist" ? "Wishlist" : "Active Listings") +
    "</h2></div>" +
    (tiles
      ? '<div class="card-grid">' + tiles + "</div>"
      : '<p class="notice">' +
        (data.view === "wishlist"
          ? "No wishlisted cards yet."
          : "No active shop, auction or trade listings.") +
        "</p>") +
    '<div class="toolbar space-top"><button class="button secondary" data-action="profile-cards-page" data-page="' +
    (data.page - 1) +
    '" ' +
    (data.page <= 1 ? "disabled" : "") +
    ">← Previous</button><span>Page " +
    data.page +
    '</span><button class="button secondary" data-action="profile-cards-page" data-page="' +
    (data.page + 1) +
    '" ' +
    (!data.hasMore ? "disabled" : "") +
    ">Next →</button></div></section>"
  );
}
