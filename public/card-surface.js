import { cardFrameClass, cardAura } from "./card-frames.js";
import { levelLabel } from "./card-values.js";
import { rarityClass } from "./card-display.js";

// Two-state presentation inspired by suleymanlaarabidev's Uiverse card.
// Keep all clipping inside the frame so enhancement halos remain untouched.
export function cardSurface(c, options, h) {
  const { escape: e, image, gradeBadge, series } = h;
  const flags = h.cardFlags?.(c) || {};
  const {
    level = 1,
    showLevel = false,
    tag = "",
    actions = "",
    details = "",
    meta = "",
    className = "",
    protectedCard = flags.protectedCard || false,
    wishlisted = flags.wishlisted || false,
    forTrade = flags.forTrade || false,
  } = options;
  const interactive = !!actions;
  const identity = `<div class="card-name" title="${e(c.name)}">${e(c.name)}</div><div class="card-series" title="${e(series(c))}">${e(series(c))}</div>`;
  const icons =
    protectedCard || wishlisted || forTrade
      ? '<div class="card-state-icons">' +
        (wishlisted
          ? '<span class="card-state-heart" role="img" aria-label="Wishlisted" title="Wishlisted">♥</span>'
          : "") +
        (protectedCard
          ? '<span class="card-state-lock" role="img" aria-label="Protected" title="Protected">🔒</span>'
          : "") +
        (forTrade
          ? '<span class="card-state-trade" role="img" aria-label="For Trade" title="For Trade">⚖️</span>'
          : "") +
        "</div>"
      : "";
  return `<article class="collect-card card-surface tier-${rarityClass(c.rarity)} ${cardFrameClass(level)} ${className} ${showLevel ? "has-card-level" : ""}" data-card-surface="${e(c.id)}" ${interactive ? 'data-card-interactive tabindex="0" aria-label="Card Actions for ' + e(c.name) + '"' : ""}><div class="card-surface-stage"><div class="portrait">${image(c)}${gradeBadge(c)}${tag ? `<span class="card-tag">${e(tag)}</span>` : ""}${showLevel ? `<span class="level-tag">${levelLabel(level)}</span>` : ""}</div><div class="card-front">${identity}${meta ? `<div class="card-front-meta">${meta}</div>` : ""}</div>${interactive ? `<div class="card-back" inert><div class="card-body">${details}<div class="card-action-content">${actions}</div></div></div>` : ""}${icons}</div>${cardAura(level)}</article>`;
}

