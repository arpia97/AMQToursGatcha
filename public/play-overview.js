import {PLAY_MODES,playHref} from './play-navigation.js';
import {ARENA_FORMAT} from './play-arena-config.js';
import {DUEL_FORMAT} from './play-mode-rules.js';
import {playPools,poolFormat,poolName} from './play-pool.js';
import {playPlayerAvatar} from './play-avatar.js';

const modes=new Map(PLAY_MODES.map(mode=>[mode.id,mode]));
const icon=path=>'<svg class="play-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="'+path+'"/></svg>';
const chevron='<span aria-hidden="true" class="overview-chevron">›</span>';
const groups=[
  [DUEL_FORMAT,[[DUEL_FORMAT,'']]],
  ['ngmc-ranked',[['ngmc-ranked','4v4 Ranked'],['ngmc-3v3','3v3 Unranked']]],
  [ARENA_FORMAT,[[ARENA_FORMAT,'Round Robin']]],
  ['song-artist',[['1v1','1v1'],['3v3','3v3'],['1-team','1-Team']]],
];
const queueNames=new Map(groups.flatMap(([mode,formats])=>formats.map(([format,label])=>
  [format,[modes.get(mode).name,label].filter(Boolean).join(' · ')])));
const matchModes={
  [DUEL_FORMAT]:[DUEL_FORMAT,'1v1 Ranked'],'lobby-duel':[DUEL_FORMAT,'1v1 Unranked'],
  'ngmc-ranked':['ngmc-ranked','NGMC 4v4'],'ngmc-3v3':['ngmc-ranked','NGMC 3v3'],'lobby-ngmc':['ngmc-ranked','NGMC Custom'],
  [ARENA_FORMAT]:[ARENA_FORMAT,'2v2 Arena'],'lobby-arena':[ARENA_FORMAT,'2v2 Arena'],
  '1v1':['song-artist','Song/Artist 1v1'],'3v3':['song-artist','Song/Artist 3v3'],
  '1-team':['song-artist','Song/Artist 1-Team'],'lobby-team':['song-artist','Song/Artist 1-Team'],
  'lobby-ffa':['song-artist','Song/Artist Free-for-All'],
};
const poolLabel=pool=>'<span class="overview-pool-label '+(pool==='watched'?'watched':'random')+'">'+poolName(pool)+'</span>';
const avatar=(player,esc)=>'<span class="overview-avatar">'+playPlayerAvatar(player,esc)+'</span>';
const defaultPool=()=>{
  try{return localStorage.getItem('amqtours-play-overview-pool')==='watched'?'watched':'random';}
  catch{return 'random';}
};

