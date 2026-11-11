import {
  instantSalePrice,
  levelLabel,
  cardInvestment,
} from "./card-values.js";

export function listingModalHTML({
  card,
  item,
  venue = "shop",
  variant,
  escape = (s) => String(s),
  number = (n) => String(n),
  quantityInput,
}) {
  const c = card;
  const currentVenue = ["shop", "auction", "trade", "store"].includes(venue)
    ? venue
    : "shop";
  const chosenVariant = variant || (item.copies > 1 ? "extra" : "card");
  const level = chosenVariant === "extra" ? 1 : item.level;
  const price = instantSalePrice(c, level);

  const tabs =
    `<div class="tabs listing-venues" role="group" aria-label="Listing type">` +
    `<button class="tab ${currentVenue === "shop" ? "active" : ""}" data-action="listing-venue" data-id="${escape(c.id)}" data-venue="shop">Marketplace</button>` +
    `<button class="tab ${currentVenue === "auction" ? "active" : ""}" data-action="listing-venue" data-id="${escape(c.id)}" data-venue="auction">Auction</button>` +
    `<button class="tab ${currentVenue === "trade" ? "active" : ""}" data-action="listing-venue" data-id="${escape(c.id)}" data-venue="trade">Trade</button>` +
    `<button class="tab ${currentVenue === "store" ? "active" : ""}" data-action="listing-venue" data-id="${escape(c.id)}" data-venue="store">Sell to Store</button>` +
    `</div>`;

  const copySelect = (label) =>
    `<label>${label}<select name="variant">` +
    (item.copies > 1
      ? `<option value="extra" ${chosenVariant === "extra" ? "selected" : ""}>Extra copy · Lv. 1</option>`
      : "") +
    `<option value="card" ${chosenVariant === "card" ? "selected" : ""}>Your card · ${levelLabel(item.level)}</option>` +
    `</select></label>`;

  let heading = "";
  let form = "";

  if (currentVenue === "store") {
    heading = `<h2>Sell to Store</h2><p>Receive <strong class="money">✦ ${number(price)} credits</strong> immediately. This consumes the selected copy permanently.</p>`;
    form =
      `<form id="instant-sell-form" class="stack">` +
      `<input type="hidden" name="card" value="${escape(c.id)}">` +
      `<input type="hidden" name="expectedPrice" value="${price}">` +
      `<input type="hidden" name="expectedRarity" value="${escape(c.rarity || "Pending")}">` +
      `<input type="hidden" name="expectedLevel" value="${level}">` +
      copySelect("Copy to sell") +
      `<p class="form-hint">50% of the shop rarity price for ${escape(c.rarity || "Pending")} × ${number(cardInvestment(level))} invested card${level === 1 ? "" : "s"}. ${chosenVariant === "card" && item.copies > 1 ? "Any remaining extra copies become Lv. 1." : ""} Pending uses the D price. Sale proceeds do not increase Cumulative earned credits.</p>` +
      `<div class="form-error" role="alert"></div>` +
      `<button class="button full" type="submit">Sell permanently for ✦ ${number(price)}</button>` +
      `</form>`;
  } else if (currentVenue === "trade") {
    heading = `<h2>List for Trade</h2><p>${escape(c.name)} · your enhanced card keeps its level.</p>`;
    form =
      `<form id="listing-form" class="stack">` +
      `<input name="card" type="hidden" value="${escape(c.id)}">` +
      `<input name="venue" type="hidden" value="trade">` +
      copySelect("Copy to trade") +
      `<p class="form-hint">The listed copy is held securely until traded or cancelled. Extra copies left behind become Lv. 1 if you list your enhanced card.</p>` +
      `<p class="form-hint">Other players can make offers which you can review, accept, or decline at any time. Enhancement levels transfer.</p>` +
      `<div class="form-error" role="alert"></div>` +
      `<button class="button full mint" type="submit">List for trade →</button>` +
      `</form>`;
  } else if (currentVenue === "auction") {
    heading = `<h2>Start an Auction</h2><p>${escape(c.name)} · your enhanced card keeps its level.</p>`;
    const durationInput = quantityInput
      ? quantityInput({
          id: "auction-hours",
          name: "hours",
          label: "Duration in Hours (Max 7 Days)",
          min: 1,
          max: 168,
          value: 72,
        })
      : '<label>Duration in Hours (Max 7 Days)<input id="auction-hours" name="hours" type="number" min="1" max="168" value="72"></label>';
    form =
      `<form id="listing-form" class="stack">` +
      `<input name="card" type="hidden" value="${escape(c.id)}">` +
      `<input name="venue" type="hidden" value="auction">` +
      copySelect("Copy to sell") +
      `<label>Minimum opening bid<input name="price" type="number" min="1" max="1000000" step="1" value="500" required></label>` +
      `<div class="auction-fields">${durationInput}<label>Optional buyout price<input name="buyout" type="number" min="1" max="1000000" step="1" placeholder="No buyout"></label></div>` +
      `<p class="form-hint">Buyout must be at least the opening bid. You can withdraw until the first bid.</p>` +
      `<p class="form-hint">The listed copy is held securely. Extra copies left behind become Lv. 1 if you list your enhanced card.</p>` +
      `<div class="form-error" role="alert"></div>` +
      `<button class="button full" type="submit">Start auction →</button>` +
      `</form>`;
  } else {
    // venue === "shop"
    heading = `<h2>List on the Marketplace</h2><p>${escape(c.name)} · your enhanced card keeps its level.</p>`;
    form =
      `<form id="listing-form" class="stack">` +
      `<input name="card" type="hidden" value="${escape(c.id)}">` +
      `<input name="venue" type="hidden" value="shop">` +
      copySelect("Copy to sell") +
      `<label>Selling price<input name="price" type="number" min="1" max="1000000" step="1" value="500" required></label>` +
      `<p class="form-hint">One fixed price, no timer. Withdraw any time before it sells.</p>` +
      `<p class="form-hint">The listed copy is held securely. Extra copies left behind become Lv. 1 if you list your enhanced card.</p>` +
      `<div class="form-error" role="alert"></div>` +
      `<button class="button full" type="submit">List at fixed price →</button>` +
      `</form>`;
  }

  return `<section class="listing-panel"><header class="listing-heading">${heading}</header>${tabs}<div class="listing-content">${form}</div></section>`;
}
