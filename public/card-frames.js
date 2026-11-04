import { MAX_CARD_LEVEL, levelLabel } from "./card-values.js";
export function frameLevel(level = 1) {
  return Number.isInteger(level)
    ? Math.max(1, Math.min(MAX_CARD_LEVEL, level))
    : 1;
}
export function cardFrameClass(level = 1) {
  return "enhancement-frame enhancement-level-" + frameLevel(level);
}
export function cardAura(level = 1) {
  return frameLevel(level) > 1
    ? '<span class="frame-aura" aria-hidden="true"></span><span class="frame-aura frame-aura-soft" aria-hidden="true"></span>'
    : "";
}
export function enhancementBadge(level = 1) {
  const value = frameLevel(level);
  return (
    '<span class="enhancement-badge enhancement-level-' +
    value +
    '">' +
    levelLabel(value) +
    "</span>"
  );
}
