import {mountOverviewRooms} from './play-overview-rooms.js';
import {PLAY_MODES,playHref} from './play-navigation.js';
import {ARENA_FORMAT} from './play-arena-config.js';
import {DUEL_FORMAT,ONE_TEAM_FORMAT,ONE_TEAM_MODE} from './play-mode-rules.js';
import {playPools,poolFormat,poolName} from './play-pool.js';
import {playPlayerAvatar} from './play-avatar.js';
import {liveProgressText,liveScoreHTML} from './play-live-score.js';

const modes=new Map(PLAY_MODES.map(mode=>[mode.id,mode]));
const icon=path=>'<svg class="play-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="'+path+'"/></svg>';
const eye=icon('M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6Z M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z');
const chevron='<span aria-hidden="true" class="overview-chevron">›</span>';
const groups=[
  [DUEL_FORMAT,[[DUEL_FORMAT,'']]],
  ['ngmc-ranked',[['ngmc-ranked','4v4 Ranked'],['ngmc-3v3','3v3 Unranked']]],
  [ARENA_FORMAT,[[ARENA_FORMAT,'Round Robin']]],
  ['song-artist',[['1v1','1v1'],['3v3','3v3']]],
  [ONE_TEAM_MODE,[[ONE_TEAM_FORMAT,'Survival'],['1-team','Song/Artist']]],
];
const queueNames=new Map(groups.flatMap(([mode,formats])=>formats.map(([format,label])=>
  [format,[modes.get(mode).name,label].filter(Boolean).join(' · ')])));
queueNames.set('hot-potato','Hot Potato · Team VS');
queueNames.set('hot-potato-team','Hot Potato · 1-Team');
const matchModes={
  'hot-potato':['variety','Hot Potato · Team VS'],'hot-potato-team':['variety','Hot Potato · 1-Team'],
  'lobby-hot-potato':['variety','Hot Potato · Team VS'],'lobby-hot-potato-team':['variety','Hot Potato · 1-Team'],
  [DUEL_FORMAT]:[DUEL_FORMAT,'1v1 Ranked'],'lobby-duel':[DUEL_FORMAT,'1v1 Unranked'],
  'ngmc-ranked':['ngmc-ranked','NGMC 4v4'],'ngmc-3v3':['ngmc-ranked','NGMC 3v3'],'lobby-ngmc':['ngmc-ranked','NGMC Custom'],
  [ARENA_FORMAT]:[ARENA_FORMAT,'2v2 Arena'],'lobby-arena':[ARENA_FORMAT,'2v2 Arena'],
  '1v1':['song-artist','Song/Artist 1v1'],'3v3':['song-artist','Song/Artist 3v3'],
  [ONE_TEAM_FORMAT]:[ONE_TEAM_MODE,'1-Team'],
  '1-team':[ONE_TEAM_MODE,'Song/Artist 1-Team'],'lobby-team':[ONE_TEAM_MODE,'Song/Artist 1-Team'],
  'lobby-ffa':['song-artist','Song/Artist Free-for-All'],
};
const poolLabel=pool=>'<span class="overview-pool-label '+(pool==='watched'?'watched':'random')+'">'+poolName(pool)+'</span>';
const avatar=(player,esc)=>'<span class="overview-avatar">'+playPlayerAvatar(player,esc)+'</span>';
const defaultPool=()=>{
  try{return localStorage.getItem('amqtours-play-overview-pool')==='watched'?'watched':'random';}
  catch{return 'random';}
};

