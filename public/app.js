import { cardFavoriteFlag, cardQuickActions } from "./card-quick-actions.js";
import { SPECIAL_PACK_DESCRIPTION } from "./pack-odds.js";
import { replacementPortrait } from "./mal-portraits.js";
import {installTitleMotion} from "./title-motion.js";
const titleMotion = installTitleMotion();
import {installMobileNavigation} from "./mobile-navigation.js";
import {installCardFilters, strictCards, favoriteCardFilter} from "./card-filters.js";
import { recentActivityRows } from "./account-activity.js";
import { installDetailPopovers } from "./detail-popover.js";
import { pickemShare } from "./pickem-votes.js";
import { readApiResponse } from "./api-response.js";
import { installCardOrderDrag } from "./card-order-drag.js";
import { animeChecklist } from "./anime-checklist-ui.js";
import { quantityInput, installQuantityInputs } from "./quantity-input.js";
import { avatarCropStyle } from "./avatar-crop.js";
import { createAvatarEditor } from "./avatar-editor.js";
import { catalogProgressHTML } from "./catalog-progress.js";
import { cardSizeControl, installCardSize } from "./card-preferences.js";
import {
  cardSurface,
  installCardSurfaces,
  syncCardFlags,
} from "./card-surface.js";
import { cardFrameClass, cardAura } from "./card-frames.js";
import {
  MAX_CARD_LEVEL,
  ENHANCEMENT_REVISION,
  AUTOSELL_TIERS,
  enhancementCost,
  levelLabel,
} from "./card-values.js";
import {
  QUIZ_HOTKEY_ACTIONS,
  DEFAULT_QUIZ_HOTKEYS,
  formatHotkeyEvent,
  normalizeQuizHotkeys,
} from "./quiz-hotkeys.js";
import {
  wishlistButton,
  profileCardTabs,
  profileCardPanel,
} from "./profile-cards-ui.js";
import { titleBadges, titleSettingsPanel } from "./title-ui.js";
import {profileQuizPanel} from './profile-quiz-ui.js';
import {friendButton,friendsPanel} from './friends-ui.js';
import { createTitleOrderEditor } from "./title-order.js";
import { loadOnce, loadStylesheet } from "./route-resources.js";
import { loadQuizTitleDisplay, quizAnimeTitle } from "./quiz-title-display.js";
import { pageErrorHTML } from "./page-error.js";
import { createTradesUI } from "./trades-ui.js";
import { createShowcaseEditor } from "./showcase-order.js";
import {
  createWishlistEditor,
  createCollectionEditor,
  installWishlistDrag,
} from "./wishlist-order.js";
import { createPinnedAnimeEditor } from "./pinned-anime-order.js";
import { collectorsPanel, collectorsButton } from "./card-collectors.js";
import { authFormHTML } from "./auth-form.js";
import {
  SITE_ROUTES,
  resolvePage,
  routeHref,
  currentRoute,
  navigate,
  installNavigation,
  navigationSection,
} from "./site-navigation.js";
import { playHref } from "./play-navigation.js";
import { pickemTeams } from "./tour-winner.js";
import {
  createPickemAutosave,
  focusPredictionField,
} from "./pickem-autosave.js";
import { minimumBid } from "./community-market-rules.js";
import {
  pickemBoard,
  tourSummaries,
  predictionDraft,
  predictionBody,
} from "./pickem-board.js";
import { MAX_SPOTLIGHTS } from "./site-defaults.js";
import { roleBadge } from "./role-label.js";
import { formIdentifier } from "./form-actions.js";
import {
  countdownText,
  compactCountdownText,
  clockCountdownText,
  nextWeeklyReset,
} from "./countdown.js";
import { createAlchemyUI } from "./alchemy-ui.js";
import { applyAlchemyPatch } from "./alchemy-rules.js";
import { listingModalHTML } from "./listing-form.js";
import { createPackReveal, syncPackCardActions } from "./pack-reveal.js";
import { createFeatures } from "./features.js";
import { installInboxDropdown } from "./inbox-dropdown.js";
import { createInbox, settingTabs, inboxSettings } from "./inbox-ui.js";
import { noticePanel } from "./player-notices.js";
import { applyGameState } from "./game-state.js";
import { auctionRefreshIds, applyAuctionRefresh, syncBidForm } from "./auction-live.js";
import { readRouletteMotion, saveRouletteMotion } from "./roulette-motion.js";
import {
  seriesTitle,
  rarityClass,
  popularityLabel,
  collectionView,
  collectionPage,
} from "./card-display.js";
const $ = (s) => document.querySelector(s);
const cardSurfaces = installCardSurfaces(document);
installQuantityInputs(document);
const currentCardSize = installCardSize(document, {
  getItem: (key) => localStorage.getItem(key),
  setItem: (key, value) => localStorage.setItem(key, value),
});
const mobileNavigation = installMobileNavigation({
  bottom: [{key:'home',label:'Home'},{key:'profile',label:'Profile'},{key:'play',label:'Play'}],
  route: () => navigationSection(page(),state?.me?.id,profileData?.id),
  brand: {href:routeHref('home'),logo:new URL('./amq-tours-logo.png',import.meta.url).href},
  secondary: {href:'/tour',label:'Open Tour Platform'},
  groups: () => [
    {key:'collect',label:'Collect',keys:['profile','collection','packs','fusion','catalog','shop','auctions']},
    {key:'play',label:'Play',keys:['play','pickems','arcade']},
    {key:'community',label:'Community',keys:['home','players','ranks']}
  ],
  additionalLinks: () => [{key:'collection',href:routeHref('collection'),label:'My Collection',icon:'M3 5h7v14H3z M14 5h7v14h-7z',active:page()==='collection'}],
  extraLinks: () => (state?.me?.is_admin || state?.me?.is_quiz_maker) ? [{href:document.querySelector('.host-link').href,label:'Host Console'}] : []
});
const favoritesOnly = scope => favoriteCardFilter(scope, state?.me?.id);
function resetCardFilterPage(scope) {
  if (scope === "collection") ui.collectionPage = 1;
  else if (scope === "catalog") catalogPageNumber = 1;
  else if (scope === "market-search") ui.marketPage = 1;
  else if (scope === "trade-search") ui.tradePage = 1;
  else ui.profileCardsPage = 1;
}
const cardFilters = installCardFilters(async scope => {
  resetCardFilterPage(scope);
  try {
    if (scope !== "collection") await loadDynamic();
    render();
  } catch (error) { toast(error.message, true); }
}, () => state?.me?.id);
let titleMode = "romaji";
try {
  if (localStorage.getItem("amqtours-title-mode") === "english")
    titleMode = "english";
} catch {}
let packMotion = "full";
try {
  const saved = localStorage.getItem("amqtours-pack-motion");
  if (["system", "full", "reduced"].includes(saved)) packMotion = saved;
} catch {}
document.documentElement.dataset.packMotion = packMotion;
function packMotionControl() {
  return (
    '<label class="pack-motion-control">Pack animations<select class="pack-motion-select" aria-label="Pack animations">' +
    [
      ["full", "Full animation"],
      ["system", "System setting"],
      ["reduced", "Reduced motion"],
    ]
      .map(
        ([id, label]) =>
          '<option value="' +
          id +
          '" ' +
          (packMotion === id ? "selected" : "") +
          ">" +
          label +
          "</option>",
      )
      .join("") +
    "</select></label>"
  );
}
document.addEventListener("change", (ev) => {
  if (!ev.target.matches(".pack-motion-select")) return;
  packMotion = ev.target.value;
  document.documentElement.dataset.packMotion = packMotion;
  try {
    localStorage.setItem("amqtours-pack-motion", packMotion);
  } catch {}
  document.querySelectorAll(".pack-motion-select").forEach((el) => {
    el.value = packMotion;
  });
});
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
icons.profile =
  '<circle cx="12" cy="8" r="4"/><path d="M4 22v-3a8 8 0 0 1 16 0v3"/>';
icons.notifications = '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 8-3 10h18c0-2-3-3-3-10M10 21h4"/>';
icons.catalog = icons.collection;
icons.play = '<path d="m8 5 12 7-12 7z"/>';
const routes = SITE_ROUTES;
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
import { batchSaleQuote } from "./card-management.js";
let pendingBatchSale = null;
const ui = {
  profileView: "overview",
  profileCardsPage: 1,
  profileCardsData: null,
  profileQuizData: null,
  profileCollection: {
    kind: "both",
    query: "",
    rarity: "",
    role: "",
    sort: "custom",
    wishlist: false,
    tradeable: false,
  },
  profileFavorites: {kind:"both",query:"",rarity:"",role:"",sort:"custom",wishlist:false,tradeable:false},
  rouletteMotion: readRouletteMotion({
    getItem: (key) => localStorage.getItem(key),
  }),
  filters: { rarity: "", role: "" },
  catalogSort: "name",
  collectionSort: "rarity",
  collectionPage: 1,
  collectionFilters: {
    rarity: "",
    role: "",
    upgradable: false,
    hideProtected: false,
    tradeable: false,
  },
  playerPage: 1,
  playerData: null,
  tab: () => tab,
  metric: "earned",
  rankPage: 1,
  rankData: null,
  rankFriendsOnly: false,
  marketFriendsOnly: false,
  tradeFriendsOnly: false,
  profileQuizSort: {key:"quiz",ascending:true},
  pickemPage: 1,
  pickemData: null,
  pickemOpen: null,
  pickemDetail: null,
  pickemDrafts: {},
  marketPage: 1,
  marketData: null,
  marketSort: "newest",
  marketQuery: "",
  marketRarity: "",
  marketWishlistOnly: false,
  shopSection: "buy",
  tradeView: "browse",
  tradeQuery: "",
  tradeKind: "both",
  tradeRarity: "",
  tradeRole: "",
  tradeSort: "newest",
  tradeWishlistOnly: false,
  profileWishlist: {kind:"both",query:"",rarity:"",role:"",sort:"custom",ownership:""},
  tradeHideCompleted: (() => {
    try {
      return localStorage.getItem("amqtours-trade-hide-completed") === "1";
    } catch {
      return false;
    }
  })(),
  tradePickerShowProtected: (() => {
    try {
      return localStorage.getItem("amqtours-trade-show-protected") === "1";
    } catch {
      return false;
    }
  })(),
  tradePage: 1,
  tradeData: null,
  shopSell: {
    query: "",
    rarity: "",
    role: "",
    upgradable: false,
    hideProtected: false,
    mode: "extras",
    sort: "rarity",
    page: 1,
  },
  rouletteDraft: { choice: "red", stake: 100 },
  mahjongHistoryOpen: false,
  mahjongHistoryPage: 1,
  mahjongHistoryData: null,
  gamblingHistory: {
    game: "all",
    page: 1,
    data: null,
    loading: false,
  },
};
document.documentElement.dataset.rouletteMotion = ui.rouletteMotion;
document.addEventListener("change", (ev) => {
  if (!ev.target.matches(".roulette-motion-select")) return;
  const mode = ev.target.value;
  if (
    !saveRouletteMotion(mode, {
      setItem: (key, value) => localStorage.setItem(key, value),
    })
  )
    return;
  ui.rouletteMotion = mode;
  document.documentElement.dataset.rouletteMotion = mode;
  if (state) render();
});
let loadVersion = 0;
const pendingMutations = new Map();
const cardCache = new Map();
const collectorCounts = new Map();
let collectorCountRequest = null;
let catalogPageData = null,
  catalogPageNumber = 1;
function rememberCards(cards = []) {
  for (const c of cards) {
    cardCache.set(c.id, c);
    if (c.collectors)
      collectorCounts.set(c.id, { counts: c.collectors, at: Date.now() });
  }
  while (cardCache.size > 5000) cardCache.delete(cardCache.keys().next().value);
}
const isDemo =
  new URLSearchParams(location.search).has("demo") ||
  location.hostname.endsWith(".github.io");
const page = () => resolvePage(currentRoute());
const profileURL = (id) => routeHref("player/" + encodeURIComponent(id));
const cardBy = (id) =>
  cardCache.get(id) ||
  state.catalog.find((c) => c.id === id) || {
    id,
    name: "Archived card",
    kind: "character",
    series: "",
    image: "",
  };
const inbox = createInbox({escape,cardBy,routeHref});
let inboxWrites = Promise.resolve();
const inboxDropdown = installInboxDropdown({
  anchor: $(".inbox-anchor"), href: routeHref("notifications"), player: () => state?.me?.id,
  load: () => api("inbox"), rememberCards, inbox,
  onCount: unread => {state.inboxUnread = unread; updateInboxBadge();},
});
const image = (c) =>
  c.image
    ? `<img class="${c.id?.startsWith("acdb-") ? "acdb-portrait" : ""}" data-portrait-id="${escape(c.id || "")}" src="${escape(c.image)}" alt="${escape(c.name)}" loading="lazy" referrerpolicy="no-referrer">`
    : `<div class="fallback-img" aria-label="No image">✦</div>`;
function toast(message, error = false) {
  clearTimeout(toastTimer);
  $("#toast").textContent = message;
  $("#toast").className = `visible${error ? " error" : ""}`;
  toastTimer = setTimeout(() => ($("#toast").className = ""), 5500);
}
function modal(html, wide = false, className = "") {
  $("#modal").className = [wide ? "wide" : "", className]
    .filter(Boolean)
    .join(" ");
  $("#modal-body").innerHTML = html;
  $("#modal").showModal();
  ensureCollectorCounts();
}
let animeChecklistData = null;
async function openAnimeChecklist(seriesKey, pageNumber = 1) {
  const data = await api(
    "anime-checklist?series=" +
      encodeURIComponent(seriesKey) +
      "&page=" +
      pageNumber,
  );
  animeChecklistData = data;
  modal(
    animeChecklist(data, {
      escape,
      cardHTML,
      wishlist: state.wishlist || [],
      state,
      titleMode,
    }),
    true,
    "anime-checklist-dialog",
  );
  $("#modal").scrollTop = 0;
}
function empty(title, description, button = "") {
  return `<div class="empty"><div class="empty-icon">✦</div><h3>${title}</h3><p>${description}</p>${button}</div>`;
}
function intro(title, description, extra = "") {
  return `<div class="page-intro"><div><h1>${title}</h1><p>${description}</p></div>${extra}</div>`;
}
const btn = (label, action, extra = "", cls = "") =>
  `<button class="button ${cls}" data-action="${action}" ${extra}>${label}</button>`;
