import { SPECIAL_PACK_DESCRIPTION } from "./pack-odds.js";
import { routeHref } from "./site-navigation.js";
import { rarityRank, rarityClass } from "./card-display.js";
import { collectorsButton } from "./card-collectors.js";
import { cardQuickActions } from "./card-quick-actions.js";

export function packCardActions(card, state, escape, options = {}) {
  const id = typeof card === "string" ? card : card.id;
  const cardObj = typeof card === "string" ? options.card || { id } : card;
  const isAutoSold = !!(typeof card === "object" && card.autoSold);
  const autoSoldBadge = isAutoSold
    ? card.autoSoldId
      ? `<button type="button" class="text-button pack-autosell-tag" data-action="pack-autosell-cancel" data-sale="${escape(card.autoSoldId)}" title="Restore this copy for its original ${escape(card.autoSoldPrice)} credit auto-sale">Cancel Auto-sell · −✦ ${escape(card.autoSoldPrice)}</button>`
      : `<span class="pack-autosell-tag">Auto-sold · +✦ ${escape(card.autoSoldPrice)}</span>`
    : "";
  return `<div class="pack-card-actions" data-pack-card="${escape(id)}"${isAutoSold ? ' data-auto-sold="1"' : ""}${card.autoSoldId ? ` data-auto-sold-id="${escape(card.autoSoldId)}"` : ""}>${autoSoldBadge}${collectorsButton(cardObj, escape)}${state.me ? cardQuickActions(cardObj, {
    wishlist: state.wishlist?.includes(id) ?? false,
    protect: !isAutoSold && !!state.inventory?.find(i => i.card === id)?.protected,
    showcase: !isAutoSold && !!state.showcase?.includes(id),
    favorite: state.cardFavorites?.includes(id) ?? false,
  }, escape, isAutoSold || !state.inventory?.some(i => i.card === id) ? ["protect", "showcase"] : []) : ""}</div>`;
}

