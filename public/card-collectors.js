export function collectorsPanel(
  data,
  { escape: e, number: n, cardBy, avatarHTML, profileURL },
) {
  const button = (view, page, label, disabled = false) =>
    '<button type="button" class="button secondary" data-action="card-collectors" data-id="' +
    e(data.card) +
    '" data-view="' +
    view +
    '" data-page="' +
    page +
    '" ' +
    (disabled ? "disabled" : "") +
    ">" +
    label +
    "</button>";
  return (
    '<section class="card-collectors"><h2>' +
    e(cardBy(data.card).name) +
    '</h2><nav class="tabs" aria-label="Card Collectors">' +
    ["owned", "wanted"]
      .map(
        (view) =>
          '<button type="button" class="tab ' +
          (data.view === view ? "active" : "") +
          '" data-action="card-collectors" data-id="' +
          e(data.card) +
          '" data-view="' +
          view +
          '">' +
          (view === "owned" ? "Owned By" : "Wanted By") +
          " · " +
          n(data.counts[view]) +
          "</button>",
      )
      .join("") +
    '</nav><div class="collector-people">' +
    (data.rows.length
      ? data.rows
          .map(
            (p) =>
              '<a href="' +
              profileURL(p.id) +
              '" data-close-dialog>' +
              avatarHTML(p) +
              "<span>" +
              e(p.name) +
              "</span></a>",
          )
          .join("")
      : '<p class="notice">' +
        (data.view === "owned"
          ? "No collectors own this card yet."
          : "No one has wishlisted this card yet.") +
        "</p>") +
    '</div><div class="toolbar">' +
    button(data.view, data.page - 1, "← Previous", data.page <= 1) +
    "<span>Page " +
    data.page +
    "</span>" +
    button(data.view, data.page + 1, "Next →", !data.hasMore) +
    "</div></section>"
  );
}
