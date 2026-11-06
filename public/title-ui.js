import { rarityClass } from "./card-display.js";
import { roleBadge } from "./role-label.js";
export function titleBadges(profile, escape) {
  return (
    '<div class="profile-title-stack">' +
    roleBadge(profile.role) +
    '<div class="profile-earned-titles">' +
    (profile.titles || [])
      .map(
        (t) =>
          '<span class="equipped-title' +
          (t.rarity ? " card-earned-title tier-" + rarityClass(t.rarity) : "") +
          '">' +
          escape(t.title) +
          "</span>",
      )
      .join("") +
    "</div></div>"
  );
}
export function titleSettingsPanel(data, escape) {
  if (!data) return '<div class="loading">Loading Your Titles…</div>';
  const titles = data.titles || [];
  return (
    '<div class="page-intro"><div><h1>My Titles</h1><p>Choose the titles displayed on your profile.</p></div></div>' +
    (data.role === "Host"
      ? '<section class="title-option host-title-option">' +
        roleBadge("Host") +
        '<span>Always Equipped · AG</span><input type="checkbox" checked disabled aria-label="Host Is Always Equipped"></section>'
      : "") +
    (titles.length
      ? '<form id="titles-form" class="stack"><div class="title-options">' +
        titles
          .map(
            (t) =>
              '<label class="title-option' +
              (t.rarity
                ? " card-earned-title tier-" + rarityClass(t.rarity)
                : "") +
              '"><span><strong>' +
              escape(t.title) +
              "</strong>" +
              (t.source === "card"
                ? "<small>MAX Card · " + escape(t.rarity) + "</small>"
                : t.title.trim().toLocaleLowerCase() ===
                    String(t.quizName || "")
                      .trim()
                      .toLocaleLowerCase()
                  ? ""
                  : "<small>" + escape(t.quizName) + "</small>") +
              '</span><input type="checkbox" name="' +
              (t.source === "card" ? "card" : "quiz") +
              '" value="' +
              escape(t.source === "card" ? t.card : t.quiz) +
              '" ' +
              (t.equipped ? "checked" : "") +
              "></label>",
          )
          .join("") +
        '</div><div class="form-error" role="alert"></div><button class="button mint" type="submit">Save Displayed Titles →</button></form>'
      : '<div class="notice space-top">No Earned Titles Yet. Reach MAX with a card or get a perfect quiz score to unlock a title.</div>')
  );
}
