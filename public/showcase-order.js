import { cardFrameClass, cardAura, enhancementBadge } from "./card-frames.js";
import { rarityClass } from "./card-display.js";
import { RARITIES } from "./card-values.js";

export function createShowcaseEditor({
  escape: e,
  cardBy,
  image,
  gradeBadge,
  series,
}) {
  let owner,
    original = [],
    order = [],
    levels = new Map(),
    sort = "custom";
  function open(profile, player) {
    if (!player || profile?.id !== player)
      throw Error("You can arrange only your own showcase.");
    owner = player;
    original = (profile.showcase || []).map((item) => item.card);
    order = [...original];
    levels = new Map(
      (profile.showcase || []).map((item) => [item.card, item.level]),
    );
    sort = "custom";
  }
  function move(card, position) {
    const index = order.indexOf(card);
    if (
      index < 0 ||
      !Number.isInteger(position) ||
      position < 0 ||
      position >= order.length
    )
      return false;
    order.splice(index, 1);
    order.splice(position, 0, card);
    sort = "custom";
    return true;
  }
  function sortBy(mode) {
    if (!["custom", "original", "rarity", "name", "level"].includes(mode))
      return;
    sort = mode;
    if (mode === "original") order = [...original];
    else if (mode !== "custom")
      order.sort((a, b) => {
        const first = cardBy(a),
          second = cardBy(b);
        return (
          (mode === "rarity"
            ? RARITIES.indexOf(second.rarity) - RARITIES.indexOf(first.rarity)
            : mode === "level"
              ? (levels.get(b) || 1) - (levels.get(a) || 1)
              : 0) ||
          first.name.localeCompare(second.name, "en", {
            numeric: true,
            sensitivity: "base",
          })
        );
      });
  }
  function payload(player) {
    if (!player || player !== owner)
      throw Error("Sign in to the same account before saving.");
    return { cards: [...order], expectedCards: [...original] };
  }
  function render() {
    const changed = order.some((card, i) => card !== original[i]);
    return `<h2>Arrange Showcase</h2><p>Set the order shown on your profile. Changes apply after you save.</p><form id="showcase-order-form"><label class="showcase-sort">Sort By<select id="showcase-sort">${[
      ["custom", "Custom Order"],
      ["rarity", "Rarity · Highest First"],
      ["name", "Name · A–Z"],
      ["level", "Enhancement · Highest First"],
      ["original", "Restore Saved Order"],
    ]
      .map(
        ([value, label]) =>
          `<option value="${value}" ${sort === value ? "selected" : ""}>${label}</option>`,
      )
      .join(
        "",
      )}</select></label><ol id="showcase-order-list" class="showcase-order-list">${order
      .map((id, index) => {
        const card = cardBy(id),
          name = e(card.name);
        return `<li class="showcase-order-row"><span class="showcase-order-portrait tier-${rarityClass(card.rarity)} ${cardFrameClass(levels.get(id))}">${cardAura(levels.get(id))}${image(card)}${gradeBadge(card)}</span><div class="showcase-order-name"><strong>${name}</strong><small>${e(series(card))} · ${enhancementBadge(levels.get(id))}</small></div><label class="showcase-position"><span class="sr-only">Position for ${name}</span><select data-showcase-position="${e(id)}" aria-label="Position for ${name}">${order.map((_, i) => `<option value="${i}" ${index === i ? "selected" : ""}>${i + 1}</option>`).join("")}</select></label><div class="showcase-move"><button type="button" class="button secondary" data-action="showcase-move" data-id="${e(id)}" data-position="${index - 1}" data-step="-1" aria-label="Move ${name} Earlier" ${index === 0 ? "disabled" : ""}>↑</button><button type="button" class="button secondary" data-action="showcase-move" data-id="${e(id)}" data-position="${index + 1}" data-step="1" aria-label="Move ${name} Later" ${index === order.length - 1 ? "disabled" : ""}>↓</button></div></li>`;
      })
      .join(
        "",
      )}</ol><div class="form-error" role="alert"></div><div class="showcase-order-footer"><button type="button" class="button secondary" data-close-dialog>Cancel</button><button type="submit" class="button mint" ${changed ? "" : "disabled"}>Save Order</button></div></form>`;
  }
  return { open, move, sortBy, payload, render };
}