export function mountPlayOverview(root,{esc,join,leave,viewQueue,watch,watchPrivate,loadScore,loadRooms,openLobby,viewer,profileHref}) {
  let pool=defaultPool(),counts,currentQueue,players=[],signedIn=!!viewer,openMatch=null,pinned=false;
  let matchSnapshot,playerSnapshot;
  const lifetime=new AbortController();
  root.innerHTML=`<div class="overview-page">
    <header class="overview-heading"><div><h1>Overview</h1><div class="overview-stats">
      <span><b data-online>—</b> online</span><span><b data-queued>—</b> queued</span><span><b data-live>—</b> live</span>
    </div></div><button class="button mint" data-create-overview>＋ Create a lobby</button></header>
    <div class="play-directory"><div class="play-directory-main"><section id="overview-live-matches" aria-labelledby="live-matches-title">
      <header class="overview-section-head"><h2 id="live-matches-title">Live Matches <span class="overview-total">—</span></h2>
        <div class="overview-arrows" hidden><button type="button" data-slide="-1" aria-label="Previous matches">‹</button><button type="button" data-slide="1" aria-label="Next matches">›</button></div>
      </header>
      <ul class="overview-match-list" aria-label="Live match scorecards" tabindex="0"></ul>
      <p class="overview-empty overview-match-empty" role="status">Loading…</p>
    </section>
    <section class="open-lobbies" aria-labelledby="overview-open-title"><header class="overview-section-head"><h2 id="overview-open-title">Open Lobbies <span class="overview-total" data-room-count>—</span></h2></header><div class="room-board"></div><p class="overview-empty" data-room-status role="status">Loading lobbies…</p></section>
      <section id="quick-join" aria-labelledby="quick-join-title">
        <header class="overview-section-head"><h2 id="quick-join-title">Quick Join</h2>
          <div class="overview-selection" role="group" aria-label="Song pool">
            ${playPools.map(value=>'<button type="button" data-overview-pool="'+value+'">'+poolName(value)+'</button>').join('')}
          </div>
        </header>
        <div class="overview-queue-list">
          ${groups.flatMap(([mode,formats])=>formats.map(([format,label])=>
            '<article class="overview-mode"><h3>'+icon(modes.get(mode).icon)+modes.get(mode).name+(label?'<small>'+label+'</small>':'')+'</h3>'+
            '<div class="overview-queue-row"><span class="overview-count" data-overview-count="'+format+'"></span><button type="button" class="button overview-join" data-overview-join="'+format+'"></button></div></article>'
          )).join('')}
          <article class="overview-mode overview-solo">
            <h3>${icon(modes.get('quiz').icon)}Quiz</h3><span>Solo</span>
            <a href="${playHref('quiz')}" data-play-mode="quiz" class="button secondary overview-open">Browse Quizzes${chevron}</a>
          </article>
          <article class="overview-mode overview-disabled">
            <h3>${icon(modes.get('speed-showdown').icon)}Speed Showdown</h3><span>Coming Soon</span>
          </article>
        </div>
      </section>
        </div><section id="online-players" class="overview-panel" aria-labelledby="online-players-title">
          <header><h2 id="online-players-title">Online Players</h2><span class="overview-total overview-online-total">—</span></header>
          <div class="overview-search">${icon('M21 21l-4.5-4.5M18 11a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z')}<input type="search" placeholder="Find a player" aria-label="Find an online player"></div>
          <ul class="overview-player-list" aria-label="Online players" tabindex="0"></ul>
          <p class="overview-empty overview-player-empty" role="status">Loading…</p>
          <button type="button" class="text-button overview-signin" data-action="account" hidden>Sign In</button>
        </section>
    </div>
  </div>`;

  const $=selector=>root.querySelector(selector);
  const countRows=root.querySelectorAll('[data-overview-count]'), joinButtons=root.querySelectorAll('[data-overview-join]');
  const matchList=$('.overview-match-list'), playerList=$('.overview-player-list'), search=$('.overview-search input');

  function renderQueues() {
    const total=counts?Object.values(counts).reduce((sum,count)=>sum+count,0):null;
    $('[data-queued]').textContent=total??'—';
    $('[data-queued]').dataset.active=String(total>0);
    for (const button of root.querySelectorAll('[data-overview-pool]')) button.setAttribute('aria-pressed',String(button.dataset.overviewPool===pool));
    for (const row of countRows) {
      const count=counts?.[poolFormat(row.dataset.overviewCount,pool)]??(counts?0:'—');
      if(row.querySelector('b')?.textContent!==String(count))row.innerHTML='<b>'+count+'</b> in queue';
      row.dataset.active=String(Number(count)>0);
    }
    for (const button of joinButtons) {
      const format=button.dataset.overviewJoin;
      const current=currentQueue?.format===format&&currentQueue.pool===pool;
      const label=current?(['joining','preparing','matched'].includes(currentQueue.type)?'View':'Leave'):'Join';
      if(button.dataset.label!==label){
        button.dataset.label=label;
        button.innerHTML=label+chevron;
      }
      button.setAttribute('aria-label',label+' '+queueNames.get(format));
      button.dataset.current=String(current);
      button.disabled=!!currentQueue&&!current;
    }
  }

  const visible=new Set(),checked=new Map();
  const visibility=new IntersectionObserver(entries=>{
    for(const {target,isIntersecting} of entries){
      if(isIntersecting&&matchList.contains(target))visible.add(target);else visible.delete(target);
    }
    void refreshScores();
  },{root:matchList});
  let fetching=false;
  async function refreshScores(){
    if(fetching||document.hidden||lifetime.signal.aborted)return;
    const now=Date.now();
    const due=[...visible].filter(row=>row.querySelector('[data-watch-match]:enabled')&&
      now-(checked.get(row)||0)>(row===openMatch?4000:20000));
    const row=due.sort((a,b)=>(checked.get(a)||0)-(checked.get(b)||0))[0];
    if(!row)return;
    fetching=true;
    checked.set(row,now);
    try{
      const score=await loadScore(row.dataset.matchId,lifetime.signal);
      if(!matchList.contains(row)||lifetime.signal.aborted)return;
      const order=new Map((score.playerOrder||[]).map((id,i)=>[String(id),i]));
      for(const roster of row.querySelectorAll('.overview-side ul')){
        const sorted=[...roster.children].sort((a,b)=>(order.get(a.dataset.playerId)??Infinity)-(order.get(b.dataset.playerId)??Infinity));
        roster.append(...sorted);
      }
      const group=score.scores[0]||[];
      const leading=group.length>2?[...group].sort((a,b)=>b.value-a.value).slice(0,1):group;
      row.querySelector('.overview-card-score').textContent=leading.map(side=>side.value).join(' : ');
      for(const [i,stack] of [...row.querySelectorAll('.overview-stack')].entries()){
        const team=leading[i]?.team;
        const avatars=row.querySelectorAll('.overview-side.team-'+(Number(team)+1)+' .overview-avatar');
        stack.replaceChildren(...[...avatars].slice(0,4).map(el=>el.cloneNode(true)));
      }
      const fixture=score.scores.length>1?' · Fixture 1':group.length>2?' · Leader':'';
      row.querySelector('.overview-song').textContent=liveProgressText(score)+fixture;
      const spectators=row.querySelector('.overview-spectators');
      const count=score.spectatorCount;
      spectators.hidden=!Number.isSafeInteger(count)||count<0;
      if(!spectators.hidden){
        const label=count+' spectator'+(count===1?'':'s');
        spectators.title=label;
        spectators.setAttribute('aria-label',label);
        spectators.lastElementChild.textContent=count;
      }
      row.querySelector('.overview-live-score').innerHTML='<div class="overview-score-heading"><strong>'+esc(liveProgressText(score))+'</strong><span>'+esc(score.unit)+'</span></div>'+liveScoreHTML(score,esc);
      if(row===openMatch)positionDetails();
    }catch(error){
      if(lifetime.signal.aborted||!row.isConnected)return;
      if(error.status===404){
        row.querySelector('[data-watch-match]').disabled=true;
        row.querySelector('.overview-song').textContent='Match ended';
        row.querySelector('.overview-spectators').hidden=true;
      }
      const detail=row.querySelector('.overview-live-score');
      if(!detail.querySelector('strong'))detail.textContent=error.status===404?'Match ended.':'Score temporarily unavailable.';
    }finally{fetching=false;}
  }
  const poll=setInterval(refreshScores,1500);
  function positionDetails(){
    if(!openMatch)return;
    const panel=openMatch.querySelector('.overview-matchup'),rect=openMatch.getBoundingClientRect();
    const left=Math.max(8,Math.min(rect.left,innerWidth-panel.offsetWidth-8));
    const top=rect.bottom+panel.offsetHeight+8<=innerHeight?rect.bottom:Math.max(8,rect.top-panel.offsetHeight);
    Object.assign(panel.style,{left:left+'px',top:top+'px'});
  }
  function updateArrows(){
    const max=matchList.scrollWidth-matchList.clientWidth;
    $('.overview-arrows').hidden=max<=1;
    $('[data-slide="-1"]').disabled=matchList.scrollLeft<=1;
    $('[data-slide="1"]').disabled=matchList.scrollLeft>=max-1;
  }
  function setMatch(row,keepOpen=false) {
    if(openMatch===row){pinned=keepOpen;return;}

    if(openMatch){
      openMatch.querySelector('button').setAttribute('aria-expanded','false');
      openMatch.querySelector('.overview-matchup').hidePopover();
      openMatch.querySelector('.overview-matchup').hidden=true;
    }
    openMatch=row;
    pinned=keepOpen;
    if(row){
      row.querySelector('button').setAttribute('aria-expanded','true');
      row.querySelector('.overview-matchup').hidden=false;
      row.querySelector('.overview-matchup').showPopover();
      positionDetails();
      void refreshScores();
    }
  }

  function matchup(match,title,byId,index) {
    if(!match.roster?.length)return '';
    const teams=new Map();
    const grouped=match.format!=='lobby-ffa'&&match.roster.every(player=>Number.isInteger(player.team));
    for (const player of match.roster) {
      const team=grouped?player.team:0;
      if(!teams.has(team))teams.set(team,[]);
      teams.get(team).push(player);
    }
    const duel=teams.size===2&&match.roster.length===2;
    return '<div class="overview-matchup" popover="manual" id="overview-match-'+index+'" role="region" aria-label="'+esc(title)+' players" hidden>'+
      '<div class="overview-matchup-title"><strong>'+esc(title)+'</strong>'+poolLabel(match.pool)+'</div>'+
      '<div class="overview-live-score"><span>Loading score…</span></div>'+
      '<div class="overview-sides'+(teams.size===1?' single':'')+'">'+[...teams].sort(([a],[b])=>a-b).map(([team,roster])=>
        '<section class="overview-side team-'+(team+1)+'">'+(duel?'':'<h3>'+(teams.size===1?'Players':'Team '+(team+1))+'</h3>')+'<ul>'+
          roster.map(player=>'<li data-player-id="'+esc(player.id)+'">'+avatar({...player,avatar:byId.get(player.id)?.avatar},esc)+'<span class="overview-name">'+esc(player.name)+'</span></li>').join('')+
        '</ul></section>'
      ).join('')+'</div>'+
      '</div>';
  }

  function renderMatches(matches,byId) {
    const key=JSON.stringify(matches);
    if(matchSnapshot===key)return;
    matchSnapshot=key;
    const focus=document.activeElement;
    const priorId=openMatch?.dataset.matchId,keepOpen=pinned,refocus=openMatch?.contains(focus);
    setMatch(null);
    visibility.disconnect();visible.clear();checked.clear();
    matchList.innerHTML=matches.map((match,index)=>{
      const [mode,title]=matchModes[match.format]||['overview',match.format];
      const roster=matchup(match,title,byId,index);
      const detail=match.locked?'Private lobby':match.players+' player'+(match.players===1?'':'s');
      const when=Number.isFinite(match.started)?' · '+new Date(match.started).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}):'';
      const button=roster?'button type="button" aria-expanded="false" aria-controls="overview-match-'+index+'"':'div';
      return '<li class="overview-match" '+(match.locked?'data-private':'')+' data-match-id="'+esc(match.id??index)+'"><'+button+' class="overview-match-button">'+
        '<span class="overview-card-meta"><b>● LIVE</b><span class="overview-spectators" role="img" hidden>'+eye+
        '<span aria-hidden="true"></span></span>'+poolLabel(match.pool)+'</span><span class="overview-match-mode"><strong>'+esc(title)+'</strong></span>'+
        '<span class="overview-versus"><span class="overview-stack"></span><b class="overview-card-score">'+(roster?'…':'—')+'</b><span class="overview-stack"></span></span>'+
        (roster?'</button>':'</div>')+'<div class="overview-card-foot"><small class="overview-song">'+esc(detail+when)+'</small>'+
        (match.locked&&match.lobbyCode?'<button type="button" class="overview-watch" data-private-watch="'+esc(match.lobbyCode)+'">Watch</button>':roster?'<button type="button" class="overview-watch" data-watch-match="'+esc(match.id)+'">▷ Watch</button>':'')+'</div>'+roster+'</li>';
    }).join('');
    updateArrows();
    $('[data-live]').textContent=$('#overview-live-matches .overview-total').textContent=matches.length;
    const empty=$('.overview-match-empty');
    empty.hidden=matches.length>0;
    empty.textContent='No matches in progress.';
    for (const row of matchList.querySelectorAll('.overview-match')) {
      const button=row.querySelector('button.overview-match-button');
      if(!button)continue;
      visibility.observe(row);
      row.onpointerenter=event=>{if(event.pointerType==='mouse'&&!pinned)setMatch(row);};
      row.onpointerleave=event=>{if(event.pointerType==='mouse'&&!pinned&&!button.matches(':focus-visible'))setMatch(null);};
      button.onfocus=()=>{if(button.matches(':focus-visible'))setMatch(row);};
      row.onfocusout=event=>{if(!pinned&&!row.matches(':hover')&&!row.contains(event.relatedTarget))setMatch(null);};
      button.onclick=()=>openMatch===row&&pinned?setMatch(null):setMatch(row,true);
      if(priorId===row.dataset.matchId){
        setMatch(row,keepOpen);
        if(refocus)(focus.matches('[data-watch-match]')?row.querySelector('[data-watch-match]'):button).focus({preventScroll:true});
      }
    }
  }

  function filterPlayers() {
    const query=search.value.trim().toLowerCase();
    let found=false;
    for (const row of playerList.children){
      row.hidden=!row.dataset.name.includes(query);
      if(!row.hidden)found=true;
    }
    const empty=$('.overview-player-empty');
    empty.hidden=found;
    empty.textContent=!signedIn?'Sign in to see who’s online.':players.length?'No players match your search.':'No players online.';
  }

  function renderPlayers() {
    const key=JSON.stringify(players);
    if(playerSnapshot!==key){
      playerSnapshot=key;
      const top=playerList.scrollTop;
      const labels={playing:'In Match',queued:'In Queue',quiz:'Playing Quiz',spectating:'Spectating',afk:'AFK',browsing:'Browsing'};
      playerList.innerHTML=players.map(player=>
        '<li data-name="'+esc(player.name.toLowerCase())+'">'+avatar(player,esc)+'<a class="overview-player-profile" href="'+esc(profileHref(player.id))+'" title="'+esc(player.name)+'">'+esc(player.name)+'</a>'+
          '<span class="overview-player-status" data-status="'+esc(player.status)+'">'+(labels[player.status]||labels.browsing)+'</span></li>'
      ).join('');
      playerList.scrollTop=top;
    }
    $('.overview-search').hidden=!signedIn;
    playerList.hidden=!signedIn;
    $('.overview-signin').hidden=signedIn;
    filterPlayers();
  }

  function update(data,account=viewer) {
    void refreshRooms();
    signedIn=!!account;
    players=data.onlinePlayers||[];
    $('[data-online]').textContent=$('.overview-online-total').textContent=data.online??'—';
    counts=data.counts??counts;
    renderQueues();
    renderPlayers();
    renderMatches(data.matches||[],new Map(players.map(player=>[player.id,player])));
  }

  const refreshRooms=mountOverviewRooms(root,{esc,loadRooms,openLobby,signal:lifetime.signal});
  void refreshRooms();
  const listeners=lifetime;
  const resize=new ResizeObserver(updateArrows);
  resize.observe(matchList);
  matchList.addEventListener('scroll',()=>{updateArrows();setMatch(null);},{signal:listeners.signal});
  window.addEventListener('scroll',positionDetails,{signal:listeners.signal,passive:true});
  window.addEventListener('resize',positionDetails,{signal:listeners.signal});
  search.addEventListener('input',filterPlayers,{signal:listeners.signal});
  root.addEventListener('click',event=>{
    const privateButton=event.target.closest('[data-private-watch]');
    if(privateButton){watchPrivate(privateButton.dataset.privateWatch,privateButton.closest('li').querySelector('.overview-match-mode strong').textContent);return;}
    const arrow=event.target.closest('[data-slide]');
    if(arrow){
      const step=(matchList.firstElementChild?.offsetWidth||0)+10;
      matchList.scrollBy({left:Number(arrow.dataset.slide)*step,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
      return;
    }
    const button=event.target.closest('[data-overview-pool]');
    if(button){
      pool=button.dataset.overviewPool;
      try{localStorage.setItem('amqtours-play-overview-pool',pool);}catch{}
      renderQueues();
      return;
    }
    const spectate=event.target.closest('[data-watch-match]');
    if(spectate){
      const row=spectate.closest('.overview-match');
      setMatch(row,true);
      const title=row.querySelector('.overview-match-mode strong').textContent;
      watch(spectate.dataset.watchMatch,title);return;
    }
    const queue=event.target.closest('[data-overview-join]');
    if(!queue||queue.disabled)return;
    if(queue.dataset.label==='Leave'){leave();return;}
    if(queue.dataset.label==='View'){viewQueue();return;}
    join(queue.dataset.overviewJoin,pool);
  },{signal:listeners.signal});
  document.addEventListener('pointerdown',event=>{if(openMatch&&!openMatch.contains(event.target))setMatch(null);},{signal:listeners.signal});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&openMatch)setMatch(null);},{signal:listeners.signal});
  renderQueues();
  return {
    update,
    updateCounts(value){if(value){counts=value;renderQueues();}},
    updateQueue(value){currentQueue=value;renderQueues();},
    close(){setMatch(null);listeners.abort();clearInterval(poll);visibility.disconnect();resize.disconnect();},
    unavailable(){
      if(matchSnapshot===undefined)$('.overview-match-empty').textContent='Live matches unavailable. Retrying…';
      if(playerSnapshot===undefined)$('.overview-player-empty').textContent='Online players unavailable. Retrying…';
    },
  };
}