// Update every copy of a pulled card without replacing the card or its animation.
export function syncPackCardActions(root, state) {
  for (const group of root.querySelectorAll("[data-pack-card]")) {
    const isAutoSold = group.dataset.autoSold === "1";
    const id = group.dataset.packCard;
    const owned = !isAutoSold && state.inventory?.find(item => item.card === id);
    for (const [action, pressed] of Object.entries({
      protect: !!owned?.protected,
      showcase: !!owned && !!state.showcase?.includes(id),
      wishlist: !!state.wishlist?.includes(id),
      favorite: !!state.cardFavorites?.includes(id),
    })) {
      const button = group.querySelector(`[data-action="${action}-toggle"]`);
      if (!button) continue;
      button.setAttribute("aria-pressed", String(pressed));
      if (action === "protect" || action === "showcase") button.disabled = !owned;
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
  const creditsLeftMarkup = (result) => {
    const remaining = result?.balance ?? getState().me?.balance;
    return typeof remaining === "number"
      ? `<p class="pack-credits-left">Credits left: <span class="money">✦ ${number(remaining)}</span></p>`
      : "";
  };
  const addedSummary = (result) => {
    const sold = result.autoSoldCount || 0;
    return sold > 0
      ? `${number(result.cards.length - sold)} of ${number(result.cards.length)} cards added to your collection. Duplicates are saved as extra copies.`
      : `${result.cards.length === 5 ? "Five" : number(result.cards.length)} cards added. Duplicates are saved as extra copies.`;
  };
  const autoSoldSummary = (result) => `Auto-sold <strong>${number(result.autoSoldCount)}</strong> card${result.autoSoldCount === 1 ? "" : "s"} below your Settings threshold for <strong>+✦ ${number(result.autoSoldCredits || 0)}</strong>.`;
  function show(result, pack) {
    pull = { result, pack };
    last = null;
    resultPage = 1;
    const best = [...result.cards].sort(
      (a, b) => rarityRank(a) - rarityRank(b),
    )[0];
    const tier = rarityClass(best?.rarity);
    modal(
      `<section class="pack-cinematic aura-${tier}">${motionControl()}<span class="eyebrow">${pack.special ? "SPECIAL BONUS PACK" : pack.paidSpecial ? "SPECIAL CARD PACK" : pack.daily ? "YOUR DAILY GIFT" : pack.premium ? "PREMIUM SUMMON" : "FIVE NEW POSSIBILITIES"}</span><h2>${pack.special ? "A Special Gift For You." : pack.paidSpecial ? "Special Card Pack" : "A Little Light. A New Favourite."}</h2><button class="sealed-pack" data-action="reveal-pack" aria-label="Reveal your ${result.cards.length} cards"><span class="pack-seal">✦</span><span>AMQ TOURS<br><strong>GATCHA</strong></span><small>TAP TO REVEAL</small></button><p class="form-hint">${pack.special ? "Your 5 special cards (1 AG guaranteed!) are waiting." : pack.paidSpecial ? SPECIAL_PACK_DESCRIPTION : result.autoSoldCount > 0 ? `${number(result.cards.length - result.autoSoldCount)} cards added to your collection · ${number(result.autoSoldCount)} auto-sold (+✦ ${number(result.autoSoldCredits)}).` : `Your ${result.cards.length} cards are already safely in your collection.`}</p>${creditsLeftMarkup(result)}<button class="text-button" data-action="reveal-pack">Skip animation · show cards →</button></section>`,
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
        (pack.paidSpecial ? "special_" : pack.premium ? "premium_" : "") + pack.kind + "_price"
      ] || (pack.paidSpecial ? 3000 : pack.premium ? 1000 : 500);
    const autoSoldCount = result.autoSoldCount || 0;
    const autoSoldNotice =
      autoSoldCount > 0
        ? `<p class="notice pack-autosell-summary">${autoSoldSummary(result)}</p>`
        : "";
    modal(
      `<section class="pack-results">${motionControl()}<div class="pull-label">${pack.special ? "SPECIAL BONUS PACK" : pack.daily ? "DAILY PACK CLAIMED" : "YOUR NEWEST ADDITIONS"}</div><h2>Who Found Their Way to You?</h2><p data-pack-added-summary>${addedSummary(result)}</p>${creditsLeftMarkup(result)}${autoSoldNotice}<div class="card-grid pull-reveal">${shown.map((c, i) => `<div class="pull-slot pull-${i}">${cardHTML(c, null, null, packCardActions(c, getState(), escape), { packResult: true })}</div>`).join("")}</div>${pages > 1 ? `<div class="toolbar"><button type="button" class="button secondary" data-action="pack-reveal-page" data-delta="-1" ${resultPage <= 1 ? "disabled" : ""}>← Previous</button><span>Page ${resultPage} of ${pages}</span><button type="button" class="button secondary" data-action="pack-reveal-page" data-delta="1" ${resultPage >= pages ? "disabled" : ""}>Next →</button></div>` : ""}<div class="reveal-actions">${pack.special ? '<a class="button mint" href="' + routeHref("collection") + '" data-close-dialog>My Collection ↗</a><button type="button" class="button secondary" data-close-dialog>Continue</button>' : !pack.daily ? `<button class="button mint" data-action="pack" data-kind="${escape(pack.kind)}" data-premium="${!!pack.premium}" data-count="${pack.count || 1}"${pack.paidSpecial?' data-special="true"':''}>Open ${pack.count > 1 ? pack.count + " more packs" : "another pack"} · ✦ ${number(price * (pack.count || 1))}</button>` : '<a class="button mint" href="' + routeHref("packs") + '" data-close-dialog>Explore more packs ↗</a>'}<a class="button secondary" href="${routeHref("collection")}" data-close-dialog>My Collection ↗</a></div></section>`,
      true,
    );
  }
  return {
    show,
    reveal,
    cancelAutoSale: (sale, root) => {
      const result = last?.result;
      const card = result?.cards.find((c) => c.autoSoldId === sale && c.autoSold);
      if (!card) return;
      card.autoSold = false;
      result.autoSoldCount = Math.max(0, (result.autoSoldCount || 0) - 1);
      result.autoSoldCredits = Math.max(0, (result.autoSoldCredits || 0) - card.autoSoldPrice);
      result.balance = getState().me?.balance;
      // Keep the current page, hover/touch state and reveal animations intact.
      for (const group of root.querySelectorAll("[data-auto-sold-id]")) {
        if (group.dataset.autoSoldId !== sale) continue;
        delete group.dataset.autoSold;
        group.querySelector('[data-action="pack-autosell-cancel"]')?.remove();
      }
      syncPackCardActions(root, getState());
      const added = root.querySelector("[data-pack-added-summary]");
      if (added) added.textContent = addedSummary(result);
      const notice = root.querySelector(".pack-autosell-summary");
      if (notice) {
        if (result.autoSoldCount) notice.innerHTML = autoSoldSummary(result);
        else notice.remove();
      }
      const balance = root.querySelector(".pack-credits-left .money");
      if (balance) balance.textContent = `✦ ${number(result.balance)}`;
    },
    turn: (delta) => {
      if (last) {
        resultPage += delta;
        renderResults();
      }
    },
  };
}
