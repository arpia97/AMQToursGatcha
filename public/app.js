import { countdownText, nextDailyReset, nextWeeklyReset } from "./countdown.js";
import { createWorkshop } from "./workshop-ui.js";
import { instantSalePrice, cardInvestment } from "./card-values.js";
import { createPackReveal } from "./pack-reveal.js";
import { createFeatures } from "./features.js";
import {
  seriesTitle,
  rarityClass,
  popularityLabel,
  collectionView,
  collectionPage,
} from "./card-display.js";
const $ = (s) => document.querySelector(s);
let titleMode = "romaji";
try {
  if (localStorage.getItem("amqtours-title-mode") === "english")
    titleMode = "english";
} catch {}
const series = (c) => seriesTitle(c, titleMode);
const gradeBadge = (c) =>
  `<span class="grade-badge grade-${rarityClass(c.rarity)}" title="${escape(popularityLabel(c))}">${escape(c.rarity || "Pending")}</span>`;
const escape = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const number = (n) => Number(n || 0).toLocaleString("en-US");
const svg = (body) =>
  `<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
const icons = {
  home: '<path d="m3 10 9-7 9 7v10H3z"/><path d="M9 20v-7h6v7"/>',
  collection:
    '<rect x="6" y="5" width="13" height="16" rx="2"/><path d="M15 2H4v15m6-4 2-3 2 3-2 3z"/>',
  packs: '<path d="m12 3 9 5-9 5-9-5zM3 8v9l9 5 9-5V8M12 13v9m-5-17 10 5"/>',
  auctions: '<path d="m12 3 7 7-4 4-7-7zM2 18l9-9m1 11h10m-8-4h6v4"/>',
  pickems: '<path d="M4 4h16v16H4zM8 2v4m8-4v4M4 9h16m-12 5 3 3 5-5"/>',
  ranks:
    '<path d="M8 3h8v5c0 6-8 6-8 0zM8 5H4v3c0 3 4 3 4 3m8-6h4v3c0 3-4 3-4 3m-4 2v6m-5 2h10"/>',
  arcade:
    '<path d="M7 7h10l4 10c1 3-2 4-4 2l-3-3h-4l-3 3c-2 2-5 1-4-2zM6 11h5m-2.5-2.5v5m7-2h.01m2 2h.01"/>',
};
icons.fusion =
  '<path d="m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3zM3 3l3 3m12 12 3 3"/>';
icons.shop = '<path d="M3 9h18l-2-6H5zM5 9v12h14V9M9 21v-7h6v7"/>';
icons.players =
  '<circle cx="10" cy="8" r="4"/><path d="M3 21v-3a7 7 0 0 1 11-5m3 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6m2 5 3 3"/>';
const routes = [
  ["home", "Overview"],
  ["collection", "My collection"],
  ["fusion", "Card fusion"],
  ["packs", "Card packs"],
  ["shop", "Shop"],
  ["auctions", "Auctions"],
  ["pickems", "Pick’ems"],
  ["players", "Players"],
  ["arcade", "Gambling"],
  ["ranks", "Rankings"],
];
let heroCards = null,
  clockOffset = 0;
const handledDeadlines = new Set();
const shownWins = new Set();
let state,
  tab = "character",
  search = "",
  demo = null,
  busy = false,
  toastTimer,
  profileData = null,
  profileResults = [],
  searchTimer;
const ui = {
  filters: { rarity: "", role: "" },
  catalogSort: "name",
  collectionSort: "rarity",
  collectionPage: 1,
  collectionFilters: { rarity: "", role: "" },
  playerPage: 1,
  playerData: null,
  tab: () => tab,
  metric: "earned",
  rankPage: 1,
  rankData: null,
  pickemPage: 1,
  pickemData: null,
  marketPage: 1,
  marketData: null,
};
let loadVersion = 0;
const pendingMutations = new Map();
const cardCache = new Map();
let catalogPageData = null,
  catalogPageNumber = 1;
function rememberCards(cards = []) {
  for (const c of cards) cardCache.set(c.id, c);
  while (cardCache.size > 5000) cardCache.delete(cardCache.keys().next().value);
}
const isDemo =
  new URLSearchParams(location.search).has("demo") ||
  location.hostname.endsWith(".github.io");
const page = () =>
  location.hash.startsWith("#player/")
    ? "profile"
    : routes.some((r) => r[0] === location.hash.slice(1))
      ? location.hash.slice(1)
      : "home";
const rarity = (level) =>
  level >= 10 ? 5 : level >= 6 ? 4 : level >= 4 ? 3 : level >= 2 ? 2 : 1;
const profileURL = (id) => "#player/" + encodeURIComponent(id);
const cardBy = (id) =>
  cardCache.get(id) ||
  state.catalog.find((c) => c.id === id) || {
    id,
    name: "Archived card",
    kind: "character",
    series: "",
    image: "",
  };
const image = (c) =>
  c.image
    ? `<img class="${c.id?.startsWith("acdb-") ? "acdb-portrait" : ""}" src="${escape(c.image)}" alt="${escape(c.name)}" loading="lazy" referrerpolicy="no-referrer">`
    : `<div class="fallback-img" aria-label="No image">✦</div>`;
function toast(message, error = false) {
  clearTimeout(toastTimer);
  $("#toast").textContent = message;
  $("#toast").className = `visible${error ? " error" : ""}`;
  toastTimer = setTimeout(() => ($("#toast").className = ""), 5500);
}
function modal(html, wide = false) {
  $("#modal").className = wide ? "wide" : "";
  $("#modal-body").innerHTML = html;
  $("#modal").showModal();
}
function empty(title, description, button = "") {
  return `<div class="empty"><div class="empty-icon">✦</div><h3>${title}</h3><p>${description}</p>${button}</div>`;
}
function intro(title, description, extra = "") {
  return `<div class="page-intro"><div><h1>${title}</h1><p>${description}</p></div>${extra}</div>`;
}
const btn = (label, action, extra = "", cls = "") =>
  `<button class="button ${cls}" data-action="${action}" ${extra}>${label}</button>`;
function countdown(end, prefix = "", days = true, ended = "Ended") {
  return (
    '<span class="countdown" data-countdown-end="' +
    Number(end) +
    '" data-countdown-prefix="' +
    escape(prefix) +
    '" data-countdown-days="' +
    days +
    '" data-countdown-ended="' +
    escape(ended) +
    '">' +
    (end <= Date.now() + clockOffset
      ? ended
      : prefix + countdownText(end, Date.now() + clockOffset, days)) +
    "</span>"
  );
}
function remaining(end) {
  return countdown(end);
}
function tickCountdowns() {
  if (!state) return;
  const now = Date.now() + clockOffset;
  let expired = false;
  for (const el of document.querySelectorAll("[data-countdown-end]")) {
    const end = Number(el.dataset.countdownEnd);
    el.textContent =
      now >= end
        ? el.dataset.countdownEnded
        : el.dataset.countdownPrefix +
          countdownText(end, now, el.dataset.countdownDays === "true");
    if (now >= end && end > state.now && !handledDeadlines.has(end)) {
      handledDeadlines.add(end);
      expired = true;
    }
  }
  if (
    expired &&
    !busy &&
    !document.hidden &&
    !$("#modal").open &&
    !workshop.pickerOpen()
  )
    refresh().catch(() => {});
}
setInterval(() => {
  tickCountdowns();
  showAuctionWin();
}, 1000);
function revealAcquired(result, title = "A new favourite is yours.") {
  const c = result.cards?.[0];
  if (!c) {
    if ($("#modal").open) $("#modal").close();
    toast(result.message);
    return;
  }
  modal(
    '<section class="pack-results acquisition"><div class="pull-label">ADDED TO YOUR COLLECTION</div><h2>' +
      escape(title) +
      "</h2><p>" +
      escape(result.message) +
      '</p><div class="acquisition-card pull-slot">' +
      cardHTML(c, null, {
        level: result.level || 1,
        copies: 1,
        preview: true,
      }) +
      '</div><a class="button mint" href="#collection" data-close-dialog>View my collection ↗</a><button class="text-button" data-close-dialog>Keep exploring</button></section>',
  );
}
function showAuctionWin() {
  if (
    !state?.me ||
    busy ||
    document.hidden ||
    $("#modal").open ||
    workshop.pickerOpen()
  )
    return;
  const a = (state.auctionWins || []).find(
    (a) => !shownWins.has(state.me.id + ":" + a.id),
  );
  if (!a) return;
  const c = cardBy(a.card),
    key = state.me.id + ":" + a.id;
  modal(
    '<section class="pack-results acquisition"><div class="pull-label">WINNING BID · ✦ ' +
      number(a.bid) +
      "</div><h2>You won the auction!</h2><p>" +
      escape(c.name) +
      ' is ready to join your collection.</p><div class="acquisition-card pull-slot">' +
      cardHTML(c, null, { level: a.level || 1, copies: 1, preview: true }) +
      '</div><button class="button mint" data-action="claim" data-id="' +
      a.id +
      '">Claim your card →</button><button class="text-button" data-close-dialog>Claim later</button></section>',
  );
  if ($("#modal").open) {
    shownWins.add(key);
    api("auction-notice", { auction: a.id }, "auction-notice-" + a.id).catch(
      () => {},
    );
  }
}
function cardHTML(c, a = null, item = null) {
  const mine = a?.winner === state.me?.id,
    selling = a?.seller === state.me?.id,
    level = item?.level || a?.level;
  const auction = a
    ? `<p class="form-hint">${a.seller ? 'By <a href="' + profileURL(a.seller) + '">' + escape(a.seller_name || a.seller) + "</a>" : "Community auction"}</p><div class="bid-label"><span>${a.bid ? "Highest bid" : "Opening bid"}</span></div><div class="card-price"><span class="coin">✦</span> ${number(a.bid || a.reserve || 1)} <span class="subtext">credits</span></div>${a.winner && a.bid ? `<p class="form-hint auction-leader">Highest bidder: <a href="${profileURL(a.winner)}">${escape(a.winner_name || a.winner)}</a>${mine ? " · You" : ""}</p>` : '<p class="form-hint auction-leader">No bids yet</p>'}${selling ? `<p class="form-hint">Your listing</p>${!a.bid ? btn("Withdraw listing", "cancel-listing", `data-id="${a.id}" data-venue="auction"`, "secondary") : ""}` : btn(a.ends <= state.now ? "Claim your card" : mine ? "↑ Your bid leads" : "Place a bid ↗", a.ends <= state.now ? "claim" : "bid", `data-id="${a.id}"`, "secondary")}${a.buyout && !selling && a.ends > state.now ? btn("Buyout · ✦ " + number(a.buyout), "buyout", `data-id="${a.id}"`, "mint") : ""}`
    : "";
  const owned =
    item && !item.preview
      ? `<div class="bid-label"><span>${item.copies - 1} extra copies</span><span>${2 ** (item.level - 1)} to enhance</span></div><div class="card-controls"><button class="bid-button" data-action="enhance" data-id="${escape(c.id)}" ${item.level >= 20 || item.copies - 1 < 2 ** (item.level - 1) ? "disabled" : ""}>${item.level >= 20 ? "Max level" : "Enhance → " + (item.level + 1)}</button><details class="card-menu"><summary>Actions ▾</summary><div class="collection-actions"><button class="text-button" data-action="set-avatar" data-id="${escape(c.id)}">Profile picture</button><button class="text-button" data-action="showcase-toggle" data-id="${escape(c.id)}">${(state.showcase || []).includes(c.id) ? "★ Remove from showcase" : "☆ Showcase"}</button><button class="text-button" data-action="fusion-card" data-id="${escape(c.id)}">Add to fusion ↗</button><button class="text-button" data-action="instant-sell" data-id="${escape(c.id)}">Sell now · ✦ ${number(instantSalePrice(c, item.copies > 1 ? 1 : item.level))}</button><button class="text-button" data-action="sell-card" data-id="${escape(c.id)}">List / auction ↗</button></div></details></div>`
      : "";
  return `<article class="collect-card tier-${rarityClass(c.rarity)} ${level ? "rarity-" + rarity(level) : ""}"><div class="portrait">${image(c)}${gradeBadge(c)}<span class="card-tag">${c.kind === "seiyuu" ? "SEIYUU" : c.role === "main" ? "MAIN" : c.role === "unknown" ? "UNSORTED" : "SUPPORTING"}</span>${level ? '<span class="level-tag">LV. ' + level + "</span>" : ""}</div><div class="card-body"><div class="card-name" title="${escape(c.name)}">${escape(c.name)}</div><div class="card-series">${escape(series(c))}</div>${auction}${owned}</div></article>`;
}
function tabs() {
  return `<div class="tabs" role="group" aria-label="Card type"><button class="tab ${tab === "character" ? "active" : ""}" data-tab="character">Characters</button><button class="tab ${tab === "seiyuu" ? "active" : ""}" data-tab="seiyuu">Seiyuus</button></div>`;
}
const workshop = createWorkshop({
  escape,
  number,
  cardBy,
  cardHTML,
  image,
  gradeBadge,
  btn,
  getState: () => state,
  empty,
});
const features = createFeatures(
  {
    escape,
    number,
    btn,
    cardHTML,
    cardBy,
    image,
    gradeBadge,
    rarityClass,
    rarity,
    series,
    empty,
    remaining,
    countdown,
    nextWeeklyReset,
    profileURL,
    tabs,
    getState: () => state,
  },
  ui,
);
let fusionPickerFocus = null;
function renderFusionPicker(focusSearch = false, position = null) {
  const overlay = $("#fusion-picker");
  overlay.innerHTML = workshop.renderPicker();
  overlay.hidden = false;
  const input = overlay.querySelector("#fusion-search");
  if (focusSearch) {
    input?.focus();
    if (position !== null) input?.setSelectionRange(position, position);
  }
}
function openFusionPicker(index) {
  fusionPickerFocus = document.activeElement;
  workshop.openPicker(index);
  if ($("#modal").open) $("#modal").close();
  document.querySelectorAll(".sidebar,.workspace").forEach((el) => {
    el.inert = true;
  });
  document.body.classList.add("fusion-picker-open");
  renderFusionPicker(true);
}
function closeFusionPicker() {
  workshop.closePicker();
  const overlay = $("#fusion-picker");
  overlay.hidden = true;
  overlay.innerHTML = "";
  document.querySelectorAll(".sidebar,.workspace").forEach((el) => {
    el.inert = false;
  });
  document.body.classList.remove("fusion-picker-open");
  if (fusionPickerFocus?.isConnected) fusionPickerFocus.focus();
  fusionPickerFocus = null;
}
document.addEventListener("keydown", (ev) => {
  if (!workshop.pickerOpen()) return;
  if (ev.key === "Escape") {
    ev.preventDefault();
    closeFusionPicker();
    return;
  }
  if (ev.key !== "Tab") return;
  const items = [
    ...$("#fusion-picker").querySelectorAll(
      "button:not([disabled]),input,select,a[href]",
    ),
  ];
  const first = items[0],
    last = items.at(-1);
  if (
    ev.shiftKey &&
    (document.activeElement === first ||
      !$("#fusion-picker").contains(document.activeElement))
  ) {
    ev.preventDefault();
    last?.focus();
  } else if (!ev.shiftKey && document.activeElement === last) {
    ev.preventDefault();
    first?.focus();
  }
});
$("#fusion-picker").addEventListener("click", (ev) => {
  if (ev.target === $("#fusion-picker")) closeFusionPicker();
});
function shop() {
  return features.shop();
}
function pickemHero(p) {
  return `<section class="hero pickem-hero"><div class="hero-copy"><div class="hero-tag">PICK’EMS OPEN · ${escape(p.tour)}</div><h2>Make your call.<br><span>Back your team.</span></h2><p>${escape(p.title)} · ${remaining(p.ends)}<br>✦ ${number(p.winner_reward)} for the winner + ${number(p.score_reward)} per exact team score</p><a class="button" href="#pickems">Make your prediction ↗</a></div><div class="hero-match"><strong>${escape(p.team_a)}</strong><span>VS</span><strong>${escape(p.team_b)}</strong><small>Free entry · Open until the host’s deadline</small></div></section>`;
}
const packReveal = createPackReveal({
  modal,
  cardHTML,
  escape,
  number,
  getState: () => state,
});
function dailyPack() {
  const day = new Date(state.now + 9 * 3600000).toISOString().slice(0, 10);
  if (state.me?.daily_pack === day) return "";
  return `<div class="daily-strip daily-pack"><div class="daily-icon">♢</div><div><h3>Your daily pack is waiting.</h3><p>5 random cards · characters + seiyuus · free each day</p></div>${btn("Claim & open →", "daily-pack", "", "mint")}</div>`;
}
function daily() {
  const claimed =
    state.me?.daily ===
    new Date(state.now + 9 * 3600000).toISOString().slice(0, 10);
  return `<div class="daily-strip"><div class="daily-icon">✦</div><div><h3>${claimed ? "Today’s bonus is in your wallet." : "A little something for showing up."}</h3><p>${claimed ? countdown(nextDailyReset(state.now), "Claim again in ", false, "Available now") : "Daily check-in · 100 credits"}</p></div>${btn(claimed ? "Claimed ✓" : "+ Claim 100", "daily", claimed ? "disabled" : "", claimed ? "secondary" : "mint")}</div>`;
}
function packPanel(kind, premium = false) {
  const char = kind === "character",
    price =
      state.settings[(premium ? "premium_" : "") + kind + "_price"] ||
      (premium ? 2000 : 500);
  return `<article class="pack-panel ${kind} ${premium ? "premium" : ""}"><span class="eyebrow">${premium ? "A LITTLE MORE EXTRAORDINARY." : "FIVE CARDS. NEW POSSIBILITIES."}</span><h3>${premium ? "Premium " : ""}${char ? "Character" : "Seiyuu"} card pack</h3><p>${premium ? "Double the normal chance of S, SS, SSS, Ubers and AG. The extra chance comes from D." : char ? "Five completely random characters. Every card has an equal chance." : "Collect the voices behind your favourite stories. Every actor has an equal chance."}</p>${btn('<span class="coin">✦</span> ' + number(price) + " <span>· Open pack →</span>", "pack", `data-kind="${kind}" data-premium="${premium}"`, "secondary")}<div class="pack-object" aria-hidden="true">${premium ? "✦" : char ? "✧" : "♬"}<span class="pack-caption">${premium ? "PREMIUM" : char ? "CHARACTER" : "SEIYUU"} / 05</span></div></article>`;
}
function home() {
  const hero = heroCards || [];
  const featured = state.auctions
    .filter((a) => a.kind === "character" && a.ends > state.now)
    .slice(0, 5);
  return (
    intro(
      state.me
        ? `Hey, ${escape(state.me.name)} <span class="muted">✧</span>`
        : "Your next favourite awaits.",
      "A good tour deserves a great collection.",
      `<span class="pill"><span class="dot"></span> THE AMQ COLLECTION CLUB</span>`,
    ) +
    (state.activePickem
      ? pickemHero(state.activePickem)
      : `<section class="hero"><div class="hero-copy"><div class="hero-tag">PLAY TOURS. EARN CREDITS. COLLECT.</div><h2>For the characters<br>you <span>can’t forget.</span></h2><p>Build a deck of your favourite characters and the voices that bring them to life.</p><a class="button" href="#packs">Find your next favourite <span>↗</span></a></div><div class="hero-art" aria-hidden="true">${hero.map((c) => `<div class="hero-card tier-${rarityClass(c.rarity)}">${image(c)}${gradeBadge(c)}<strong>${escape(c.name)}</strong></div>`).join("")}</div></section>`) +
    `<div class="daily-rewards ${dailyPack() ? "two-col" : ""}">${daily()}${dailyPack()}</div>` +
    `<div class="section-head"><div class="section-title"><h2>This week’s auction</h2><span class="pill live"><span class="dot"></span> ${featured.length ? "BIDDING OPEN" : "COMING SOON"}</span></div><div class="auction-header-actions"><span class="subtext">${countdown(nextWeeklyReset(state.now), "Auction resets in ", true, "Refreshing auctions…")}</span><a class="text-button" href="#auctions">View auctions ↗</a></div></div>${featured.length ? `<div class="card-grid">${featured.map((a) => cardHTML(cardBy(a.card), a)).join("")}</div>` : empty("The next lineup is on its way.", "Five characters and five voice actors will enter the weekly auction once the host loads the catalog.")}<div class="section-head"><div><h2>Unwrap a little luck</h2></div><a class="text-button" href="#packs">Explore packs ↗</a></div><div class="two-col">${packPanel("character")}${packPanel("seiyuu")}</div><div class="stat-grid"><div class="stat"><span>YOUR COLLECTION</span><strong>${number(state.inventory.length)}</strong><small>unique cards, endless favourites</small></div><div class="stat"><span>LIFETIME CREDITS EARNED</span><strong>${number(state.me?.earned)}</strong><small>every tour effort counts</small></div><div class="stat"><span>COLLECTORS IN THE CLUB</span><strong>${number(state.counts.players)}</strong><small>from the AMQ Tours community</small></div></div>`
  );
}
function collection() {
  const items = collectionView(state.inventory, cardBy, {
    kind: tab,
    query: search,
    sort: ui.collectionSort,
    ...ui.collectionFilters,
  });
  const collectionData = collectionPage(items, ui.collectionPage);
  ui.collectionPage = collectionData.page;
  return (
    intro(
      "Your collection. Your favourites.",
      "Every card has a story. Build yours, one pull at a time.",
    ) +
    (state.me ? features.pinnedAnime() : "") +
    `<div class="filters">${tabs()}<input class="search" id="search" aria-label="Search your collection" placeholder="Search your collection…" value="${escape(search)}"></div>` +
    features.filters("collection") +
    (state.me
      ? features.catalogPager(
          collectionData,
          ui.collectionPage,
          "collection-top",
        )
      : "") +
    (state.me
      ? items.length
        ? `<div class="card-grid">${collectionData.items.map((i) => cardHTML(i.c, null, i)).join("")}</div>`
        : empty(
            "No matching cards in your collection.",
            "Try another search or clear the rarity and role filters.",
            '<a class="button" href="#packs">Explore card packs ↗</a>',
          )
      : empty(
          "Your collection is waiting.",
          "Sign in using your AMQ player ID or alias to see your cards.",
          btn("Sign in", "account"),
        )) +
    (state.me
      ? features.catalogPager(collectionData, ui.collectionPage, "collection") +
        features.animeCollection()
      : "") +
    `<div class="notice space-top">Enhancement uses extra copies of the same card: Lv. 1 → 2 costs 1, Lv. 2 → 3 costs 2, then 4, 8, and so on. Your base card is kept. There is no extra credit fee.</div>`
  );
}
function packs() {
  const pool = state.catalogSummary || {
    character: state.catalog.filter((c) => c.kind === "character").length,
    seiyuu: state.catalog.filter((c) => c.kind === "seiyuu").length,
  };
  const list = catalogPageData?.cards || [];
  return (
    intro(
      "Five cards. One little thrill.",
      "Characters, husbandos, waifus, and the voices you know by heart.",
    ) +
    dailyPack() +
    `<div class="two-col">${packPanel("character")}${packPanel("seiyuu")}</div>
    <div class="section-head"><h2>Premium packs</h2><span class="subtext">Double chances S and above · reduced D chance</span></div><div class="two-col">${packPanel("character", true)}${packPanel("seiyuu", true)}</div><div class="rules-grid"><div class="rule"><strong>05</strong><h3>Five independent draws</h3><p>Duplicates can appear in the same pack and are saved as extra copies.</p></div>
    <div class="rule"><strong>＝</strong><h3>Every card, equal chances</h3><p>Normal packs are uniform within the chosen character or seiyuu pool. Role and rarity do not affect normal pulls.</p></div>
    <div class="rule"><strong>↑</strong><h3>Duplicates go further</h3><p>Enhance with 1, 2, 4, 8… extra copies, keeping one base card.</p></div></div>
    <div class="notice">Current pool: ${number(pool.character)} characters and ${number(pool.seiyuu)} voice actors. ${pool.source?.provider === "Tenrai" ? "MAL character roles and portraits, imported gradually." : ""} Gender never changes the odds.</div><details class="rarity-guide"><summary>MAL popularity rarity · AG → D</summary><p>Cumulative top cutoffs: AG 0.1% · Ubers 0.5% · SSS 1% · SS 2.5% · S 5% · A 10% · B 20% · C 40% · D 60%. Rarity can change as the catalogue grows or favorites refresh every 15 days.</p></details>
    <div class="filters">${tabs()}<input class="search" id="search" aria-label="Search catalog" placeholder="Search names or series…" value="${escape(search)}"></div>
    ${features.filters()}<div class="card-grid">${list.map((c) => cardHTML(c)).join("") || empty("No matching cards.", "Try another name or series.")}</div>
    ${features.catalogPager(catalogPageData, catalogPageNumber)}`
  );
}
function auctions() {
  const list = state.auctions.filter((a) => a.kind === tab),
    active = list.filter((a) => !a.seller && a.ends > state.now),
    won = list.filter((a) => a.ends <= state.now);
  return (
    intro(
      "A new week. A new lineup.",
      "Five characters. Five seiyuus. Higher tiers in the spotlight.",
    ) +
    `<div class="notice">Bids hold credits immediately; outbid players are refunded. After the timer ends, the highest bidder can claim the card here.</div>${tabs()}${won.length ? `<div class="section-head"><h2>Ready to join your deck</h2></div><div class="card-grid">${won.map((a) => cardHTML(cardBy(a.card), a)).join("")}</div>` : ""}<div class="section-head"><h2>Weekly community auctions</h2><span class="subtext">${countdown(active[0]?.ends || nextWeeklyReset(state.now), "Auction resets in ", true, "Refreshing auctions…")}</span></div>${active.length ? `<div class="card-grid">${active.map((a) => cardHTML(cardBy(a.card), a)).join("")}</div>` : empty("No auctions just yet.", "The host needs at least five cards in each catalog to start weekly auctions.")}` +
    features.userAuctions()
  );
}
function pickems() {
  return (
    intro(
      "Know the match? Make the call.",
      "Back a winner, predict both scores, and turn good reads into credits.",
    ) +
    `<div class="notice">Entry is free. Winner rewards and exact-score rewards are added together. Each team’s exact score pays separately. You can edit your prediction until the host’s deadline.</div>` +
    ((ui.pickemData?.pickems || state.pickems).length
      ? `<div class="two-col">${(ui.pickemData?.pickems || state.pickems)
          .map((p) => {
            const closed = p.ends <= state.now || p.settled;
            return `<article class="pickem"><div class="pickem-meta"><span class="eyebrow">${escape(p.tour)}</span><span class="pill ${closed ? "" : "live"}">${p.settled ? "SETTLED" : closed ? "LOCKED · awaiting results" : "OPEN · " + remaining(p.ends)}</span></div><h3>${escape(p.title)}</h3><div class="match-teams"><span class="team">${escape(p.team_a)}${p.settled ? `<br><br>${p.result_a}` : ""}</span><span class="versus">VS</span><span class="team">${escape(p.team_b)}${p.settled ? `<br><br>${p.result_b}` : ""}</span></div><div class="reward-line">✦ ${number(p.winner_reward)} for the winner · ${number(p.score_reward)} per exact team score</div>${p.prediction ? `<p class="form-hint">Your pick: ${escape(p.prediction === "a" ? p.team_a : p.team_b)} · ${p.prediction_a}–${p.prediction_b}</p>` : ""}${!closed ? btn(p.prediction ? "Edit prediction →" : "Make your prediction →", "predict", `data-id="${p.id}"`, "secondary") : ""}<p class="form-hint space-top">Closes ${new Date(p.ends).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Seoul" })} KST</p></article>`;
          })
          .join("")}</div>`
      : empty(
          "Waiting for the next match.",
          "The host will post tour details, teams, rewards, and a deadline here.",
        )) +
    features.pager("pickems", ui.pickemPage, ui.pickemData?.hasMore)
  );
}
function ranks() {
  return features.ranks();
}
function arcade() {
  return features.gambling();
}
function avatarHTML(p, large = false) {
  const item = (p.inventory || state.inventory).find(
      (i) => i.card === p.avatar_card,
    ),
    card = p.avatar_card ? cardBy(p.avatar_card) : null;
  return `<span class="profile-avatar ${card ? "tier-" + rarityClass(card.rarity) : ""} ${large ? "large" : ""} rarity-${rarity(p.avatar_level || item?.level || 1)}"><span class="avatar-crop">${card ? image(card) : escape(p.name.slice(0, 2).toUpperCase())}</span>${item || p.avatar_level ? `<b>Lv. ${p.avatar_level || item?.level}</b>` : ""}</span>`;
}
function players() {
  return (
    intro(
      "Meet the collectors.",
      "Find a player by their AMQ Tours ID, alias, or any of their usernames.",
    ) +
    `<form id="player-search" class="player-search"><input id="profile-search" name="q" class="search" placeholder="Search players, aliases, past usernames…" aria-label="Search players" value="${escape(search)}"><button class="button secondary" type="submit">Search ↗</button></form><p class="form-hint">${number(ui.playerData?.total ?? profileResults.length)} collectors · 50 per page</p><div class="profile-grid space-top">${profileResults.map((p) => `<a class="profile-tile" href="${profileURL(p.id)}">${avatarHTML(p)}<div><h3>${escape(p.name)}</h3><p>${escape(p.id)}</p><span class="money">✦ ${number(p.earned)} earned</span></div><span class="muted">↗</span></a>`).join("") || empty("No player found.", "Try another alias, username, or AMQ Tours ID.")}</div>${features.catalogPager(ui.playerData, ui.playerPage, "players", 50)}`
  );
}
function profile() {
  if (!profileData) return '<div class="loading">Finding this collector…</div>';
  const p = profileData,
    own = p.id === state.me?.id,
    pk = p.stats.pickems,
    rate = pk.total ? Math.round((pk.correct / pk.total) * 100) + "%" : "—";
  return `<div class="profile-heading">${avatarHTML(p, true)}<div><span class="eyebrow">THE AMQ COLLECTION CLUB</span><h1>${escape(p.name)}</h1><p>AMQ Tours ID · ${escape(p.id)}</p></div>${own ? btn("Edit profile", "edit-profile", "", "secondary") : ""}</div>${features.profileExtras(p, own)}<div class="stat-grid profile-stats"><div class="stat"><span>AVAILABLE CREDITS</span><strong>✦ ${number(p.balance)}</strong><small>${number(p.earned)} earned over time</small></div><div class="stat"><span>TOURS PLAYED</span><strong>${number(p.stats.participation)}</strong><small>tour participation</small></div><div class="stat"><span>TOURS COUNTED</span><strong>${number(p.stats.counting)}</strong><small>counting contributions</small></div><div class="stat"><span>TOURS REPORTED</span><strong>${number(p.stats.reporting)}</strong><small>reporting contributions</small></div><div class="stat"><span>PICK’EM WINNER ACCURACY</span><strong>${rate}</strong><small>${pk.correct} correct / ${pk.total} settled predictions</small></div><div class="stat"><span>COLLECTION</span><strong>${number(p.inventory.length)}</strong><small>unique characters &amp; seiyuus</small></div></div><div class="notice space-top"><strong>Find this player by</strong><br>AMQ aliases: ${p.aliases.map(escape).join(" · ") || "—"}<br>Username history: ${p.usernames.map(escape).join(" · ") || escape(p.name)}</div><div class="section-head"><h2>Recent collection</h2><span class="subtext">${p.avatar_card ? "Card avatars always show their current enhancement." : "No card profile picture selected yet."}</span></div>${
    p.inventory.length
      ? `<div class="card-grid">${p.inventory
          .slice(0, 20)
          .map((item) => {
            const c = cardBy(item.card);
            return `<article class="collect-card tier-${rarityClass(c.rarity)} rarity-${rarity(item.level)}"><div class="portrait">${image(c)}${gradeBadge(c)}<span class="level-tag">LV. ${item.level}</span></div><div class="card-body"><div class="card-name">${escape(c.name)}</div><div class="card-series">${escape(series(c))}</div></div></article>`;
          })
          .join(
            "",
          )}</div><p class="form-hint space-top">Showing up to 20 owned cards.</p>`
      : empty(
          "A fresh deck, ready for favourites.",
          "This collector has not collected a card yet.",
        )
  }`;
}
async function loadDynamic() {
  const version = ++loadVersion,
    current = page(),
    hash = location.hash;
  let data;
  if (current === "packs")
    data = await api(
      "catalog?kind=" +
        tab +
        "&q=" +
        encodeURIComponent(search) +
        "&page=" +
        catalogPageNumber +
        "&rarity=" +
        encodeURIComponent(ui.filters.rarity) +
        "&role=" +
        encodeURIComponent(tab === "character" ? ui.filters.role : "") +
        "&sort=" +
        encodeURIComponent(ui.catalogSort),
    );
  if (current === "collection" && state.me)
    data = await api("anime-collection?page=" + (ui.animePage || 1));
  if (current === "ranks")
    data = await api("rankings?metric=" + ui.metric + "&page=" + ui.rankPage);
  if (current === "pickems") data = await api("pickems?page=" + ui.pickemPage);
  if (["shop", "auctions"].includes(current))
    data = await api(
      "market?venue=" +
        (current === "shop" ? "shop" : "auction") +
        "&kind=" +
        tab +
        "&page=" +
        ui.marketPage,
    );
  if (current === "players")
    data = await api(
      "profiles?q=" + encodeURIComponent(search) + "&page=" + ui.playerPage,
    );
  if (current === "profile")
    data = await api(
      "player?id=" + encodeURIComponent(decodeURIComponent(hash.slice(8))),
    );
  if (version !== loadVersion || location.hash !== hash) return;
  if (data) {
    rememberCards(data.cards);
    if (current === "collection") ui.animeData = data;
    if (current === "packs") catalogPageData = data;
    if (current === "ranks") ui.rankData = data;
    if (current === "pickems") ui.pickemData = data;
    if (["shop", "auctions"].includes(current)) ui.marketData = data;
    if (current === "players") {
      profileResults = data.profiles;
      ui.playerData = data;
    }
    if (current === "profile") profileData = data;
  }
}
function render() {
  if (!state) return;
  const route = page(),
    title =
      route === "profile"
        ? "Player profile"
        : routes.find((r) => r[0] === route)[1];
  $("#navigation").innerHTML = routes
    .map(
      ([id, name]) =>
        `<a class="nav-link ${id === route || (id === "players" && route === "profile") ? "active" : ""}" href="#${id}" aria-label="${name}" ${id === route ? 'aria-current="page"' : ""}>${svg(icons[id])}<span>${name}</span></a>`,
    )
    .join("");
  $("#page-name").textContent = title;
  $("#balance").textContent = number(state.me?.balance);
  $("#account").innerHTML = state.me?.avatar_card
    ? avatarHTML(state.me)
    : escape(state.me ? state.me.name.slice(0, 2).toUpperCase() : "↗");
  $("#account").setAttribute(
    "aria-label",
    state.me ? "Manage account" : "Sign in",
  );
  $("#main").innerHTML = {
    home,
    collection,
    fusion: () => workshop.render(),
    packs,
    auctions,
    shop,
    pickems,
    ranks,
    arcade,
    players,
    profile,
  }[route]();
  const queryInput = $("#search") || $("#profile-search");
  if (queryInput && search.trim()) {
    const none =
      route === "packs"
        ? !catalogPageData?.cards?.length
        : route === "players"
          ? !profileResults.length
          : route === "collection"
            ? !collectionView(state.inventory, cardBy, {
                kind: tab,
                query: search,
                sort: ui.collectionSort,
                ...ui.collectionFilters,
              }).length
            : false;
    queryInput.classList.toggle("no-results", none);
    queryInput.setAttribute("aria-invalid", String(none));
  }
  tickCountdowns();
  document.title = title + " · AMQ Tours Gatcha";
}
async function api(path, body, key) {
  if (demo) return demo.request(path, body);
  const res = await fetch("api/" + path, {
    method: body ? "POST" : "GET",
    headers: body
      ? {
          "Content-Type": "application/json",
          "Idempotency-Key": key || crypto.randomUUID(),
        }
      : {},
    body: body ? JSON.stringify(body) : undefined,
    credentials: "same-origin",
  });
  const data = await res.json();
  if (!res.ok)
    throw Object.assign(new Error(data.error || "The request failed."), {
      status: res.status,
    });
  return data;
}
async function refresh() {
  const previousPlayer = state?.me?.id;
  state = await api("state");
  clockOffset = state.now - Date.now();
  if (heroCards === null) {
    try {
      heroCards = (await api("featured")).cards || [];
      rememberCards(heroCards);
    } catch {
      heroCards = [];
    }
  }
  if (previousPlayer && previousPlayer !== state.me?.id) workshop.clear();
  if (state.loginReward) toast(state.loginReward.message);
  rememberCards(state.catalog);
  await loadDynamic();
  render();
}
async function execute(path, b, after) {
  if (busy) return;
  busy = true;
  const signature = path + ":" + JSON.stringify(b),
    key = pendingMutations.get(signature) || crypto.randomUUID();
  pendingMutations.set(signature, key);
  const buttons = [...$("#modal").querySelectorAll("button[type=submit]")];
  buttons.forEach((x) => (x.disabled = true));
  try {
    const result = await api(path, b, key);
    rememberCards(result.cards);
    pendingMutations.delete(signature);
    try {
      await refresh();
    } catch {
      toast(
        "Action saved. The latest view could not be loaded; refresh to check your account.",
        true,
      );
    }
    if (after) after(result);
    else if (path === "bid" && result.cards?.length) {
      revealAcquired(result, "Your auction prize is here.");
    } else {
      if ($("#modal").open) $("#modal").close();
      toast(result.message);
    }
    return result;
  } catch (err) {
    if (err.status && err.status < 500) pendingMutations.delete(signature);
    if ($("#modal").open && $("#modal .form-error"))
      $("#modal .form-error").textContent = err.message;
    else toast(err.message, true);
  } finally {
    busy = false;
    buttons.forEach((x) => (x.disabled = false));
    showAuctionWin();
  }
}
function auth(register = false) {
  modal(
    `<h2>${register ? "Welcome to the club." : "Good to see you again."}</h2><p>${register ? "Use the one-use registration code provided by your host. Your account links to your existing AMQ Tours ID." : "Sign in with your AMQ Tours ID or an imported alias."}</p><div class="tabs"><button class="tab ${register ? "" : "active"}" data-action="signin-form">Sign in</button><button class="tab ${register ? "active" : ""}" data-action="register-form">Register</button></div><form id="auth-form" class="stack"><input type="hidden" name="mode" value="${register ? "register" : "login"}"><label>AMQ player ID or alias<input name="player" required autocomplete="username" maxlength="100"></label>${register ? '<label>Registration code<input name="code" required autocomplete="off"></label>' : ""}<label>Password<input type="password" name="password" required minlength="${register ? 12 : 8}" maxlength="256" autocomplete="${register ? "new-password" : "current-password"}"></label><div class="form-error" role="alert"></div><button type="submit" class="button full">${register ? "Create account" : "Sign in"} →</button><span class="form-hint">${register ? "Use at least 12 characters." : "Need account access or a password reset? Ask your tour host."}</span></form>`,
  );
}
function account() {
  if (!state.me) {
    auth();
    return;
  }
  modal(
    `<h2>${escape(state.me.name)}</h2><p>AMQ player ID · ${escape(state.me.id)}</p><div class="two-col"><div class="stat"><span>AVAILABLE</span><strong>${number(state.me.balance)}</strong></div><div class="stat"><span>LIFETIME EARNED</span><strong>${number(state.me.earned)}</strong></div></div><div class="section-head"><h3>Recent activity</h3></div>${
      state.ledger.length
        ? `<div class="table-wrap"><table><tbody>${state.ledger
            .slice(0, 12)
            .map(
              (l) =>
                `<tr><td>${escape(l.reason)}<br><small>${new Date(l.at).toLocaleDateString()}</small></td><td class="${l.delta > 0 ? "ledger-positive" : "ledger-negative"}">${l.delta > 0 ? "+" : ""}${number(l.delta)}</td></tr>`,
            )
            .join("")}</tbody></table></div>`
        : "<p>No wallet activity yet.</p>"
    }<div class="dialog-actions">${state.me.is_admin ? '<a class="button secondary" href="host.html">Host console ↗</a>' : ""}<a class="button" href="${profileURL(state.me.id)}" id="view-profile">Your profile ↗</a>${btn("Edit profile", "edit-profile", "", "secondary")}${btn("Sign out", "logout", "", "secondary")}</div>`,
  );
}
document.addEventListener("click", async (ev) => {
  const t = ev.target.closest("[data-action],[data-tab]");
  if (!t || busy) return;
  if (t.dataset.tab) {
    tab = t.dataset.tab;
    ui.marketPage = 1;
    ui.filters.role = "";
    ui.collectionFilters.role = "";
    ui.collectionPage = 1;
    if (tab === "seiyuu" && ui.catalogSort === "role") ui.catalogSort = "name";
    if (tab === "seiyuu" && ui.collectionSort === "role")
      ui.collectionSort = "name";
    catalogPageNumber = 1;
    await loadDynamic();
    render();
    return;
  }
  const a = t.dataset.action;
  if (await handleFeatureClick(a, t)) return;
  if (a === "reveal-pack") {
    packReveal.reveal();
    return;
  }
  if (a === "daily-pack") {
    if (!state.me) {
      auth();
      return;
    }
    await execute("daily-pack", {}, (r) => packReveal.show(r, { daily: true }));
    return;
  }
  if (a === "players-prev" || a === "players-next") {
    ui.playerPage += a.endsWith("next") ? 1 : -1;
    await loadDynamic();
    render();
    return;
  }
  if (a === "catalog-prev" || a === "catalog-next") {
    catalogPageNumber += a === "catalog-next" ? 1 : -1;
    await loadDynamic();
    render();
    return;
  }
  if (a === "account") {
    account();
    return;
  }
  if (a === "signin-form") {
    auth();
    return;
  }
  if (a === "register-form") {
    auth(true);
    return;
  }
  if (a === "logout") {
    await execute("logout", {});
    return;
  }
  if (!state.me) {
    auth();
    return;
  }
  if (a === "edit-profile") {
    modal(
      `<h2>Make yourself at home.</h2><p>Change your username freely. Past usernames remain linked to your profile. AMQ aliases and other players’ names are reserved.</p><form id="profile-form" class="stack"><label>Username<input name="username" required maxlength="32" value="${escape(state.me.name)}" autocomplete="nickname"></label><label>Profile picture<select name="avatar"><option value="">Use initials</option>${state.inventory.map((i) => `<option value="${escape(i.card)}" ${i.card === state.me.avatar_card ? "selected" : ""}>${escape(cardBy(i.card).name)} · Lv. ${i.level}</option>`).join("")}</select></label><div class="form-error" role="alert"></div><button type="submit" class="button full">Save profile →</button></form>`,
    );
    return;
  }
  if (a === "set-avatar") {
    await execute("profile", { avatar: t.dataset.id });
    return;
  }
  if (a === "daily" || a === "enhance" || a === "claim") {
    await execute(
      a,
      a === "daily"
        ? {}
        : a === "enhance"
          ? { card: t.dataset.id }
          : { auction: Number(t.dataset.id) },
      a === "claim"
        ? (r) => revealAcquired(r, "Your auction prize is here.")
        : undefined,
    );
    return;
  }
  if (a === "bid") {
    const lot = [...state.auctions, ...(ui.marketData?.items || [])].find(
      (x) => x.id === Number(t.dataset.id),
    );
    modal(
      `<h2>${escape(cardBy(lot.card).name)}</h2><p>${lot.bid ? "Highest bid: " + number(lot.bid) + " credits." : "Be the first to bid."} Your credits are held while your bid leads.</p><form id="bid-form" class="stack"><input type="hidden" name="auction" value="${lot.id}"><label>Your bid in credits<input type="number" name="amount" required min="${lot.bid ? lot.bid + 1 : lot.reserve || 1}" max="100000000" step="1" value="${lot.bid ? lot.bid + 1 : lot.reserve || 1}"></label><span class="form-hint">Available: ${number(state.me.balance)} credits${lot.winner === state.me.id ? " · Your existing bid counts toward the total." : ""}</span><div class="form-error" role="alert"></div><button class="button full" type="submit">Place bid →</button></form>`,
    );
    return;
  }
  if (a === "predict") {
    const p = (ui.pickemData?.pickems || state.pickems).find(
      (x) => x.id === Number(t.dataset.id),
    );
    modal(
      `<h2>Make your call.</h2><p>${escape(p.title)} · closes ${remaining(p.ends)}</p><form id="predict-form" class="stack"><input type="hidden" name="pickem" value="${p.id}"><label>Winning team<select name="winner"><option value="a" ${p.prediction === "a" ? "selected" : ""}>${escape(p.team_a)}</option><option value="b" ${p.prediction === "b" ? "selected" : ""}>${escape(p.team_b)}</option></select></label><div class="form-grid"><label>${escape(p.team_a)} score<input type="number" name="scoreA" min="0" max="1000" required value="${p.prediction_a ?? ""}"></label><label>${escape(p.team_b)} score<input type="number" name="scoreB" min="0" max="1000" required value="${p.prediction_b ?? ""}"></label></div><span class="form-hint">✦ ${p.winner_reward} winner + ${p.score_reward} per correct team score</span><div class="form-error" role="alert"></div><button class="button full" type="submit">Save prediction →</button></form>`,
    );
  }
});
document.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const f = ev.target,
    b = Object.fromEntries(new FormData(f));
  if (await handleFeatureSubmit(f, b)) return;
  if (f.id === "auth-form") {
    const mode = b.mode;
    delete b.mode;
    await execute(mode, b);
  }
  if (f.id === "player-search") {
    search = b.q;
    ui.playerPage = 1;
    await loadDynamic();
    render();
  }
  if (f.id === "profile-form") {
    b.avatar = b.avatar || null;
    await execute("profile", b);
  }
  if (f.id === "bid-form")
    await execute("bid", {
      auction: Number(b.auction),
      amount: Number(b.amount),
    });
  if (f.id === "predict-form")
    await execute("predict", {
      pickem: Number(b.pickem),
      winner: b.winner,
      scoreA: Number(b.scoreA),
      scoreB: Number(b.scoreB),
    });
  if (f.id === "pack-form")
    await execute(
      "pack",
      { kind: b.kind, premium: b.premium === "true" },
      (result) =>
        packReveal.show(result, {
          kind: b.kind,
          premium: b.premium === "true",
        }),
    );
});
document.addEventListener("input", (ev) => {
  if (["search", "profile-search"].includes(ev.target.id)) {
    ev.target.classList.remove("no-results");
    ev.target.removeAttribute("aria-invalid");
  }
  if (ev.target.id === "profile-search") {
    search = ev.target.value;
    ui.playerPage = 1;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(async () => {
      try {
        const pos = $("#profile-search")?.selectionStart;
        await loadDynamic();
        render();
        $("#profile-search")?.focus();
        $("#profile-search")?.setSelectionRange(pos, pos);
      } catch (err) {
        toast(err.message, true);
      }
    }, 350);
    return;
  }
  if (ev.target.id === "search") {
    if (page() === "collection") ui.collectionPage = 1;
    const position = ev.target.selectionStart;
    search = ev.target.value;
    if (page() === "packs") {
      catalogPageNumber = 1;
      clearTimeout(searchTimer);
      searchTimer = setTimeout(async () => {
        try {
          await loadDynamic();
          render();
          $("#search")?.focus();
          $("#search")?.setSelectionRange(position, position);
        } catch (err) {
          toast(err.message, true);
        }
      }, 350);
    } else {
      render();
      $("#search")?.focus();
      $("#search")?.setSelectionRange(position, position);
    }
  }
});
document.addEventListener(
  "error",
  (ev) => {
    if (ev.target.tagName === "IMG")
      ev.target.replaceWith(
        Object.assign(document.createElement("div"), {
          className: "fallback-img",
          textContent: "✦",
        }),
      );
  },
  true,
);
$("#account").addEventListener("click", account);
$(".dialog-close").addEventListener("click", () => $("#modal").close());
$("#modal").addEventListener("click", (e) => {
  if (e.target === $("#modal")) {
    const r = e.target.getBoundingClientRect();
    if (
      e.clientX < r.left ||
      e.clientX > r.right ||
      e.clientY < r.top ||
      e.clientY > r.bottom
    )
      e.target.close();
  }
});
document.addEventListener("click", (e) => {
  if (e.target.closest("#view-pulls,#view-profile,[data-close-dialog]"))
    $("#modal").close();
});
window.addEventListener("hashchange", async () => {
  if (workshop.pickerOpen()) closeFusionPicker();
  search = "";
  catalogPageNumber = 1;
  ui.marketPage = 1;
  ui.rankPage = 1;
  ui.pickemPage = 1;
  ui.playerPage = 1;
  profileData = null;
  try {
    await loadDynamic();
    render();
  } catch (err) {
    $("#main").innerHTML = empty(
      "That collector could not be found.",
      escape(err.message),
      '<a class="button secondary" href="#players">Search players</a>',
    );
  }
  window.scrollTo(0, 0);
});
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && !busy && !$("#modal").open && !workshop.pickerOpen())
    refresh().catch(() => {});
});
setInterval(() => {
  if (!document.hidden && !busy && !$("#modal").open && !workshop.pickerOpen())
    refresh().catch(() => {});
}, 60000);
$("#reset-demo").addEventListener("click", () => {
  demo?.reset();
  refresh();
  toast("Demo reset.");
});
try {
  if (isDemo) {
    const { Demo } = await import("./demo.js");
    demo = await Demo.create();
    $("#demo-banner").hidden = false;
  }
  await refresh();
} catch (err) {
  $("#main").innerHTML =
    intro(
      "The club is temporarily offline.",
      "The shared backend could not be reached.",
    ) +
    `<div class="notice warm">${escape(err.message)}</div><a class="button" href="?demo=1">Explore the demo ↗</a>`;
}

const titleSelect = $("#title-mode");
titleSelect.value = titleMode;
titleSelect.addEventListener("change", () => {
  titleMode = titleSelect.value;
  try {
    localStorage.setItem("amqtours-title-mode", titleMode);
  } catch {}
  if (state) render();
});

async function handleFeatureClick(a, t) {
  try {
    if (a?.startsWith("fusion-")) {
      if (!state.me) {
        auth();
        return true;
      }
      if (a === "fusion-pick") {
        openFusionPicker(Number(t.dataset.index));
        return true;
      }
      if (a === "fusion-picker-close") {
        closeFusionPicker();
        return true;
      }
      if (a === "fusion-add" || a === "fusion-card") {
        const item = state.inventory.find((i) => i.card === t.dataset.id);
        workshop.add({
          card: t.dataset.id,
          variant:
            a === "fusion-card"
              ? item?.copies > 1
                ? "extra"
                : "card"
              : t.dataset.variant,
        });
        if (a === "fusion-add") closeFusionPicker();
        if (a === "fusion-card") location.hash = "fusion";
      }
      if (a === "fusion-remove") workshop.remove(Number(t.dataset.index));
      if (a === "fusion-clear") workshop.clear();
      if (a === "fusion-dismiss") workshop.dismiss();
      if (a === "fusion-prev") workshop.prev();
      if (a === "fusion-next") workshop.next();
      if (a === "fusion-prev" || a === "fusion-next") {
        renderFusionPicker();
        $("#fusion-picker .fusion-picker-dialog")?.focus();
        return true;
      }
      if (a === "fusion-run") {
        const body = workshop.request();
        t.disabled = true;
        try {
          await execute("fusion", body, (r) => {
            workshop.complete(r);
            render();
            toast(r.message, r.outcome === "break");
          });
        } finally {
          if (t.isConnected) t.disabled = false;
        }
        return true;
      }
      render();
      return true;
    }
    if (
      [
        "collection-prev",
        "collection-next",
        "collection-top-prev",
        "collection-top-next",
      ].includes(a)
    ) {
      ui.collectionPage += a.endsWith("next") ? 1 : -1;
      render();
      $("#main .filters")?.scrollIntoView({ block: "start" });
      return true;
    }
    if (a === "rank-metric") {
      ui.metric = t.dataset.metric;
      ui.rankPage = 1;
      await loadDynamic();
      render();
      return true;
    }
    for (const [prefix, key] of [
      ["anime", "animePage"],
      ["market", "marketPage"],
      ["ranks", "rankPage"],
      ["pickems", "pickemPage"],
    ])
      if (a === prefix + "-next" || a === prefix + "-prev") {
        ui[key] = (ui[key] || 1) + (a.endsWith("next") ? 1 : -1);
        await loadDynamic();
        render();
        return true;
      }
    if (a === "clear-collection-filters") {
      ui.collectionPage = 1;
      ui.collectionFilters = { rarity: "", role: "" };
      render();
      return true;
    }
    if (a === "clear-filters") {
      ui.filters = { rarity: "", role: "" };
      catalogPageNumber = 1;
      await loadDynamic();
      render();
      return true;
    }
    if (
      ![
        "pack",
        "showcase-toggle",
        "sell-card",
        "instant-sell",
        "listing-venue",
        "pin-anime",
        "shop-buy",
        "buy-listing",
        "cancel-listing",
        "buyout",
      ].includes(a)
    )
      return false;
    if (!state.me) {
      auth();
      return true;
    }
    if (a === "pack") {
      const kind = t.dataset.kind,
        premium = t.dataset.premium === "true",
        price =
          state.settings[(premium ? "premium_" : "") + kind + "_price"] ||
          (premium ? 2000 : 500);
      modal(
        `<h2>${premium ? "A rarer kind of luck." : "A new favourite could be inside."}</h2><p>Five independent ${kind === "character" ? "character" : "seiyuu"} cards for <strong>${number(price)} credits</strong>. ${premium ? "AG, Ubers, SSS, SS and S each have double their normal chances, taken only from D. No guaranteed minimum." : "Normal pack odds apply."} Duplicates are possible.</p><form id="pack-form"><input type="hidden" name="kind" value="${kind}"><input type="hidden" name="premium" value="${premium}"><div class="form-error" role="alert"></div><button class="button full" type="submit">✦ Open for ${number(price)} credits</button></form>`,
      );
      return true;
    }
    if (a === "showcase-toggle") {
      const cards = [...(state.showcase || [])],
        i = cards.indexOf(t.dataset.id);
      if (i >= 0) cards.splice(i, 1);
      else {
        if (cards.length >= 6) {
          toast("Your showcase holds up to six cards. Remove one first.", true);
          return true;
        }
        cards.push(t.dataset.id);
      }
      await execute("showcase", { cards });
      return true;
    }
    if (a === "buyout") {
      const auct = [...state.auctions, ...(ui.marketData?.items || [])].find(
        (x) => x.id === Number(t.dataset.id),
      );
      modal(
        "<h2>Buy out " +
          escape(cardBy(auct.card).name) +
          "?</h2><p>Pay " +
          number(auct.buyout) +
          " credits and receive the Lv. " +
          auct.level +
          ' card immediately. Any existing bid you hold is deducted from that price.</p><form id="purchase-form"><input type="hidden" name="action" value="buyout"><input type="hidden" name="id" value="' +
          auct.id +
          '"><div class="form-error" role="alert"></div><button class="button full" type="submit">Buy out for ' +
          number(auct.buyout) +
          " credits</button></form>",
      );
      return true;
    }
    if (a === "listing-venue") {
      const variant = $("#listing-form [name=variant]")?.value;
      listingForm(t.dataset.id, t.dataset.venue, variant);
      return true;
    }
    if (a === "instant-sell") {
      openInstantSale(t.dataset.id);
      return true;
    }
    if (a === "sell-card") {
      listingForm(t.dataset.id, "shop");
      return true;
    }
    if (a === "pin-anime") {
      await execute("pin-anime", {
        series: t.dataset.series,
        pinned: t.dataset.pinned !== "true",
      });
      return true;
    }
    if (a === "cancel-listing") {
      modal(
        `<h2>Withdraw this listing?</h2><p>Your card returns with its enhancement level. ${t.dataset.venue === "auction" ? "Only auctions without bids can be withdrawn." : "It will no longer be available to buy."}</p><form id="withdraw-form"><input name="listing" type="hidden" value="${Number(t.dataset.id)}"><input name="venue" type="hidden" value="${escape(t.dataset.venue)}"><div class="form-error" role="alert"></div><button class="button full" type="submit">Withdraw & return card</button></form>`,
      );
      return true;
    }
    if (a === "shop-buy" || a === "buy-listing") {
      const weekly = a === "shop-buy",
        l = (weekly ? state.shop : ui.marketData?.items || []).find(
          (l) => l.id === Number(t.dataset.id),
        );
      modal(
        `<h2>${escape(cardBy(l.card).name)}</h2><p>Buy this card for <strong>${number(l.price)} credits</strong>. ${l.level > 1 ? "Level " + l.level + " · your higher existing level is kept." : ""}</p><form id="purchase-form"><input type="hidden" name="action" value="${a}"><input type="hidden" name="id" value="${l.id}"><div class="form-error" role="alert"></div><button class="button full" type="submit">Buy for ${number(l.price)} credits →</button></form>`,
      );
      return true;
    }
  } catch (err) {
    toast(err.message, true);
    return true;
  }
  return false;
}
function listingForm(id, venue, variant) {
  const c = cardBy(id),
    item = state.inventory.find((i) => i.card === id),
    auction = venue === "auction";
  modal(
    `<h2>${auction ? "Start an auction" : "List on the marketplace"}</h2><p>${escape(c.name)} · your enhanced card keeps its level.</p><div class="listing-venues" role="group" aria-label="Listing type"><button class="tab ${!auction ? "active" : ""}" data-action="listing-venue" data-id="${escape(id)}" data-venue="shop">Fixed-price marketplace</button><button class="tab ${auction ? "active" : ""}" data-action="listing-venue" data-id="${escape(id)}" data-venue="auction">Timed auction</button></div><form id="listing-form" class="stack"><input name="card" type="hidden" value="${escape(id)}"><input name="venue" type="hidden" value="${venue}"><label>Copy to sell<select name="variant">${item.copies > 1 ? '<option value="extra" ' + (variant === "extra" ? "selected" : "") + ">Extra copy · Lv. 1</option>" : ""}<option value="card" ${variant === "card" ? "selected" : ""}>Your card · Lv. ${item.level}</option></select></label><label>${auction ? "Minimum opening bid" : "Selling price"}<input name="price" type="number" min="1" max="1000000" step="1" value="500" required></label>${auction ? '<div class="auction-fields"><label>Duration in hours (max 7 days)<input name="hours" type="number" min="1" max="168" step="1" value="72" required></label><label>Optional buyout price<input name="buyout" type="number" min="1" max="1000000" step="1" placeholder="No buyout"></label></div><p class="form-hint">Buyout must be at least the opening bid. You can withdraw until the first bid.</p>' : '<p class="form-hint">One fixed price, no timer. Withdraw any time before it sells.</p>'}<p class="form-hint">The listed copy is held securely. Extra copies left behind become Lv. 1 if you list your enhanced card.</p><div class="form-error" role="alert"></div><button class="button full" type="submit">${auction ? "Start auction" : "List at fixed price"} →</button></form>`,
  );
}
function openInstantSale(id, variant) {
  const c = cardBy(id),
    item = state.inventory.find((i) => i.card === id);
  if (!item) {
    toast("You no longer own that card.", true);
    return;
  }
  variant ||= item.copies > 1 ? "extra" : "card";
  const level = variant === "extra" ? 1 : item.level,
    price = instantSalePrice(c, level);
  modal(
    `<h2>Sell ${escape(c.name)} now?</h2><p>Receive <strong class="money">✦ ${number(price)} credits</strong> immediately. This consumes the selected copy permanently.</p><form id="instant-sell-form" class="stack"><input type="hidden" name="card" value="${escape(id)}"><input type="hidden" name="expectedPrice" value="${price}"><input type="hidden" name="expectedRarity" value="${escape(c.rarity || "Pending")}"><input type="hidden" name="expectedLevel" value="${level}"><label>Copy to sell<select name="variant">${item.copies > 1 ? '<option value="extra" ' + (variant === "extra" ? "selected" : "") + ">Extra copy · Lv. 1</option>" : ""}<option value="card" ${variant === "card" ? "selected" : ""}>Your card · Lv. ${item.level}</option></select></label><p class="form-hint">50% of the weekly shop price for ${escape(c.rarity || "Pending")} × ${number(cardInvestment(level))} invested card${level === 1 ? "" : "s"}. ${variant === "card" && item.copies > 1 ? "Any remaining extra copies become Lv. 1." : ""} Pending uses the D price. Sale proceeds do not increase Cumulative earned credits.</p><div class="form-error" role="alert"></div><button class="button full" type="submit">Sell permanently for ✦ ${number(price)}</button></form>`,
  );
}
async function handleFeatureSubmit(f, b) {
  if (f.id === "instant-sell-form") {
    await execute("sell-instant", {
      ...b,
      expectedPrice: Number(b.expectedPrice),
      expectedLevel: Number(b.expectedLevel),
    });
    return true;
  }

  if (f.id === "withdraw-form") {
    await execute("cancel-listing", {
      listing: Number(b.listing),
      venue: b.venue,
    });
    return true;
  }
  if (f.id === "anime-pin-search") {
    try {
      const r = await api("anime-search?q=" + encodeURIComponent(b.q));
      ui.animeSearch = r.series;
      render();
    } catch (err) {
      toast(err.message, true);
    }
    return true;
  }
  if (f.id === "listing-form") {
    await execute("list-card", {
      card: b.card,
      variant: b.variant,
      venue: b.venue,
      price: Number(b.price),
      ...(b.venue === "auction" ? { hours: Number(b.hours) } : {}),
      buyout: b.buyout ? Number(b.buyout) : null,
    });
    return true;
  }
  if (f.id === "purchase-form") {
    await execute(
      b.action,
      b.action === "shop-buy"
        ? { slot: Number(b.id) }
        : b.action === "buyout"
          ? { auction: Number(b.id) }
          : { listing: Number(b.id) },
      (r) =>
        revealAcquired(
          r,
          b.action === "buyout"
            ? "Your auction prize is here."
            : "Your new card is here.",
        ),
    );
    return true;
  }
  if (f.classList.contains("gambling-form")) {
    if (!state.me) {
      auth();
      return true;
    }
    await execute(
      "gamble",
      { game: b.game, choice: b.choice || "", stake: Number(b.stake) },
      (r) =>
        modal(
          `<div class="game-result"><div class="game-symbol">${r.won ? "✦" : "♧"}</div><h2>${r.won ? "Luck found you." : "Another roll of the dice."}</h2><p>Result: <strong>${escape(Array.isArray(r.outcome) ? r.outcome.join(" + ") : r.outcome)}</strong></p><strong class="${r.net > 0 ? "ledger-positive" : "ledger-negative"}">${r.net > 0 ? "+" : ""}${number(r.net)} credits</strong><p>Bet: ${number(r.stake)} · Payout: ${number(r.payout)} (includes stake)</p><button class="button full" data-action="close-result">Back to the arcade</button></div>`,
        ),
    );
    return true;
  }
  return false;
}
document.addEventListener("change", async (ev) => {
  if (!["filter-rarity", "filter-role"].includes(ev.target.id)) return;
  ui.filters[ev.target.id === "filter-role" ? "role" : "rarity"] =
    ev.target.value;
  catalogPageNumber = 1;
  try {
    await loadDynamic();
    render();
  } catch (err) {
    toast(err.message, true);
  }
});
document.addEventListener("click", (ev) => {
  if (ev.target.closest('[data-action="close-result"]')) $("#modal").close();
});

document.addEventListener("change", async (ev) => {
  if (!["catalog-page-input", "catalog-page-select"].includes(ev.target.id))
    return;
  const value = Number(ev.target.value);
  if (!Number.isSafeInteger(value) || value < 1 || value > 10000) return;
  catalogPageNumber = value;
  if (catalogPageData?.total != null)
    catalogPageNumber = Math.min(
      value,
      Math.max(1, Math.ceil(catalogPageData.total / 40)),
    );
  try {
    await loadDynamic();
    render();
  } catch (err) {
    toast(err.message, true);
  }
});

document.addEventListener("change", async (ev) => {
  if (["catalog-sort", "collection-sort"].includes(ev.target.id)) {
    if (ev.target.id === "catalog-sort") {
      ui.catalogSort = ev.target.value;
      catalogPageNumber = 1;
    } else {
      ui.collectionSort = ev.target.value;
      ui.collectionPage = 1;
    }
    try {
      if (page() === "packs") await loadDynamic();
      render();
    } catch (err) {
      toast(err.message, true);
    }
  }
  if (["players-page-input", "players-page-select"].includes(ev.target.id)) {
    const p = Number(ev.target.value),
      max = Math.max(1, Math.ceil((ui.playerData?.total || 1) / 50));
    if (!Number.isSafeInteger(p) || p < 1) return;
    ui.playerPage = Math.min(p, max);
    try {
      await loadDynamic();
      render();
    } catch (err) {
      toast(err.message, true);
    }
  }
});

document.addEventListener("change", (ev) => {
  if (ev.target.closest("#instant-sell-form") && ev.target.name === "variant")
    openInstantSale(ev.target.form.elements.card.value, ev.target.value);
});

document.addEventListener("input", (ev) => {
  if (ev.target.id !== "fusion-search") return;
  const pos = ev.target.selectionStart;
  workshop.filter("query", ev.target.value);
  renderFusionPicker(true, pos);
});
document.addEventListener("change", (ev) => {
  if (!["fusion-kind", "fusion-rarity"].includes(ev.target.id)) return;
  workshop.filter(
    ev.target.id === "fusion-kind" ? "kind" : "grade",
    ev.target.value,
  );
  const id = ev.target.id;
  renderFusionPicker();
  $("#" + id)?.focus();
});

document.addEventListener("change", (ev) => {
  if (
    !["collection-filter-rarity", "collection-filter-role"].includes(
      ev.target.id,
    )
  )
    return;
  ui.collectionPage = 1;
  ui.collectionFilters[ev.target.id.endsWith("rarity") ? "rarity" : "role"] =
    ev.target.value;
  render();
});

document.addEventListener("change", (ev) => {
  if (
    ![
      "collection-page-input",
      "collection-page-select",
      "collection-top-page-input",
      "collection-top-page-select",
    ].includes(ev.target.id)
  )
    return;
  const value = Number(ev.target.value);
  if (!Number.isSafeInteger(value) || value < 1) return;
  ui.collectionPage = value;
  render();
  $("#main .filters")?.scrollIntoView({ block: "start" });
});
