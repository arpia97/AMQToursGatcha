import { rarityRank, rarityClass } from "./card-display.js";

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
      `<section class="pack-results">${motionControl()}<div class="pull-label">${pack.daily ? "DAILY PACK CLAIMED" : "YOUR NEWEST ADDITIONS"}</div><h2>Who Found Their Way to You?</h2><p>Five cards added. Duplicates are saved as extra copies.</p><div class="card-grid pull-reveal">${result.cards.map((c, i) => `<div class="pull-slot pull-${i}">${cardHTML(c)}</div>`).join("")}</div><div class="reveal-actions">${!pack.daily ? `<button class="button mint" data-action="pack" data-kind="${escape(pack.kind)}" data-premium="${!!pack.premium}">Open another pack · ✦ ${number(price)}</button>` : '<a class="button mint" href="#packs" data-close-dialog>Explore more packs ↗</a>'}<a class="button secondary" href="#collection" data-close-dialog>My Collection ↗</a></div></section>`,
      true,
    );
  }
  return { show, reveal };
}
