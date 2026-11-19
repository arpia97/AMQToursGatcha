import { installPlayAccountMenu } from "../play-account-menu.js";
import { cardSizeControl, installCardSize } from "../card-preferences.js";
import {playPools} from '../play-pool.js';
import {DUEL_FORMAT, queueMode as modeForQueue} from '../play-mode-rules.js';
import {ARENA_FORMAT} from '../play-arena-config.js';
import { PLAY_MODES, playRoute, playHref } from "../play-navigation.js";
import { loadOnce, loadStylesheet } from "../route-resources.js";
import { loadQuizTitleDisplay, quizAnimeTitle } from "../quiz-title-display.js";
import { readApiResponse } from "../api-response.js";
import { authFormHTML } from "../auth-form.js";
import { cardFrameClass, cardAura } from "../card-frames.js";
import { rarityClass } from "../card-display.js";
import { levelLabel } from "../card-values.js";
import { avatarCropStyle } from "../avatar-crop.js";
import { roleBadge } from "../role-label.js";
import { installTitleMotion } from "../title-motion.js";
import { installDetailPopovers } from "../detail-popover.js";

installTitleMotion();
installDetailPopovers(document);
const $ = (selector) => document.querySelector(selector);
const escape = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
const number = (n) => Number(n || 0).toLocaleString("en-US");
const assets = new URL("../", import.meta.url);
const apiBase = new URL("api/", assets);
const storage = { getItem: (key) => localStorage.getItem(key), setItem: (key, value) => localStorage.setItem(key, value) };
const currentCardSize = installCardSize(document, storage);
let state = { me: null, avatar: null }, mode = playRoute(location.pathname) || playRoute("/play");
let rankingFormat = "ngmc-ranked", rankingPage = 0, rankingPool = 'random';
try{if(localStorage.getItem('amqtours-play-ranking-pool')==='watched')rankingPool='watched';}catch{}
let rankingSort='rank',rankingDirection='asc';
let viewVersion = 0, quiz, songArtist, accountError = "", titleMode = "romaji", toastTimer;
try { if (storage.getItem("amqtours-title-mode") === "english") titleMode = "english"; } catch {}

