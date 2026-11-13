import { routeHref } from "./site-navigation.js";
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
  let pull = null,
    last = null,
    resultPage = 1;
  function show(result, pack) {
    pull = { result, pack };
    last = null;
    resultPage = 1;
    const best = [...result.cards].sort(
      (a, b) => rarityRank(a) - rarityRank(b),
    )[0];
    const tier = rarityClass(best?.rarity);
    modal(
      `<section class="pack-cinematic aura-${tier}">${motionControl()}<span class="eyebrow">${pack.special ? "SPECIAL BONUS PACK" : pack.daily ? "YOUR DAILY GIFT" : pack.premium ? "PREMIUM SUMMON" : "FIVE NEW POSSIBILITIES"}</span><h2>${pack.special ? "A Special Gift For You." : "A Little Light. A New Favourite."}</h2><button class="sealed-pack" data-action="reveal-pack" aria-label="Reveal your ${result.cards.length} cards"><span class="pack-seal">✦</span><span>AMQ TOURS<br><strong>GATCHA</strong></span><small>TAP TO REVEAL</small></button><p class="form-hint">${pack.special ? "Your 5 special cards (1 AG guaranteed!) are waiting." : `Your ${result.cards.length} cards are already safely in your collection.`}</p><button class="text-button" data-action="reveal-pack">Skip animation · show cards →</button></section>`,
      true,
    );
  }
  function reveal() {
    if (!pull) return;
    last = pull;
    pull = null;
    renderResults();
  }
  function renderResults() {
    const { result, pack } = last;
    const pages = Math.max(1, Math.ceil(result.cards.length / 20));
    resultPage = Math.min(pages, Math.max(1, resultPage));
    const shown = result.cards.slice((resultPage - 1) * 20, resultPage * 20);
    const price =
      getState().settings[
        (pack.premium ? "premium_" : "") + pack.kind + "_price"
      ] || (pack.premium ? 1000 : 500);
    modal(
      `<section class="pack-results">${motionControl()}<div class="pull-label">${pack.special ? "SPECIAL BONUS PACK" : pack.daily ? "DAILY PACK CLAIMED" : "YOUR NEWEST ADDITIONS"}</div><h2>Who Found Their Way to You?</h2><p>${result.cards.length === 5 ? "Five" : number(result.cards.length)} cards added. Duplicates are saved as extra copies.</p><div class="card-grid pull-reveal">${shown.map((c, i) => `<div class="pull-slot pull-${i}">${cardHTML(c, null, null, packCardActions(c.id, getState(), escape))}</div>`).join("")}</div>${pages > 1 ? `<div class="toolbar"><button type="button" class="button secondary" data-action="pack-reveal-page" data-delta="-1" ${resultPage <= 1 ? "disabled" : ""}>← Previous</button><span>Page ${resultPage} of ${pages}</span><button type="button" class="button secondary" data-action="pack-reveal-page" data-delta="1" ${resultPage >= pages ? "disabled" : ""}>Next →</button></div>` : ""}<div class="reveal-actions">${pack.special ? '<a class="button mint" href="' + routeHref("collection") + '" data-close-dialog>My Collection ↗</a><button type="button" class="button secondary" data-close-dialog>Continue</button>' : !pack.daily ? `<button class="button mint" data-action="pack" data-kind="${escape(pack.kind)}" data-premium="${!!pack.premium}" data-count="${pack.count || 1}">Open ${pack.count > 1 ? pack.count + " more packs" : "another pack"} · ✦ ${number(price * (pack.count || 1))}</button>` : '<a class="button mint" href="' + routeHref("packs") + '" data-close-dialog>Explore more packs ↗</a>'}<a class="button secondary" href="${routeHref("collection")}" data-close-dialog>My Collection ↗</a></div></section>`,
      true,
    );
  }
  return {
    show,
    reveal,
    turn: (delta) => {
      if (last) {
        resultPage += delta;
        renderResults();
      }
    },
  };
}
