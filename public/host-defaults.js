import {
  PICKEM_WINDOW,
  PICKEM_REOPEN_WINDOW,
  defaultReward,
} from "./site-defaults.js";
export function deadlineFields(name, label, now = Date.now()) {
  const time = now + PICKEM_WINDOW;
  const value = new Date(time - new Date(time).getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
  return `<div class="deadline-fields"><label class="check-label"><input type="checkbox" name="${name}Automatic" data-deadline-target="${name}" checked> ${PICKEM_WINDOW / 60000} minutes after publishing</label><label>${label}<input name="${name}" type="datetime-local" value="${value}" disabled required></label><p class="form-hint">Uncheck to choose a specific deadline in your browser’s local time.</p></div>`;
}
export function updateRewardDefaults(form) {
  const category = form.elements.namedItem("reason").value;
  const note = form.elements.namedItem("note");
  if (note)
    note.placeholder = {
      reporting: "Tour reporting",
      counting: "Tour counting",
      participation: "Tour participation",
      other: "Host credit reward",
    }[category];
  const games = form.elements.namedItem("games");
  const perGame = ["reporting", "counting"].includes(category);
  games.disabled = !perGame;
  form.querySelector(".reporting-games").hidden = !perGame;
  const caption = form.querySelector(".reward-games-label");
  if (caption)
    caption.textContent =
      category === "counting" ? "Rounds counted" : "Games reported";
  form.elements.namedItem("amount").value =
    defaultReward(category, Number(games.value) || 1) ?? 500;
}

export function reopenPickemForm(p, now = Date.now()) {
  if (p.settled || p.ends > now) return "";
  return (
    '<section class="pickem-reopen space-top"><h3>Reopen Voting</h3><p class="form-hint">Keep existing picks and let players submit or change their picks.</p><form id="reopen-pickem" class="stack"><label>Reopen for (minutes)<input name="minutes" type="number" min="1" max="129600" step="1" value="' +
    PICKEM_REOPEN_WINDOW / 60000 +
    '" required></label><button type="submit" class="button mint">Reopen Voting →</button></form></section>'
  );
}