const icon = (path) => '<svg class="play-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="' + path + '"/></svg>';
const gachaHref = (path = "") => new URL(path, assets).pathname;
async function api(path, body, key, { signal, headers = {} } = {}) {
  const response = await fetch(new URL(path, apiBase), {
    method: body ? "POST" : "GET", credentials: "same-origin", signal: signal || AbortSignal.timeout(12000),
    headers: { ...headers, ...(body ? { "Content-Type": "application/json", "Idempotency-Key": key || crypto.randomUUID() } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return readApiResponse(response);
}
function toast(message) {
  $("#toast").textContent = message; $("#toast").classList.add("visible");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => $("#toast").classList.remove("visible"), 4500);
}
function fail(error) { toast(error.message || "Something went wrong. Try again."); }
function modal(html, className = "") {
  const dialog = $("#modal");
  dialog.className = className;
  $("#modal-body").innerHTML = html;
  if (!dialog.open) dialog.showModal();
}
function auth(form = "login") { modal(authFormHTML(form).replace("Join AMQ Gatcha.", "Join AMQ Tours.")); }
function avatarHTML(me = state.me, card = state.avatar) {
  if (!card) return '<span class="profile-avatar">' + escape(me.name.slice(0, 2).toUpperCase()) + '</span>';
  return '<span class="profile-avatar tier-' + rarityClass(card.rarity) + ' ' + cardFrameClass(card.level) + '">' + cardAura(card.level) +
    '<span class="avatar-crop" style="' + avatarCropStyle(me.avatar_crop) + '"><img src="' + escape(card.image) + '" alt=""></span><b>' + levelLabel(card.level) + '</b></span>';
}
const accountMenu = installPlayAccountMenu({ $, api, modal, escape, number, avatarHTML, gachaHref, state: () => state });
function header() {
  accountMenu.sync();
}
function account() {
  if (!state.me) { if (accountError) toast(accountError); auth(); return; }
  accountMenu.toggle();
}
function profile() {
  const me = state.me;
  const hostBadge = me.role === "Host" ? '<div class="profile-title-stack">' + roleBadge(me.role) + '</div>' : "";
  modal('<section class="play-account-summary"><h2>' + escape(me.name) + '</h2>' + hostBadge +
    '<p>AMQ Tours ID · ' + escape(me.id) + '</p><div class="stat-grid"><div class="stat"><span>Available</span><strong>' + number(me.balance) + '</strong></div><div class="stat"><span>Lifetime Earned</span><strong>' + number(me.earned) + '</strong></div></div></section><div class="play-account-actions"><a class="button" href="' + gachaHref('player/' + encodeURIComponent(me.id)) + '">Your Profile ↗</a>'+(me.is_admin?'<button class="button secondary" data-action="play-console">Play Host Console</button>':'')+'<a class="button secondary" href="/tour/profile">Tour Platform ↗</a></div>');
}
function listForm(){
  const list=state.animeList;
  return '<form id="play-anime-list" class="stack"><h3>Watched Anime List</h3><p class="form-hint">Watched lobbies combine everyone’s lists. Completed anime and entries with watched episodes qualify.</p>'+
    '<label>List Provider<select name="provider"><option value="myanimelist">MyAnimeList</option><option value="anilist" '+(list?.provider==='anilist'?'selected':'')+'>AniList</option></select></label>'+
    '<label>Username or public list URL<input name="username" required maxlength="180" autocomplete="off" placeholder="Username or profile URL" value="'+escape(list?.name)+'"></label>'+
    (list?'<small>'+number(list.count)+' anime · Updated '+escape(new Date(list.updated).toLocaleDateString())+'</small>':'')+
    '<p role="status" aria-live="polite"></p><div><button type="submit" class="button mint">'+(list?'Refresh List':'Import List')+'</button> '+(list?'<button type="button" class="button secondary" data-list-remove>Unlink</button>':'')+'</div></form>';
}
async function saveAnimeList(form,remove=false){
  const status=form.querySelector('[role=status]'),player=state.me?.id;
  if(!player||form.dataset.busy)return;
  const body=remove?{remove:true}:Object.fromEntries(new FormData(form));
  form.dataset.busy="1";
  for(const control of form.elements)control.disabled=true;
  status.textContent=remove?'Unlinking…':'Importing anime…';
  try{
    const result=await api('play-anime-list',body,undefined,{signal:AbortSignal.timeout(100000)});
    if(state.me?.id!==player)return;
    state.animeList=result.animeList;
    if(form.isConnected && $("#modal").open)settings();
    toast(remove?'List unlinked.':number(result.animeList.count)+' watched anime imported.');
  }catch(error){status.textContent=error.message;}
  finally{delete form.dataset.busy;for(const c of form.elements)c.disabled=false;}
}
function settings() {
  modal('<h2>Settings</h2>'+cardSizeControl(currentCardSize())+'<label>Anime Titles<select id="play-settings-title-mode"><option value="romaji" ' + (titleMode === "romaji" ? 'selected' : '') + '>Romaji</option><option value="english" ' + (titleMode === "english" ? 'selected' : '') + '>English</option></select></label><p class="form-hint">Your title preference is shared with Gacha.</p>'+listForm()+'<a class="button secondary space-top" href="' + gachaHref('profile') + '">Gacha Profile ↗</a>', "settings-modal");
}
async function refreshAccount() {
  try { state = await api("play-state"); accountError = ""; }
  catch (error) { accountError = error.message; }
  header();
}
const multiplayerRoot = document.createElement('div');
const queueLabels = {[DUEL_FORMAT]:'1v1 Ranked','2v2-arena':'2v2 Arena','ngmc-ranked':'NGMC 4v4 Ranked','ngmc-3v3':'NGMC 3v3 Unranked','1v1':'Song/Artist 1v1','3v3':'Song/Artist 3v3','1-team':'Song/Artist 1-Team'};
const queueKey = () => 'amqtours-play-queue-' + state.me?.id;
let currentQueue;
function savedQueue(){
  try{const value=sessionStorage.getItem(queueKey());return Object.hasOwn(queueLabels,value)?value:null;}catch{return null;}
}
function showQueue(status){
  const box=$('#play-current-queue'),format=status?.format;
  if(currentQueue?.format!==format&&state.me){
    try{if(format)sessionStorage.setItem(queueKey(),format);else sessionStorage.removeItem(queueKey());}catch{}
  }
  const wasQueued=!!currentQueue;
  currentQueue=status;
  box.hidden=!format;
  if(!format){
    if(wasQueued&&!multiplayerRoot.isConnected)queueMicrotask(()=>{
      if(!songArtist?.waiting()&&!multiplayerRoot.isConnected&&(mode==='quiz'||mode==='rankings'))songArtist?.leave();
    });
    return;
  }
  $('#play-queue-mode').textContent=queueLabels[format]+(status.pool==='watched'?' · Watched':'');
  const text=!status.connected?'Reconnecting…':status.type==='matched'?'Match found':status.type==='queued'?
    'In queue · '+status.waiting+(format===ARENA_FORMAT?' players':' / '+status.needed):'Joining queue…';
  if($('#play-queue-status').textContent!==text)$('#play-queue-status').textContent=text;
  box.querySelector('[data-action="leave-queue"]').disabled=!status.connected||status.type==='matched';
}
const loadQuizModule = loadOnce(() => import("../quiz-ui.js"));
const loadMultiplayerStyles = loadOnce(() => loadStylesheet(new URL("../play-song.css", import.meta.url)));
const loadMultiplayer = loadOnce(async () => {
  const [{ createSongArtistUI }] = await Promise.all([
    import("../play-song-ui.js"), loadMultiplayerStyles(),
  ]);
  return songArtist = createSongArtistUI({
    root: multiplayerRoot, apiBase, getPlayer: () => state.me, escape,
    animeTitle: song => quizAnimeTitle(song, titleMode), prepareTitles: loadQuizTitleDisplay,
    onError: fail, onQueueChange: showQueue,
    onMatchMode(id) {
      if (mode !== id || !multiplayerRoot.isConnected) {
        viewVersion++;
        if(mode==='quiz')quiz?.leave();
        $('#modal').close();
        $('#main').replaceChildren(multiplayerRoot);
        mode = id;
        history.replaceState(null, "", playHref(id));
        nav();
      }
    },
  });
});
function resetQuiz() {
  quiz?.leave();
  quiz = null;
}
function createQuizController(createQuizUI) {
  return createQuizUI({ gachaLayout: true, api, escape, getState: () => state, onRender: renderQuiz,
    onWallet: me => { if (state.me?.id === me.id) { state.me = me; header(); } },
    storage, prepareTitles: loadQuizTitleDisplay, animeTitle: song => quizAnimeTitle(song, titleMode),
  });
}
function nav() {
  document.title = PLAY_MODES.find((item) => item.id === mode).name + " · AMQ Tours Play";
  for (const mobile of [false, true]) {
    $(mobile ? "#play-mobile-nav" : "#play-nav").innerHTML = PLAY_MODES.map((item) => '<a ' + (item.disabled ? 'role="link" aria-disabled="true" tabindex="-1" title="Coming Soon"' : 'href="' + playHref(item.id) + '" data-play-mode="' + item.id + '"') + (mode === item.id ? ' aria-current="page"' : '') + ' aria-label="' + item.name + '">' + icon(item.icon) + '<span>' + (mobile ? item.short : item.name) + '</span>' + (!mobile && item.disabled ? '<i class="play-soon-dot" aria-hidden="true"></i>' : '') + '</a>').join("");
  }
}
function renderQuiz({ questionOnly = false } = {}) {
  if (mode !== "quiz" || !quiz) return;
  if (questionOnly && quiz.updateQuestion()) return;
  const active = document.activeElement;
  const focus = $("#main").contains(active) && active.id ? { id: active.id, start: active.selectionStart, end: active.selectionEnd } : null;
  $("#main").innerHTML = quiz.render(); quiz.mount();
  if (focus) {
    const input = document.getElementById(focus.id);
    if (input && !input.disabled) { input.focus({ preventScroll: true }); if (input.setSelectionRange && focus.start !== null) { try { input.setSelectionRange(focus.start, focus.end); } catch {} } }
  }
}
async function resumeBackgroundQueue(version){
  await accountReady;
  if(version!==viewVersion||!state.me||songArtist?.waiting())return;
  const saved=savedQueue();
  if(!saved)return;
  const multiplayer=await loadMultiplayer();
  if(version===viewVersion&&!multiplayer.waiting())multiplayer.enter(modeForQueue(saved),saved);
}
async function openMode(id, push = true) {
  const requested = PLAY_MODES.find(item => item.id === id);
  if (!requested) return;
  if (requested.disabled) {
    id = playRoute("/play");
    history.replaceState(null, "", playHref(id));
  }
  if(songArtist?.rankedAtRisk()){
    if(id===mode)return;
    if(!songArtist.confirmNavigation()){
      if(!push)history.pushState(null,"",playHref(mode));
      return;
    }
  }
  const version = ++viewVersion;
  if (mode === "quiz" && id !== "quiz") quiz?.leave();
  if (!songArtist?.waiting()) songArtist?.leave();
  mode = id;
  if (push && location.pathname !== playHref(id)) history.pushState(null, "", playHref(id));
  nav();
  if(id!=='rankings'||!$('#ranking-results'))
    $("#main").innerHTML = '<p class="loading">' + (id === "quiz" ? "Loading Quizzes…" : id==="rankings"?"Loading Rankings…":"Loading Matchmaking…") + '</p>';
  try {
    if(id==='rankings'||id==='quiz')resumeBackgroundQueue(version).catch(fail);
    if (id === "rankings") {
      const path = rankingFormat==="quiz"?"quiz-play-rankings?page="+rankingPage:"play-rankings?format="+rankingFormat+"&page="+rankingPage+"&pool="+rankingPool;
      const {rankingPanel,rankingResultsHTML}=await import("../play-rankings.js");
      if(version!==viewVersion)return;
      const panel=rankingPanel($("#main"),rankingFormat,rankingPool);
      panel.innerHTML='<p class="ranking-empty" role="status">Loading Rankings…</p>';
      const data=await api(path+'&sort='+rankingSort+'&dir='+rankingDirection);
      if(version===viewVersion)panel.innerHTML=rankingResultsHTML(rankingFormat,rankingPage,data,escape,rankingSort,rankingDirection);
    } else if (id === "quiz") {
      const [, { createQuizUI }] = await Promise.all([accountReady, loadQuizModule()]);
      if (version !== viewVersion) return;
      quiz ??= createQuizController(createQuizUI);
      await quiz.load();
      if (version === viewVersion) renderQuiz();
    } else {
      const [, multiplayer] = await Promise.all([accountReady, loadMultiplayer()]);
      if (version === viewVersion){
        $('#main').replaceChildren(multiplayerRoot);
        multiplayer.enter(id,state.me?savedQueue():null);
      }
    }
  } catch (error) {
    if (version !== viewVersion) return;
    const title = PLAY_MODES.find(item => item.id === id).name;
    const panel=id==='rankings' && $('#ranking-results');
    (panel || $("#main")).innerHTML = '<section class="play-quiz-error">' + (panel?'':'<h1>'+escape(title)+'</h1>') + '<p>' + escape(error.message) + '</p><button class="button secondary" data-action="retry-mode">Retry</button></section>';
  }
}
const accountReady = refreshAccount();
openMode(mode, false);
window.addEventListener("popstate", () => openMode(playRoute(location.pathname) || playRoute("/play"), false));
document.addEventListener("click", async (event) => {
  const link = event.target.closest("a[data-play-mode]");
  if (link && !event.defaultPrevented && event.button === 0 && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey) { event.preventDefault(); openMode(link.dataset.playMode); return; }
  const button = event.target.closest("button"); if (!button) return;
  try {
    const action = button.dataset.action;
    if (button.closest("#account-menu")) accountMenu.close(true);
    if (action === "profile") { profile(); return; }
    if (await accountMenu.action(action, button)) return;
    if(button.hasAttribute('data-list-remove')){await saveAnimeList(button.form,true);return;}
    if(mode==='rankings' && button.dataset.rankFormat){
      if(button.dataset.rankFormat===rankingFormat)return;
      rankingFormat=button.dataset.rankFormat;
      rankingPage=0;
      rankingSort=rankingFormat==='quiz'?'points':'rank';
      rankingDirection=rankingFormat==='quiz'?'desc':'asc';
      await openMode(mode,false); return;
    }
    if(mode==='rankings'&&playPools.includes(button.dataset.rankPool)){
      if(rankingPool===button.dataset.rankPool)return;
      rankingPool=button.dataset.rankPool;
      rankingPage=0;
      try{localStorage.setItem('amqtours-play-ranking-pool',rankingPool);}catch{}
      await openMode(mode,false);return;
    }
    if(mode==='rankings'&&button.dataset.rankSort){
      const field=button.dataset.rankSort;
      rankingDirection=field===rankingSort?(rankingDirection==='asc'?'desc':'asc'):(['rank','name','time'].includes(field)?'asc':'desc');
      rankingSort=field;rankingPage=0;await openMode(mode,false);
      if(mode==='rankings'&&rankingSort===field)document.querySelector('[data-rank-sort="'+field+'"]')?.focus({preventScroll:true});
      return;
    }
    if(action==='view-queue'&&currentQueue){await openMode(modeForQueue(currentQueue.format));return;}
    if(action==='leave-queue'){songArtist?.cancelQueue();return;}
    if(mode==="rankings" && button.hasAttribute("data-rank-page")){
      rankingPage=Number(button.dataset.rankPage);
      await openMode(mode,false);
    } else if (button.classList.contains("dialog-close")) $("#modal").close();
    else if (action === "account") account();
    else if(action==="play-console" && state.me?.is_admin)await (await import("../play-console.js")).openPlayConsole(modal,api,escape);
    else if (action === "settings") settings();
    else if (action === "signin-form") auth();
    else if (action === "register-form") auth("register");
    else if (action === "recovery-form") auth("recover");
    else if (action === "retry-mode") await openMode(mode, false);
    else if (action === "logout") {
      if(songArtist&&!songArtist.confirmNavigation())return;
      await api("logout", {}); songArtist?.leave({cancelQueue:true}); state = { me: null, avatar: null, titles: [] }; header(); resetQuiz(); await refreshAccount(); $("#modal").close(); if (["quiz","song-artist","ngmc-ranked",DUEL_FORMAT].includes(mode)) await openMode(mode, false);
    } else if (mode === "quiz" && quiz && $("#main").contains(button)) await quiz.click(button);
  } catch (error) { fail(error); }
});
document.addEventListener("submit", async (event) => {
  const form = event.target;
  if(form.id==="play-anime-list"){event.preventDefault();await saveAnimeList(form);return;}
  if (form.id === "quiz-answer-form") { event.preventDefault(); try { await quiz.submit(form); } catch (error) { fail(error); } return; }
  if (form.id !== "auth-form") return;
  event.preventDefault(); const button = form.querySelector('[type="submit"]'); button.disabled = true;
  try {
    const { mode: action, ...body } = Object.fromEntries(new FormData(form));
    await api(action, body); resetQuiz(); await refreshAccount(); $("#modal").close(); if (["quiz","song-artist","ngmc-ranked",DUEL_FORMAT].includes(mode)) await openMode(mode, false);
  } catch (error) { form.querySelector(".form-error").textContent = error.message; }
  finally { button.disabled = false; }
});
document.addEventListener("input", async (event) => {
  const input = event.target;
  if (mode !== "quiz" || !quiz) return;
  if (input.id === "quiz-search") quiz.setSearch(input.value);
  else if (input.id === "quiz-volume") quiz.setVolume(input.value);
  else if (input.id === "quiz-answer") { try { await quiz.input(input); } catch (error) { fail(error); } }
});
document.addEventListener("change", async (event) => {
  const input = event.target;
  if (input.id === "play-settings-title-mode") {
    titleMode = input.value === "english" ? "english" : "romaji";
    try { storage.setItem("amqtours-title-mode", titleMode); } catch {}
    if (mode === "quiz") renderQuiz();
    if (['song-artist','ngmc-ranked',DUEL_FORMAT].includes(mode))songArtist?.render(); return;
  }
  if (mode !== "quiz" || !quiz) return;
  try {
    if (input.id === "quiz-server") quiz.setServer(input.value);
    else if (input.id === "quiz-sort") quiz.setSort(input.value);
    else if (input.id === "quiz-competitive") quiz.setCompetitive(input.checked);
    else if (input.id === "quiz-friends-only") await quiz.setFriendsOnly(input.checked);
    else if (input.id === "quiz-favorites-first") quiz.setFavoritesFirst(input.checked);
    else if (input.id === "quiz-hide-perfect") quiz.setHidePerfect(input.checked);
  } catch (error) { fail(error); }
});
document.addEventListener("keydown", (event) => {
  if (mode === "quiz" && !$("#modal").open) quiz?.key(event);
  if(mode!=='rankings'||!event.target.matches('[data-rank-format]'))return;
  const tabs=[...event.target.parentElement.querySelectorAll('[role=tab]')];
  const index=tabs.indexOf(event.target);
  const next={ArrowLeft:(index+tabs.length-1)%tabs.length,ArrowRight:(index+1)%tabs.length,Home:0,End:tabs.length-1}[event.key];
  if(next===undefined)return;
  event.preventDefault();
  tabs[next].focus();
  tabs[next].click();
});
document.addEventListener("focusin", (event) => { if (mode === "quiz" && event.target.id === "quiz-answer") quiz?.focus(event.target); });
window.addEventListener("beforeunload",event=>{
  if(songArtist?.rankedAtRisk()){event.preventDefault();event.returnValue="";}
});
window.addEventListener("pagehide", () => { viewVersion++; quiz?.leave(); songArtist?.leave({preserveQueue:true}); });
window.addEventListener('pageshow',event=>{if(event.persisted)openMode(mode,false);});
