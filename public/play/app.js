import { mountQuizHotkeys } from "../quiz-hotkey-settings.js";
import {readAniListExport} from "../play-anilist-export.js";
import {watchedListStatuses} from "../play-list-statuses.js";
import { installPlayAccountMenu } from "../play-account-menu.js?v=shared-heartbeat";
import { cardSizeControl, installCardSize } from "../card-preferences.js";
import {playPools} from '../play-pool.js';
import {DUEL_FORMAT, ONE_TEAM_FORMAT, queueMode as modeForQueue} from '../play-mode-rules.js';
import {ARENA_FORMAT} from '../play-arena-config.js';
import { PLAY_MODES, playPage, playRoute, playHref, playQuizHref } from "../play-navigation.js?v=host-page";
import { loadOnce, loadStylesheet } from "../route-resources.js";
import { loadQuizTitleDisplay, quizAnimeTitle } from "../quiz-title-display.js";
import { readApiResponse } from "../api-response.js";
import { authFormHTML } from "../auth-form.js";
import { cardFrameClass, cardAura } from "../card-frames.js";
import { rarityClass } from "../card-display.js";
import { levelLabel } from "../card-values.js";
import { avatarCropStyle } from "../avatar-crop.js";
import { roleBadge } from "../role-label.js";
import {preparationLabel,percentDone} from "../play-setup-progress.js";
import { installTitleMotion } from "../title-motion.js";
import { installDetailPopovers } from "../detail-popover.js?v=quiz-mode-toggles";

installTitleMotion();
installDetailPopovers(document);
const $ = (selector) => document.querySelector(selector);
const mobileTabs = new Set(["overview", "ngmc-ranked", "quiz"]);
const mobileMenu = $("#play-mobile-menu");
const moreButton = $("#play-mobile-more");
moreButton.addEventListener("click", () => {
  mobileMenu.showModal();
  moreButton.setAttribute("aria-expanded", "true");
});
mobileMenu.addEventListener("close", () => moreButton.setAttribute("aria-expanded", "false"));
mobileMenu.addEventListener("click", (event) => {
  if (event.target !== mobileMenu) return;
  const { top, right, bottom, left } = mobileMenu.getBoundingClientRect();
  if (event.clientY < top || event.clientY > bottom || event.clientX < left || event.clientX > right) mobileMenu.close();
});
matchMedia("(max-width:800px)").addEventListener("change", (event) => {
  if (!event.matches) mobileMenu.close();
});
const escape = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
const number = (n) => Number(n || 0).toLocaleString("en-US");
const assets = new URL("../", import.meta.url);
const apiBase = new URL("api/", assets);
const storage = { getItem: (key) => localStorage.getItem(key), setItem: (key, value) => localStorage.setItem(key, value) };
const currentCardSize = installCardSize(document, storage);
let state = { me: null, avatar: null }, mode = playRoute(location.pathname) || playRoute("/play");
let rankingFormat = "ngmc-ranked", rankingPage = 0, rankingPool = 'random';
try{if(localStorage.getItem('amqtours-play-ranking-pool')==='watched')rankingPool='watched';}catch{}
let rankingSort='rank',rankingDirection='asc',rankingFriendsOnly=false;
let linkedQuiz = null;
let closeConsole;
let viewVersion = 0, quiz, songArtist, accountError = "", titleMode = "romaji", toastTimer;
try { if (storage.getItem("amqtours-title-mode") === "english") titleMode = "english"; } catch {}

