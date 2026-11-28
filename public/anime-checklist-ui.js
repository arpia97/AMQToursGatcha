import { seriesTitle } from "./card-display.js";
import { wishlistButton } from "./profile-cards-ui.js";
import {songProgress} from './songbook-ui.js';

export function animeChecklist(
  data,
  { escape: e, cardHTML, wishlist, state, titleMode },
) {
  const title = seriesTitle(data, titleMode);
  return (
    '<section class="anime-checklist"><div class="section-head"><div><span class="eyebrow">Character Checklist</span><h2>' +
    e(title) +
    '</h2></div><span class="pill">' +
    data.owned +
    " / " +
    data.total +
    ' Collected</span></div>' +
    (data.hasSongbook?`<section class="songbook-checklist-summary"><div class="songbook-progress"><strong>Characters · ${data.owned} / ${data.total}</strong><progress aria-label="Character collection" value="${data.owned}" max="${data.total||1}"></progress></div><div><div data-anime-song-progress>${data.songProgress?songProgress(data.songProgress):'Loading song progress…'}</div><button class="text-button" data-action="songbook-open" data-series="${e(data.series_key)}">View Anime Songbook ↗</button></div></section>`:'')+
    '<div class="anime-checklist-grid">' +
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
          wishlistButton(c, wishlist, e, state) +
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