export function mountPlayOverview(root,{esc,join,leave,viewQueue,viewer}) {
  let pool=defaultPool(),counts,currentQueue,players=[],signedIn=!!viewer,openMatch=null,pinned=false;
  let matchSnapshot,playerSnapshot;
  root.innerHTML=`<div class="overview-page">
    <h1>Overview</h1>
    <div class="overview-mobile-links" aria-label="Overview sections">
      <button type="button" data-overview-scroll="quick-join">Quick Join</button>
      <button type="button" data-overview-scroll="live-matches">Live Matches</button>
      <button type="button" data-overview-scroll="online-players">Online Players</button>
    </div>
    <div class="overview-columns">
      <section id="quick-join" aria-labelledby="quick-join-title">
        <header class="overview-section-head"><h2 id="quick-join-title">Quick Join</h2>
          <div class="overview-selection" role="group" aria-label="Song pool">
            ${playPools.map(value=>'<button type="button" data-overview-pool="'+value+'">'+poolName(value)+'</button>').join('')}
          </div>
        </header>
        <div class="overview-queue-list">
          ${groups.map(([mode,formats])=>'<article class="overview-mode"><h3>'+icon(modes.get(mode).icon)+modes.get(mode).name+'</h3><div class="overview-formats">'+formats.map(([format,label])=>
            '<div class="overview-queue-row"><strong>'+label+'</strong><span class="overview-count" data-overview-count="'+format+'"></span><button type="button" class="button overview-join" data-overview-join="'+format+'"></button></div>'
          ).join('')+'</div></article>').join('')}
          <article class="overview-mode overview-solo">
            <h3>${icon(modes.get('quiz').icon)}Quiz</h3><span>Solo</span>
            <a href="${playHref('quiz')}" data-play-mode="quiz" class="button secondary overview-open">Browse Quizzes${chevron}</a>
          </article>
          <article class="overview-mode overview-disabled">
            <h3>${icon(modes.get('speed-showdown').icon)}Speed Showdown</h3><span>Coming Soon</span>
          </article>
        </div>
      </section>
      <div class="overview-side-panels">
        <section id="live-matches" class="overview-panel" aria-labelledby="live-matches-title">
          <header><h2 id="live-matches-title">Live Matches</h2><span class="overview-total">—</span></header>
          <ul class="overview-match-list"></ul><p class="overview-empty overview-match-empty" role="status">Loading…</p>
        </section>
        <section id="online-players" class="overview-panel" aria-labelledby="online-players-title">
          <header><h2 id="online-players-title">Online Players</h2><span class="overview-total overview-online-total">—</span></header>
          <div class="overview-search">${icon('M21 21l-4.5-4.5M18 11a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z')}<input type="search" placeholder="Find a player" aria-label="Find an online player"></div>
          <ul class="overview-player-list" aria-label="Online players" tabindex="0"></ul>
          <p class="overview-empty overview-player-empty" role="status">Loading…</p>
          <button type="button" class="text-button overview-signin" data-action="account" hidden>Sign In</button>
        </section>
      </div>
    </div>
  </div>`;

  const $=selector=>root.querySelector(selector);
  const countRows=root.querySelectorAll('[data-overview-count]'), joinButtons=root.querySelectorAll('[data-overview-join]');
  const matchList=$('.overview-match-list'), playerList=$('.overview-player-list'), search=$('.overview-search input');

  function renderQueues() {
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

  function setMatch(row,keepOpen=false) {
    if(openMatch){
      openMatch.querySelector('button').setAttribute('aria-expanded','false');
      openMatch.querySelector('.overview-matchup').hidden=true;
    }
    openMatch=row;
    pinned=keepOpen;
    if(row){
      row.querySelector('button').setAttribute('aria-expanded','true');
      row.querySelector('.overview-matchup').hidden=false;
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
    return '<div class="overview-matchup" id="overview-match-'+index+'" role="region" aria-label="'+esc(title)+' players" hidden>'+
      '<div class="overview-matchup-title"><strong>'+esc(title)+'</strong>'+poolLabel(match.pool)+'</div>'+
      '<div class="overview-sides'+(teams.size===1?' single':'')+'">'+[...teams].sort(([a],[b])=>a-b).map(([team,roster])=>
        '<section class="overview-side team-'+(team+1)+'"><h3>'+(teams.size===1?'Players':'Team '+(team+1))+'</h3><ul>'+
          roster.map(player=>'<li>'+avatar({...player,avatar:byId.get(player.id)?.avatar},esc)+esc(player.name)+'</li>').join('')+
        '</ul></section>'
      ).join('')+(teams.size===2?'<span class="overview-matchup-vs" aria-hidden="true">VS</span>':'')+'</div></div>';
  }

  function renderMatches(matches,byId) {
    const key=JSON.stringify(matches);
    if(matchSnapshot===key)return;
    matchSnapshot=key;
    const priorId=openMatch?.dataset.matchId,keepOpen=pinned,refocus=openMatch?.contains(document.activeElement);
    setMatch(null);
    matchList.innerHTML=matches.map((match,index)=>{
      const [mode,title]=matchModes[match.format]||['overview',match.format];
      const roster=matchup(match,title,byId,index);
      const detail=match.locked?'Private lobby':match.players+' player'+(match.players===1?'':'s');
      const when=Number.isFinite(match.started)?' · '+new Date(match.started).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}):'';
      const button=roster?'button type="button" aria-expanded="false" aria-controls="overview-match-'+index+'"':'div';
      return '<li class="overview-match" data-match-id="'+esc(match.id??index)+'"><'+button+' class="overview-match-button">'+
        '<span class="overview-match-mode">'+icon(modes.get(mode).icon)+'<span><strong>'+esc(title)+'</strong><small>'+esc(detail+when)+'</small></span></span>'+
        poolLabel(match.pool)+(roster?chevron:'')+(roster?'</button>':'</div>')+roster+'</li>';
    }).join('');
    $('#live-matches .overview-total').textContent=matches.length;
    const empty=$('.overview-match-empty');
    empty.hidden=matches.length>0;
    empty.textContent='No matches in progress.';
    for (const row of matchList.querySelectorAll('.overview-match')) {
      const button=row.querySelector('button');
      if(!button)continue;
      row.onpointerenter=event=>{if(event.pointerType==='mouse'&&!pinned)setMatch(row);};
      row.onpointerleave=event=>{if(event.pointerType==='mouse'&&!pinned&&!button.matches(':focus-visible'))setMatch(null);};
      button.onfocus=()=>{if(button.matches(':focus-visible'))setMatch(row);};
      button.onblur=()=>{if(!pinned&&!row.matches(':hover'))setMatch(null);};
      button.onclick=()=>openMatch===row&&pinned?setMatch(null):setMatch(row,true);
      if(priorId===row.dataset.matchId){
        if(refocus)button.focus({preventScroll:true});
        setMatch(row,keepOpen);
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
      playerList.innerHTML=players.map(player=>{
        const label=player.status==='playing'?'In Match':player.status==='queued'?'In Queue':'';
        return '<li data-name="'+esc(player.name.toLowerCase())+'">'+avatar(player,esc)+'<strong title="'+esc(player.name)+'">'+esc(player.name)+'</strong>'+
          (label?'<span class="overview-player-status" data-status="'+label+'">'+label+'</span>':'')+'</li>';
      }).join('');
      playerList.scrollTop=top;
    }
    $('.overview-search').hidden=!signedIn;
    playerList.hidden=!signedIn;
    $('.overview-signin').hidden=signedIn;
    filterPlayers();
  }

  function update(data,account=viewer) {
    signedIn=!!account;
    players=data.onlinePlayers||[];
    $('.overview-online-total').textContent=data.online??'—';
    counts=data.counts??counts;
    renderQueues();
    renderPlayers();
    renderMatches(data.matches||[],new Map(players.map(player=>[player.id,player])));
  }

  const listeners=new AbortController();
  search.addEventListener('input',filterPlayers,{signal:listeners.signal});
  root.addEventListener('click',event=>{
    const scroll=event.target.closest('[data-overview-scroll]');
    if(scroll){$('#'+scroll.dataset.overviewScroll).scrollIntoView();return;}
    const button=event.target.closest('[data-overview-pool]');
    if(button){
      pool=button.dataset.overviewPool;
      try{localStorage.setItem('amqtours-play-overview-pool',pool);}catch{}
      renderQueues();
      return;
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
    close(){listeners.abort();},
    unavailable(){
      if(matchSnapshot===undefined)$('.overview-match-empty').textContent='Live matches unavailable. Retrying…';
      if(playerSnapshot===undefined)$('.overview-player-empty').textContent='Online players unavailable. Retrying…';
    },
  };
}
