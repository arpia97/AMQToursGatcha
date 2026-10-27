import { PICKEM_WINDOW, defaultReward } from "./site-defaults.js";
export function deadlineFields(name, label, now = Date.now()) {
  const time = now + PICKEM_WINDOW;
  const value = new Date(time - new Date(time).getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
  return `<div class="deadline-fields"><label class="check-label"><input type="checkbox" name="${name}Automatic" data-deadline-target="${name}" checked> 10 minutes after publishing</label><label>${label}<input name="${name}" type="datetime-local" value="${value}" disabled required></label><p class="form-hint">Uncheck to choose a specific deadline in your browser’s local time.</p></div>`;
}
export function updateRewardDefaults(form) {
  const category = form.elements.namedItem("reason").value;
  const games = form.elements.namedItem("games");
  const perGame = ["reporting", "counting"].includes(category);
  games.disabled = !perGame;
  form.querySelector(".reporting-games").hidden = !perGame;
  const caption = form.querySelector(".reward-games-label");
  if (caption)
    caption.textContent =
      category === "counting" ? "Games counted" : "Games reported";
  form.elements.namedItem("amount").value =
    defaultReward(category, Number(games.value) || 1) ?? 500;
}