const icon = (path) => '<svg class="play-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="' + path + '"/></svg>';
const gachaHref = (path = "") => new URL(path, assets).pathname;
const playerProfileHref = id => gachaHref("player/" + encodeURIComponent(id));
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
  for(const link of document.querySelectorAll('[data-host-page]'))link.hidden=!state.me?.is_admin;
}
function account() {
  if (!state.me) { if (accountError) toast(accountError); auth(); return; }
  accountMenu.toggle();
}
const loadPlayHistory = loadOnce(async () => {
  const [history] = await Promise.all([
    import("../play-history.js?v=team-song-result"), loadStylesheet(new URL("play-history.css?v=team-song-result", assets)),
  ]);
  return history;
});
function profile() {
  const me = state.me;
  const hostBadge = me.role === "Host" ? '<div class="profile-title-stack">' + roleBadge(me.role) + '</div>' : "";
  modal('<section class="play-account-summary"><h2>' + escape(me.name) + '</h2>' + hostBadge +
    '<p>AMQ Tours ID · ' + escape(me.id) + '</p><div class="stat-grid"><div class="stat"><span>Available</span><strong>' + number(me.balance) + '</strong></div><div class="stat"><span>Lifetime Earned</span><strong>' + number(me.earned) + '</strong></div></div></section><div class="play-account-actions"><a class="button" href="' + gachaHref('player/' + encodeURIComponent(me.id)) + '">Your Profile ↗</a>'+(me.is_admin?'<button class="button secondary" data-action="play-console">Play Host Console</button>':'')+'<a class="button secondary" href="/tour/profile">Tour Platform ↗</a></div>');
}
function listSourceFields(provider, list) {
  if (provider==='anilist-export') {
    const saved=list?.source==='export';
    return '<label>AniList JSON File<input type="file" name="exportFile" accept=".json,application/json" '+(saved?'':'required')+'></label>'+
      (saved?'<small>Choose a new export to replace your list, or change the statuses below.</small>':'');
  }
  return '<label>Username or public list URL<input name="username" required maxlength="180" autocomplete="off" placeholder="Username or profile URL" value="'+escape(list?.provider===provider?list.name:'')+'"></label>';
}
function listForm(){
  const list=state.animeList;
  const provider=list?.source==='export'?'anilist-export':list?.provider??'myanimelist';
  return '<form id="play-anime-list" class="stack"><h3>Watched Anime List</h3><p class="form-hint">Choose which entries to include in Watched games.</p>'+
    '<label>List Source<select name="provider">'+Object.entries({myanimelist:'MyAnimeList',anilist:'AniList Username','anilist-export':'AniList JSON Export'}).map(([key,label])=>'<option value="'+key+'" '+(provider===key?'selected':'')+'>'+label+'</option>').join('')+'</select></label>'+
    '<div data-list-fields>'+listSourceFields(provider,list)+'</div>'+
    '<fieldset class="play-list-statuses"><legend>Include in Watched</legend>'+Object.entries(watchedListStatuses).map(([key,label])=>
      '<label><input type="checkbox" name="statuses" value="'+key+'" '+(!list?.statuses||list.statuses.includes(key)?'checked':'')+'>'+label+'</label>').join('')+'</fieldset>'+
    (list?'<small>'+number(list.count)+' anime · Updated '+escape(new Date(list.updated).toLocaleDateString())+'</small>':'')+
    '<p role="status" aria-live="polite"></p><div><button type="submit" class="button mint">'+(list?'Update List':'Import List')+'</button> '+(list?'<button type="button" class="button secondary" data-list-remove>Unlink</button>':'')+'</div></form>';
}
async function saveAnimeList(form,remove=false){
  const status=form.querySelector('[role=status]'),player=state.me?.id;
  if(!player||form.dataset.busy)return;
  const data=new FormData(form);
  const body=remove?{remove:true}:{provider:data.get('provider')};
  if(!remove){
    body.statuses=data.getAll('statuses');
    if(!body.statuses.length){status.textContent='Select at least one list status.';return;}
  }
  form.dataset.busy="1";
  for(const control of form.elements)control.disabled=true;
  status.textContent=remove?'Unlinking…':'Importing anime…';
  try{
    if (!remove && body.provider==='anilist-export') {
      const file=form.elements.exportFile.files[0];
      if (file) {
        if (file.size>64*1024*1024) throw Error('Choose an AniList export smaller than 64 MB.');
        body.file=readAniListExport(await file.text());
      }
    } else if (!remove) body.username=data.get('username');
    const result=await api('play-anime-list',body,undefined,{signal:AbortSignal.timeout(100000)});
    if(state.me?.id!==player)return;
    state.animeList=result.animeList;
    if(form.isConnected && $("#modal").open)settings();
    toast(remove?'List unlinked.':number(result.animeList.count)+' watched anime imported.');
  }catch(error){status.textContent=error.message;}
  finally{delete form.dataset.busy;for(const c of form.elements)c.disabled=false;}
}
function settings() {
  modal('<h2>Settings</h2>'+cardSizeControl(currentCardSize())+'<label>Anime Titles<select id="play-settings-title-mode"><option value="romaji" ' + (titleMode === "romaji" ? 'selected' : '') + '>Romaji</option><option value="english" ' + (titleMode === "english" ? 'selected' : '') + '>English</option></select></label><p class="form-hint">Your title preference is shared with Gacha.</p>'+(state.me ? '<details class="settings-section"><summary>Quiz Hotkeys</summary><form id="play-quiz-hotkeys" class="stack"></form></details>' : '')+listForm()+'<a class="button secondary space-top" href="' + gachaHref('profile') + '">Gacha Profile ↗</a>', "settings-modal");
  const form = $("#play-quiz-hotkeys"), player = state.me?.id;
  if (form) mountQuizHotkeys(form, state.me.quiz_hotkeys, async (quizHotkeys) => {
    await api("profile", {quizHotkeys});
    if (state.me?.id !== player) return;
    state.me.quiz_hotkeys = quizHotkeys;
    if (mode === "quiz") renderQuiz();
  });
}
async function refreshAccount(expectedPlayer) {
  try {
    const updated = await api("play-state");
    if (expectedPlayer && (state.me?.id !== expectedPlayer || updated.me?.id !== expectedPlayer)) return;
    state = updated;
    accountError = "";
  }
  catch (error) { accountError = error.message; }
  header();
}
const multiplayerRoot = document.createElement('div');
const queueLabels = {'hot-potato':'Hot Potato · Team VS','hot-potato-team':'Hot Potato · 1-Team','lobby-hot-potato':'Hot Potato · Team VS','lobby-hot-potato-team':'Hot Potato · 1-Team',[DUEL_FORMAT]:'1v1 Ranked','2v2-arena':'2v2 Arena','ngmc-ranked':'NGMC 4v4 Ranked','ngmc-3v3':'NGMC 3v3 Unranked','1v1':'Song/Artist 1v1','3v3':'Song/Artist 3v3','1-team':'Song/Artist 1-Team',[ONE_TEAM_FORMAT]:'1-Team'};
const queueKey = () => 'amqtours-play-queue-' + state.me?.id;
let currentQueue, overview, currentActivity,watchView,watchOpener,watchRequest,queueTimer;
function stopWatching(){
  watchRequest=null;
  if(!watchView)return;
  watchView.close();watchView=null;
  $('#play-watch').hidden=true;
  $('#main').hidden=false;
  $('.play-live').hidden=mode==='overview'||mode==='host';
  if(watchOpener?.isConnected)watchOpener.focus({preventScroll:true});
  watchOpener=null;
  void refreshLive(true);
}
const playTab=crypto.randomUUID();
let inactiveSince=document.hidden||!document.hasFocus()?Date.now():null;
let reportedQuiz=false;
const watchingPath=id=>'play-watch?match='+encodeURIComponent(id);
async function watchMatch(id,title){
  if(!state.me){account();return;}
  if(songArtist?.inMatch()||(mode==='quiz'&&quiz?.active())){toast('Finish your current game before spectating.');return;}
  const viewer=state.me.id,version=viewVersion,request=watchRequest={},opener=document.activeElement;
  const [{watchPlayMatch}]=await Promise.all([import('../play-spectator-ui.js?v=stable-round-layout'),loadMultiplayerStyles()]);
  if(watchRequest!==request||version!==viewVersion||state.me?.id!==viewer||songArtist?.inMatch())return;
  stopWatching();
  const root=$('#play-watch');
  $('#main').hidden=true;
  $('.play-live').hidden=true;
  root.hidden=false;
  watchOpener=opener;
  watchView=watchPlayMatch({root,api,apiBase,title,id,viewer,esc:escape,
    animeTitle:song=>quizAnimeTitle(song,titleMode),onLeave:stopWatching,
    onJoinLobby:()=>void openMode('one-team'),
    onActivity:()=>void refreshLive(true),
  });
  root.focus({preventScroll:true});
  void loadQuizTitleDisplay().then(()=>watchView?.refresh()).catch(()=>{});
}
function savedQueue(){
  try{
    const key=queueKey(),format=sessionStorage.getItem(key);
    return Object.hasOwn(queueLabels,format)?{format,fromOverview:sessionStorage.getItem(key+'-overview')==='1'}:null;
  }catch{return null;}
}
function showQueue(status){
  const box=$('#play-current-queue'),format=status?.format;
  if(state.me&&(currentQueue?.format!==format||currentQueue?.fromOverview!==status?.fromOverview)){
    try{
      const key=queueKey();
      if(format)sessionStorage.setItem(key,format);
      else sessionStorage.removeItem(key);
      if(status?.fromOverview)sessionStorage.setItem(key+'-overview','1');
      else sessionStorage.removeItem(key+'-overview');
    }catch{}
  }
  const wasQueued=!!currentQueue;
  currentQueue=status;
  overview?.updateQueue(status);
  box.hidden=!format;
  clearInterval(queueTimer);
  if(!format){
    if(wasQueued&&!multiplayerRoot.isConnected)queueMicrotask(()=>{
      if(!songArtist?.waiting()&&!multiplayerRoot.isConnected&&(mode==='quiz'||mode==='rankings'||mode==='host'))songArtist?.leave();
    });
    return;
  }
  $('#play-queue-mode').textContent=queueLabels[format]+(format===ONE_TEAM_FORMAT?(status.pool==='watched'?' Watched':' Random'):status.pool==='watched'?' · Watched':'');
  const text=!status.connected?'Reconnecting…':status.type==='preparing'?preparationLabel(status.progress):status.type==='matched'?'Match found':status.type==='queued'?
    'In queue · '+status.waiting+(format===ARENA_FORMAT?' players':' / '+status.needed+' · '+percentDone(status.waiting,status.needed)):'Joining queue…';
  const label=$('#play-queue-status');
  const update=()=>{
    const seconds=Math.ceil((status.startsAt-Date.now())/1000);
    const displayed=status.connected&&status.startsAt?text+' · '+(seconds>0?'Starts in '+seconds+'s':'Starting…'):text;
    if(label.textContent!==displayed)label.textContent=displayed;
    if(seconds<=0)clearInterval(queueTimer);
  };
  update();
  if(status.connected&&status.startsAt>Date.now())queueTimer=setInterval(update,250);
  box.querySelector('[data-action="leave-queue"]').disabled=!status.connected||['preparing','matched'].includes(status.type);
}
const loadOverview=loadOnce(async()=>{
  const [module]=await Promise.all([import('../play-overview.js?v=rematch-transfer'),loadStylesheet(new URL('../play-overview.css?v=rematch-transfer',import.meta.url))]);
  return module.mountPlayOverview;
});
const loadQuizModule = loadOnce(() => import("../quiz-ui.js?v=sudden-death"));
const loadMultiplayerStyles = loadOnce(() => loadStylesheet(new URL("../play-song.css?v=stable-round", import.meta.url)));
const loadMultiplayer = loadOnce(async () => {
  const [{ createSongArtistUI }] = await Promise.all([
    import("../play-song-ui.js?v=stable-round"), loadMultiplayerStyles(),
  ]);
  return songArtist = createSongArtistUI({
    root: multiplayerRoot, apiBase, getPlayer: () => state.me, escape,
    animeTitle: song => quizAnimeTitle(song, titleMode), prepareTitles: loadQuizTitleDisplay,
    onError: fail, onQueueChange: showQueue, onQueueCounts: counts=>overview?.updateCounts(counts), onCreditReward: refreshAccount,
    onMatchMode(id,matchId) {
      stopWatching();
      const navigating=mode!==id||!multiplayerRoot.isConnected;
      // Bind the queue origin to this match so reconnects and reloads retain it.
      const saved=history.state?.overviewMatch;
      const returnToOverview=matchId&&(
        currentQueue?.match===matchId&&currentQueue.fromOverview||
        saved?.id===matchId&&saved.player===state.me?.id
      );
      if(navigating||returnToOverview){
        history.replaceState(returnToOverview?{overviewMatch:{id:matchId,player:state.me?.id}}:null,"",playHref(id));
      }
      if (navigating) {
        viewVersion++;
        if(mode==='quiz')quiz?.leave();
        overview?.close();overview=null;
        $('#modal').close();
        $('#main').replaceChildren(multiplayerRoot);
        mode = id;
        if(reportedQuiz)void refreshLive(true);
        nav();
      }
    },
    onMatchExit(id){
      const saved=history.state?.overviewMatch;
      if(!id||saved?.id!==id||saved.player!==state.me?.id)return;
      history.replaceState(null,"",playHref('overview'));
      void openMode('overview',false);
      return true;
    },
  });
});
function resetQuiz() {
  quiz?.leave();
  quiz = null;
  linkedQuiz = null;
}
function createQuizController(createQuizUI) {
  return createQuizUI({ gachaLayout: true, api, escape, getState: () => state, onRender: renderQuiz,
    onWallet: me => { if (state.me?.id === me.id) { state.me = me; header(); } },
    storage, prepareTitles: loadQuizTitleDisplay, animeTitle: song => quizAnimeTitle(song, titleMode),
  });
}
function nav() {
  document.title = playPage(mode).name + " · AMQ Tours Play";
  document.body.classList.toggle("play-viewport", !["quiz","rankings","host"].includes(mode));
  $('.play-live').hidden=mode==='overview'||mode==='host';
  const link = (item, compact = false) => '<a ' +
    (item.disabled ? 'role="link" aria-disabled="true" tabindex="-1" title="Coming Soon"' : 'href="' + playHref(item.id) + '" data-play-mode="' + item.id + '"') +
    (mode === item.id ? ' aria-current="page"' : '') + ' aria-label="' + item.name + '">' + icon(item.icon) +
    '<span>' + (compact ? item.short : item.name) + '</span>' +
    (item.disabled ? '<i class="play-soon-dot" aria-hidden="true"></i>' : '') + '</a>';
  $("#play-nav").innerHTML = PLAY_MODES.map(item => link(item)).join("");
  $("#play-mobile-primary").innerHTML = PLAY_MODES.filter(item => mobileTabs.has(item.id)).map(item => link(item, true)).join("");
  $("#play-mobile-links").innerHTML = PLAY_MODES.filter(item => !item.disabled && !mobileTabs.has(item.id)).map(item => link(item)).join("");
  for(const item of document.querySelectorAll('[data-host-page]')){
    if(mode==='host')item.setAttribute('aria-current','page');else item.removeAttribute('aria-current');
  }
  moreButton.toggleAttribute("data-current", !mobileTabs.has(mode));
  if (mobileMenu.open) mobileMenu.close();
}
function renderQuiz({ questionOnly = false } = {}) {
  if (mode !== "quiz" || !quiz) return;
  if(quiz.active()!==reportedQuiz)void refreshLive(true);
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
  if(version===viewVersion&&!multiplayer.waiting())multiplayer.enter(modeForQueue(saved.format),saved);
}
async function openMode(id, push = true) {
  const requested = playPage(id);
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
  closeConsole?.(); closeConsole=null;
  stopWatching();
  overview?.close();overview=null;
  if (mode === "quiz" && id !== "quiz") quiz?.leave();
  if (!songArtist?.waiting()) songArtist?.leave();
  mode = id;
  if(reportedQuiz&&mode!=='quiz')void refreshLive(true);
  if (push && location.pathname !== playHref(id)) history.pushState(null, "", playHref(id));
  nav();
  if(id!=='rankings'||!$('#ranking-results'))
    $("#main").innerHTML = '<p class="loading">' + (id === "host" ? "Loading Host Console…" : id === "quiz" ? "Loading Quizzes…" : id==="rankings"?"Loading Rankings…":id==='overview'?'Loading Overview…':"Loading Matchmaking…") + '</p>';
  try {
    if(['overview','rankings','quiz','host'].includes(id))resumeBackgroundQueue(version).catch(fail);
    if(id==='host'){
      await accountReady;
      if(version!==viewVersion)return;
      if(!state.me?.is_admin){
        $('#main').innerHTML='<section class="play-quiz-error"><h1>Play Host Console</h1><p>Host access is required.</p>'+
          (state.me?'':'<button class="button mint" data-action="account">Sign In</button>')+'</section>';
        return;
      }
      const {mountPlayConsole}=await import('../play-console.js?v=quiz-first');
      if(version===viewVersion)closeConsole=mountPlayConsole($('#main'),api,escape,format=>labels[format]||format);
    } else if(id==='overview'){
      const [mount]=await Promise.all([loadOverview(),accountReady]);
      if(version!==viewVersion)return;
      const join=(format,pool)=>{
        if(!state.me){account();return;}
        void loadMultiplayer().then(multiplayer=>{
          if(mode==='overview')multiplayer.quickJoin(format,pool);
        }).catch(fail);
      };
      overview=mount($('#main'),{esc:escape,join,leave:()=>songArtist?.cancelQueue(),viewer:state.me,
        profileHref:playerProfileHref,
        viewQueue:()=>currentQueue&&openMode(modeForQueue(currentQueue.format)),
        watch:(id,title)=>watchMatch(id,title).catch(fail),
        loadScore:(id,signal)=>api(watchingPath(id),undefined,undefined,{signal:AbortSignal.any([signal,AbortSignal.timeout(8000)])}),
      });
      overview.updateQueue(currentQueue);
      if(currentActivity)overview.update(currentActivity,state.me);
      if(state.me)void loadMultiplayer().catch(()=>{});
      void refreshLive();
    } else if (id === "rankings") {
      const path = rankingFormat==="quiz"?"quiz-play-rankings?page="+rankingPage:"play-rankings?format="+rankingFormat+"&page="+rankingPage+"&pool="+rankingPool;
      const [{rankingPanel,rankingResultsHTML}]=await Promise.all([import("../play-rankings.js?v=pinned-ranking"),accountReady]);
      if(version!==viewVersion)return;
      const friendsOnly=Boolean(state.me && rankingFriendsOnly);
      const panel=rankingPanel($("#main"),rankingFormat,rankingPool,friendsOnly);
      panel.innerHTML='<p class="ranking-empty" role="status">Loading Rankings…</p>';
      const data=await api(path+'&sort='+rankingSort+'&dir='+rankingDirection+(friendsOnly?'&friends=1':''));
      if(friendsOnly && data.friendsOnly!==true)throw Error('The friends filter is updating. Try again shortly.');
      if(version===viewVersion)panel.innerHTML=rankingResultsHTML(rankingFormat,rankingPage,data,escape,rankingSort,rankingDirection,playerProfileHref,friendsOnly,state.me);
    } else if (id === "quiz") {
      const [, { createQuizUI }] = await Promise.all([accountReady, loadQuizModule()]);
      if (version !== viewVersion) return;
      quiz ??= createQuizController(createQuizUI);
      const quizId = new URLSearchParams(location.search).get("quiz");
      if (quizId && quizId !== linkedQuiz) quiz.openLeaderboard(quizId);
      linkedQuiz = quizId;
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
    const title = playPage(id).name;
    const panel=id==='rankings' && $('#ranking-results');
    (panel || $("#main")).innerHTML = '<section class="play-quiz-error">' + (panel?'':'<h1>'+escape(title)+'</h1>') + '<p>' + escape(error.message) + '</p><button class="button secondary" data-action="retry-mode">Retry</button></section>';
  }
}
const accountReady = refreshAccount();
const labels={...queueLabels,'lobby-duel':'1v1 Unranked','lobby-ngmc':'NGMC Unranked',
  'lobby-team':'Song/Artist 1-Team','lobby-ffa':'Song/Artist Free-for-All','lobby-arena':'2v2 Arena'};
let activityBusy=false,activityPending=false,drawerSnapshot;
let lastHiddenPing=0, lastInboxCheck=0;
async function refreshLive(force=false){
  if(activityBusy){activityPending||=force;return;}
  const hidden=document.hidden,viewer=state.me?.id;
  if(hidden && (!viewer || (!force && Date.now()-lastHiddenPing<180_000)))return;
  activityBusy=true;
  const detailed=!hidden&&mode==='overview';
  const params=new URLSearchParams();
  if(detailed)params.set('overview','1');
  if(viewer){
    params.set('tab',playTab);
    params.set('idle',String(inactiveSince===null?0:Math.max(0,Date.now()-inactiveSince)));
    reportedQuiz=mode==='quiz'&&!!quiz?.active();
    if(reportedQuiz)params.set('quiz','1');
    if(watchView?.active())params.set('spectating','1');
    if(hidden){params.set('hidden','1');params.set('presence','1');}
  }
  const updateUnread=viewer && !hidden && (force || Date.now()-lastInboxCheck>=60_000) ? accountMenu.unreadSnapshot() : null;
  if(updateUnread)params.set('inbox','1');
  try{
    const data=await api('play-live?'+params);
    if(hidden)lastHiddenPing=Date.now();
    if(updateUnread && Number.isInteger(data.inboxUnread)){updateUnread(data.inboxUnread);lastInboxCheck=Date.now();}
    if(hidden||viewer!==state.me?.id||document.hidden)return;
    const {matches,online,waiting}=data;
    currentActivity=data;
    if(detailed)overview?.update(data,state.me);
    $('#live-count').textContent=number(matches.length);
    $('#live-counts').textContent=number(online)+' online · '+number(waiting)+' finding a match';
    const key=JSON.stringify(matches.map(({roster,...match})=>match));
    if(drawerSnapshot!==key){
      drawerSnapshot=key;
      $('#live-matches').innerHTML=matches.length?'<ul>'+matches.map(m=>'<li><div><strong>'+escape(labels[m.format]||m.format)+'</strong><span>'+
        (m.pool==='watched'?'Watched':'Random')+' · '+number(m.players)+' players · Started '+
        escape(new Date(m.started).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}))+'</span></div>'+
        (m.id?'<button type="button" class="button secondary" data-drawer-watch="'+escape(m.id)+'" data-watch-title="'+escape(labels[m.format]||m.format)+'">Watch</button>':'')+'</li>').join('')+'</ul>':'<p>No matches in progress.</p>';
    }
  }catch{
    if(hidden)return;
    drawerSnapshot=undefined;
    $('#live-count').textContent='—';$('#live-counts').textContent='Activity unavailable';
    $('#live-matches').textContent='Retrying automatically.';
    if(detailed)overview?.unavailable();
  }finally{
    activityBusy=false;
    if(activityPending||(!document.hidden&&((!detailed&&mode==='overview')||viewer!==state.me?.id))){
      const forced=activityPending;activityPending=false;void refreshLive(forced);
    }
  }
}
void accountReady.then(()=>refreshLive(true));
setInterval(refreshLive,30_000);
let focusRefresh;
function updatePlayFocus(){
  if(document.hidden||!document.hasFocus())inactiveSince??=Date.now();
  else inactiveSince=null;
  clearTimeout(focusRefresh);
  focusRefresh=setTimeout(()=>refreshLive(true),100);
}
document.addEventListener('visibilitychange',updatePlayFocus);
window.addEventListener('focus',updatePlayFocus);
window.addEventListener('blur',updatePlayFocus);
openMode(mode, false);
window.addEventListener("popstate", () => openMode(playRoute(location.pathname) || playRoute("/play"), false));
document.addEventListener("pointerdown", (event) => {
  if (mode !== "quiz" || !quiz) return;
  if (event.target.closest("[data-quiz-answer-option]")) event.preventDefault();
  else if (!event.target.closest(".quiz-answer-field")) quiz.closeSuggestions();
});
document.addEventListener("click", async (event) => {
  const link = event.target.closest("a[data-play-mode]");
  if (link && !event.defaultPrevented && event.button === 0 && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey) { event.preventDefault(); openMode(link.dataset.playMode); return; }
  const button = event.target.closest("button, [data-quiz-answer-option]"); if (!button) return;
  try {
    const action = button.dataset.action;
    if (button.closest("#account-menu")) accountMenu.close(true);
    if(button.dataset.drawerWatch){await watchMatch(button.dataset.drawerWatch,button.dataset.watchTitle);return;}
    if (action === "profile") { profile(); return; }
    if (action === "play-history" && state.me) {
      const owner = state.me.id;
      const {openPlayHistory} = await loadPlayHistory();
      if (state.me?.id === owner) openPlayHistory({modal, api, escape, titleMode});
      return;
    }
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
    else if(action==="play-console" && state.me?.is_admin){
      $('#modal').close();
      await openMode('host');
    }
    else if (action === "settings") settings();
    else if (action === "signin-form") auth();
    else if (action === "register-form") auth("register");
    else if (action === "recovery-form") auth("recover");
    else if (action === "retry-mode") await openMode(mode, false);
    else if (action === "logout") {
      if(songArtist&&!songArtist.confirmNavigation())return;
      await api("logout", {}); rankingFriendsOnly=false; rankingPage=0; songArtist?.leave({cancelQueue:true}); state = { me: null, avatar: null, titles: [] }; header(); resetQuiz(); await refreshAccount(); $("#modal").close(); currentActivity=null; await openMode(mode, false);
    } else if (mode === "quiz" && quiz && $("#main").contains(button)) {
      await quiz.click(button);
      if (linkedQuiz && mode === "quiz" &&
          (button.hasAttribute("data-quiz-back") || button.dataset.quizAction === "quiz-stop")) {
        linkedQuiz = null;
        history.replaceState(history.state, "", playQuizHref());
      }
    }
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
    await api(action, body); resetQuiz(); await refreshAccount(); $("#modal").close(); currentActivity=null; await openMode(mode, false);
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
  if (mode==='rankings' && input.id==='ranking-friends-only') {
    if (!state.me) {
      input.checked=false;
      account();
      return;
    }
    rankingFriendsOnly=input.checked;
    rankingPage=0;
    await openMode(mode,false);
    return;
  }
  if (input.form?.id==='play-anime-list' && input.name==='provider') {
    input.form.querySelector('[data-list-fields]').innerHTML=listSourceFields(input.value,state.animeList);
    input.form.querySelector('[role=status]').textContent='';
    return;
  }
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
    else if (input.id === "quiz-friends-only") await quiz.setFriendsOnly(input.checked);
    else if (input.matches('[data-answer-autolock]')) quiz.setAutolock(input.checked);
    else if (input.matches('[data-fuzzy-anime]')) quiz.setFuzzyAnime(input.checked);
    else if (input.id === "quiz-favorites-first") quiz.setFavoritesFirst(input.checked);
    else if (input.id === "quiz-hide-perfect") quiz.setHidePerfect(input.checked);
  } catch (error) { fail(error); }
});
document.addEventListener("keydown", (event) => {
  if (mode === "quiz" && !$("#modal").open && !mobileMenu.open) quiz?.key(event);
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