// Hover/focus and touch share the same presentation. A first tap can only
// reveal the controls; it can never submit an action that appears under it.
export function installCardSurfaces(root) {
  const states = new WeakMap();
  const stateFor = (card) => {
    if (!states.has(card)) states.set(card, {});
    return states.get(card);
  };
  const surface = (target) => target?.closest?.("[data-card-interactive]");
  const update = (card) => {
    const s = stateFor(card),
      open = !s.dismissed && !!(s.hover || s.focus || s.pinned);
    card.classList.toggle("is-revealed", open);
    card.querySelector(".card-back").inert = !open;
  };
  const dismiss = (card) => {
    const s = stateFor(card);
    s.pinned = s.hover = s.focus = false;
    s.dismissed = true;
    update(card);
  };
  root.addEventListener("pointerover", (event) => {
    const card = surface(event.target);
    if (
      !card ||
      card.contains(event.relatedTarget) ||
      event.pointerType === "touch"
    )
      return;
    Object.assign(stateFor(card), { hover: true, dismissed: false });
    update(card);
  });
  root.addEventListener("pointerout", (event) => {
    const card = surface(event.target);
    if (!card || card.contains(event.relatedTarget)) return;
    stateFor(card).hover = false;
    update(card);
  });
  root.addEventListener("focusin", (event) => {
    const card = surface(event.target);
    if (!card || !event.target.matches?.(":focus-visible")) return;
    Object.assign(stateFor(card), { focus: true, dismissed: false });
    update(card);
  });
  root.addEventListener("focusout", (event) => {
    const card = surface(event.target);
    if (!card || card.contains(event.relatedTarget)) return;
    stateFor(card).focus = false;
    update(card);
  });
  root.addEventListener(
    "pointerdown",
    (event) => {
      const card = surface(event.target);
      if (card) {
        stateFor(card).pointerType = event.pointerType;
        stateFor(card).touchClosed =
          event.pointerType === "touch" &&
          !card.classList.contains("is-revealed");
      }
    },
    true,
  );
  root.addEventListener(
    "click",
    (event) => {
      const card = surface(event.target);
      for (const other of root.querySelectorAll(
        "[data-card-interactive].is-revealed",
      ))
        if (other !== card) dismiss(other);
      if (!card) return;
      const s = stateFor(card);
      if (s.touchClosed) {
        s.touchClosed = false;
        s.pinned = true;
        s.dismissed = false;
        update(card);
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      if (event.target.closest?.("button,a,input,select,textarea,label"))
        return;
      if (s.pointerType === "mouse") return;
      s.pinned = !s.pinned;
      s.dismissed = !s.pinned;
      update(card);
    },
    true,
  );
  root.addEventListener(
    "keydown",
    (event) => {
      const card = surface(event.target);
      if (!card) return;
      if (event.key === "Escape" && card.classList.contains("is-revealed")) {
        event.preventDefault();
        event.stopPropagation();
        card.focus({ preventScroll: true });
        dismiss(card);
      } else if (event.target === card && ["Enter", " "].includes(event.key)) {
        event.preventDefault();
        Object.assign(stateFor(card), { pinned: true, dismissed: false });
        update(card);
        card
          .querySelector("button:not([disabled]),a[href]")
          ?.focus({ preventScroll: true });
      }
    },
    true,
  );
  return {
    capture(container) {
      return [
        ...container.querySelectorAll("[data-card-interactive].is-revealed"),
      ].map((card) => ({
        id: card.dataset.cardSurface,
        ...stateFor(card),
        action: card.contains(root.activeElement)
          ? root.activeElement?.dataset.action
          : null,
      }));
    },
    restore(container, saved) {
      for (const value of saved) {
        const card = [
          ...container.querySelectorAll("[data-card-interactive]"),
        ].find((c) => c.dataset.cardSurface === value.id);
        if (!card) continue;
        states.set(card, { ...value });
        update(card);
        if (value.action)
          [...card.querySelectorAll("[data-action]")]
            .find((b) => b.dataset.action === value.action)
            ?.focus({ preventScroll: true });
      }
    },
  };
}

export function syncCardFlags(root, flagsBy) {
  const cards = root?.matches?.(".card-surface")
    ? [root]
    : root?.querySelectorAll?.(".card-surface") || [];
  for (const card of cards) {
    const flags = flagsBy({ id: card.dataset.cardSurface });
    for(const button of card.querySelectorAll?.('[data-action="trade-toggle"]') || []) {
      button.disabled=!!flags.protectedCard;
      button.setAttribute("aria-pressed",String(!!flags.forTrade));
      button.classList.toggle("is-selected",!!flags.forTrade);
      button.textContent=flags.forTrade?"⚖️ For Trade":"⚖️ Trade";
      button.title=flags.protectedCard?"Unprotect this card before trading":flags.forTrade?"Remove trade marker":"Mark willing to trade or sell";
    }
    const stage = card.querySelector(".card-surface-stage");
    if (!stage) continue;
    stage.querySelector(".card-state-icons")?.remove();
    if (flags.protectedCard || flags.wishlisted || flags.forTrade)
      stage.insertAdjacentHTML(
        "beforeend",
        '<div class="card-state-icons">' +
          (flags.wishlisted
            ? '<span class="card-state-heart" role="img" aria-label="Wishlisted" title="Wishlisted">♥</span>'
            : "") +
          (flags.protectedCard
            ? '<span class="card-state-lock" role="img" aria-label="Protected" title="Protected">🔒</span>'
            : "") +
          (flags.forTrade
            ? '<span class="card-state-trade" role="img" aria-label="For Trade" title="For Trade">⚖️</span>'
            : "") +
          "</div>",
      );
  }
}
