import { cardFrameClass, cardAura } from "./card-frames.js";
import { levelLabel } from "./card-values.js";
import { rarityClass } from "./card-display.js";

// Two-state presentation inspired by suleymanlaarabidev's Uiverse card.
// Keep all clipping inside the frame so enhancement halos remain untouched.
export function cardSurface(c, options, h) {
  const { escape: e, image, gradeBadge, series } = h;
  const {
    level = 1,
    showLevel = false,
    tag = "",
    actions = "",
    details = "",
    meta = "",
    className = "",
  } = options;
  const interactive = !!actions;
  const identity = `<div class="card-name" title="${e(c.name)}">${e(c.name)}</div><div class="card-series" title="${e(series(c))}">${e(series(c))}</div>`;
  return `<article class="collect-card card-surface tier-${rarityClass(c.rarity)} ${cardFrameClass(level)} ${className}" data-card-surface="${e(c.id)}"><div class="card-surface-stage"><div class="portrait">${image(c)}${gradeBadge(c)}${tag ? `<span class="card-tag">${e(tag)}</span>` : ""}${showLevel ? `<span class="level-tag">${levelLabel(level)}</span>` : ""}</div><div class="card-front">${identity}${meta ? `<div class="card-front-meta">${meta}</div>` : ""}</div>${interactive ? `<button type="button" class="card-actions-toggle" data-card-toggle aria-expanded="false" aria-label="Actions for ${e(c.name)}" title="Show card actions"><span aria-hidden="true">•••</span></button><div class="card-back"><div class="card-body"><header class="card-back-heading">${identity}</header>${details}<div class="card-action-content">${actions}</div></div></div>` : ""}</div>${cardAura(level)}</article>`;
}

// Event delegation also covers packs, pickers and newly rendered pages.
// Opening a surface is local presentation only: never dispatch a card action.
export function installCardSurfaces(root) {
  const states = new WeakMap();
  const stateFor = (card) => {
    if (!states.has(card)) states.set(card, {});
    return states.get(card);
  };
  const update = (card) => {
    const s = stateFor(card);
    const open = !s.dismissed && !!(s.hover || s.focus || s.pinned);
    card.classList.toggle("is-revealed", open);
    const toggle = card.querySelector("[data-card-toggle]");
    toggle?.setAttribute("aria-expanded", String(open));
    if (toggle) toggle.title = open ? "Hide card actions" : "Show card actions";
  };
  const surface = (target) =>
    target?.closest?.(".card-surface:has([data-card-toggle])");
  root.addEventListener("pointerover", (event) => {
    const card = surface(event.target);
    if (
      !card ||
      card.contains(event.relatedTarget) ||
      event.pointerType === "touch"
    )
      return;
    const s = stateFor(card);
    s.hover = true;
    s.dismissed = false;
    update(card);
  });
  root.addEventListener("pointerout", (event) => {
    const card = surface(event.target);
    if (!card || card.contains(event.relatedTarget)) return;
    const s = stateFor(card);
    s.hover = false;
    s.dismissed = false;
    update(card);
  });
  root.addEventListener("focusin", (event) => {
    const card = surface(event.target);
    if (!card) return;
    const s = stateFor(card);
    s.focus = true;
    s.dismissed = false;
    update(card);
  });
  root.addEventListener("focusout", (event) => {
    const card = surface(event.target);
    if (!card || card.contains(event.relatedTarget)) return;
    const s = stateFor(card);
    s.focus = false;
    s.dismissed = false;
    update(card);
  });
  root.addEventListener("click", (event) => {
    const toggle = event.target.closest?.("[data-card-toggle]");
    if (toggle) {
      const card = surface(toggle),
        s = stateFor(card);
      s.pinned = !s.pinned;
      s.dismissed = !s.pinned;
      update(card);
    }
    for (const card of root.querySelectorAll(".card-surface.is-revealed")) {
      if (card.contains(event.target)) continue;
      const s = stateFor(card);
      s.pinned = s.focus = s.hover = false;
      update(card);
    }
  });
  root.addEventListener(
    "keydown",
    (event) => {
      const card = surface(event.target);
      if (event.key !== "Escape" || !card?.classList.contains("is-revealed"))
        return;
      event.preventDefault();
      event.stopPropagation();
      const s = stateFor(card);
      s.pinned = false;
      // Move focus out of the disappearing panel, then suppress the focus reveal.
      card.querySelector("[data-card-toggle]")?.focus({ preventScroll: true });
      s.dismissed = true;
      update(card);
    },
    true,
  );
  return {
    // Preserve the open card and panel position through protect/showcase updates.
    capture(container) {
      return [...container.querySelectorAll(".card-surface.is-revealed")].map(
        (card) => ({
          id: card.dataset.cardSurface,
          ...stateFor(card),
          scroll: card.querySelector(".card-back")?.scrollTop || 0,
          action: card.contains(root.activeElement)
            ? root.activeElement?.dataset.action
            : null,
        }),
      );
    },
    restore(container, saved) {
      for (const value of saved) {
        const card = [...container.querySelectorAll(".card-surface")].find(
          (c) => c.dataset.cardSurface === value.id,
        );
        if (!card?.querySelector("[data-card-toggle]")) continue;
        states.set(card, { ...value });
        update(card);
        card.querySelector(".card-back").scrollTop = value.scroll;
        if (value.action)
          [...card.querySelectorAll("[data-action]")]
            .find((b) => b.dataset.action === value.action)
            ?.focus({ preventScroll: true });
      }
    },
  };
}
