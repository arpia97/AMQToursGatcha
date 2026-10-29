import { rarityRank, rarityClass } from "./card-display.js";

function cardActions(card, state) {
  const item = state.inventory?.find((i) => i.card === card);
  return [
    {
      action: "protect-toggle",
      pressed: !!item?.protected,
      label: item?.protected ? "🔒 Protected" : "♧ Protect",
      title: item?.protected ? "Unprotect this card" : "Protect this card",
      disabled: !item,
    },
    {
      action: "showcase-toggle",
      pressed: (state.showcase || []).includes(card),
      label: (state.showcase || []).includes(card)
        ? "★ Showcased"
        : "☆ Showcase",
      title: (state.showcase || []).includes(card)
        ? "Remove from showcase"
        : "Add to showcase",
      disabled: !item,
    },
  ];
}

export function packCardActions(card, state, escape) {
  return `<div class="pack-card-actions" data-pack-card="${escape(card)}">${cardActions(
    card,
    state,
  )
    .map(
      (a) =>
        `<button type="button" class="text-button" data-action="${a.action}" data-id="${escape(card)}" aria-pressed="${a.pressed}" title="${a.title}" ${a.disabled ? "disabled" : ""}>${a.label}</button>`,
    )
    .join("")}</div>`;
}

// Update every copy of a pulled card without replacing the card or its animation.
export function syncPackCardActions(root, state) {
  for (const group of root.querySelectorAll("[data-pack-card]")) {
    for (const action of cardActions(group.dataset.packCard, state)) {
      const button = group.querySelector(`[data-action="${action.action}"]`);
      button.textContent = action.label;
      button.setAttribute("aria-pressed", String(action.pressed));
      button.title = action.title;
      button.disabled = action.disabled;
    }
  }
}

// Cards have already been granted by the server. Revealing never purchases again.
export function createPackReveal({
  modal,
  cardHTML,
  escape,
  number,
  getState,
  motionControl = () => "",
}) {
  let pull = null;
  function show(result, pack) {
    pull = { result, pack };
    const best = [...result.cards].sort(
      (a, b) => rarityRank(a) - rarityRank(b),
    )[0];
    const tier = rarityClass(best?.rarity);
    modal(
      `<section class="pack-cinematic aura-${tier}">${motionControl()}<span class="eyebrow">${pack.daily ? "YOUR DAILY GIFT" : pack.premium ? "PREMIUM SUMMON" : "FIVE NEW POSSIBILITIES"}</span><h2>A Little Light. A New Favourite.</h2><button class="sealed-pack" data-action="reveal-pack" aria-label="Reveal your five cards"><span class="pack-seal">✦</span><span>AMQ TOURS<br><strong>GATCHA</strong></span><small>TAP TO REVEAL</small></button><p class="form-hint">Your five cards are already safely in your collection.</p><button class="text-button" data-action="reveal-pack">Skip animation · show cards →</button></section>`,
      true,
    );
  }
  function reveal() {
    if (!pull) return;
    const { result, pack } = pull;
    pull = null;
    const price =
      getState().settings[
        (pack.premium ? "premium_" : "") + pack.kind + "_price"
      ] || (pack.premium ? 1000 : 500);
    modal(
      `<section class="pack-results">${motionControl()}<div class="pull-label">${pack.daily ? "DAILY PACK CLAIMED" : "YOUR NEWEST ADDITIONS"}</div><h2>Who Found Their Way to You?</h2><p>Five cards added. Duplicates are saved as extra copies.</p><div class="card-grid pull-reveal">${result.cards.map((c, i) => `<div class="pull-slot pull-${i}">${cardHTML(c, null, null, packCardActions(c.id, getState(), escape))}</div>`).join("")}</div><div class="reveal-actions">${!pack.daily ? `<button class="button mint" data-action="pack" data-kind="${escape(pack.kind)}" data-premium="${!!pack.premium}">Open another pack · ✦ ${number(price)}</button>` : '<a class="button mint" href="#packs" data-close-dialog>Explore more packs ↗</a>'}<a class="button secondary" href="#collection" data-close-dialog>My Collection ↗</a></div></section>`,
      true,
    );
  }
  return { show, reveal };
}
