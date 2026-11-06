import { seriesTitle } from "./card-display.js";
import { wishlistButton } from "./profile-cards-ui.js";

export function animeChecklist(
  data,
  { escape: e, cardHTML, wishlist, titleMode },
) {
  const title = seriesTitle(data, titleMode);
  return (
    '<section class="anime-checklist"><div class="section-head"><div><span class="eyebrow">Character Checklist</span><h2>' +
    e(title) +
    '</h2></div><span class="pill">' +
    data.owned +
    " / " +
    data.total +
    ' Collected</span></div><div class="anime-checklist-grid">' +
    data.cards
      .map(
        (c) =>
          '<div class="anime-checklist-entry ' +
          (c.owned ? "is-owned" : "is-missing") +
          '">' +
          cardHTML(c, null, { preview: true }) +
          '<div class="anime-checklist-status"><span>' +
          (c.owned ? "✓ Owned" : "Missing") +
          "</span>" +
          wishlistButton(c, wishlist, e) +
          "</div></div>",
      )
      .join("") +
    '</div><div class="toolbar space-top"><button type="button" class="button secondary" data-action="anime-checklist-page" data-page="' +
    (data.page - 1) +
    '" ' +
    (data.page === 1 ? "disabled" : "") +
    ">← Previous</button><span>Page " +
    data.page +
    '</span><button type="button" class="button secondary" data-action="anime-checklist-page" data-page="' +
    (data.page + 1) +
    '" ' +
    (!data.hasMore ? "disabled" : "") +
    '>Next →</button></div><div class="form-error" role="alert"></div></section>'
  );
}