function countdown(
  end,
  prefix = "",
  days = true,
  ended = "Ended",
  compact = false,
) {
  return (
    '<span class="countdown" data-countdown-end="' +
    Number(end) +
    '" data-countdown-prefix="' +
    escape(prefix) +
    '" data-countdown-days="' +
    days +
    '" data-countdown-ended="' +
    escape(ended) +
    '" data-countdown-compact="' +
    compact +
    '">' +
    (end <= Date.now() + clockOffset
      ? ended
      : prefix +
        (compact
          ? compactCountdownText(end, Date.now() + clockOffset)
          : countdownText(end, Date.now() + clockOffset, days))) +
    "</span>"
  );
}
function remaining(end) {
  return countdown(end);
}
function tickCountdowns() {
  if (!state || document.hidden) return;
  const now = Date.now() + clockOffset;
  let expired = false;
  for (const el of document.querySelectorAll("[data-countdown-end]")) {
    const end = Number(el.dataset.countdownEnd);
    el.textContent =
      now >= end
        ? el.dataset.countdownEnded
        : el.hasAttribute("data-countdown-clock") ? clockCountdownText(end, now)
        : el.dataset.countdownPrefix +
          (el.dataset.countdownCompact === "true"
            ? compactCountdownText(end, now)
            : countdownText(end, now, el.dataset.countdownDays === "true"));
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
    !fusionOverlayOpen()
  )
    refresh().catch(() => {});
}
setInterval(() => {
  tickCountdowns();
  showTradeNotices();
  showAuctionWin();
  showSpecialPack();
}, 1000);
const shownTradeNotices = new Set();
function markTradeNoticesSeen(ids) {
  const player = state.me?.id;
  if (!player || !ids?.length) return;
  for (const id of ids) shownTradeNotices.add(player + ":" + id);
  api("notice-seen", { ids })
    .then(() => {
      if (state.me?.id === player)
        state.notices = (state.notices || []).filter(
          (notice) => !ids.includes(notice.id),
        );
    })
    .catch(() => {});
}
function showTradeNotices() {
  if (
    !state?.me ||
    busy ||
    document.hidden ||
    $("#modal").open ||
    fusionOverlayOpen() ||
    quizPlaying()
  )
    return;
  if(page()==="notifications") return;
  const notices = (state.notices || []).filter(
    (notice) => !shownTradeNotices.has(state.me.id + ":" + notice.id),
  );
  if (!notices.length) return;
  modal(noticePanel(notices, { escape, number, cardBy, image, rarityClass }));
  if ($("#modal").open)
    markTradeNoticesSeen(notices.map((notice) => notice.id));
}
function acceptAuctionNotices(value, player) {
  if(state.me?.id!==player||busy)return;
  rememberCards(value.cards);
  state.notices=value.notices;
  if (Number.isInteger(value.inboxUnread) && state.inboxUnread!==value.inboxUnread) {
    state.inboxUnread=value.inboxUnread; updateInboxBadge();
    if(page()==="notifications") loadDynamic().then(render).catch(err=>toast(err.message,true));
  }
  const market=page()==='auctions'?ui.marketData:null;
  if(applyAuctionRefresh(state,market,value.auctionState))render();
  const form=document.getElementById('bid-form');
  if(form&&value.auctionState?.player===player&&value.auctionState.now===state.auctionUpdatedAt){
    const lot=value.auctionState?.lots.find(a=>a.id===Number(form.elements.auction.value));
    if(lot)syncBidForm(form,lot,state.me,number,Date.now()+clockOffset);
  }
}
let pollingNotices = false,lastNoticePoll=0;
async function pollNotices(force=false) {
  const form=document.getElementById('bid-form');
  const fast=page()==='auctions'||!!form;
  if (
    pollingNotices ||
    busy ||
    !state?.me ||
    document.hidden ||
    isDemo ||
    quizPlaying() ||
    !force&&Date.now()-lastNoticePoll<(fast?5000:30000)
  )
    return;
  const player = state.me.id,requestState=state;
  lastNoticePoll=Date.now();
  pollingNotices = true;
  try {
    const ids=auctionRefreshIds(state,page()==='auctions'?ui.marketData:null,form?.elements.auction.value);
    const value = await api("notices?auctions="+ids.join(','));
    if (state.me?.id === player&&state===requestState) {
      acceptAuctionNotices(value,player);
      showTradeNotices();
    }
  } catch {
  } finally {
    pollingNotices = false;
  }
}
setInterval(pollNotices,1000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)pollNotices(true);});
function revealAcquired(result, title = "A New Favourite Is Yours.") {
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
      '</div><a class="button mint" href="' + routeHref("collection") + '" data-close-dialog>View my collection ↗</a><button class="text-button" data-close-dialog>Keep exploring</button></section>',
  );
  if ($("#modal").open) markTradeNoticesSeen(result.noticeIds);
}
function showAuctionWin() {
  if (
    !state?.me ||
    busy ||
    document.hidden ||
    $("#modal").open ||
    fusionOverlayOpen()
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
      "</div><h2>You Won the Auction!</h2><p>" +
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
let showingSpecialPack = false;
function showSpecialPack() {
  if (
    showingSpecialPack ||
    !state?.me ||
    !state?.specialPack ||
    busy ||
    document.hidden ||
    $("#modal").open ||
    fusionOverlayOpen() ||
    quizPlaying()
  )
    return;
  showingSpecialPack = true;
  const pack = state.specialPack;
  delete state.specialPack;
  rememberCards(pack.cards);
  packReveal.show({ cards: pack.cards }, { special: true });
  api("special-pack-seen", {})
    .catch(() => {})
    .finally(() => {
      showingSpecialPack = false;
    });
}
function cardFlags(c) {
  const item = state?.inventory?.find((i) => i.card === c.id);
  return {
    protectedCard: !!item?.protected,
    forTrade: !!item?.for_trade,
    wishlisted: (state?.wishlist || []).includes(c.id),
  };
}
function ownedCardActions(c, item) {
  const id = escape(c.id), cost = enhancementCost(item.level), maxed = item.level >= MAX_CARD_LEVEL;
  const showcased = state.showcase?.includes(c.id) ?? false;
  const toggles = cardQuickActions(c, {
    wishlist: state.wishlist?.includes(c.id) ?? false,
    protect: !!item.protected,
    trade: !!item.for_trade,
    favorite: cardFavoriteFlag(state,c.id),
  }, escape);
  return `<div class="card-copy-info"><span>${item.copies - 1} Extra Copies</span><span>${maxed ? "MAX" : cost + " to Enhance"}</span></div>
    <div class="card-action-grid owned-card-grid">
      <button class="bid-button" data-action="enhance" data-id="${id}" ${maxed || item.copies - 1 < cost ? "disabled" : ""}>${maxed ? "MAX" : "Enhance → " + (item.level + 1 === MAX_CARD_LEVEL ? "MAX" : item.level + 1)}</button>
      <button class="text-button" data-action="set-avatar" data-id="${id}" aria-pressed="${state.me?.avatar_card === c.id}">Profile Pic</button>
      <button type="button" class="text-button" data-action="showcase-toggle" data-id="${id}" aria-pressed="${showcased}">Showcase</button>
      <button class="text-button" data-action="sell-card" data-id="${id}" ${item.protected ? "disabled" : ""}>List Card ↗</button>
      ${collectorsButton(c, escape)}
    </div>${toggles}`;
}
function cardHTML(c, a = null, item = null, extraActions = "", { packResult = false } = {}) {
  const mine = a?.winner === state.me?.id,
    selling = a?.seller === state.me?.id,
    level = item?.level || a?.level;
  const auction = a
    ? `${a.seller || a.rolling ? `<p class="form-hint user-auction-timer">${countdown(a.ends, "Ends in ", true, "Ended", true)}</p>` : ""}<p class="form-hint">${a.seller ? 'By <a href="' + profileURL(a.seller) + '">' + escape(a.seller_name || a.seller) + "</a> " + roleBadge(state.roles?.[a.seller]) : "Community auction"}</p><div class="bid-label"><span>${a.bid ? "Highest bid" : "Opening bid"}</span></div><div class="card-price"><span class="coin">✦</span> ${number(a.bid || a.reserve || 1)} <span class="subtext">credits</span></div>${a.winner && a.bid ? `<p class="form-hint auction-leader">Highest bidder: <a href="${profileURL(a.winner)}">${escape(a.winner_name || a.winner)}</a> ${roleBadge(state.roles?.[a.winner])}${mine ? " · You" : ""}</p>` : '<p class="form-hint auction-leader">No bids yet</p>'}${selling ? `<p class="form-hint">Your listing</p>${!a.bid ? btn("Withdraw listing", "cancel-listing", `data-id="${a.id}" data-venue="auction"`, "secondary") : ""}` : btn(a.ends <= state.now ? "Claim your card" : mine ? "↑ Your bid leads" : "Place a bid ↗", a.ends <= state.now ? "claim" : "bid", `data-id="${a.id}"`, "secondary")}${a.buyout && !selling && a.ends > state.now ? btn("Buyout · ✦ " + number(a.buyout), "buyout", `data-id="${a.id}"`, "mint") : ""}`
    : "";
  const owned = item && !item.preview ? ownedCardActions(c, item) : "";
  const actions =
    auction +
    owned +
    (!packResult && (page() === "catalog" || a) ? collectorsButton(c, escape) : "") +
    (state.me && !item?.preview && !owned && !packResult
      ? wishlistButton(c, state.wishlist || [], escape, state)
      : "") +
    extraActions;
  const meta = a
    ? `✦ ${number(a.bid || a.reserve || 1)}<small>${a.winner && a.bid ? "Highest Bidder: " + escape(a.winner_name || a.winner) : "Opening Bid"}</small>${a.seller || a.rolling ? `<small class="user-auction-timer">${countdown(a.ends, "Ends in ", true, "Ended", true)}</small>` : ""}`
    : "";
  return cardSurface(
    c,
    {
      level: level || 1,
      showLevel: !!level,
      ...(item?.ownerFlags || cardFlags(c)),
      forTrade: !!(item?.ownerFlags?.forTrade ?? item?.for_trade ?? cardFlags(c).forTrade),
      protectedCard: !!(item?.ownerFlags?.protectedCard ?? item?.protected ?? cardFlags(c).protectedCard),
      wishlisted: !!(item?.ownerFlags?.wishlisted ?? cardFlags(c).wishlisted),
      tag:
        c.kind === "seiyuu"
          ? "SEIYUU"
          : c.role === "main"
            ? "MAIN"
            : c.role === "unknown"
              ? "UNSORTED"
              : "SUPPORTING",
      actions,
      meta,
      details: a?.extra_copies
        ? `<p class="form-hint">Includes ${number(a.extra_copies)} spare copies from level conversion.</p>`
        : "",
    },
    { escape, image, gradeBadge, series, cardFlags },
  );
}
function tabs() {
  const choices = [
    ["character", "Characters"],
    ["seiyuu", "Seiyuus"],
    ...(page() === "packs" ? [] : [["both", "Both"]]),
  ];
  return `<div class="tabs" role="group" aria-label="Card type">${choices.map(([id, label]) => `<button class="tab ${tab === id ? "active" : ""}" data-tab="${id}" aria-pressed="${tab === id}">${label}</button>`).join("")}</div>`;
}
const workingTitlePopovers = installDetailPopovers(document);
let quizUI, arcadePage;
const quizPlaying = () => page() === "quiz" && quizUI?.active();
const loadQuizUI = loadOnce(async () => {
  const { createQuizUI } = await import("./quiz-ui.js");
  return quizUI = createQuizUI({
    gachaLayout: true,
    api,
    escape,
    prepareTitles: loadQuizTitleDisplay,
    animeTitle: (song) => quizAnimeTitle(song, titleMode),
    getState: () => state,
    onRender: (options) => {
      if (page() !== "quiz") return;
      if (options?.questionOnly && quizUI.updateQuestion()) return;
      render();
    },
    onWallet: (me) => {
      state.me = me;
    },
  });
});
const alchemyUI = createAlchemyUI({
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
const arcadeStyles = ["mahjong.css", "pachinko.css", "adventure.css", "horse-racing.css"].map(name =>
  loadOnce(() => loadStylesheet(new URL(name, import.meta.url), document.querySelector('link[href="card-frames.css"]'))),
);
const loadArcadePage = loadOnce(async () => {
  const [{ createArcadePage }] = await Promise.all([
    import("./arcade-page.js"),
    ...arcadeStyles.map(load => load()),
  ]);
  return arcadePage = createArcadePage({
    ui, getState: () => state, api, auth, execute, loadDynamic, modal,
    refreshCurrent, render, escape, number, now: () => Date.now() + clockOffset,
  });
});
const tradesUI = createTradesUI(
  {
    escape,
    number,
    btn,
    cardBy,
    image,
    gradeBadge,
    rarityClass,
    series,
    empty,
    profileURL,
    getState: () => state,
  },
  ui,
);
const features = createFeatures(
  {
    escape,
    number,
    btn,
    cardHTML,
    cardFlags,
    cardBy,
    image,
    gradeBadge,
    rarityClass,
    series,
    empty,
    remaining,
    countdown,
    nextWeeklyReset,
    profileURL,
    tabs,
    getState: () => state,
    avatarHTML,
    renderTrades: () => tradesUI.render(),
  },
  ui,
);
const wishlistEditor = createWishlistEditor({
  escape,
  cardBy,
  image,
  gradeBadge,
  series,
});
const collectionEditor = createCollectionEditor({
  escape,
  cardBy,
  image,
  gradeBadge,
  series,
});
const showcaseEditor = createShowcaseEditor({
  escape,
  cardBy,
  image,
  gradeBadge,
  series,
});
function openShowcasePurchase() {
  const slots = state.me?.showcase_slots ?? 30,
    max = Math.min(
      MAX_SPOTLIGHTS - slots,
      Math.floor((state.me?.balance || 0) / 100),
    );
  if (slots >= MAX_SPOTLIGHTS) {
    toast("All " + MAX_SPOTLIGHTS + " showcase slots are unlocked.");
    return;
  }
  if (max < 1) {
    toast("You need 100 credits to unlock a showcase slot.", true);
    return;
  }
  modal(
    "<h2>Unlock Showcase Slots</h2><p>100 credits per slot · " +
      slots +
      ' slots unlocked · 30 free. Slots stay available when you swap or remove cards.</p><form id="showcase-slots-form" class="stack"><input type="hidden" name="expectedSlots" value="' +
      slots +
      '">' +
      quantityInput({
        id: "showcase-slot-count",
        name: "quantity",
        label: "Slots to Unlock",
        max,
      }) +
      '<p class="money">Total: ✦ <span id="showcase-slot-price">100</span></p><div class="form-error" role="alert"></div><button class="button mint" type="submit">Buy Slots</button></form>',
  );
}
document.addEventListener("input", (event) => {
  if (event.target.id === "showcase-slot-count")
    $("#showcase-slot-price").textContent = number(
      Number(event.target.value) * 100,
    );
});
const titleEditor = createTitleOrderEditor();
const titleDrag = installCardOrderDrag(document, titleEditor, {
  prefix: "title",
  pointerMouse: true,
  panel: ".title-arrange-panel",
  canEdit: () =>
    !busy && page() === "titles" && titleEditor.activeFor(state.me?.id),
  changed(id) {
    const scroll = window.scrollY;
    render();
    window.scrollTo(0, scroll);
    if (id) {
      document
        .querySelector('[data-title-handle="' + CSS.escape(id) + '"]')
        ?.focus({ preventScroll: true });
      const status = document.getElementById("title-arrange-status");
      if (status)
        status.textContent =
          "Title moved to position " +
          (titleEditor.cards().indexOf(id) + 1) +
          ".";
    }
  },
});
document.addEventListener("change", (event) => {
  if (event.target.matches("[data-title-choice]") && !busy)
    titleEditor.setEquipped(
      event.target.dataset.titleChoice,
      event.target.checked,
    );
});
document.addEventListener("click", (event) => {
  if (
    !event.target.closest('[data-action="title-order-reset"]') ||
    busy ||
    !ui.titleData ||
    !state.me
  )
    return;
  titleDrag.cancel();
  titleEditor.open(ui.titleData, state.me.id);
  render();
});
const wishlistDrag = installWishlistDrag(document, wishlistEditor, {
  canEdit: () => !busy,
  changed(card) {
    ui.profileCardsPage = wishlistEditor.currentPage();
    const scroll = window.scrollY;
    render();
    window.scrollTo(0, scroll);
    if (card)
      document
        .querySelector('[data-wishlist-handle="' + CSS.escape(card) + '"]')
        ?.focus({ preventScroll: true });
    const status = document.getElementById("wishlist-arrange-status");
    if (status && card)
      status.textContent =
        cardBy(card).name +
        " moved to position " +
        (wishlistEditor.cards().indexOf(card) + 1) +
        ".";
  },
});
const showcaseDrag = installCardOrderDrag(document, showcaseEditor, {
  prefix: "showcase",
  visualPrefix: "wishlist",
  panel: ".showcase-arrange-panel",
  capture: "#main",
  canEdit: () => !busy,
  changed(card) {
    const scroll = window.scrollY;
    render();
    window.scrollTo(0, scroll);
    if (card) {
      document
        .querySelector('[data-showcase-handle="' + CSS.escape(card) + '"]')
        ?.focus({ preventScroll: true });
      const status = document.getElementById("showcase-arrange-status");
      if (status)
        status.textContent =
          cardBy(card).name +
          " moved to position " +
          (showcaseEditor.cards().indexOf(card) + 1) +
          ".";
    } else
      document.getElementById("showcase-sort")?.focus({ preventScroll: true });
  },
});
const collectionDrag = installCardOrderDrag(document, collectionEditor, {
  prefix: "collection",
  visualPrefix: "wishlist",
  panel: ".collection-arrange-panel",
  capture: "#main",
  canEdit: () => !busy,
  changed(card) {
    if (page() === "collection")
      ui.collectionPage = collectionEditor.currentPage();
    else ui.profileCardsPage = collectionEditor.currentPage();
    const scroll = window.scrollY;
    render();
    window.scrollTo(0, scroll);
    if (card) {
      document
        .querySelector('[data-collection-handle="' + CSS.escape(card) + '"]')
        ?.focus({ preventScroll: true });
      const status = document.getElementById("collection-arrange-status");
      if (status)
        status.textContent =
          cardBy(card).name +
          " moved to position " +
          (collectionEditor.cards().indexOf(card) + 1) +
          ".";
    } else
      document
        .getElementById("collection-sort")
        ?.focus({ preventScroll: true });
  },
});
const pinnedAnimeEditor = createPinnedAnimeEditor({ series, escape });
const pinnedAnimeDrag = installCardOrderDrag(document, pinnedAnimeEditor, {
  prefix: "pinned-anime",
  visualPrefix: "wishlist",
  panel: ".pinned-anime-arrange-panel",
  pointerMouse: true,
  canEdit: () =>
    !busy &&
    page() === "collection" &&
    pinnedAnimeEditor.activeFor(state.me?.id),
  changed(seriesKey) {
    const scroll = window.scrollY;
    render();
    window.scrollTo(0, scroll);
    if (seriesKey) {
      document
        .querySelector(
          '[data-pinned-anime-handle="' + CSS.escape(seriesKey) + '"]',
        )
        ?.focus({ preventScroll: true });
      const status = document.getElementById("pinned-anime-arrange-status");
      if (status) {
        const item = pinnedAnimeEditor
          .items()
          .find((a) => a.series_key === seriesKey);
        const name = item
          ? series({ ...item, series: item.series_romaji })
          : seriesKey;
        status.textContent =
          name +
          " moved to position " +
          (pinnedAnimeEditor.keys().indexOf(seriesKey) + 1) +
          ".";
      }
    }
  },
});

document.addEventListener("input", (event) => {
  if (event.target.id === "trade-offer-credits") {
    tradesUI.setCredits?.(event.target.value);
    const btn = document.querySelector("#trade-card-form button[type='submit']");
    if (btn && tradesUI.submitLabel) btn.textContent = tradesUI.submitLabel();
    return;
  }
  if (event.target.id !== "trade-picker-query" || busy) return;
  const position = event.target.selectionStart;
  tradesUI.filter("query", event.target.value);
  $("#modal-body").innerHTML = tradesUI.renderPicker();
  const input = $("#trade-picker-query");
  input.focus();
  input.setSelectionRange(position, position);
});
document.addEventListener("change", (event) => {
  if (busy) return;
  if (event.target.id === "trade-offer-credits") {
    tradesUI.setCredits?.(event.target.value);
    const btn = document.querySelector("#trade-card-form button[type='submit']");
    if (btn && tradesUI.submitLabel) btn.textContent = tradesUI.submitLabel();
    return;
  }
  if (event.target.id === "trade-picker-kind") {
    tradesUI.filter("kind", event.target.value);
    $("#modal-body").innerHTML = tradesUI.renderPicker();
  }
  if (event.target.id === "trade-picker-rarity") {
    tradesUI.filter("rarity", event.target.value);
    $("#modal-body").innerHTML = tradesUI.renderPicker();
  }
  if (event.target.id === "trade-picker-role") {
    tradesUI.filter("role", event.target.value);
    $("#modal-body").innerHTML = tradesUI.renderPicker();
  }
  if (event.target.id === "trade-picker-sort") {
    tradesUI.filter("sort", event.target.value);
    $("#modal-body").innerHTML = tradesUI.renderPicker();
  }
  if (event.target.id === "trade-picker-upgradable") {
    tradesUI.filter("upgradable", event.target.checked);
    $("#modal-body").innerHTML = tradesUI.renderPicker();
  }
  if (event.target.id === "trade-picker-show-protected") {
    tradesUI.filter("showProtected", event.target.checked);
    try {
      if (event.target.checked)
        localStorage.setItem("amqtours-trade-show-protected", "1");
      else localStorage.removeItem("amqtours-trade-show-protected");
    } catch {}
    $("#modal-body").innerHTML = tradesUI.renderPicker();
  }
  if (event.target.dataset.tradeCopyIndex !== undefined) {
    tradesUI.variant(
      event.target.value,
      Number(event.target.dataset.tradeCopyIndex),
    );
    $("#modal-body").innerHTML = tradesUI.renderPicker();
  }
  if (event.target.id === "trade-copy") {
    tradesUI.variant(event.target.value);
    $("#modal-body").innerHTML = tradesUI.renderPicker();
  }
});

let fusionPickerFocus = null,
  fusionReviewOpen = false,
  pendingAlchemyMaterial = null;
function repaintAlchemyOrder(key = null) {
  const selector = "#fusion-picker,.fusion-picker-dialog,.alchemy-queue-list",
    scrolls = [...document.querySelectorAll(selector)].map((el) => [
      el.scrollTop,
      el.scrollLeft,
    ]),
    pageScroll = [window.scrollX, window.scrollY];
  if (alchemyUI.pickerOpen()) renderFusionPicker();
  else render();
  [...document.querySelectorAll(selector)].forEach((el, i) => {
    if (scrolls[i]) {
      el.scrollTop = scrolls[i][0];
      el.scrollLeft = scrolls[i][1];
    }
  });
  window.scrollTo(...pageScroll);
  if (key)
    document
      .querySelector('[data-alchemy-handle="' + CSS.escape(key) + '"]')
      ?.focus({ preventScroll: true });
}
const alchemyDrag = installCardOrderDrag(
  document,
  {
    cards: () => alchemyUI.orderKeys(),
    move: (key, to) => alchemyUI.moveKey(key, to),
    drop: (key, target, after) => alchemyUI.dropKey(key, target, after),
  },
  {
    prefix: "alchemy",
    panel: ".alchemy-sort-grid",
    capture: (handle) => handle,
    scrollSelector: ".alchemy-queue-list",
    canEdit: () => !busy && !fusionReviewOpen,
    changed: repaintAlchemyOrder,
  },
);
document.addEventListener("change", (event) => {
  const id = event.target.dataset.alchemyExtras;
  if (!id || busy) return;
  try {
    alchemyUI.setExtras(id, Number(event.target.value));
    repaintAlchemyOrder();
  } catch (error) {
    toast(error.message, true);
    event.target.value = event.target.defaultValue;
  }
});
function fusionOverlayOpen() {
  return alchemyUI.pickerOpen() || fusionReviewOpen;
}
function openFusionReview(body, content = null) {
  fusionPickerFocus = document.activeElement;
  fusionReviewOpen = true;
  const overlay = $("#fusion-picker");
  overlay.innerHTML =
    '<section class="fusion-picker-dialog fusion-review-dialog" role="dialog" aria-modal="true" aria-labelledby="fusion-review-title" tabindex="-1"><button type="button" class="fusion-review-close" data-action="alchemy-close" aria-label="Close Alchemy Review">×</button>' +
    (content || alchemyUI.confirmation(body)) +
    "</section>";
  overlay.hidden = false;
  document
    .querySelectorAll(".sidebar,.workspace")
    .forEach((el) => (el.inert = true));
  document.body.classList.add("fusion-picker-open");
  overlay.querySelector('[data-action="alchemy-close"]')?.focus();
}
function showRefinementResult() {
  const dialog = $("#fusion-picker .fusion-review-dialog");
  dialog.innerHTML =
    '<button type="button" class="fusion-review-close" data-action="alchemy-close" aria-label="Close Alchemy Result">×</button>' +
    alchemyUI.refinementResult();
  dialog.querySelector(".fusion-review-actions button").focus();
}
function showAlchemyDrawResult() {
  const dialog = $("#fusion-picker .fusion-review-dialog");
  dialog.classList.add("alchemy-draw-dialog");
  dialog.innerHTML =
    '<button type="button" class="fusion-review-close" data-action="alchemy-close" aria-label="Close Alchemy Result">×</button>' +
    alchemyUI.drawResult();
  (
    dialog.querySelector('[data-action="alchemy-draw-reveal"]') ||
    dialog.querySelector(".fusion-review-actions button")
  ).focus({ preventScroll: true });
}
function renderFusionPicker(focusSearch = false, resultsOnly = false) {
  const overlay = $("#fusion-picker");
  const results = overlay.querySelector("#alchemy-picker-results");
  if (resultsOnly && results) {
    results.innerHTML = alchemyUI.renderPicker(true);
    return;
  }
  const previous = overlay.querySelector("#fusion-search");
  const selection =
    previous && document.activeElement === previous
      ? [
          previous.selectionStart,
          previous.selectionEnd,
          previous.selectionDirection,
        ]
      : null;
  const scrollTop =
    overlay.querySelector(".fusion-picker-dialog")?.scrollTop || 0;
  overlay.innerHTML = alchemyUI.renderPicker();
  cardFilters.update(overlay);
  const dialog = overlay.querySelector(".fusion-picker-dialog");
  if (dialog) dialog.scrollTop = scrollTop;
  overlay.hidden = false;
  const input = overlay.querySelector("#fusion-search");
  if (focusSearch || selection) {
    input?.focus({ preventScroll: true });
    if (selection) input?.setSelectionRange(...selection);
  }
}
async function openFusionPicker(mode = "material", rarity = null) {
  fusionPickerFocus = document.activeElement;
  alchemyUI.openPicker(mode, rarity);
  if ($("#modal").open) $("#modal").close();
  document.querySelectorAll(".sidebar,.workspace").forEach((el) => {
    el.inert = true;
  });
  document.body.classList.add("fusion-picker-open");
  renderFusionPicker(true);
  if (mode === "target") {
    const results = await alchemyUI.loadTargets(api);
    if (results && alchemyUI.pickerOpen()) renderFusionPicker(false, true);
  }
}
function closeFusionPicker(force = false) {
  if (busy && !force) return;
  fusionReviewOpen = false;
  alchemyUI.closePicker();
  const overlay = $("#fusion-picker");
  overlay.hidden = true;
  overlay.innerHTML = "";
  document.querySelectorAll(".sidebar,.workspace").forEach((el) => {
    el.inert = false;
  });
  document.body.classList.remove("fusion-picker-open");
  const returnFocus = fusionPickerFocus;
  fusionPickerFocus = null;
  if (page() === "fusion") render();
  const returnTarget = returnFocus?.isConnected
    ? returnFocus
    : [...document.querySelectorAll("#main [data-action]")].find(
        (el) =>
          returnFocus?.dataset.action &&
          el.dataset.action === returnFocus.dataset.action &&
          el.dataset.rarity === returnFocus.dataset.rarity &&
          el.dataset.id === returnFocus.dataset.id,
      );
  returnTarget?.focus({ preventScroll: true });
}
document.addEventListener("keydown", (ev) => {
  if (!fusionOverlayOpen()) return;
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
  const winner = p.mode === "tour";
  const dated = /^(\d{4}-\d{2}-\d{2})\s+(.+)$/.exec(p.tour);
  const date = dated && new Date(dated[1] + "T00:00:00Z");
  const hasDate = date && Number.isFinite(date.getTime()) && date.toISOString().startsWith(dated[1]);
  const tourName = hasDate ? dated[2] : p.tour;
  const dateLabel = hasDate
    ? `<time datetime="${dated[1]}">${date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}</time>`
    : "";
  const meta = [dateLabel, winner ? pickemTeams(p).length + " teams" : escape(tourName), "Free entry"]
    .filter(Boolean).join('<b aria-hidden="true">•</b>');
  const credits = p.winner_reward + (p.mode === "pair" ? 2 * p.score_reward : 0);
  const reward = winner ? "for a correct pick" : p.mode === "pair" ? "for the correct two-game result"
    : `for the winner + ${number(p.score_reward)} per exact team score`;
  return `<section class="pickem-ticket" aria-label="Open Tour Pick’em"><div class="pickem-ticket-main">
    <svg class="pickem-ticket-mark" viewBox="0 0 128 128" fill="none" stroke="currentColor" stroke-width="3" aria-hidden="true"><path d="M38 29h52v20c0 22-11 35-26 37-15-2-26-15-26-37V29Zm0 7H23v9c0 14 8 23 20 25m47-34h15v9c0 14-8 23-20 25M64 86v13m-15 6q15-12 30 0v5H49z"/><path d="m64 42 4 9 10 1-7 7 2 10-9-5-9 5 2-10-7-7 10-1z"/></svg>
    <div class="pickem-ticket-kicker">Tour Pick’em <span class="pickem-ticket-open"><i aria-hidden="true"></i>Open</span></div>
    <h2>${winner ? escape(tourName) : escape(p.team_a + " vs " + p.team_b)}</h2>
    <div class="pickem-ticket-meta">${meta}</div>
    <div class="pickem-ticket-prize"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" aria-hidden="true"><path d="M7 3h10v6c0 4-2.2 6.5-5 7-2.8-.5-5-3-5-7V3Zm0 2H3v2c0 3 2 5 5 5m9-7h4v2c0 3-2 5-5 5m-4 4v4m-4 1h8"/></svg><span><strong>${number(credits)} credits</strong> ${reward}</span></div>
  </div><div class="pickem-ticket-side">
    <div class="pickem-ticket-clocklabel">Voting closes in</div>
    <div class="pickem-ticket-time" data-countdown-end="${Number(p.ends)}" data-countdown-ended="Closed" data-countdown-clock>${clockCountdownText(p.ends, Date.now() + clockOffset)}</div>
    <a class="pickem-ticket-action" href="${routeHref("pickems/" + p.id)}">${winner ? "Pick Your Winner" : "Make Your Prediction"} <span aria-hidden="true">→</span></a>
    ${pickemShare(p.id)}
  </div></section>`;
}
const packReveal = createPackReveal({
  motionControl: packMotionControl,
  modal,
  cardHTML,
  escape,
  number,
  getState: () => state,
});
async function saveCardAction(path, body, t) {
  if (!t.closest("[data-pack-card]"))
    return execute(path, body, (result) => toast(result.message));
  if (busy) return;
  const root = $("#modal");
  const buttons = [...root.querySelectorAll("[data-pack-card] button")].map(
    (button) => ({ button, disabled: button.disabled }),
  );
  buttons.forEach(({ button }) => { button.disabled = true; });
  try {
    return await execute(path, body, (result) => toast(result.message));
  } finally {
    buttons.forEach(({ button, disabled }) => { button.disabled = disabled; });
    syncPackCardActions(root, state);
    syncCardFlags(root, cardFlags);
  }
}
function dailyPack() {
  const day = new Date(state.now + 9 * 3600000).toISOString().slice(0, 10);
  if (state.me?.daily_pack === day) return "";
  if (Object.hasOwn(state, "loginReward"))
    return '<div class="notice daily-pack">Daily rewards are updating. Please refresh in a moment.</div>';
  return `<div class="daily-strip daily-pack"><div class="daily-icon">♢</div><div><h3>Your Daily Pack Is Waiting.</h3><p>Choose 5 random characters or seiyuus · free each day</p></div><form id="daily-pack-form" class="daily-pack-claim"><label>Pack Type<select id="daily-pack-kind" name="kind" aria-label="Daily pack type"><option value="character" ${ui.dailyPackKind !== "seiyuu" ? "selected" : ""}>Character Pack</option><option value="seiyuu" ${ui.dailyPackKind === "seiyuu" ? "selected" : ""}>Seiyuu Pack</option></select></label><button type="submit" class="button mint">Claim & open →</button></form></div>`;
}
function daily() {
  const claimed =
    state.me?.daily ===
    new Date(state.now + 9 * 3600000).toISOString().slice(0, 10);
  if (claimed) return "";
  return `<div class="daily-strip"><div class="daily-icon">✦</div><div><h3>A Little Something for Showing Up.</h3><p>Daily check-in · 300 credits</p></div>${btn("+ Claim 300", "daily", "", "mint")}</div>`;
}
function specialPackPanel(kind){
  const price=state.settings['special_'+kind+'_price'];if(!price)return '';
  return `<article class="pack-panel ${kind} special-paid"><span class="eyebrow">${kind==='character'?'Characters':'Seiyuus'}</span><h3>Special Card Pack</h3><p>${SPECIAL_PACK_DESCRIPTION}</p>${btn('<span class="coin">✦</span> '+number(price)+' <span>· Open pack →</span>','pack',`data-kind="${kind}" data-special="true"`,'secondary')}<div class="pack-object" aria-hidden="true">✦<span class="pack-caption">${kind==='character'?'CHARACTER':'SEIYUU'} / 10</span></div></article>`;
}
function packPanel(kind, premium = false) {
  const char = kind === "character",
    price =
      state.settings[(premium ? "premium_" : "") + kind + "_price"] ||
      (premium ? 1000 : 500);
  return `<article class="pack-panel ${kind} ${premium ? "premium" : ""}"><span class="eyebrow">${premium ? "A LITTLE MORE EXTRAORDINARY." : "FIVE CARDS. NEW POSSIBILITIES."}</span><h3>${premium ? "Premium " : ""}${char ? "Character" : "Seiyuu"} Card Pack</h3><p>${premium ? "Double the normal chance of S, SS, SSS, Ubers, AG." : char ? "Five completely random characters. Every card has an equal chance." : "Collect the voices behind your favourite stories. Every actor has an equal chance."}</p>${btn('<span class="coin">✦</span> ' + number(price) + " <span>· Open pack →</span>", "pack", `data-kind="${kind}" data-premium="${premium}"`, "secondary")}<div class="pack-object" aria-hidden="true">${premium ? "✦" : char ? "✧" : "♬"}<span class="pack-caption">${premium ? "PREMIUM" : char ? "CHARACTER" : "SEIYUU"} / 05</span></div></article>`;
}
function home() {
  const hero = heroCards || [];
  const rewards = [daily(), dailyPack()].filter(Boolean);
  const featured = state.auctions
    .filter((a) => !a.seller && a.ends > state.now)
    .slice(0, 10);
  return (
    intro(
      state.me
        ? `Hey, ${escape(state.me.name)} <span class="muted">✧</span>`
        : "Your Next Favourite Awaits.",
      "A good tour deserves a great collection.",
      `<span class="pill"><span class="dot"></span> THE AMQ COLLECTION CLUB</span>`,
    ) +
    (state.activePickem
      ? pickemHero(state.activePickem)
      : `<section class="hero"><div class="hero-copy"><div class="hero-tag">PLAY TOURS. EARN CREDITS. COLLECT.</div><h2>For the Characters<br>You <span>Can’t Forget.</span></h2><p>Play tours, earn credits, gamble big, and collect your favorites!</p><div class="hero-actions"><a class="button" href="${routeHref("packs")}">Find your next favourite <span>↗</span></a><a class="button secondary" href="${routeHref("collection")}">See my collection <span>↗</span></a></div></div><div class="hero-art" aria-hidden="true">${hero.map((c) => `<div class="hero-card tier-${rarityClass(c.rarity)} ${cardFrameClass()}">${image(c)}${gradeBadge(c)}<strong>${escape(c.name)}</strong></div>`).join("")}</div></section>`) +
    (rewards.length
      ? `<div class="daily-rewards ${rewards.length === 2 ? "two-col" : ""}">${rewards.join("")}</div>`
      : "") +
    `<div class="section-head"><div class="section-title"><h2>${state.communityMarket?.active ? "Community Auctions" : "This Week’s Auction"}</h2><span class="pill live"><span class="dot"></span> ${featured.length ? "BIDDING OPEN" : "COMING SOON"}</span></div><div class="auction-header-actions"><span class="subtext">${state.communityMarket?.active ? "12 Hours · Each Bid Restarts the Clock" : countdown(nextWeeklyReset(state.now), "Auction resets in ", true, "Refreshing auctions…")}</span><a class="text-button" href="${routeHref("auctions")}">View auctions ↗</a></div></div>${
      featured.length
        ? `<div class="overview-auctions">${["character", "seiyuu"]
            .map(
              (kind) =>
                `<section aria-label="${kind === "character" ? "Character" : "Seiyuu"} auctions"><h3>${kind === "character" ? "Character" : "Seiyuu"} Auctions</h3><div class="card-grid weekly-card-grid">${
                  featured
                    .filter((a) => a.kind === kind)
                    .slice(0, 5)
                    .map((a) => cardHTML(cardBy(a.card), a))
                    .join("") ||
                  '<p class="form-hint">No auctions available.</p>'
                }</div></section>`,
            )
            .join("")}</div>`
        : empty(
            "The Next Lineup Is on Its Way.",
            "Five characters and five voice actors will enter the weekly auction once the host loads the catalog.",
          )
    }<div class="section-head"><div><h2>Unwrap a Little Luck</h2></div><a class="text-button" href="${routeHref("packs")}">Explore packs ↗</a></div><div class="two-col">${packPanel("character")}${packPanel("seiyuu")}</div><div class="stat-grid"><div class="stat"><span>YOUR COLLECTION</span><strong>${number(state.inventory.length)}</strong><small>unique cards, endless favourites</small></div><div class="stat"><span>LIFETIME CREDITS EARNED</span><strong>${number(state.me?.earned)}</strong><small>every tour effort counts</small></div><div class="stat"><span>COLLECTORS IN THE CLUB</span><strong>${number(state.counts.players)}</strong><small>from the AMQ Tours community</small></div></div>`
  );
}
function collection() {
  if (
    state.me &&
    (collectionEditor.activeFor(state.me.id) ||
      pinnedAnimeEditor.activeFor(state.me.id))
  )
    return (
      profileTabs("collection") +
      intro(
        '<span class="desktop-collection-title">Your Collection. Your Favourites.</span><span class="mobile-collection-title">My Collection</span>',
        "Every card has a story.",
        btn("Close Arrange", "collection-cancel", "", "secondary"),
      ) +
      (pinnedAnimeEditor.activeFor(state.me.id)
        ? pinnedAnimeEditor.render(number)
        : features.pinnedAnime()) +
      collectionEditor.render()
    );
  const items = collectionView(state.inventory, cardBy, {
    kind: tab,
    query: search,
    sort: ui.collectionSort,
    ...ui.collectionFilters,
    strict: strictCards("collection"),
    favoriteIds: favoritesOnly("collection") ? new Set(state.cardFavorites || []) : null,
  });
  const collectionData = collectionPage(items, ui.collectionPage);
  ui.collectionPage = collectionData.page;
  return (
    profileTabs("collection") +
    intro(
      '<span class="desktop-collection-title">Your Collection. Your Favourites.</span><span class="mobile-collection-title">My Collection</span>',
      "Every card has a story.",
      state.me &&
      (state.inventory.length > 1 || (ui.animeData?.pinned?.length || 0) > 1)
        ? btn("Arrange Collection", "collection-arrange", "", "secondary")
        : "",
    ) +
    (state.me ? features.pinnedAnime() : "") +
    `<section class="collection-toolbar" aria-label="Collection controls"><div class="filters collection-toolbar-main">${tabs()}<input class="search" id="search" aria-label="Search your collection" placeholder="Search your collection…" value="${escape(search)}">${features.filters("collection")}</div>${state.me ? features.catalogPager(collectionData, ui.collectionPage, "collection-top") : ""}</section>` +
    (state.me
      ? items.length
        ? `<div class="card-grid collection-card-grid">${collectionData.items.map((i) => cardHTML(i.c, null, i)).join("")}</div>`
        : empty(
            "No Matching Cards in Your Collection.",
            "Try another search or clear the rarity and role filters.",
            '<a class="button" href="' + routeHref("packs") + '">Explore card packs ↗</a>',
          )
      : empty(
          "Your Collection Is Waiting.",
          "Sign in using your AMQ player ID or alias to see your cards.",
          btn("Sign in", "account"),
        )) +
    (state.me
      ? `<div class="collection-footer-pager">${features.catalogPager(collectionData, ui.collectionPage, "collection")}</div>` +
        features.animeCollection()
      : "") +
    `<div class="notice space-top">Enhance with extra copies of the same card: Lv. 2 needs 1, Lv. 3 needs 2, Lv. 4 needs 3, Lv. 5 needs 4, and MAX needs 5. MAX is Level 6 (16 invested copies total). Your base card is kept; there is no credit fee.</div>`
  );
}
function packs() {
  return (
    intro(
      "Find Your Next Favourite.",
      "Characters, husbandos, waifus, and the voices you know by heart.",
      packMotionControl(),
    ) +
    dailyPack() +
    `<div class="two-col">${packPanel("character")}${packPanel("seiyuu")}</div>
    <div class="section-head"><h2>Premium Packs</h2><span class="subtext">Double chances S and above</span></div><div class="two-col">${packPanel("character", true)}${packPanel("seiyuu", true)}</div>${state.settings.special_character_price&&state.settings.special_seiyuu_price?'<div class="section-head"><h2>Special Card Packs</h2></div><div class="two-col">'+specialPackPanel('character')+specialPackPanel('seiyuu')+'</div>':''}<div class="rules-grid"><div class="rule"><strong>05 / 10</strong><h3>Independent Draws</h3><p>Duplicates can appear in the same pack and are saved as extra copies.</p></div>
    <div class="rule"><strong>＝</strong><h3>Every Card, Equal Chances</h3><p>Normal packs are uniform within the chosen character or seiyuu pool.</p></div>
    <div class="rule"><strong>↑</strong><h3>Duplicates Go Further</h3><p>Enhance with 1, 2, 3, 4 and 5 extra copies, keeping one base card. Level 6 is MAX.</p></div></div>`
  );
}
function catalogue() {
  const pool = state.catalogSummary || {
    character: state.catalog.filter((c) => c.kind === "character").length,
    seiyuu: state.catalog.filter((c) => c.kind === "seiyuu").length,
  };
  const list = catalogPageData?.cards || [];
  return (
    intro(
      "Card Catalogue",
      "Find your favourites among all imported characters and seiyuus.",
    ) +
    `    <div class="notice">Current pool: ${number(pool.character)} characters and ${number(pool.seiyuu)} voice actors. ${pool.source?.provider === "Tenrai" ? "MAL character roles and portraits, imported gradually." : ""}</div>${catalogProgressHTML(pool.importProgress, escape, number)}<details class="rarity-guide"><summary>MAL Popularity Rarity · AG → D</summary><p>Cumulative top cutoffs: AG 0.1% · Ubers 0.5% · SSS 1% · SS 2.5% · S 5% · A 10% · B 20% · C 40% · D 60%. Rarity can change as the catalogue grows or favorites refresh every 15 days.</p></details>
     <section class="collection-toolbar catalog-toolbar" aria-label="Catalogue controls"><div class="filters collection-toolbar-main">${tabs()}<input class="search" id="search" aria-label="Search catalog" placeholder="Search names or series…" value="${escape(search)}">${features.filters()}</div>${features.catalogPager(catalogPageData, catalogPageNumber, "catalog-top")}</section>
     <div class="card-grid collection-card-grid">${list.map((c) => cardHTML(c)).join("") || empty("No Matching Cards.", "Try another name or series.")}</div>
     <div class="collection-footer-pager">${features.catalogPager(catalogPageData, catalogPageNumber)}</div>`
  );
}

function auctions() {
  const list = state.auctions.filter((a) => tab === "both" || a.kind === tab),
    active = list.filter((a) => !a.seller && a.ends > state.now),
    won = list.filter((a) => a.ends <= state.now);
  return (
    intro(
      state.communityMarket?.active
        ? "Community Auctions"
        : "A New Week. A New Lineup.",
      "Five characters. Five seiyuus. Higher tiers in the spotlight.",
    ) +
    `<div class="notice">Bids hold credits immediately; outbid players are refunded. After the timer ends, the highest bidder can claim the card here.${state.communityMarket?.active ? " Each bid restarts that card’s 12-hour timer. The next bid must be at least 10% higher." : ""}</div>${tabs()}${won.length ? `<div class="section-head"><h2>Ready to Join Your Deck</h2></div><div class="card-grid">${won.map((a) => cardHTML(cardBy(a.card), a)).join("")}</div>` : ""}<div class="section-head"><h2>${state.communityMarket?.active ? "Community Auctions" : "Weekly Community Auctions"}</h2><span class="subtext">${countdown(active[0]?.ends || nextWeeklyReset(state.now), state.communityMarket?.active ? "Next Auction Ends in " : "Auction resets in ", true, "Refreshing auctions…")}</span></div>${active.length ? `<div class="card-grid">${active.map((a) => cardHTML(cardBy(a.card), a)).join("")}</div>` : empty("No Auctions Just Yet.", "The host needs at least five cards in each catalog to start weekly auctions.")}` +
    features.userAuctions()
  );
}
function pickems() {
  return (
    intro(
      "Who Takes the Tour?",
      "Pick the winning team and earn credits for a correct call.",
    ) +
    `<div class="notice">Choose one team to win the tour. Your latest choice is saved automatically. Entry is free, and you can change your pick until voting closes. Correct picks earn the tour’s winner reward.</div>` +
    ((ui.pickemData?.tours || tourSummaries(state.pickems, state.now)).length
      ? pickemBoard(
          ui.pickemData?.tours || tourSummaries(state.pickems, state.now),
          ui.pickemDetail,
          {
            escape,
            number,
            remaining,
            now: state.now,
            focused: ui.pickemData?.focused,
            drafts: ui.pickemDrafts,
            signedIn: !!state.me,
          },
        )
      : ui.pickemData?.focused ? empty("Pick’em Not Found", "This link may refer to a deleted Pick’em.") : empty(
          "Waiting for the Next Tour.",
          "The host will publish tour pick’ems here.",
        )) +
    (ui.pickemData?.focused ? `<a class="button secondary space-top" href="${routeHref("pickems")}">← All Pick’ems</a>` : features.pager("pickems", ui.pickemPage, ui.pickemData?.hasMore))
  );
}
function ranks() {
  return features.ranks();
}
function avatarHTML(p, large = false) {
  const item = (p.inventory || state.inventory).find(
      (i) => i.card === p.avatar_card,
    ),
    card = p.avatar_card ? cardBy(p.avatar_card) : null;
  return `<span class="profile-avatar ${card ? "tier-" + rarityClass(card.rarity) : ""} ${large ? "large" : ""} ${cardFrameClass(p.avatar_level || item?.level || 1)}">${cardAura(p.avatar_level || item?.level || 1)}<span class="avatar-crop" style="${avatarCropStyle(p.avatar_crop)}">${card ? image(card) : escape(p.name.slice(0, 2).toUpperCase())}</span>${item || p.avatar_level ? `<b>${levelLabel(p.avatar_level || item?.level)}</b>` : ""}</span>`;
}
const avatarEditor = createAvatarEditor({
  avatarHTML,
  getState: () => state,
  cardBy,
  escape,
});

function players() {
  return (
    intro(
      "Meet the Collectors.",
      "Find a player by their AMQ Tours ID, alias, or any of their usernames.",
    ) +
    `<form id="player-search" class="player-search"><input id="profile-search" name="q" class="search" placeholder="Search players, aliases, past usernames…" aria-label="Search players" value="${escape(search)}"><button class="button secondary" type="submit">Search ↗</button></form><p class="form-hint">${number(ui.playerData?.total ?? profileResults.length)} collectors · 50 per page</p><div class="profile-grid space-top">${profileResults.map((p) => `<article class="profile-tile"><a class="profile-tile-link" href="${profileURL(p.id)}">${avatarHTML(p)}<div><h3>${escape(p.name)} ${roleBadge(state.roles?.[p.id])}</h3><p>${escape(p.id)}</p>${p.private_balance || p.earned == null ? '<span class="muted">Private balance</span>' : `<span class="money">✦ ${number(p.earned)} earned</span>`}</div></a>${friendButton(p,state.me?.id,escape,true)}</article>`).join("") || empty("No Player Found.", "Try another alias, username, or AMQ Tours ID.")}</div>${features.catalogPager(ui.playerData, ui.playerPage, "players", 50)}`
  );
}
function profileTabs(active) {
  return `<nav class="tabs profile-tabs" aria-label="My Profile sections"><a class="tab ${active === "profile" ? "active" : ""}" href="${routeHref("profile")}">My Profile</a><a class="tab ${active === "collection" ? "active" : ""}" href="${routeHref("collection")}">My Collection</a><a class="tab ${active === "titles" ? "active" : ""}" href="${routeHref("titles")}">My Titles</a></nav>`;
}
function myTitles() {
  if (!state.me) return myProfile();
  return (
    profileTabs("titles") +
    titleSettingsPanel(
      titleEditor.activeFor(state.me.id) ? titleEditor.data() : ui.titleData,
      escape,
    )
  );
}
function myProfile() {
  if (!state.me)
    return (
      intro("My Profile", "Your collection and favourites, in one place.") +
      empty(
        "Your Profile Is Waiting.",
        "Sign in to view your profile and collection.",
        btn("Sign in", "account"),
      )
    );
  return profileTabs("profile") + profile();
}
function profileInventoryFilters(view = ui.profileView) {
  return view === "favorites" ? ui.profileFavorites : ui.profileCollection;
}
function profile() {
  if (!profileData) return '<div class="loading">Finding this collector…</div>';
  const p = profileData,
    own = p.id === state.me?.id,
    pk = p.stats.pickems,
    rate = pk.total ? Math.round((pk.correct / pk.total) * 100) + "%" : "—";
  const heading =
    `<div class="profile-heading">${avatarHTML(p, true)}<div><span class="eyebrow">THE AMQ COLLECTION CLUB</span><h1>${escape(p.name)}</h1>${titleBadges(p, escape)}<p>AMQ Tours ID · ${escape(p.id)}</p></div></div>` +
    profileCardTabs(ui.profileView, friendButton(p,state.me?.id,escape));
  if(ui.profileView==='quiz')return heading+profileQuizPanel(ui.profileQuizData,escape,ui.profileQuizSort);
  if (ui.profileView !== "overview")
    return (
      heading +
      (own && ui.profileView === "wishlist" && wishlistEditor.activeFor(p.id)
        ? wishlistEditor.render()
        : own &&
            ui.profileView === "collection" &&
            collectionEditor.activeFor(p.id)
          ? collectionEditor.render()
          : profileCardPanel(ui.profileCardsData, {
              cardBy,
              cardHTML,
              escape,
              number,
              own,
              wishlist: state.wishlist || [],
              state,
              collectionFilters: profileInventoryFilters(),
              wishlistFilters: {...ui.profileWishlist, favoritesOnly: favoritesOnly("profile-wishlist-search")},
            }))
    );
  return (
    heading +
    `${features.profileExtras(p, own, own && showcaseEditor.activeFor(p.id) ? showcaseEditor.render() : null)}<div class="stat-grid profile-stats">${p.balanceHidden ? '<div class="stat"><span>AVAILABLE CREDITS</span><strong>Private</strong><small>Hidden by collector</small></div>' : `<div class="stat"><span>AVAILABLE CREDITS</span><strong>✦ ${number(p.balance)}</strong><small>${number(p.earned)} earned over time</small></div>`}<div class="stat"><span>TOURS PLAYED</span><strong>${number(p.stats.participation)}</strong><small>tour participation</small></div><div class="stat"><span>TOURS COUNTED</span><strong>${number(p.stats.counting)}</strong><small>counting contributions</small></div><div class="stat"><span>TOURS REPORTED</span><strong>${number(p.stats.reporting)}</strong><small>reporting contributions</small></div><div class="stat"><span>PICK’EM WINNER ACCURACY</span><strong>${rate}</strong><small>${pk.correct} ${pk.correct === 1 ? "win" : "wins"} / ${pk.total - pk.correct} ${pk.total - pk.correct === 1 ? "loss" : "losses"}</small></div>${p.collectionHidden ? '<div class="stat"><span>COLLECTION</span><strong>Private</strong><small>Hidden by collector</small></div>' : `<div class="stat"><span>COLLECTION</span><strong>${number(p.collectionCount ?? p.inventory.length)}</strong><small>unique characters &amp; seiyuus</small></div>`}</div><div class="notice space-top"><strong>Find this player by</strong><br>AMQ aliases: ${p.aliases.map(escape).join(" · ") || "—"}<br>Username history: ${p.usernames.map(escape).join(" · ") || escape(p.name)}</div><div class="section-head"><h2>Recent Collection</h2><span class="subtext">${p.avatar_card ? "Card avatars always show their current enhancement." : "No card profile picture selected yet."}</span></div>${
      p.collectionHidden
        ? '<p class="notice">This collector’s collection is private.</p>'
        : p.inventory.length
          ? `<div class="card-grid">${p.inventory
              .slice(0, 20)
              .map((item) => {
                const c = cardBy(item.card);
                return cardHTML(c, null, {
                  level: item.level,
                  preview: true,
                  ownerFlags: {
                    protectedCard: !!item.protected,
                    wishlisted: (p.wishlist || []).includes(item.card),
                    forTrade: !!item.for_trade,
                  },
                }, state.me ? wishlistButton(c, state.wishlist || [], escape, state) : "");
              })
              .join(
                "",
              )}</div><div class="section-head space-top"><p class="form-hint">Showing up to 20 owned cards.</p><button type="button" class="button secondary" data-action="profile-cards-view" data-view="collection">View Full Collection →</button></div>`
          : empty(
              "A Fresh Deck, Ready for Favourites.",
              "This collector has not collected a card yet.",
            )
    }`
  );
}
async function loadDynamic() {
  const version = ++loadVersion,
    current = page(),
    route = currentRoute();
  if (current === "packs" && tab === "both") tab = "character";
  let data, pickemDetail, profileCardsResult,profileQuizResult;
  if (current === "shop" && ui.marketSort === "ending")
    ui.marketSort = "newest";
  if (!state.me) {
    ui.rankFriendsOnly = false;
    ui.tradeFriendsOnly = false;
    ui.marketFriendsOnly = false;
    ui.tradeWishlistOnly = false;
    ui.marketWishlistOnly = false;
    if (ui.marketSort === "wishlist") ui.marketSort = "newest";
  }
  if(current==="notifications" && state.me) data=await api(inbox.query(state.me.id));
  if (current === "home") await loadFeatured();
  if (current === "quiz") {
    await loadQuizUI();
    if (version !== loadVersion) return;
    await quizUI.load();
  }
  if (current === "arcade") {
    await loadArcadePage();
    if (version !== loadVersion) return;
  }
  if (current === "catalog")
    data = await api(
      "catalog?" + new URLSearchParams({
        kind: tab,
        q: search,
        strict: strictCards("catalog") ? "1" : "0",
        favorites: favoritesOnly("catalog") ? "1" : "0",
        page: catalogPageNumber,
        rarity: ui.filters.rarity,
        role: tab === "character" ? ui.filters.role : "",
        sort: ui.catalogSort,
      }),
    );
  if (current === "fusion" && state.me) data = await alchemyUI.load(api);
  if (current === "collection" && state.me)
    data = await api("anime-collection?page=" + (ui.animePage || 1));
  if (current === "titles" && state.me) data = await api("my-titles");
  if (current === "ranks")
    data = await api("rankings?metric=" + ui.metric + "&page=" + ui.rankPage + (ui.rankFriendsOnly && state.me ? "&friends=1" : ""));
  if (current === "pickems") {
    const id = route.split("/")[1];
    if (id) {
      try {
        pickemDetail = await api("pickem-tour?id=" + id);
      } catch (err) {
        if (err.status !== 404) throw err;
      }
      const tours = tourSummaries(pickemDetail?.matches || [], state.now);
      if (tours.length) tours[0].voters = pickemDetail.matches[0].voteSummary.total;
      data = { tours, focused: true };
    } else data = await api("pickem-tours?page=" + ui.pickemPage);
    if (!id &&
      ui.pickemOpen !== null &&
      data.tours.some((t) => t.key === ui.pickemOpen)
    ) {
      try {
        pickemDetail = await api("pickem-tour?key=" + ui.pickemOpen);
      } catch (err) {
        if (!/not found/i.test(err.message)) throw err;
      }
    }
  }
  if (current === "arcade" && state.me && ui.mahjongHistoryOpen)
    data = await api("mahjong-history?page=" + ui.mahjongHistoryPage);
  if (
    current === "auctions" ||
    (current === "shop" && ui.shopSection === "market")
  )
    data = await api(
      "market?venue=" +
        (current === "shop" ? "shop" : "auction") +
        "&kind=" +
        tab +
        "&page=" +
        ui.marketPage +
        "&sort=" +
        encodeURIComponent(ui.marketSort) +
        "&wishlist=" +
        (ui.marketWishlistOnly ? "1" : "0") +
        "&q=" +
        encodeURIComponent(ui.marketQuery) + "&rarity=" + encodeURIComponent(ui.marketRarity) + (strictCards("market-search") ? "&strict=1" : "") + (favoritesOnly("market-search") ? "&favorites=1" : "") + (ui.marketFriendsOnly && state.me ? "&friends=1" : ""),
    );
  if (
    current === "shop" &&
    ui.shopSection === "trades" &&
    (state.me || ui.tradeView === "browse")
  )
    data = await api(
      "trades?" +
        new URLSearchParams({
          view: ui.tradeView,
          page: String(ui.tradePage),
          q: ui.tradeQuery || "",
          strict: strictCards("trade-search") ? "1" : "0",
          favorites: favoritesOnly("trade-search") ? "1" : "0",
          kind: ui.tradeKind || "both",
          rarity: ui.tradeRarity || "",
          role: ui.tradeKind === "character" ? ui.tradeRole || "" : "",
          sort: ui.tradeSort || "newest",
          wishlist: ui.tradeWishlistOnly ? "1" : "0",
          friends: ui.tradeFriendsOnly && state.me ? "1" : "0",
          ...((ui.tradeView === "listings" || ui.tradeView === "offers") &&
          ui.tradeHideCompleted
            ? { hide_completed: "1" }
            : {}),
        }),
    );
  if (current === "players")
    data = await api(
      "profiles?q=" + encodeURIComponent(search) + "&page=" + ui.playerPage,
    );
  if (current === "player" || (current === "profile" && state.me))
    data = await api(
      "player?id=" +
        encodeURIComponent(
          current === "profile"
            ? state.me.id
            : decodeURIComponent(route.slice(7)),
        ),
    );
  if (
    (current === "player" || current === "profile") &&
    data &&
    ui.profileView !== "overview" &&
    ui.profileView !== "quiz" &&
    !(ui.profileView === "wishlist" && wishlistEditor.activeFor(data.id)) &&
    !(ui.profileView === "collection" && collectionEditor.activeFor(data.id))
  ) {
    const view = ui.profileView;
    const filters = profileInventoryFilters(view);
    const scope = "profile-"+view+"-search";
    const wishlistOwnership = ui.profileWishlist.ownership;
    const useWishlistOwnership = wishlistOwnership === "owned" ? !!state.me : !data.collectionHidden;
    profileCardsResult = await api(
      "player-cards?id=" +
        encodeURIComponent(data.id) +
        "&view=" +
        ui.profileView +
        "&page=" +
        ui.profileCardsPage +
        (view === "collection" || view === "favorites"
          ? "&" + new URLSearchParams({kind:filters.kind,q:filters.query,strict:strictCards(scope)?"1":"0",favorites:favoritesOnly(scope)?"1":"0",rarity:filters.rarity,role:filters.kind==="character"?filters.role:"",sort:filters.sort,wishlist:filters.wishlist?"1":"0",tradeable:filters.tradeable?"1":"0"})
          : view === "wishlist"
            ? "&" + new URLSearchParams({kind:ui.profileWishlist.kind,q:ui.profileWishlist.query,strict:strictCards(scope)?"1":"0",favorites:favoritesOnly(scope)?"1":"0",rarity:ui.profileWishlist.rarity,role:ui.profileWishlist.kind==="character"?ui.profileWishlist.role:"",sort:ui.profileWishlist.sort,ownership:useWishlistOwnership?wishlistOwnership:""})
            : ""),
    );
  }
  if((current==='player'||current==='profile')&&data&&ui.profileView==='quiz')
    profileQuizResult=await api('player-quiz?id='+encodeURIComponent(data.id));
  if (version !== loadVersion || currentRoute() !== route) return;
  if (profileCardsResult?.view === "wishlist" &&
      (ui.profileWishlist.ownership === "owned" ? !state.me : profileCardsResult.ownershipHidden)) {
    ui.profileWishlist.ownership = "";
  }
  if(profileQuizResult)ui.profileQuizData=profileQuizResult;
  if (profileCardsResult) {
    rememberCards(profileCardsResult.cards);
    ui.profileCardsData = profileCardsResult;
    ui.profileCardsPage = profileCardsResult.page;
  }
  if (data) {
    rememberCards(data.cards);
    if(current==="notifications" && data.player===state.me?.id){inbox.accept(data);state.inboxUnread=data.unread;}
    if (current === "collection") ui.animeData = data;
    if (current === "titles") {
      ui.titleData = data;
      if (!titleEditor.activeFor(state.me?.id) || !titleEditor.dirty())
        titleEditor.open(data, state.me.id);
    }
    if (current === "catalog") {
      catalogPageData = data;
      catalogPageNumber = data.page;
    }
    if (current === "ranks") ui.rankData = data;
    if (current === "pickems") {
      ui.pickemData = data;
      ui.pickemDetail = pickemDetail || null;
      ui.pickemOpen = pickemDetail?.key ?? null;
    }
    if (current === "arcade") ui.mahjongHistoryData = data;
    if (current === "shop" && ui.shopSection === "trades") ui.tradeData = data;
    else if (["shop", "auctions"].includes(current)) ui.marketData = data;
    if (current === "players") {
      profileResults = data.profiles;
      ui.playerData = data;
    }
    if (current === "profile" || current === "player") profileData = data;
  }
}
document.addEventListener("change",event=>{
  if(event.target.id==="inbox-group"){inbox.filter(event.target.value);loadDynamic().then(render).catch(err=>toast(err.message,true));}
});
document.addEventListener("click",event=>{
  const link=event.target.closest("[data-inbox-link]");
  if(!link)return;
  if(link.dataset.inboxSection){ui.shopSection=link.dataset.inboxSection;ui.tradeView="browse";ui.marketPage=1;ui.tradePage=1;}
  $("#modal").close();
},true);
const loadingPage = () => '<p class="loading">Loading…</p>';
function updateInboxBadge() {
  const bell=$(".inbox-bell"), unread=state.inboxUnread||0;
  inboxDropdown.sync();
  bell.innerHTML = svg(icons.notifications) +
    (unread > 0 ? `<span class="inbox-bell-count" aria-hidden="true">${number(unread)}</span>` : "");
  bell.setAttribute("aria-label", unread > 0 ? `Notifications, ${number(unread)} unread` : "Notifications");
}
function render() {
  if (!state) return;
  workingTitlePopovers.dismiss();
  const cardSurfaceState =
    $("#main").dataset.cardPage === page()
      ? cardSurfaces.capture($("#main"))
      : [];
  const active = document.activeElement;
  const searchFocus =
    active?.matches("input.search, input[type=search]") && active.id
      ? {
          id: active.id,
          start: active.selectionStart,
          end: active.selectionEnd,
          direction: active.selectionDirection,
          value: active.value,
        }
      : null;
  const predictionFocus = active?.form?.dataset.inlinePrediction
    ? { form: active.form.getAttribute("id"), name: active.name }
    : null;
  const route = page(),
    title =
      route === "player"
        ? "Player Profile"
        : route === "collection"
          ? "My Collection"
          : route === "titles"
            ? "My Titles"
            : route === "notifications"
              ? "Notifications"
              : routes.find((r) => r[0] === route)[1];
  const activeSection = navigationSection(route, state.me?.id, profileData?.id);
  $("#navigation").innerHTML = routes
    .map(([id, name]) => {
      if (id === "quiz") {
        const playUrl = playHref("overview");
        const href = location.hostname.endsWith(".github.io") ? "https://amqtours.app" + playUrl : playUrl;
        return `<a class="nav-link" href="${href}" data-mobile-key="play">${svg(icons.play)}<span>Play</span></a>`;
      }
      const active = id === activeSection;
      return `<a class="nav-link ${active ? "active" : ""}" href="${routeHref(id)}" aria-label="${name}" ${active ? 'aria-current="page"' : ""}>${svg(icons[id])}<span>${name}</span></a>`;
    })
    .join("");
  updateInboxBadge();
  $("#page-name").textContent = title;
  $("#balance").textContent = number(state.me?.balance);
  $(".host-link")?.toggleAttribute("hidden", !(state.me?.is_admin || state.me?.is_quiz_maker));
  accountButton.innerHTML = state.me?.avatar_card
    ? avatarHTML(state.me)
    : escape(state.me ? state.me.name.slice(0, 2).toUpperCase() : "↗");
  accountButton.setAttribute("aria-label", state.me ? "Manage account" : "Sign in");
  if (state.me) {
    accountButton.setAttribute("aria-controls", accountMenu.id);
    accountButton.setAttribute("aria-expanded", String(!accountMenu.hidden));
  } else {
    closeAccountMenu();
    accountButton.removeAttribute("aria-controls");
    accountButton.removeAttribute("aria-expanded");
  }
  $("#main").innerHTML = {
    home,
    collection,
    notifications: () => inbox.render(state.me?.id),
    fusion: () => alchemyUI.render(),
    quiz: () => quizUI?.render() ?? loadingPage(),
    packs,
    catalog: catalogue,
    auctions,
    shop,
    pickems,
    ranks,
    arcade: () => arcadePage?.render() ?? loadingPage(),
    players,
    profile: myProfile,
    titles: myTitles,
    player: () =>
      profileData?.id === state.me?.id
        ? profileTabs("profile") + profile()
        : profile(),
  }[route]();
  $("#main").dataset.cardPage = route;
  mobileNavigation.update();
  cardFilters.update();
  cardSurfaces.restore($("#main"), cardSurfaceState);
  if (route === "quiz") quizUI?.mount();
  else quizUI?.leave();
  if (searchFocus) {
    const input = document.getElementById(searchFocus.id);
    if (input && input.value === searchFocus.value) {
      input.focus({ preventScroll: true });
      input.setSelectionRange(
        searchFocus.start,
        searchFocus.end,
        searchFocus.direction,
      );
    }
  }
  if (predictionFocus)
    focusPredictionField(
      document.getElementById(predictionFocus.form),
      predictionFocus.name,
    );
  const queryInput = $("#search") || $("#profile-search");
  if (queryInput && search.trim()) {
    const none =
      route === "catalog"
        ? !catalogPageData?.cards?.length
        : route === "players"
          ? !profileResults.length
          : route === "collection"
            ? !collectionView(state.inventory, cardBy, {
                kind: tab,
                query: search,
                sort: ui.collectionSort,
                ...ui.collectionFilters,
                strict: strictCards("collection"),
                favoriteIds: favoritesOnly("collection") ? new Set(state.cardFavorites || []) : null,
              }).length
            : false;
    queryInput.classList.toggle("no-results", none);
    queryInput.setAttribute("aria-invalid", String(none));
  }
  const profileCollectionInput = $("#profile-"+ui.profileView+"-search");
  if (
    profileCollectionInput &&
    (ui.profileView === "wishlist" ? ui.profileWishlist : profileInventoryFilters()).query.trim() &&
    ui.profileCardsData
  ) {
    const none = !ui.profileCardsData.rows?.length;
    profileCollectionInput.classList.toggle("no-results", none);
    profileCollectionInput.setAttribute("aria-invalid", String(none));
  }
  tickCountdowns();
  ensureCollectorCounts();
  if (route === "arcade") arcadePage?.mount();
  document.title = title + " · AMQ Tours Gatcha";
}
function ensureCollectorCounts() {
  const buttons = [...document.querySelectorAll("[data-collector-card]")];
  const paint = () =>
    buttons.forEach((button) => {
      const value = collectorCounts.get(button.dataset.collectorCard)?.counts;
      if (!value || !button.isConnected) return;
      button.textContent =
        "Collection (" + value.owned + "/" + value.wanted + ") ↗";
      button.title =
        "Owned by " + value.owned + " · Wishlisted by " + value.wanted;
      button.setAttribute(
        "aria-label",
        "Collection: " +
          value.owned +
          " owned, " +
          value.wanted +
          " wishlisted",
      );
    });
  paint();
  if (collectorCountRequest) return;
  const ids = [...new Set(buttons.map((b) => b.dataset.collectorCard))]
    .filter(
      (id) =>
        !collectorCounts.has(id) ||
        Date.now() - collectorCounts.get(id).at > 60000,
    )
    .slice(0, 50);
  if (!ids.length) return;
  collectorCountRequest = api(
    "card-counts?cards=" + encodeURIComponent(JSON.stringify(ids)),
  )
    .then((result) => {
      rememberCards(result.cards);
      for (const id of ids) {
        const cached = collectorCounts.get(id);
        collectorCounts.set(id, { counts: cached?.counts, at: Date.now() });
      }
      paint();
    })
    .catch(() => {
      for (const id of ids)
        collectorCounts.set(id, {
          at: Date.now(),
          counts: collectorCounts.get(id)?.counts,
        });
    })
    .finally(() => {
      collectorCountRequest = null;
      while (collectorCounts.size > 5000)
        collectorCounts.delete(collectorCounts.keys().next().value);
      ensureCollectorCounts();
    });
}
const pendingReads = new Map();
async function api(path, body, key, { signal, headers: extraHeaders = {} } = {}) {
  if (demo && path === "quizzes") return { quizzes: [] };
  if (demo) return demo.request(path, body);
  if (!body && !signal && pendingReads.has(path)) return pendingReads.get(path);
  const request = (async () => {
    const res = await fetch("api/" + path, {
      method: body ? "POST" : "GET",
      headers: {
        ...extraHeaders,
        ...(body ? {
          "Content-Type": "application/json",
          "Idempotency-Key": key || crypto.randomUUID(),
        } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      credentials: "same-origin",
      signal,
    });
    return readApiResponse(res);
  })();
  if (body || signal) return request;
  pendingReads.set(path, request);
  try {
    return await request;
  } finally {
    if (pendingReads.get(path) === request) pendingReads.delete(path);
  }
}

const loadFeatured = loadOnce(async () => {
  try {
    heroCards = (await api("featured")).cards || [];
    rememberCards(heroCards);
  } catch {
    heroCards = [];
  }
});
let sharedRefreshNeeded = false;
async function refresh() {
  const previousPlayer = state?.me?.id;
  const refreshState = api(demo ? "state" : "state?view=compact");
  if (page() === "home") loadFeatured();
  state = await refreshState;
  sharedRefreshNeeded = false;
  clockOffset = state.now - Date.now();
  if (previousPlayer && previousPlayer !== state.me?.id) {
    titleDrag.cancel();
    titleEditor.close();
    wishlistDrag.cancel();
    wishlistEditor.close();
    showcaseDrag.cancel();
    showcaseEditor.close();
    collectionDrag.cancel();
    collectionEditor.close();
    pinnedAnimeDrag.cancel();
    pinnedAnimeEditor.close();
    ui.pickemDrafts = {};
    ui.shopBatchReview = null;
    pendingBatchSale = null;
    alchemyUI.clear();
    ui.rouletteDraft = { choice: "red", stake: 100 };
    ui.mahjongHistoryData = null;
    ui.mahjongHistoryOpen = false;
    ui.mahjongHistoryPage = 1;
  }
  rememberCards(state.catalog);
  await loadDynamic();
  render();
  showSpecialPack();
}
async function refreshCurrent() {
  if (demo || page() !== "arcade" || !state?.me) return refresh();
  const update = await api("game-state");
  const next = applyGameState(state, update);
  if (!next) return refresh();
  state = next;
  sharedRefreshNeeded = true;
  rememberCards(update.cards);
  clockOffset = update.now - Date.now();
  render();
}
async function execute(path, b, after, form = null) {
  if (busy) return;
  busy = true;
  const signature = path + ":" + JSON.stringify(b),
    key = pendingMutations.get(signature) || crypto.randomUUID();
  pendingMutations.set(signature, key);
  const buttons = [
    ...$("#modal").querySelectorAll("button[type=submit]"),
    ...(form?.querySelectorAll("button[type=submit]") || []),
  ];
  buttons.forEach((x) => (x.disabled = true));
  try {
    const result = await api(path, b, key);
    rememberCards(result.cards);
    pendingMutations.delete(signature);
    try {
      const alchemyNext = applyAlchemyPatch(state, result);
      if (alchemyNext) {
        state = alchemyNext;
        alchemyUI.update(result.alchemyState);
        rememberCards(result.alchemyState.cards);
        sharedRefreshNeeded = true;
        render();
      } else {
        const next =
          result.gameState && applyGameState(state, result.gameState);
        if (next) {
          state = next;
          sharedRefreshNeeded = true;
          rememberCards(result.gameState.cards);
          clockOffset = result.gameState.now - Date.now();
          if (
            path.startsWith("mahjong-") &&
            ui.mahjongHistoryOpen &&
            result.mahjong?.status !== "active"
          )
            await loadDynamic();
          render();
        } else await refresh();
      }
    } catch {
      toast(
        "Action saved. The latest view could not be loaded; refresh to check your account.",
        true,
      );
    }
    if (after) after(result);
    else if (path === "bid" && result.cards?.length) {
      revealAcquired(result, "Your Auction Prize Is Here.");
    } else {
      if ($("#modal").open) $("#modal").close();
      toast(result.message);
    }
    return result;
  } catch (err) {
    if (err.status && err.status < 500) pendingMutations.delete(signature);
    if (
      (path.startsWith("mahjong-") ||
        path.startsWith("gem-") ||
        path.startsWith("horse-") ||
        path.startsWith("roulette-") ||
        path.startsWith("blackjack-") ||
        path.startsWith("climb-")) &&
      err.status === 409
    ) {
      try {
        await refreshCurrent();
      } catch {}
    }
    if (form?.isConnected && form.querySelector(".form-error"))
      form.querySelector(".form-error").textContent = err.message;
    else if ($("#modal").open && $("#modal .form-error"))
      $("#modal .form-error").textContent = err.message;
    else toast(err.message, true);
  } finally {
    busy = false;
    buttons.forEach((x) => (x.disabled = false));
    showAuctionWin();
    showSpecialPack();
  }
}
function auth(register = false, recovery = false) {
  modal(authFormHTML(recovery ? "recover" : register ? "register" : "login"));
}
let settingsHotkeyDraft = { ...DEFAULT_QUIZ_HOTKEYS };
const accountButton = $("#account");
const accountMenu = $("#account-menu");
const accountAnchor = accountMenu.parentElement;
$("#account-profile").href = routeHref("profile");

function closeAccountMenu(restoreFocus = false) {
  if (accountMenu.hidden) return;
  accountMenu.hidden = true;
  accountButton.setAttribute("aria-expanded", "false");
  if (restoreFocus) accountButton.focus();
}

function account() {
  if (!state?.me) {
    auth();
    return;
  }
  if (!accountMenu.hidden) {
    closeAccountMenu(true);
    return;
  }
  inboxDropdown.close();
  accountMenu.hidden = false;
  accountButton.setAttribute("aria-expanded", "true");
}

function accountActivity() {
  const activities = recentActivityRows(state);
  modal(
    `<section class="account-popup"><header class="account-summary"><h2>${escape(state.me.name)} ${roleBadge(state.me.role)}</h2><p>AMQ player ID · ${escape(state.me.id)}</p><div class="two-col"><div class="stat"><span>AVAILABLE</span><strong>${number(state.me.balance)}</strong></div><div class="stat"><span>LIFETIME EARNED</span><strong>${number(state.me.earned)}</strong></div></div></header><div class="section-head"><h3 id="account-activity-heading">Recent Activity</h3></div><div class="account-activity" role="region" aria-labelledby="account-activity-heading" tabindex="0">${
      activities.length
        ? `<div class="table-wrap"><table><tbody>${activities
            .map(
              (l) =>
                `<tr><td>${escape(l.text)}<br><small>${new Date(l.at).toLocaleDateString()}</small></td><td class="${l.delta > 0 ? "ledger-positive" : l.delta < 0 ? "ledger-negative" : "muted"}">${l.delta > 0 ? "+" : ""}${number(l.delta)}</td></tr>`,
            )
            .join("")}</tbody></table></div>`
        : "<p>No wallet or trade activity yet.</p>"
    }</div></section>`,
    false,
    "account-modal",
  );
}
document.addEventListener("click", async (ev) => {
  const t = ev.target.closest("[data-action],[data-tab]");
  if (!t || busy) return;
  if (t.dataset.tab) {
    tab = t.dataset.tab;
    ui.shopSell.page = 1;
    ui.marketPage = 1;
    ui.filters.role = "";
    ui.collectionFilters.role = "";
    ui.collectionPage = 1;
    if (tab !== "character" && ui.catalogSort.startsWith("role"))
      ui.catalogSort = "name";
    if (tab !== "character" && ui.collectionSort.startsWith("role"))
      ui.collectionSort = "name";
    catalogPageNumber = 1;
    await loadDynamic();
    render();
    return;
  }
  const a = t.dataset.action;
  if (a === "copy-pickem") {
    try {
      await navigator.clipboard.writeText(new URL(routeHref("pickems/" + t.dataset.id), location.href).href);
      toast("Pick’em link copied.");
    } catch {
      toast("Copy the address from the link to this Pick’em.", true);
    }
    return;
  }
  if (a === "pickem-tour") {
    const key = Number(t.dataset.id);
    ui.pickemOpen = ui.pickemOpen === key ? null : key;
    try {
      await loadDynamic();
      render();
    } catch (err) {
      toast(err.message, true);
    }
    return;
  }
  if (await handleFeatureClick(a, t)) return;
  if (a === "reveal-pack") {
    packReveal.reveal();
    return;
  }
  if (a === "players-prev" || a === "players-next") {
    ui.playerPage += a.endsWith("next") ? 1 : -1;
    await loadDynamic();
    render();
    return;
  }
  if (
    [
      "catalog-prev",
      "catalog-next",
      "catalog-top-prev",
      "catalog-top-next",
    ].includes(a)
  ) {
    catalogPageNumber += a.endsWith("next") ? 1 : -1;
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
  if (a === "recovery-form") {
    auth(true, true);
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
  if (a === "account-activity") {
    accountActivity();
    return;
  }
  if(a.startsWith("inbox-")) {
    const type=a.slice(6), id=Number(t.dataset.id), player=state.me.id;
    if(["item","peek","check","read","delete","delete-all"].includes(type)){
      const html=type==="peek" ? inboxDropdown.detail(id) : type==="item" ? inbox.detail(id) : "";
      const deleting = type === "delete" || type === "delete-all";
      const all = type === "read" || type === "delete-all";
      let result;
      try {
        const write = inboxWrites.then(() => state.me?.id === player
          ? api(deleting ? "inbox-delete" : "inbox-read",{id,all}) : null);
        inboxWrites = write.catch(() => {});
        result = await write;
        if (!result || state.me?.id !== player) return;
      } catch (error) {
        toast(error.message, true);
        return;
      }
      state.inboxUnread=result.unread;
      if (deleting) inboxDropdown.refresh();
      else inboxDropdown.markRead(id,all,result.unread);
      if(type==="peek" && !t.isConnected){updateInboxBadge();return;}
      if(type==="peek") inboxDropdown.close(true);
      if(html)modal(html);
      if(page()!=="notifications"){updateInboxBadge();return;}
      if(type==="delete-all") inbox.view(type);
    }else inbox.view(type);
    await loadDynamic(); render(); return;
  }
  if (a === "edit-profile") {
    settingsHotkeyDraft = normalizeQuizHotkeys(state.me.quiz_hotkeys);
    const currentAutosell = state.me.autosell_below || "";
    modal(
      `<h2>Settings</h2><form id="profile-form" class="stack"><label>Username<input name="username" required maxlength="32" value="${escape(state.me.name)}" autocomplete="nickname"><span class="form-hint">Past usernames remain linked and searchable.</span></label><label>Profile picture<select name="avatar"><option value="">Use initials</option>${state.inventory.map((i) => `<option value="${escape(i.card)}" ${i.card === state.me.avatar_card ? "selected" : ""}>${escape(cardBy(i.card).name)} · ${levelLabel(i.level)}</option>`).join("")}</select></label><div data-avatar-editor></div><fieldset class="settings-section"><legend>Display</legend>${titleMotion.control()}${cardSizeControl(currentCardSize())}<label>Anime Titles<select id="settings-title-mode" aria-label="Anime Titles"><option value="romaji" ${titleMode === "romaji" ? "selected" : ""}>Romaji</option><option value="english" ${titleMode === "english" ? "selected" : ""}>English</option></select></label></fieldset><fieldset class="settings-section"><legend>Pack Auto-Sell</legend><label>Auto-sell cards strictly below tier<select name="autosellBelow"><option value="" ${!currentAutosell ? "selected" : ""}>Off · Keep all pulled cards</option>${AUTOSELL_TIERS.map((tier) => `<option value="${tier}" ${currentAutosell === tier ? "selected" : ""}>Below ${tier}</option>`).join("")}</select></label><p class="form-hint">Applies only to cards opened from card packs (including daily packs) for their Lv. 1 shop sell value. Never affects shop buys, auctions, or trades.</p></fieldset><fieldset class="settings-section"><legend>Privacy</legend><label class="check-label"><input type="checkbox" name="privateBalance" ${state.me.private_balance ? "checked" : ""}> Keep my credit balance and lifetime earnings private</label><label class="check-label"><input type="checkbox" name="privateCollection" ${state.me.private_collection ? "checked" : ""}> Keep my card collection private</label><p class="form-hint">Your avatar, showcase, wishlist and active listings remain public.</p></fieldset><fieldset class="settings-section"><legend>Quiz Hotkeys</legend><p class="form-hint">Click any field and press a key or shortcut (such as <code>Alt+S</code> or <code>/</code>). Use <code>Tab</code> to move between fields.</p><div class="hotkey-grid">${QUIZ_HOTKEY_ACTIONS.map((item) => `<div class="hotkey-row"><div><strong>${escape(item.label)}</strong><small>${escape(item.hint)}</small></div><div class="hotkey-controls"><input type="text" readonly class="hotkey-capture" data-hotkey-action="${item.id}" value="${escape(settingsHotkeyDraft[item.id] || "")}" placeholder="Unbound" aria-label="${escape(item.label)} hotkey"><button type="button" class="text-button" data-action="clear-hotkey" data-hotkey-action="${item.id}">Clear</button></div></div>`).join("")}</div><div class="hotkey-footer"><button type="button" class="text-button" data-action="reset-hotkeys">Reset Defaults</button></div></fieldset><div class="form-error" role="alert"></div><button type="submit" class="button full">Save settings →</button></form>`,
      false,
      "avatar-editor-modal settings-modal",
    );
    settingTabs($("#profile-form"),state.me,t.dataset.settingsSection);
    avatarEditor.mount(
      $("#profile-form"),
      state.me.avatar_card,
      state.me.avatar_crop,
    );
    return;
  }
  if (a === "clear-hotkey") {
    const id = t.dataset.hotkeyAction;
    if (id && Object.hasOwn(settingsHotkeyDraft, id)) {
      settingsHotkeyDraft[id] = "";
      const input = document.querySelector(`.hotkey-capture[data-hotkey-action="${id}"]`);
      if (input) input.value = "";
    }
    return;
  }
  if (a === "reset-hotkeys") {
    settingsHotkeyDraft = { ...DEFAULT_QUIZ_HOTKEYS };
    for (const item of QUIZ_HOTKEY_ACTIONS) {
      const input = document.querySelector(`.hotkey-capture[data-hotkey-action="${item.id}"]`);
      if (input) input.value = settingsHotkeyDraft[item.id] || "";
    }
    return;
  }
  if (a === "set-avatar") {
    modal(
      `<h2>Choose Your Profile Picture</h2><form id="avatar-form" class="stack"><input type="hidden" name="avatar" value="${escape(t.dataset.id)}"><div data-avatar-editor></div><div class="form-error" role="alert"></div><button type="submit" class="button full">Save Profile Picture →</button></form>`,
      false,
      "avatar-editor-modal",
    );
    avatarEditor.mount(
      $("#avatar-form"),
      t.dataset.id,
      t.dataset.id === state.me.avatar_card ? state.me.avatar_crop : null,
    );
    return;
  }
  if (a === "daily" || a === "enhance" || a === "claim") {
    await execute(
      a,
      a === "daily"
        ? {}
        : a === "enhance"
          ? {
              card: t.dataset.id,
              expectedLevel: state.inventory.find(
                (i) => i.card === t.dataset.id,
              )?.level,
              enhancementRevision: ENHANCEMENT_REVISION,
            }
          : { auction: Number(t.dataset.id) },
      a === "claim"
        ? (r) => revealAcquired(r, "Your Auction Prize Is Here.")
        : undefined,
    );
    return;
  }
  if (a === "bid") {
    const player=state.me.id;
    if(!isDemo)acceptAuctionNotices(await api('notices?auctions='+Number(t.dataset.id)),player);
    if(state.me?.id!==player)return;
    const lot = [...state.auctions, ...(ui.marketData?.items || [])].find(
      (x) => x.id === Number(t.dataset.id),
    );
    if(!lot)return toast('This auction is no longer available.',true);
    if(lot.seller===player)return toast('You cannot bid on your own auction.',true);
    if(lot.closed||lot.ends<=Date.now()+clockOffset)return toast('This auction has ended.',true);
    modal(
      `<h2>${escape(cardBy(lot.card).name)}</h2><form id="bid-form" class="stack"><input type="hidden" name="auction" value="${lot.id}"><p data-bid-current aria-live="polite"></p><label>Your bid in credits<input type="number" name="amount" required min="${minimumBid(lot)}" max="100000000" step="1" value="${minimumBid(lot)}"></label><span class="form-hint" data-bid-balance></span><div class="form-error" role="alert"></div><button class="button full" type="submit">Place bid →</button></form>`,
    );
    syncBidForm(document.getElementById('bid-form'),lot,state.me,number,Date.now()+clockOffset);
    return;
  }
  if (a === "predict") {
    const p = (ui.pickemDetail?.matches || state.pickems).find(
      (x) => x.id === Number(t.dataset.id),
    );
    if (p.mode === "pair") {
      modal(
        `<h2>Predict the Two-Game Result.</h2><p>${escape(p.team_a)} vs ${escape(p.team_b)}</p><form id="predict-form" class="stack"><input type="hidden" name="pickem" value="${p.id}"><label>Game wins (A : B)<select name="result" required><option value="">Choose result…</option>${["2:0", "1:1", "0:2"].map((r) => `<option value="${r}" ${p.prediction && r === p.prediction_a + ":" + p.prediction_b ? "selected" : ""}>${r}</option>`).join("")}</select></label><div class="form-error" role="alert"></div><button class="button full" type="submit">Confirm</button></form>`,
      );
      return;
    }
    modal(
      `<h2>Make Your Call.</h2><p>${escape(p.title)} · closes ${remaining(p.ends)}</p><form id="predict-form" class="stack"><input type="hidden" name="pickem" value="${p.id}"><label>Winning team<select name="winner"><option value="a" ${p.prediction === "a" ? "selected" : ""}>${escape(p.team_a)}</option><option value="b" ${p.prediction === "b" ? "selected" : ""}>${escape(p.team_b)}</option></select></label><div class="form-grid"><label>${escape(p.team_a)} score<input type="number" name="scoreA" min="0" max="1000" required value="${p.prediction_a ?? ""}"></label><label>${escape(p.team_b)} score<input type="number" name="scoreB" min="0" max="1000" required value="${p.prediction_b ?? ""}"></label></div><span class="form-hint">✦ ${p.winner_reward} winner + ${p.score_reward} per correct team score</span><div class="form-error" role="alert"></div><button class="button full" type="submit">Save prediction →</button></form>`,
    );
  }
});
document.addEventListener("change", (ev) => {
  if (ev.target.id === "daily-pack-kind") ui.dailyPackKind = ev.target.value;
});
document.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const f = ev.target,
    b = Object.fromEntries(new FormData(f));
  if (formIdentifier(f) === "alchemy-confirm-form") {
    try {
      const reviewed = JSON.parse(f.elements.reviewed.value),
        { action, ...body } = reviewed;
      const current =
        action === "alchemy-feed"
          ? alchemyUI.request()
          : alchemyUI.drawRequest(body.rarity, body.currency);
      if (JSON.stringify(current) !== JSON.stringify(reviewed))
        throw Error("The alchemy quote changed. Close and review again.");
      await execute(
        action,
        { ...body, confirmed: true },
        (result) => {
          alchemyUI.complete(result);
          if (action === "alchemy-feed") {
            render();
            showRefinementResult();
          } else {
            render();
            showAlchemyDrawResult();
          }
        },
        f,
      );
    } catch (error) {
      f.querySelector(".form-error").textContent = error.message;
    }
    return;
  }
  if (formIdentifier(f) === "titles-form") {
    await execute(
      "equip-titles",
      titleEditor.payload(state.me?.id),
      (result) => {
        ui.titleData = result;
        titleEditor.open(result, state.me.id);
        render();
        toast(result.message);
      },
      f,
    );
    return;
  }
  if (formIdentifier(f) === "showcase-slots-form") {
    await execute(
      "showcase-slots",
      { quantity: Number(b.quantity), expectedSlots: Number(b.expectedSlots) },
      null,
      f,
    );
    return;
  }
  if (formIdentifier(f) === "wishlist-order-form") {
    const result = await execute(
      "wishlist-order",
      wishlistEditor.payload(state.me?.id),
      () => {},
      f,
    );
    if (result) {
      ui.profileWishlist.sort = "custom";
      ui.profileCardsPage = 1;
      wishlistDrag.cancel();
      wishlistEditor.close();
      showcaseDrag.cancel();
      showcaseEditor.close();
      await loadDynamic();
      render();
      toast(result.message);
    }
    return;
  }
  if (formIdentifier(f) === "showcase-order-form") {
    const result = await execute(
      "showcase",
      showcaseEditor.payload(state.me?.id),
      () => {},
      f,
    );
    if (result) {
      showcaseDrag.cancel();
      showcaseEditor.close();
      await loadDynamic();
      render();
      toast(result.message);
    }
    return;
  }
  if (formIdentifier(f) === "collection-order-form") {
    if (pinnedAnimeEditor.activeFor(state.me?.id) && pinnedAnimeEditor.dirty()) {
      await execute("pinned-anime-order", pinnedAnimeEditor.payload(state.me.id));
    }
    const result = await execute(
      "collection-order",
      collectionEditor.payload(state.me?.id),
      () => {},
      f,
    );
    if (result) {
      collectionDrag.cancel();
      collectionEditor.close();
      pinnedAnimeDrag.cancel();
      pinnedAnimeEditor.close();
      ui.collectionSort = "custom";
      ui.profileCollection.sort = "custom";
      await loadDynamic();
      render();
      toast(result.message);
    }
    return;
  }

  if (formIdentifier(f) === "daily-pack-form") {
    ui.dailyPackKind = b.kind;
    if (!state.me) {
      auth();
      return;
    }
    await execute(
      "daily-pack",
      { kind: b.kind },
      (r) => packReveal.show(r, { daily: true, kind: b.kind }),
      f,
    );
    return;
  }
  if (f.dataset.inlinePrediction) {
    if (!state.me) {
      auth();
      return;
    }
    try {
      const body = predictionBody(b);
      f.querySelector(".form-error").textContent = "";
      await execute(
        "predict",
        body,
        (result) => {
          delete ui.pickemDrafts[body.pickem];
          render();
          toast(result.message);
        },
        f,
      );
    } catch (err) {
      f.querySelector(".form-error").textContent = err.message;
    }
    return;
  }
  if (await handleFeatureSubmit(f, b)) return;
  if (formIdentifier(f) === "auth-form") {
    const mode = b.mode;
    delete b.mode;
    await execute(mode, b);
  }
  if (formIdentifier(f) === "player-search") {
    search = b.q;
    ui.playerPage = 1;
    await loadDynamic();
    render();
  }
  if (["profile-form", "avatar-form"].includes(formIdentifier(f))) {
    b.avatar = b.avatar || null;
    if (b.avatar) b.crop = avatarEditor.read(f);
    if (formIdentifier(f) === "profile-form") {
      b.autosellBelow = f.elements.autosellBelow?.value || null;
      b.privateBalance = Boolean(f.elements.privateBalance?.checked);
      b.privateCollection = Boolean(f.elements.privateCollection?.checked);
      b.quizHotkeys = normalizeQuizHotkeys(settingsHotkeyDraft);
      b.noticePreferences = inboxSettings(f);
      b.notifyFriendsQuiz = Boolean(f.elements.notifyFriendsQuiz?.checked);
    }
    await execute("profile", b);
  }
  if (formIdentifier(f) === "bid-form")
    await execute("bid", {
      auction: Number(b.auction),
      amount: Number(b.amount),
    });
  if (formIdentifier(f) === "predict-form") {
    try {
      await execute("predict", predictionBody(b));
    } catch (err) {
      f.querySelector(".form-error").textContent = err.message;
    }
  }
  if (formIdentifier(f) === "pack-form")
    await execute(
      "pack",
      {
        kind: b.kind,
        premium: b.premium === "true",
        ...(b.special==='true'?{special:true}:{}),
        count: Number(b.count || 1),
      },
      (result) =>
        packReveal.show(result, {
          kind: b.kind,
          premium: b.premium === "true",
          paidSpecial:b.special==='true',
          count: Number(b.count || 1),
        }),
    );
});
document.addEventListener("input", (ev) => {
  savePredictionDraft(ev.target);
  if (ev.target.form?.id === "pack-form" && ev.target.name === "count") {
    const form = ev.target.form,
      price = Math.max(1, Number(form.dataset.packPrice) || 500),
      maxAffordable = Math.max(0, Math.min(100, Math.floor((state.me?.balance || 0) / price)));
    if (ev.target.value !== "") {
      let parsed = parseInt(ev.target.value, 10);
      if (Number.isFinite(parsed) && parsed > maxAffordable) {
        parsed = maxAffordable;
        ev.target.value = String(parsed);
      }
    }
    const count = Math.max(0, Number(ev.target.value) || 0);
    const submitBtn = form.querySelector("[data-pack-total]");
    if (submitBtn) {
      submitBtn.disabled = count < 1;
      submitBtn.textContent =
        count < 1
          ? "Insufficient credits"
          : "✦ Open " +
            count +
            " Pack" +
            (count === 1 ? "" : "s") +
            " · " +
            number(price * count) +
            " credits";
    }
  }
  if (ev.target.id === "market-search") {
    ev.target.classList.remove("no-results");
    ev.target.setAttribute("aria-invalid", "false");
    ui.marketQuery = ev.target.value;
    ui.marketPage = 1;
    ++loadVersion;
    clearTimeout(searchTimer);
    const query = ui.marketQuery;
    searchTimer = setTimeout(async () => {
      if (
        !(
          page() === "auctions" ||
          (page() === "shop" && ui.shopSection === "market")
        ) ||
        query !== ui.marketQuery
      )
        return;
      try {
        await loadDynamic();
        if (
          (page() === "auctions" ||
            (page() === "shop" && ui.shopSection === "market")) &&
          query === ui.marketQuery
        )
          render();
      } catch (err) {
        if (query === ui.marketQuery) toast(err.message, true);
      }
    }, 350);
    return;
  }
  if (ev.target.id === "trade-search") {
    ev.target.classList.remove("no-results");
    ev.target.setAttribute("aria-invalid", "false");
    ui.tradeQuery = ev.target.value;
    ui.tradePage = 1;
    ++loadVersion;
    clearTimeout(searchTimer);
    const query = ui.tradeQuery;
    searchTimer = setTimeout(async () => {
      if (
        page() !== "shop" ||
        ui.shopSection !== "trades" ||
        query !== ui.tradeQuery
      )
        return;
      try {
        await loadDynamic();
        if (
          page() === "shop" &&
          ui.shopSection === "trades" &&
          query === ui.tradeQuery
        )
          render();
      } catch (err) {
        if (query === ui.tradeQuery) toast(err.message, true);
      }
    }, 350);
    return;
  }
  const searchView = /^profile-(collection|wishlist|favorites)-search$/.exec(ev.target.id);
  if (searchView) {
    const view = searchView[1];
    const filters = view === "wishlist" ? ui.profileWishlist : profileInventoryFilters(view);
    ev.target.classList.remove("no-results");
    ev.target.setAttribute("aria-invalid", "false");
    filters.query = ev.target.value;
    ui.profileCardsPage = 1;
    ++loadVersion;
    clearTimeout(searchTimer);
    const query = filters.query;
    searchTimer = setTimeout(async () => {
      if (
        !(page() === "profile" || page() === "player") ||
        ui.profileView !== view ||
        query !== filters.query
      )
        return;
      try {
        await loadDynamic();
        if (
          (page() === "profile" || page() === "player") &&
          ui.profileView === view &&
          query === filters.query
        )
          render();
      } catch (err) {
        if (query === filters.query) toast(err.message, true);
      }
    }, 350);
    return;
  }
  if (["search", "profile-search"].includes(ev.target.id)) {
    ev.target.classList.remove("no-results");
    ev.target.removeAttribute("aria-invalid");
  }
  if (["profile-search", "search"].includes(ev.target.id)) ++loadVersion;
  if (ev.target.id === "profile-search") {
    search = ev.target.value;
    ui.playerPage = 1;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(async () => {
      try {
        await loadDynamic();
        render();
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
    if (page() === "catalog") {
      catalogPageNumber = 1;
      clearTimeout(searchTimer);
      searchTimer = setTimeout(async () => {
        try {
          await loadDynamic();
          render();
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
function savePredictionDraft(input) {
  const form = input.form;
  if (!form?.dataset.inlinePrediction) return;
  const p = ui.pickemDetail?.matches.find(
    (p) => p.id === Number(form.dataset.inlinePrediction),
  );
  if (!p) return;
  const values = Object.fromEntries(new FormData(form));
  ui.pickemDrafts[p.id] = {
    ...predictionDraft(p),
    ...(p.mode === "pair" ? { result: values.result } : {}),
    winner: values.winner,
    scoreA: values.scoreA,
    scoreB: values.scoreB,
  };
  form.querySelector(".form-error").textContent = "";
}
const autoPick = createPickemAutosave({
  send: (body, identity) => {
    if (state.me?.id !== identity)
      throw Error("Sign in again before choosing a team.");
    return api("predict", body);
  },
  async saved(body, identity) {
    if (state.me?.id !== identity) return;
    const draft = ui.pickemDrafts[body.pickem];
    if (draft && draft.winner !== body.winner) return;
    const p = ui.pickemDetail?.matches.find((p) => p.id === body.pickem);
    if (p) p.prediction = body.winner;
    const current = state.pickems.find((p) => p.id === body.pickem);
    if (current) current.prediction = body.winner;
    delete ui.pickemDrafts[body.pickem];
    if (page() === "pickems") {
      try {
        await loadDynamic();
        render();
      } catch {
        toast("Pick saved. Refresh to update the vote totals.", true);
      }
    }
  },
  failed(error, body, identity) {
    if (state.me?.id !== identity) return;
    const form = document.getElementById("tour-prediction-" + body.pickem);
    if (form) {
      form.querySelector(".form-error").textContent =
        "Pick Not Saved: " + error.message + " Select a team to try again.";
      const status = form.querySelector(".pickem-save-status");
      if (status) status.textContent = "Not Saved";
      const previous =
        ui.pickemDetail?.matches.find((p) => p.id === body.pickem)
          ?.prediction || "";
      form.querySelectorAll('input[name="winner"]').forEach((input) => {
        input.checked = input.value === previous;
        input
          .closest(".pickem-vote-row")
          ?.classList.toggle("is-selected", input.checked);
      });
    }
    delete ui.pickemDrafts[body.pickem];
  },
});
document.addEventListener("change", (ev) => {
  savePredictionDraft(ev.target);
  const form = ev.target.form;
  if (
    !form?.dataset.inlinePrediction ||
    ev.target.name !== "winner" ||
    form.elements.mode?.value !== "tour"
  )
    return;
  if (!state.me) {
    auth();
    return;
  }
  const status = form.querySelector(".pickem-save-status");
  if (status) status.textContent = "Saving Pick…";
  form
    .querySelectorAll(".pickem-vote-row")
    .forEach((row) =>
      row.classList.toggle("is-selected", row.querySelector("input")?.checked),
    );
  autoPick(predictionBody(Object.fromEntries(new FormData(form))), state.me.id);
});
document.addEventListener(
  "error",
  async (ev) => {
    const img = ev.target;
    if (img.tagName !== "IMG") return;
    if (img.dataset.portraitId) {
      const original = img.src;
      const lookup = replacementPortrait(img.dataset.portraitId);
      delete img.dataset.portraitId;
      if (lookup) {
        const url = await lookup;
        if (!img.isConnected || img.src !== original) return;
        if (url) {
          img.src = url;
          return;
        }
      }
    }
    img.replaceWith(
      Object.assign(document.createElement("div"), {
        className: "fallback-img",
        textContent: "✦",
        ariaLabel: img.alt || "No image",
      }),
    );
  },
  true,
);
accountButton.addEventListener("click", account);
accountMenu.addEventListener("click", (event) => {
  if (event.target.closest("a, button")) closeAccountMenu(true);
});
function dismissOutsideAccount(event) {
  if (!accountAnchor.contains(event.target)) closeAccountMenu();
}
document.addEventListener("pointerdown", dismissOutsideAccount);
document.addEventListener("focusin", dismissOutsideAccount);
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape" || accountMenu.hidden) return;
  event.preventDefault();
  closeAccountMenu(true);
});
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
  if (e.target.closest("#view-pulls,[data-close-dialog]"))
    $("#modal").close();
});
installNavigation(async () => {
  closeAccountMenu();
  const destination = currentRoute();
  titleDrag.cancel();
  titleEditor.close();
  wishlistDrag.cancel();
  wishlistEditor.close();
  showcaseDrag.cancel();
  showcaseEditor.close();
  pinnedAnimeDrag.cancel();
  pinnedAnimeEditor.close();
  if (fusionOverlayOpen()) closeFusionPicker();
  search = "";
  catalogPageNumber = 1;
  ui.marketPage = 1;
  ui.rankPage = 1;
  ui.pickemPage = 1;
  ui.pickemOpen = null;
  ui.pickemDetail = null;
  ui.pickemData = null;
  ui.playerPage = 1;
  profileData = null;
  ui.profileView = "overview";
  ui.profileCardsPage = 1;
  ui.profileCardsData = null;
  ui.profileCollection.wishlist = false;
  ui.profileCollection.tradeable = false;
  try {
    if (sharedRefreshNeeded && page() !== "arcade") await refresh();
    else {
      await loadDynamic();
      if (currentRoute() === destination) render();
    }
  } catch (err) {
    if (currentRoute() === destination)
      $("#main").innerHTML = pageErrorHTML(err, page(), escape);
  }
  if (currentRoute() === destination) window.scrollTo(0, 0);
});
let backgroundRefresh = null,
  lastBackgroundRefresh = 0,
  backgroundRetryAt = 0;
function refreshInBackground() {
  if (
    document.hidden ||
    busy ||
    $("#modal").open ||
    fusionOverlayOpen() ||
    quizPlaying() ||
    backgroundRefresh ||
    Date.now() < backgroundRetryAt
  )
    return;
  lastBackgroundRefresh = Date.now();
  backgroundRefresh = refreshCurrent()
    .catch(() => {
      backgroundRetryAt = Date.now() + 30000;
    })
    .finally(() => (backgroundRefresh = null));
}
document.addEventListener("visibilitychange", () => {
  if (Date.now() - lastBackgroundRefresh > 15000) refreshInBackground();
});
setInterval(refreshInBackground, 120000);
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
      "The Club Is Temporarily Offline.",
      "The shared backend could not be reached.",
    ) +
    `<div class="notice warm">${escape(err.message)}</div><a class="button" href="?demo=1">Explore the demo ↗</a>`;
}

function setAnimeTitleMode(value) {
  if (!["romaji", "english"].includes(value)) return;
  titleMode = value;
  try {
    localStorage.setItem("amqtours-title-mode", titleMode);
  } catch {}
  if (state) render();
}

let friendListView = "added", friendListPage = 1, collectorLoad = 0, friendsLoad = 0;
const friendSaving = new Set();
async function openFriends(view = "added", page = 1) {
  if (!state.me) { auth(); return; }
  const player = state.me.id, version=++friendsLoad, route=currentRoute(), origin=$("#modal-body").firstElementChild, wasOpen=$("#modal").open;
  const data = await api("friends?view=" + view + "&page=" + page);
  if (state.me?.id !== player || version!==friendsLoad || route!==currentRoute() || $("#modal-body").firstElementChild!==origin || (wasOpen&&!$("#modal").open)) return;
  friendListView = view; friendListPage = page;
  rememberCards(data.cards);
  modal(friendsPanel(data,{escape,avatarHTML,profileURL,viewer:player}),false,"friends-modal");
}
async function handleFeatureClick(a, t) {
  try {
    if (a === "friends-open") {
      await openFriends(t.dataset.view || "added",Number(t.dataset.page || 1));
      return true;
    }
    if (a === "friend-set") {
      if (!state.me) { auth(); return true; }
      const id=t.dataset.player, player=state.me.id;
      if (friendSaving.has(id)) return true;
      friendSaving.add(id);t.disabled=true;
      try {
        const result=await api("friend-set",{player:id,added:t.dataset.added==="true"},crypto.randomUUID());
        if (state.me?.id !== player) return true;
        const patch=p=>p.id===result.player?{...p,friendship:result.friendship}:p;
        profileResults=profileResults.map(patch);
        if(profileData)profileData=patch(profileData);
        if(ui.playerData)ui.playerData.profiles=ui.playerData.profiles.map(patch);
        render();
        if($("#modal").open && $(".friends-panel"))await openFriends(friendListView,friendListPage);
      } finally {friendSaving.delete(id); if(t.isConnected)t.disabled=false;}
      return true;
    }
    if (a === "profile-quiz-sort") {
      const key=t.dataset.sort;
      if(!["quiz","category","time"].includes(key))return true;
      ui.profileQuizSort={key,ascending:ui.profileQuizSort.key===key?!ui.profileQuizSort.ascending:true};
      render();$("[data-action=profile-quiz-sort][data-sort="+key+"]")?.focus({preventScroll:true});
      return true;
    }
    if (a === "retry-page") {
      await refresh();
      return true;
    }
    if (a === "shop-section") {
      if (
        !["buy", "sell", "market", "listings", "trades"].includes(
          t.dataset.section,
        )
      )
        return true;
      ui.shopSection = t.dataset.section;
      ui.marketPage = 1;
      await loadDynamic();
      render();
      return true;
    }
    if (a === "quiz-notice-open") {
      $("#modal").close();
      (await loadQuizUI()).openLeaderboard(t.dataset.quiz);
      if (page() !== "quiz") navigate("quiz");
      else {
        await loadDynamic();
        render();
      }
      return true;
    }
    if (a?.startsWith("trade-") && a !== "trade-toggle") {
      if (a === "trade-notice-open") {
        $("#modal").close();
        ui.shopSection = "trades";
        ui.tradeView = "listings";
        ui.tradePage = 1;
        ui.tradeQuery = cardBy(t.dataset.card).name;
        if (page() !== "shop") navigate("shop");
        else {
          await loadDynamic();
          render();
        }
        return true;
      }
      if (a === "trade-search-clear") {
        clearTimeout(searchTimer);
        ui.tradeQuery = "";
        ui.tradePage = 1;
        ui.tradeData = null;
        await loadDynamic();
        render();
        $("#trade-search")?.focus({ preventScroll: true });
        return true;
      }
      if (a === "trade-kind") {
        const nextKind = t.dataset.kind;
        if (!["both", "character", "seiyuu"].includes(nextKind)) return true;
        ui.tradeKind = nextKind;
        if (nextKind !== "character") ui.tradeRole = "";
        ui.tradePage = 1;
        ui.tradeData = null;
        await loadDynamic();
        render();
        return true;
      }
      if (
        ["trade-view", "trade-prev", "trade-next", "trade-refresh"].includes(a)
      ) {
        if (a === "trade-view") {
          if (!["browse", "listings", "offers"].includes(t.dataset.view))
            return true;
          ui.tradeView = t.dataset.view;
          ui.tradePage = 1;
        } else if (a !== "trade-refresh")
          ui.tradePage = Math.max(
            1,
            ui.tradePage + (a === "trade-next" ? 1 : -1),
          );
        ui.tradeData = null;
        await loadDynamic();
        render();
        return true;
      }
      if (!state.me) {
        auth();
        return true;
      }
      if (a === "trade-new" || a === "trade-make") {
        const listing =
          a === "trade-make"
            ? ui.tradeData?.items.find((l) => l.id === Number(t.dataset.id))
            : null;
        if (a === "trade-make" && !listing)
          throw Error("Refresh the trade board and try again.");
        tradesUI.openPicker(listing);
        modal(tradesUI.renderPicker(), true, "trade-picker");
        return true;
      }
      if (
        [
          "trade-card",
          "trade-remove",
          "trade-picker-back",
          "trade-picker-prev",
          "trade-picker-next",
        ].includes(a)
      ) {
        if (busy) return true;
        if (a === "trade-card") tradesUI.choose(t.dataset.id);
        else if (a === "trade-remove") tradesUI.remove(Number(t.dataset.index));
        else if (a === "trade-picker-back") tradesUI.back();
        else tradesUI.turn(a === "trade-picker-next" ? 1 : -1);
        $("#modal-body").innerHTML = tradesUI.renderPicker();
        return true;
      }
      if (a === "trade-unprotect-offer" || a === "trade-unprotect-only") {
        if (busy) return true;
        const id = t.dataset.id;
        const item = state.inventory?.find((i) => i.card === id);
        if (!item) {
          toast("Refresh to load this card from your collection.", true);
          return true;
        }
        await execute(
          "protect-card",
          { card: id, protected: false },
          async (result) => {
            toast(result.message || "Card unprotected.");
            if (a === "trade-unprotect-offer") {
              try {
                tradesUI.choose(id);
              } catch (err) {
                toast(err.message, true);
              }
            }
            $("#modal-body").innerHTML = tradesUI.renderPicker();
          },
        );
        return true;
      }
      if (
        [
          "trade-cancel",
          "trade-withdraw",
          "trade-decline",
          "trade-accept",
        ].includes(a)
      ) {
        const id = Number(t.dataset.id),
          listing = ui.tradeData?.items.find((l) =>
            a === "trade-cancel"
              ? l.id === id
              : l.offers.some((o) => o.id === id),
          );
        if (!listing) throw Error("Refresh the trade board and try again.");
        const offer = listing.offers.find((o) => o.id === id);
        const heading = {
          "trade-cancel": "Cancel This Listing?",
          "trade-withdraw": "Withdraw This Offer?",
          "trade-decline": "Decline This Offer?",
          "trade-accept": "Accept This Trade?",
        }[a];
        const detail =
          a === "trade-accept"
            ? '<p class="subtext">You give</p>' +
              tradesUI.card(listing.card, listing.level) +
              '<p class="subtext">You receive</p>' +
              tradesUI.offer(offer) +
              "<p>All cards" +
              (Number(offer?.credits) > 0 ? " and offered credits" : "") +
              " transfer immediately. All other offers are returned. This trade is final.</p>"
            : "<p>The held " +
              (a === "trade-cancel" ? "cards and all offered cards/credits are" : "cards and credits are") +
              " returned to their owners.</p>";
        modal(
          "<h2>" +
            heading +
            "</h2>" +
            detail +
            '<form id="trade-decision-form" class="stack"><input type="hidden" name="action" value="' +
            a +
            '"><input type="hidden" name="id" value="' +
            id +
            '"><div class="form-error" role="alert"></div><button class="button mint" type="submit">Confirm</button></form>',
        );
        return true;
      }
      return true;
    }
    if (a === "shop-sign-in") {
      auth();
      return true;
    }
    if (a === "shop-sell-prev" || a === "shop-sell-next") {
      ui.shopSell.page += a.endsWith("next") ? 1 : -1;
      render();
      return true;
    }
    if (arcadePage && await arcadePage.click(a, t)) return true;
    if (a?.startsWith("alchemy-") || a === "fusion-card") {
      if (!state.me) {
        auth();
        return true;
      }
      if (a === "alchemy-close") {
        closeFusionPicker();
        return true;
      }
      if (a === "alchemy-material-open") {
        await openFusionPicker("material");
        return true;
      }
      if (a === "alchemy-auto") {
        openFusionReview(null, alchemyUI.autoForm());
        return true;
      }
      if (a === "alchemy-target-open") {
        fusionReviewOpen = false;
        await openFusionPicker("target", t.dataset.rarity);
        return true;
      }
      if (a === "alchemy-material-cancel" || a === "alchemy-material-confirm") {
        if (a === "alchemy-material-confirm" && pendingAlchemyMaterial) {
          const item = state.inventory.find(
            (i) => i.card === pendingAlchemyMaterial.card,
          );
          if (!item || item.level !== pendingAlchemyMaterial.level)
            throw Error("This card changed. Select it again.");
          alchemyUI.toggle(pendingAlchemyMaterial, true);
        }
        const scroll = pendingAlchemyMaterial?.scroll || 0;
        pendingAlchemyMaterial = null;
        fusionReviewOpen = false;
        renderFusionPicker();
        $("#fusion-picker .fusion-picker-dialog").scrollTop = scroll;
        return true;
      }
      if (a === "alchemy-inspect") {
        if (alchemyUI.inspect(t.dataset.key)) {
          repaintAlchemyOrder();
          const root = alchemyUI.pickerOpen() ? $("#fusion-picker") : $("#main");
          root.querySelector('[data-action="alchemy-inspect"][data-key="' + CSS.escape(t.dataset.key) + '"]')?.focus({ preventScroll: true });
        }
        return true;
      }
      if (a === "alchemy-move" || a === "alchemy-remove") {
        if (a === "alchemy-move")
          alchemyUI.move(Number(t.dataset.index), Number(t.dataset.direction));
        else alchemyUI.remove(Number(t.dataset.index));
        repaintAlchemyOrder();
        return true;
      }
      if (a === "alchemy-material-select" || a === "fusion-card") {
        const item = state.inventory.find((i) => i.card === t.dataset.id),
          entry = {
            card: t.dataset.id,
            variant:
              a === "fusion-card"
                ? item?.copies > 1
                  ? "extra"
                  : "card"
                : t.dataset.variant,
          };
        if (!alchemyUI.toggle(entry)) {
          pendingAlchemyMaterial = {
            ...entry,
            level: item.level,
            scroll: $("#fusion-picker .fusion-picker-dialog")?.scrollTop || 0,
          };
          openFusionReview(
            null,
            '<h2 id="fusion-review-title">Use This Enhanced Card?</h2><p><strong>' +
              escape(cardBy(entry.card).name) +
              " · " +
              levelLabel(item.level) +
              '</strong> will be added to your refinement order. Refining consumes the enhanced card and all invested copies.</p><div class="toolbar"><button type="button" class="button secondary" data-action="alchemy-material-cancel">Cancel</button><button type="button" class="button mint" data-action="alchemy-material-confirm">Add to Refinement Order</button></div>',
          );
          return true;
        }
        if (a === "fusion-card") navigate("fusion");
        repaintAlchemyOrder();
        return true;
      }
      if (a === "alchemy-target-select" || a === "alchemy-target-clear") {
        await execute(
          "alchemy-target",
          alchemyUI.targetRequest(
            a === "alchemy-target-select" ? t.dataset.id : null,
            t.dataset.rarity,
          ),
          (result) => {
            closeFusionPicker(true);
            render();
            toast(result.message);
          },
        );
        return true;
      }
      if (a === "alchemy-refine") {
        openFusionReview(alchemyUI.request());
        return true;
      }
      if (a === "alchemy-draw-reveal") {
        if (alchemyUI.revealDraw()) showAlchemyDrawResult();
        return true;
      }
      if (a === "alchemy-draw-review") {
        openFusionReview(alchemyUI.drawRequest(t.dataset.rarity, t.dataset.currency, true));
        return true;
      }
      if (a === "alchemy-material-clear") {
        alchemyUI.clear();
        if (alchemyUI.pickerOpen()) {
          renderFusionPicker();
          return true;
        }
      }
      if (a === "alchemy-dismiss") alchemyUI.dismiss();
      if (a === "alchemy-prev" || a === "alchemy-next") {
        a.endsWith("next") ? alchemyUI.next() : alchemyUI.prev();
        if (alchemyUI.pickerMode() === "target")
          await alchemyUI.loadTargets(api);
        renderFusionPicker();
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
    if (a === "anime-checklist-open" || a === "anime-checklist-page") {
      await openAnimeChecklist(
        a === "anime-checklist-open"
          ? t.dataset.series
          : animeChecklistData.series_key,
        a === "anime-checklist-page" ? Number(t.dataset.page) : 1,
      );
      return true;
    }
    if (a === "favorite-toggle") {
      if (!state.me) { auth(); return true; }
      const scope = $("#main [data-filter-scope]")?.dataset.filterScope;
      if (favoritesOnly(scope) || scope === "profile-favorites-search") resetCardFilterPage(scope);
      await execute("card-favorite", {card: t.dataset.id, favorite: t.getAttribute("aria-pressed") !== "true"}, result => {
        document.querySelectorAll('[data-action="favorite-toggle"]').forEach(button => {
          if (button.dataset.id === result.card) button.setAttribute("aria-pressed", String(result.favorite));
        });
        toast(result.message);
      });
      return true;
    }
    if (a === "wishlist-toggle") {
      collectorCounts.delete(t.dataset.id);
      if (!state.me) {
        auth();
        return true;
      }
      const checklist = t.closest(".anime-checklist") && animeChecklistData;
      await execute(
        "wishlist",
        {
          card: t.dataset.id,
          wanted: !(state.wishlist || []).includes(t.dataset.id),
        },
        checklist
          ? () => {
              const body = $("#modal-body");
              const scroll = body.scrollTop,
                dialogScroll = $("#modal").scrollTop;
              body.innerHTML = animeChecklist(checklist, {
                escape,
                cardHTML,
                wishlist: state.wishlist || [],
                state,
                titleMode,
              });
              body.scrollTop = scroll;
              $("#modal").scrollTop = dialogScroll;
              body
                .querySelector(
                  '[data-action="wishlist-toggle"][data-id="' +
                    CSS.escape(t.dataset.id) +
                    '"]',
                )
                ?.focus({ preventScroll: true });
            }
          : result => {
              document.querySelectorAll('[data-action="wishlist-toggle"]').forEach(button => {
                button.setAttribute("aria-pressed", String(result.wishlist.includes(button.dataset.id)));
              });
              syncCardFlags($("#modal"), cardFlags);
            },
      );
      return true;
    }
    if (a === "clear-profile-wishlist-filters") {
      ui.profileWishlist={...ui.profileWishlist,kind:"both",query:"",rarity:"",role:"",sort:ui.profileWishlist.sort.startsWith("role")?"custom":ui.profileWishlist.sort,ownership:""};
      ui.profileCardsPage=1; await loadDynamic(); render(); return true;
    }
    if (a === "profile-wishlist-kind") {
      const nextKind = t.dataset.kind;
      if (!["both", "character", "seiyuu"].includes(nextKind)) return true;
      wishlistDrag.cancel();
      wishlistEditor.close();
      ui.profileWishlist.kind = nextKind;
      if (nextKind !== "character") { ui.profileWishlist.role=""; if(ui.profileWishlist.sort.startsWith("role")) ui.profileWishlist.sort="custom"; }
      ui.profileCardsPage = 1;
      ui.profileCardsData = null;
      await loadDynamic();
      render();
      return true;
    }
    if (a === "profile-cards-view" || a === "profile-cards-page") {
      wishlistDrag.cancel();
      wishlistEditor.close();
      showcaseDrag.cancel();
      showcaseEditor.close();
      if (a === "profile-cards-view") {
        ui.profileView = t.dataset.view;
        ui.profileCardsPage = 1;
        if (ui.profileView !== "collection") {
          ui.profileCollection.wishlist = false;
          ui.profileCollection.tradeable = false;
        }
      } else ui.profileCardsPage = Number(t.dataset.page);
      ui.profileCardsData = null;
      ui.profileQuizData = null;
      await loadDynamic();
      render();
      return true;
    }
    if (a === "profile-venue") {
      if (t.dataset.venue === "auction") navigate("auctions");
      else {
        ui.shopSection = t.dataset.venue === "trade" ? "trades" : "market";
        ui.tradeView = "browse";
        navigate("shop");
      }
      return true;
    }
    if (a === "card-collectors") {
      const version=++collectorLoad, viewer=state.me?.id, route=currentRoute();
      const updating=!!t.closest?.(".card-collectors") || t.dataset.friends!==undefined;
      const data = await api(
        "card-collectors?card=" +
          encodeURIComponent(t.dataset.id) +
          "&view=" +
          (t.dataset.view || "owned") +
          "&page=" +
          (t.dataset.page || 1) + (t.dataset.friends === "1" ? "&friends=1" : ""),
      );
      if(version!==collectorLoad || viewer!==state.me?.id || route!==currentRoute() || (updating && (!$("#modal").open || !$(".card-collectors"))))return true;
      rememberCards(data.cards);
      modal(
        collectorsPanel(data, {
          escape,
          number,
          cardBy,
          avatarHTML,
          profileURL,
          signedIn: !!state.me,
        }),
        true,
      );
      return true;
    }
    if (a === "wishlist-arrange" || a === "wishlist-cancel") {
      if (!state.me) {
        auth();
        return true;
      }
      if (busy) return true;
      if (wishlistEditor.activeFor(state.me.id)) {
        wishlistDrag.cancel();
        wishlistEditor.close();
        showcaseDrag.cancel();
        showcaseEditor.close();
        await loadDynamic();
        render();
        return true;
      }
      const data = await api("wishlist-order");
      rememberCards(data.cards);
      wishlistEditor.open(
        { id: state.me.id, wishlist: data.wishlist },
        state.me.id,
        ui.profileCardsPage,
      );
      render();
      return true;
    }
    if (a === "wishlist-page") {
      wishlistEditor.setPage(Number(t.dataset.page));
      ui.profileCardsPage = wishlistEditor.currentPage();
      render();
      return true;
    }
    if (a === "collection-arrange" || a === "collection-cancel") {
      if (!state.me) {
        auth();
        return true;
      }
      if (busy) return true;
      if (
        a === "collection-cancel" ||
        collectionEditor.activeFor(state.me.id) ||
        pinnedAnimeEditor.activeFor(state.me.id)
      ) {
        collectionDrag.cancel();
        collectionEditor.close();
        pinnedAnimeDrag.cancel();
        pinnedAnimeEditor.close();
        pinnedAnimeDrag.cancel();
        pinnedAnimeEditor.close();
        await loadDynamic();
        render();
        return true;
      }
      wishlistDrag.cancel();
      wishlistEditor.close();
      showcaseDrag.cancel();
      showcaseEditor.close();
      const data = await api("collection-order");
      rememberCards(data.cards);
      collectionEditor.open(
        { id: state.me.id, collection: data.collection },
        state.me.id,
        page() === "collection" ? ui.collectionPage : ui.profileCardsPage,
      );
      if (page() === "collection") {
        if (!ui.animeData) {
          try {
            ui.animeData = await api(
              "anime-collection?page=" + (ui.animePage || 1),
            );
          } catch {}
        }
        if (ui.animeData?.pinned?.length > 1) {
          pinnedAnimeEditor.open(ui.animeData.pinned, state.me.id);
        }
      }
      render();
      return true;
    }
    if (a === "pinned-anime-save") {
      if (!state.me) return true;
      const payload = pinnedAnimeEditor.payload(state.me.id);
      const res = await execute("pinned-anime-order", payload);
      if (res) {
        pinnedAnimeEditor.open(pinnedAnimeEditor.items(), state.me.id);
        if (ui.animeData) {
          ui.animeData.pinned = pinnedAnimeEditor.items();
        }
        await loadDynamic();
        render();
        toast(res.message);
      }
      return true;
    }
    if (a === "pinned-anime-reset") {
      pinnedAnimeEditor.reset();
      render();
      return true;
    }
    if (a === "collection-page") {
      collectionEditor.setPage(Number(t.dataset.page));
      if (page() === "collection")
        ui.collectionPage = collectionEditor.currentPage();
      else ui.profileCardsPage = collectionEditor.currentPage();
      render();
      return true;
    }
    if (a === "collection-arrange-kind") {
      collectionEditor.setFilter("kind", t.dataset.kind || "both");
      render();
      return true;
    }
    if (a === "clear-collection-arrange-filters") {
      collectionEditor.clearFilters();
      render();
      return true;
    }
    if (a === "profile-collection-kind" || a === "profile-favorites-kind") {
      const filters = profileInventoryFilters();
      filters.kind = t.dataset.kind || "both";
      if (filters.kind === "seiyuu") {
        filters.role = "";
        if (filters.sort.startsWith("role")) filters.sort = "custom";
      }
      ui.profileCardsPage = 1;
      await loadDynamic();
      render();
      return true;
    }
    if (a === "clear-profile-collection-filters" || a === "clear-profile-favorites-filters") {
      Object.assign(profileInventoryFilters(), {
        kind: "both",
        query: "",
        rarity: "",
        role: "",
        wishlist: false,
        tradeable: false,
      });
      ui.profileCardsPage = 1;
      await loadDynamic();
      render();
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
      ui.collectionFilters = {
        rarity: "",
        role: "",
        upgradable: false,
        hideProtected: false,
        tradeable: false,
      };
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
        "pack-reveal-page",
        "pack-autosell-cancel",
        "showcase-toggle",
        "showcase-buy-slots",
        "showcase-arrange",
        "showcase-cancel",
        "showcase-page",
        "protect-toggle",
        "trade-toggle",
        "batch-sell",
        "batch-cancel",
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
    if (a === "pack-reveal-page") {
      packReveal.turn(Number(t.dataset.delta));
      $("#modal").scrollTop = 0;
      return true;
    }
    if (a === "pack-autosell-cancel") {
      const result = await saveCardAction(a, { sale: t.dataset.sale }, t);
      if (result) packReveal.cancelAutoSale(result.sale, $("#modal"));
      return true;
    }
    if (a === "pack") {
      const kind = t.dataset.kind,
        premium = t.dataset.premium === "true",special=t.dataset.special==='true',
        price =
          state.settings[(special ? "special_" : premium ? "premium_" : "") + kind + "_price"] ||
          (special ? 3000 : premium ? 1000 : 500),
        maxAffordable = Math.max(0, Math.min(100, Math.floor((state.me?.balance || 0) / price))),
        initialCount =
          maxAffordable > 0
            ? Math.min(maxAffordable, Math.max(1, Number(t.dataset.count) || 1))
            : 0;
      modal(
        `<h2>${special ? "Special Card Pack" : premium ? "A Rarer Kind of Luck." : "A New Favourite Could Be Inside."}</h2><p>${special ? SPECIAL_PACK_DESCRIPTION : `Five independent ${kind === "character" ? "character" : "seiyuu"} cards for <strong>${number(price)} credits</strong>. ${premium ? "AG, Ubers, SSS, SS and S each have double their normal chances." : "Normal pack odds apply."}`}</p><form id="pack-form" data-pack-price="${price}"><input type="hidden" name="kind" value="${kind}"><input type="hidden" name="premium" value="${premium}">${special?'<input type="hidden" name="special" value="true">':''}${quantityInput({ id: "pack-quantity", name: "count", label: "Packs to Open", min: maxAffordable > 0 ? 1 : 0, max: maxAffordable, value: initialCount })}${special?'':'<p class="form-hint">5 cards per pack.</p>'}<div class="form-error" role="alert"></div><button class="button full" type="submit" data-pack-total ${initialCount < 1 ? "disabled" : ""}>${initialCount < 1 ? "Insufficient credits" : `✦ Open for ${number(price * initialCount)} credits`}</button></form>`,
      );
      return true;
    }
    if (a === "protect-toggle") {
      if (busy) return true;
      const item = state.inventory.find((i) => i.card === t.dataset.id);
      if (!item) {
        toast("Refresh to load this card from your collection.", true);
        return true;
      }
      const nextProtected = !item.protected;
      item.protected = nextProtected ? 1 : 0;
      t.setAttribute("aria-pressed", String(nextProtected));
      t.classList.toggle("is-selected", nextProtected);
      t.title = nextProtected ? "Unprotect this card" : "Protect this card";
      const surface = t.closest(".card-surface");
      if (surface) syncCardFlags(surface, cardFlags);
      try {
        const result = await saveCardAction(
          "protect-card",
          {
            card: item.card,
            protected: nextProtected,
          },
          t,
        );
        if (!result) throw Error("Card update was not saved.");
      } catch (err) {
        item.protected = nextProtected ? 0 : 1;
        t.setAttribute("aria-pressed", String(!nextProtected));
        t.classList.toggle("is-selected", !nextProtected);

        t.title = !nextProtected ? "Unprotect this card" : "Protect this card";
        if (surface) syncCardFlags(surface, cardFlags);
      }
      return true;
    }
    if (a === "trade-toggle") {
      if (busy) return true;
      const item = state.inventory.find((i) => i.card === t.dataset.id);
      if (!item) {
        toast("Refresh to load this card from your collection.", true);
        return true;
      }
      const nextForTrade = !item.for_trade;
      item.for_trade = nextForTrade ? 1 : 0;
      t.setAttribute("aria-pressed", String(nextForTrade));
      const surface = t.closest(".card-surface");
      if (surface) syncCardFlags(surface, cardFlags);
      try {
        const result = await saveCardAction(
          "trade-card",
          {
            card: item.card,
            forTrade: nextForTrade,
          },
          t,
        );
        if (!result) throw Error("Card update was not saved.");
      } catch (err) {
        item.for_trade = nextForTrade ? 0 : 1;
        t.setAttribute("aria-pressed", String(!nextForTrade));
        if (surface) syncCardFlags(surface, cardFlags);
      }
      return true;
    }
    if (a === "batch-cancel") {
      ui.shopBatchReview = null;
      pendingBatchSale = null;
      render();
      return true;
    }
    if (a === "batch-sell") {
      const filters = {
        kind: tab,
        query: ui.shopSell.query,
        rarity: ui.shopSell.rarity,
        role: ui.shopSell.role,
        upgradable: ui.shopSell.upgradable,
        mode: ui.shopSell.mode,
      };
      const quote = batchSaleQuote(state.inventory, cardBy, filters);
      if (!quote.items.length) {
        toast("No unprotected cards match this sale.", true);
        return true;
      }
      pendingBatchSale = { filters, expectedItems: quote.items };
      ui.shopBatchReview = { filters, quote };
      render();
      $("#batch-sale-review")?.scrollIntoView({
        block: "start",
        behavior: "smooth",
      });
      return true;
    }
    if (a === "showcase-buy-slots") {
      openShowcasePurchase();
      return true;
    }
    if (a === "showcase-page") {
      showcaseEditor.setPage(Number(t.dataset.page));
      render();
      return true;
    }
    if (a === "showcase-arrange" || a === "showcase-cancel") {
      if (profileData?.id !== state.me.id || busy) return true;
      if (a === "showcase-cancel" || showcaseEditor.activeFor(state.me.id)) {
        showcaseDrag.cancel();
        showcaseEditor.close();
        await loadDynamic();
      } else {
        wishlistDrag.cancel();
        wishlistEditor.close();
        collectionDrag.cancel();
        collectionEditor.close();
        pinnedAnimeDrag.cancel();
        pinnedAnimeEditor.close();
        showcaseEditor.open(profileData, state.me.id);
      }
      render();
      return true;
    }
    if (a === "showcase-toggle") {
      const cards = [...(state.showcase || [])],
        i = cards.indexOf(t.dataset.id);
      if (i >= 0) cards.splice(i, 1);
      else {
        if (cards.length >= MAX_SPOTLIGHTS) {
          toast(
            "Your spotlights hold up to " +
              MAX_SPOTLIGHTS +
              " cards. Remove one first.",
            true,
          );
          return true;
        }
        if (cards.length >= (state.me.showcase_slots ?? 30)) {
          openShowcasePurchase();
          return true;
        }
        cards.push(t.dataset.id);
      }
      await saveCardAction("showcase", { cards, expectedCards: state.showcase || [] }, t);
      return true;
    }
    if (a === "buyout") {
      const auct = [...state.auctions, ...(ui.marketData?.items || [])].find(
        (x) => x.id === Number(t.dataset.id),
      );
      modal(
        "<h2>Buy Out " +
          escape(cardBy(auct.card).name) +
          "?</h2><p>Pay " +
          number(auct.buyout) +
          " credits and receive the " +
          levelLabel(auct.level) +
          ' card immediately. Any existing bid you hold is deducted from that price.</p><form id="purchase-form"><input type="hidden" name="action" value="buyout"><input type="hidden" name="id" value="' +
          auct.id +
          '"><div class="form-error" role="alert"></div><button class="button full" type="submit">Buy out for ' +
          number(auct.buyout) +
          " credits</button></form>",
      );
      return true;
    }
    if (a === "listing-venue") {
      const variant =
        $("#listing-form [name=variant]")?.value ||
        $("#instant-sell-form [name=variant]")?.value;
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
        `<h2>Withdraw This Listing?</h2><p>Your card returns with its enhancement level. ${t.dataset.venue === "auction" ? "Only auctions without bids can be withdrawn." : "It will no longer be available to buy."}</p><form id="withdraw-form"><input name="listing" type="hidden" value="${Number(t.dataset.id)}"><input name="venue" type="hidden" value="${escape(t.dataset.venue)}"><div class="form-error" role="alert"></div><button class="button full" type="submit">Withdraw & return card</button></form>`,
      );
      return true;
    }
    if (a === "shop-buy" || a === "buy-listing") {
      const weekly = a === "shop-buy",
        l = (weekly ? state.shop : ui.marketData?.items || []).find(
          (l) => l.id === Number(t.dataset.id),
        );
      if (!l) {
        toast("This listing changed. Refresh the shop and try again.", true);
        return true;
      }
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
function listingForm(id, venue = "shop", variant) {
  const c = cardBy(id),
    item = state.inventory.find((i) => i.card === id);
  if (!item) {
    toast("You no longer own that card.", true);
    return;
  }
  if (item.protected) {
    toast(
      "This card is protected. Unprotect it before listing or selling.",
      true,
    );
    return;
  }
  modal(
    listingModalHTML({
      card: c,
      item,
      venue,
      variant,
      escape,
      number,
      quantityInput,
    }),
    false,
    "listing-modal",
  );
}
function openInstantSale(id, variant) {
  listingForm(id, "store", variant);
}
async function handleFeatureSubmit(f, b) {
  if (formIdentifier(f) === "alchemy-auto-form") {
    try {
      alchemyUI.autoSelect(Number(b.count), b.maxRarity);
      $("#modal").close();
      render();
      openFusionReview(alchemyUI.request());
    } catch (err) {
      f.querySelector(".form-error").textContent = err.message;
    }
    return true;
  }
  if (formIdentifier(f) === "trade-card-form") {
    try {
      const p = tradesUI.payload();
      await execute(p.action, p.body, null, f);
    } catch (err) {
      f.querySelector(".form-error").textContent = err.message;
    }
    return true;
  }
  if (formIdentifier(f) === "trade-decision-form") {
    await execute(
      b.action,
      b.action === "trade-cancel"
        ? { listing: Number(b.id) }
        : { offer: Number(b.id) },
      null,
      f,
    );
    return true;
  }
  if (arcadePage && await arcadePage.submit(f, b)) return true;
  if (formIdentifier(f) === "batch-sell-form") {
    if (!pendingBatchSale) throw Error("Review the batch first.");
    const result = await execute("sell-batch", pendingBatchSale);
    if (result) {
      pendingBatchSale = null;
      ui.shopBatchReview = null;
      render();
    }
    return true;
  }
  if (formIdentifier(f) === "instant-sell-form") {
    await execute(
      "sell-instant",
      {
        ...b,
        expectedPrice: Number(b.expectedPrice),
        expectedLevel: Number(b.expectedLevel),
      },
      null,
      f,
    );
    return true;
  }

  if (formIdentifier(f) === "withdraw-form") {
    await execute("cancel-listing", {
      listing: Number(b.listing),
      venue: b.venue,
    });
    return true;
  }
  if (formIdentifier(f) === "anime-pin-search") {
    try {
      const r = await api("anime-search?q=" + encodeURIComponent(b.q));
      ui.animeSearch = r.series;
      render();
    } catch (err) {
      toast(err.message, true);
    }
    return true;
  }
  if (formIdentifier(f) === "listing-form") {
    if (b.venue === "trade") {
      const item = state.inventory.find((i) => i.card === b.card);
      const level = b.variant === "extra" ? 1 : item?.level || 1;
      const result = await execute(
        "trade-list",
        {
          card: b.card,
          variant: b.variant,
          expectedLevel: level,
        },
        null,
        f,
      );
      if (result && page() === "shop") {
        ui.shopSection = "trades";
        render();
      }
      return true;
    }
    const result = await execute(
      "list-card",
      {
        card: b.card,
        variant: b.variant,
        venue: b.venue,
        price: Number(b.price),
        ...(b.venue === "auction" ? { hours: Number(b.hours) } : {}),
        buyout: b.buyout ? Number(b.buyout) : null,
      },
      null,
      f,
    );
    if (result && page() === "shop" && b.venue === "shop") {
      ui.shopSection = "listings";
      render();
    }
    return true;
  }
  if (formIdentifier(f) === "purchase-form") {
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
            ? "Your Auction Prize Is Here."
            : "Your New Card Is Here.",
        ),
    );
    return true;
  }
  return false;
}
document.addEventListener("input", (ev) => {
  if (ev.target.id !== "shop-search") return;
  const position = ev.target.selectionStart;
  ui.shopBatchReview = null;
  pendingBatchSale = null;
  ui.shopSell.query = ev.target.value;
  ui.shopSell.page = 1;
  render();
  $("#shop-search")?.focus();
  $("#shop-search")?.setSelectionRange(position, position);
});
document.addEventListener("change", (ev) => {
  const fields = {
    "shop-rarity": "rarity",
    "shop-sort": "sort",
    "shop-role": "role",
    "shop-upgradable": "upgradable",
    "shop-hide-protected": "hideProtected",
    "shop-sale-mode": "mode",
    "shop-sell-page": "page",
    "shop-sell-page-bottom": "page",
  };
  const key = fields[ev.target.id];
  if (!key) return;
  ui.shopBatchReview = null;
  pendingBatchSale = null;
  if (key === "page") {
    const value = Number(ev.target.value);
    if (!Number.isSafeInteger(value) || value < 1) return;
    ui.shopSell.page = value;
  } else {
    ui.shopSell[key] = ["upgradable", "hideProtected"].includes(key)
      ? ev.target.checked
      : ev.target.value;
    ui.shopSell.page = 1;
  }
  render();
});
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
  if (
    ![
      "catalog-page-input",
      "catalog-page-select",
      "catalog-top-page-input",
      "catalog-top-page-select",
    ].includes(ev.target.id)
  )
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
  if (
    ["collection-upgradable", "collection-hide-protected", "collection-tradeable"].includes(
      ev.target.id,
    )
  ) {
    ui.collectionFilters[
      {
        "collection-upgradable": "upgradable",
        "collection-hide-protected": "hideProtected",
        "collection-tradeable": "tradeable",
      }[ev.target.id]
    ] = ev.target.checked;
    ui.collectionPage = 1;
    render();
    return;
  }
  if (
    ["catalog-sort", "collection-sort"].includes(ev.target.id) &&
    !ev.target.closest(".collection-arrange-panel")
  ) {
    if (ev.target.id === "catalog-sort") {
      ui.catalogSort = ev.target.value;
      catalogPageNumber = 1;
    } else {
      ui.collectionSort = ev.target.value;
      ui.collectionPage = 1;
    }
    try {
      if (page() === "catalog") await loadDynamic();
      render();
    } catch (err) {
      toast(err.message, true);
    }
  }
  const profileFilter = /^profile-(collection|favorites)-(sort|rarity|role|wishlist|tradeable)$/.exec(ev.target.id);
  if (profileFilter) {
    const [,view,field] = profileFilter;
    profileInventoryFilters(view)[field] =
      ev.target.type === "checkbox" ? ev.target.checked : ev.target.value;
    ui.profileCardsPage = 1;
    try {
      await loadDynamic();
      render();
    } catch (err) {
      toast(err.message, true);
    }
    return;
  }
  if (
    ["collection-arrange-rarity", "collection-arrange-role"].includes(
      ev.target.id,
    )
  ) {
    collectionEditor.setFilter(
      ev.target.id.endsWith("rarity") ? "rarity" : "role",
      ev.target.value,
    );
    render();
    return;
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

document.addEventListener("input", async (ev) => {
  if (ev.target.id !== "fusion-search") return;
  const query = ev.target.value;
  alchemyUI.filter("query", query);
  try {
    if (
      alchemyUI.pickerMode() === "target" &&
      !(await alchemyUI.loadTargets(api))
    )
      return;
  } catch (err) {
    toast(err.message, true);
    return;
  }
  if (
    !ev.target.isConnected ||
    $("#fusion-search") !== ev.target ||
    ev.target.value !== query ||
    !alchemyUI.pickerOpen()
  )
    return;
  renderFusionPicker(false, true);
});
document.addEventListener("change", async (ev) => {
  if (
    ![
      "fusion-kind",
      "fusion-rarity",
      "fusion-strict",
      "fusion-sort",
      "alchemy-wishlist",
      "alchemy-favorites",
      "alchemy-hide-protected",
      "alchemy-hide-tradeables",
    ].includes(ev.target.id)
  )
    return;
  alchemyUI.filter(
    ev.target.id === "fusion-strict" ? "strict" : ev.target.id === "fusion-sort" ? "sort" : ev.target.id === "alchemy-hide-tradeables"
      ? "hideTradeables"
      : ev.target.id === "alchemy-hide-protected"
      ? "hideProtected"
      : ev.target.id === "alchemy-favorites"
        ? "favorites"
      : ev.target.id === "alchemy-wishlist"
        ? "wishlist"
        : ev.target.id === "fusion-kind"
          ? "kind"
          : "grade",
    ["fusion-strict", "alchemy-wishlist", "alchemy-favorites", "alchemy-hide-protected", "alchemy-hide-tradeables"].includes(ev.target.id)
      ? ev.target.checked
      : ev.target.value,
  );
  try {
    if (
      alchemyUI.pickerMode() === "target" &&
      !(await alchemyUI.loadTargets(api))
    )
      return;
  } catch (err) {
    toast(err.message, true);
    return;
  }
  if (!alchemyUI.pickerOpen()) return;
  renderFusionPicker(false, true);
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

document.addEventListener("click", async (ev) => {
  const button =
    ev.target.closest("button, [data-quiz-answer-option]") ||
    (ev.target.hasAttribute?.("data-quiz-songs-close") ? ev.target : null);
  if (!button || page() !== "quiz") return;
  try {
    await quizUI?.click(button);
  } catch (err) {
    toast(err.message, true);
  }
});
document.addEventListener("input", (ev) => {
  if (ev.target.id === "quiz-volume") quizUI.setVolume(ev.target.value);
  if (ev.target.id === "quiz-search") {
    const position = ev.target.selectionStart;
    quizUI.setSearch(ev.target.value);
    const input = $("#quiz-search");
    if (input && input !== ev.target) {
      input.focus();
      input.setSelectionRange(position, position);
    }
  }
  if (ev.target.id === "quiz-answer")
    quizUI.input(ev.target).catch((err) => toast(err.message, true));
});
document.addEventListener("change", (ev) => {
  if (["rank-friends-only","market-friends-only","trade-friends-only"].includes(ev.target.id)) {
    const prefix=ev.target.id.split("-")[0];
    ui[prefix+"FriendsOnly"]=ev.target.checked;
    ui[prefix==="rank"?"rankPage":prefix==="market"?"marketPage":"tradePage"]=1;
    loadDynamic().then(render).catch(err=>toast(err.message,true));
  }
  if (ev.target.id === "collector-friends-only") {
    const box=ev.target;
    handleFeatureClick("card-collectors",{dataset:{id:box.dataset.card,view:box.dataset.view,page:"1",friends:box.checked?"1":"0"}}).catch(err=>toast(err.message,true));
  }
  if (ev.target.id === "quiz-friends-only")quizUI.setFriendsOnly(ev.target.checked).catch(err=>toast(err.message,true));
  if (ev.target.matches('[data-answer-autolock]'))quizUI.setAutolock(ev.target.checked);
  if (ev.target.matches('[data-fuzzy-anime]'))quizUI.setFuzzyAnime(ev.target.checked);
  if (ev.target.id === "settings-title-motion") titleMotion.set(ev.target.value);
  if (ev.target.id === "settings-title-mode") setAnimeTitleMode(ev.target.value);
  if (ev.target.id === "quiz-favorites-first") {
    quizUI.setFavoritesFirst(ev.target.checked);
    $("#quiz-favorites-first")?.focus();
  }
  if (ev.target.id === "quiz-hide-perfect") {
    quizUI.setHidePerfect(ev.target.checked);
    $("#quiz-hide-perfect")?.focus();
  }
  const wishlistOwnership = ev.target.name === "wishlist-ownership";
  if (wishlistOwnership || ["profile-wishlist-sort","profile-wishlist-rarity","profile-wishlist-role"].includes(ev.target.id)) {
    if (wishlistOwnership) {
      ui.profileWishlist.ownership = ev.target.checked ? ev.target.value : "";
      for (const input of ev.target.closest('.wishlist-ownership-options').querySelectorAll('input')) {
        if (input !== ev.target) input.checked = false;
      }
    } else {
      ui.profileWishlist[ev.target.id.replace("profile-wishlist-", "")] = ev.target.value;
    }
    ui.profileCardsPage = 1;
    loadDynamic().then(render).catch((err) => toast(err.message, true));
  }
  if (["trade-rarity", "trade-role", "trade-sort"].includes(ev.target.id)) {
    if (ev.target.id === "trade-rarity") ui.tradeRarity = ev.target.value;
    else if (ev.target.id === "trade-role") ui.tradeRole = ev.target.value;
    else ui.tradeSort = ev.target.value;
    ui.tradePage = 1;
    loadDynamic()
      .then(render)
      .catch((err) => toast(err.message, true));
  }
  if (ev.target.id === "trade-wishlist-only") {
    ui.tradeWishlistOnly = ev.target.checked;
    ui.tradePage = 1;
    loadDynamic()
      .then(render)
      .catch((err) => toast(err.message, true));
  }
  if (ev.target.id === "trade-hide-completed") {
    ui.tradeHideCompleted = ev.target.checked;
    try {
      localStorage.setItem(
        "amqtours-trade-hide-completed",
        ui.tradeHideCompleted ? "1" : "0",
      );
    } catch {}
    ui.tradePage = 1;
    loadDynamic()
      .then(render)
      .catch((err) => toast(err.message, true));
  }
  if (ev.target.id === "quiz-server") quizUI.setServer(ev.target.value);
  if (ev.target.id === "quiz-competitive")
    quizUI.setCompetitive(ev.target.checked);
  if (ev.target.id === "quiz-sort") {
    quizUI.setSort(ev.target.value);
    $("#quiz-sort")?.focus();
  }
});
document.addEventListener("focusin", (ev) => {
  if (ev.target.id === "quiz-answer") quizUI.focus(ev.target);
});
document.addEventListener("focusout", (ev) => {
  if (
    ev.target.id === "quiz-answer" &&
    !ev.relatedTarget?.closest?.(".quiz-answer-field")
  )
    quizUI.closeSuggestions();
});
document.addEventListener("pointerdown", (ev) => {
  if (ev.target.closest("[data-quiz-answer-option]")) ev.preventDefault();
  else if (page() === "quiz" && !ev.target.closest(".quiz-answer-field")) quizUI?.closeSuggestions();
});
document.addEventListener("keydown", (ev) => {
  if (ev.target?.classList?.contains("hotkey-capture")) {
    if (ev.key === "Tab") return;
    ev.preventDefault();
    ev.stopPropagation();
    const actionId = ev.target.dataset.hotkeyAction;
    if (!actionId || !Object.hasOwn(settingsHotkeyDraft, actionId)) return;
    if (ev.key === "Backspace" || ev.key === "Delete") {
      settingsHotkeyDraft[actionId] = "";
      ev.target.value = "";
      return;
    }
    if (ev.key === "Escape") {
      ev.target.blur();
      return;
    }
    const combo = formatHotkeyEvent(ev);
    if (!combo) return;
    settingsHotkeyDraft[actionId] = combo;
    ev.target.value = combo;
    return;
  }
  if (page() === "quiz" && !$("#modal")?.open) quizUI?.key(ev);
});
document.addEventListener("submit", (ev) => {
  if (ev.target.id !== "quiz-answer-form") return;
  ev.preventDefault();
  quizUI.submit(ev.target).catch((err) => toast(err.message, true));
});

document.addEventListener("change", async (ev) => {
  if (ev.target.matches("#profile-form select[name=avatar]")) {
    const id = ev.target.value;
    avatarEditor.mount(
      ev.target.form,
      id,
      id === state.me.avatar_card ? state.me.avatar_crop : null,
    );
  }
  if (["market-sort", "market-wishlist-only", "market-rarity"].includes(ev.target.id)) {
    if (ev.target.id === "market-rarity") ui.marketRarity = ev.target.value;
    else if (ev.target.id === "market-sort") ui.marketSort = ev.target.value;
    else ui.marketWishlistOnly = ev.target.checked;
    ui.marketPage = 1;
    try {
      await loadDynamic();
      render();
    } catch (error) {
      toast(error.message);
    }
  }
});
