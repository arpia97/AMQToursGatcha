import { rarityClass } from "./card-display.js";
import { roleBadge } from "./role-label.js";
import { titleOrderKey } from "./title-order.js";

function isCard(t) {
  return t.source === "card" || !!t.card;
}
function titleBadge(t, e) {
  const card = isCard(t);
  const label = card
    ? (t.rarity || "Pending") + " Card Title"
    : "Quiz Completion Title";
  return (
    '<span class="equipped-title ' +
    (card
      ? "card-earned-title tier-" + rarityClass(t.rarity)
      : "quiz-earned-title") +
    '" title="' +
    e(label) +
    '">' +
    e(t.title) +
    "</span>"
  );
}
export function titleBadges(profile, escape) {
  return (
    '<div class="profile-title-stack">' +
    roleBadge(profile.role) +
    '<div class="profile-earned-titles">' +
    (profile.titles || []).map((t) => titleBadge(t, escape)).join("") +
    "</div></div>"
  );
}
export function titleSettingsPanel(data, e) {
  if (!data) return '<div class="loading">Loading Your Titles…</div>';
  const titles = data.titles || [],
    counts = new Map(),
    seen = new Map();
  for (const t of titles)
    if (isCard(t)) counts.set(t.card, (counts.get(t.card) || 0) + 1);
  function detail(t) {
    if (!isCard(t))
      return (
        "Quiz Completion · 20 / 20" +
        (t.quizName &&
        t.quizName.trim().toLocaleLowerCase() !==
          t.title.trim().toLocaleLowerCase()
          ? " · " + t.quizName
          : "")
      );
    const count = counts.get(t.card),
      number = (seen.get(t.card) || 0) + 1;
    seen.set(t.card, number);
    return (
      "MAX " +
      (t.kind === "seiyuu"
        ? "Seiyuu "
        : t.kind === "character"
          ? "Character "
          : "") +
      "Card" +
      (count > 1 ? " · Award " + number + " of " + count : "")
    );
  }
  return (
    '<div class="page-intro"><div><h1>My Titles</h1><p>Choose the titles displayed on your profile.</p></div></div>' +
    (data.role === "Host"
      ? '<section class="title-option host-title-option">' +
        roleBadge("Host") +
        '<span>Always Equipped</span><input type="checkbox" checked disabled aria-label="Host Is Always Equipped"></section>'
      : "") +
    (titles.length
      ? '<form id="titles-form" class="stack title-arrange-panel"><div class="toolbar"><p class="form-hint" id="title-drag-help">Drag titles to change their order, or use arrow keys on a handle.</p><button type="button" class="text-button" data-action="title-order-reset">Reset Changes</button></div><div class="title-options title-sort-grid" role="list" aria-label="Title Display Order">' +
        titles
          .map(
            (t, index) =>
              '<div class="title-option title-sort-card" role="listitem" draggable="true" data-title-sort-card="' +
              e(titleOrderKey(t)) +
              '"><button type="button" class="wishlist-drag-handle title-drag-handle" draggable="true" data-title-handle="' +
              e(titleOrderKey(t)) +
              '" aria-label="Move ' +
              e(t.title) +
              '" aria-describedby="title-drag-help">⠿</button><label class="title-option-content" for="title-choice-' +
              index +
              '">' +
              titleBadge(t, e) +
              "<small>" +
              e(detail(t)) +
              '</small></label><input type="checkbox" id="title-choice-' +
              index +
              '" data-title-choice="' +
              e(titleOrderKey(t)) +
              '" name="' +
              (isCard(t) ? "award" : "quiz") +
              '" value="' +
              e(isCard(t) ? t.award : t.quiz) +
              '" ' +
              (t.equipped ? "checked" : "") +
              "></div>",
          )
          .join("") +
        "</div>" +
        (data.orderRevision === 1
          ? ""
          : '<p class="notice">Title ordering is updating. Refresh shortly before saving.</p>') +
        '<div class="form-error" role="alert"></div><button class="button mint" type="submit" ' +
        (data.orderRevision === 1 ? "" : "disabled") +
        '>Save Displayed Titles →</button><span id="title-arrange-status" class="card-order-status" role="status"></span></form>'
      : '<div class="notice space-top">No Earned Titles Yet. Reach MAX with a card or get a perfect quiz score to unlock a title.</div>')
  );
}
