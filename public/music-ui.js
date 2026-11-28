import {jamPollDelay} from './jam-polling.js';
import {openMatchChat} from './play-match-chat.js?v=party';
import {songPoster} from './song-posters.js';
import {createMusicPlayer,playerIcon} from './music-player.js?v=party-mine';
import {songAddButton,songCollectionButton,songQuickActions,songTile} from './song-tiles.js?v=music-layout';
import {compareSongs,matchesSong,matchesSongFlags,songFilters,songFilterBar,songFilterParams,SONG_FILTER_DEFAULTS} from './song-filters.js';
import {DUPLICATE_NOTES,SONG_EXCHANGE_COST} from './song-pack-rules.js';

export function createMusicUI({api,escape:e,modal,toast,avatar,rememberCards,routeHref}){
  const root=document.createElement('section');root.className='music-view';
  let account=null,tab='book',home={lists:[],invites:[],room:null},room=null,list=null;
  let view='',addingSongs=false,serial=0,syncId=0,working=false,timer=null;
  const createFilterState=()=>({filters:{...SONG_FILTER_DEFAULTS},page:1,expanded:false});
  let scopes={book:createFilterState(),catalogue:createFilterState(),lists:createFilterState()};
  let book={rows:[],hasMore:false},catalogue=null;
  const scope=()=>scopes[view==='song-catalogue'?'catalogue':tab];
  let partyChat=null,chatSeq=0,donator=false;
  function closePartyChat(){partyChat?.close();partyChat=null;chatSeq=0;}
  function showPartyChat(rows){
    if(view!=='music'||tab!=='jam'||!room){closePartyChat();return;}
    const id=room.id,history=partyChat?.matchId!==id;
    if(history){
      closePartyChat();
      partyChat=openMatchChat({id,players:room.members,me:account},async body=>{
        try{await change({op:'chat',room:id,body});if(room?.id===id)await poll();return true;}
        catch(err){report(err);return false;}
      },{label:'Party chat',donator,minimized:true,onToggle:open=>schedule(open)});
    }
    for(const row of rows||[]){partyChat.receive(row,!history);chatSeq=Math.max(chatSeq,row.seq);}
  }
  let error='',drag=null,rearranging=false;
  const player=createMusicPlayer({hostCommand,refreshRoom:()=>poll().catch(report),toast});
  const btn=(op,label,attrs='')=>`<button type="button" class="button secondary" data-music="${op}" ${attrs}>${label}</button>`;
  const trackText=s=>`<div class="music-track-summary">${songPoster(s)}<div class="music-track"><strong>${e(s.title)}</strong><small>${e(s.artist)}</small></div></div>`;
  function report(err){toast(err.message||'Music is temporarily unavailable.',true);}
  const retryKeys=new Map();
  async function change(body){
    const signature=JSON.stringify([account,body]);
    const key=retryKeys.get(signature)||crypto.randomUUID();retryKeys.set(signature,key);
    try{const r=await api('music',body,key);retryKeys.delete(signature);return r;}
    catch(err){if(err.status&&err.status<500)retryKeys.delete(signature);throw err;}
  }
  async function hostCommand(op,seconds){
    if(!room?.queue[0])return;
    await change({op,room:room.id,entry:room.queue[0].key,seconds});
    await poll(true);
  }
  async function poll(force=false){
    if(!account||!home.room&&!room)return;
    const version=++syncId,who=account,start=Date.now();
    const chatParams=view==='music'&&tab==='jam'?'&chatRoom='+encodeURIComponent(partyChat?.matchId||'')+'&after='+chatSeq:'';
    const data=await api('music?view=room&rev='+(force?-1:room?.rev??-1)+'&read='+version+chatParams);
    if(version!==syncId||who!==account)return;
    const next=data.room;
    if(!next){
      closePartyChat();room=null;home.room=null;player.room(null,account,0);if(view==='music'&&tab==='jam')draw();schedule();return;
    }
    const skew=next.now-(start+Date.now())/2;
    if(next.queue){room=next;home.room=next.id;rememberCards(next.cards||[]);player.room(next,account,skew);if(view==='music'&&tab==='jam')draw();}
    else player.sync(skew);
    showPartyChat(data.chat);
  }
  let scheduledDelay=null,tickRunning=false;
  function schedule(immediate=false){
    const delay=account?jamPollDelay({joined:!!home.room,hidden:document.hidden,
      inJam:view==='music'&&tab==='jam',playing:room?.since!=null,
      chatOpen:partyChat?.isOpen()}):0;
    if(timer!==null && !immediate && scheduledDelay===delay)return;
    clearTimeout(timer);timer=null;scheduledDelay=delay;
    if(!delay||tickRunning)return;
    timer=setTimeout(async()=>{
      timer=null;tickRunning=true;
      try{
        if(home.room)await poll();
        else{
          const who=account,version=serial;
          const next=await api('music?view=invites');
          if(account===who && serial===version && view==='music' && tab==='jam'){
            const changed=home.room!==next.room||JSON.stringify(home.invites)!==JSON.stringify(next.invites);
            home={...home,...next};
            if(home.room)await poll(true);
            if(changed)draw();
          }
        }
      }catch(err){if(view==='music'&&tab==='jam'){error=err.message;draw();}}
      finally{tickRunning=false;schedule();}
    },immediate?0:delay);
  }
  document.addEventListener('visibilitychange',()=>schedule(!document.hidden));
  async function refresh(){
    const token=++serial,who=account;
    if(!who)return;
    try{
      const inCatalogue=view==='song-catalogue';
      const prefs=scope(),params=prefs?songFilterParams(prefs.filters):null;
      params?.set('page',prefs.page);
      if(params&&!inCatalogue&&tab==='book')params.set('owned','1');
      const [next,songs,selected]=await Promise.all([inCatalogue?null:api('music'),
        inCatalogue||tab==='book'?api('songbook?'+params):null,
        !inCatalogue&&(tab==='lists'||addingSongs)&&list?api('music?view=playlist&id='+encodeURIComponent(list.id)):null]);
      if(token!==serial||account!==who)return;
      error='';
      if(inCatalogue){catalogue=songs;draw();return;}
      home=next;
      if(songs)book=songs;
      if(selected)list=selected;
      if(home.room)await poll(true);
      else if(room){syncId++;room=null;player.room(null,account,0);}
    }catch(err){if(token===serial)error=err.message;}
    if(token===serial){draw();schedule();}
  }
  function filters(defaultOrder,inCatalogue=false){
    const prefs=scope();
    return songFilterBar(prefs.filters,{escape:e,expanded:prefs.expanded,defaultOrder,catalogue:inCatalogue});
  }
  function pages(data){
    const page=scope().page;
    return page>1||data.hasMore?`<div class="songbook-pagination">${btn('prev','Previous',page===1?'disabled':'')} Page ${page} ${btn('next-page','Next',data.hasMore?'':'disabled')}</div>`:'';
  }
  function cataloguePage(){
    return `<header class="section-head"><h1>Song Catalogue</h1>${catalogue?`<span class="song-notes">♫ ${catalogue.notes} Notes</span>`:''}</header>
      ${filters('Library order',true)}${catalogue?`<p class="subtext song-catalogue-price">Choose any song for ${SONG_EXCHANGE_COST} Notes. Duplicates return ${DUPLICATE_NOTES} Note.</p>
      ${catalogue.rows.length?`<ul class="song-tiles song-tiles--catalogue">${catalogue.rows.map(s=>songTile(s,{escape:e,dock:true,catalogue:true,version:catalogue.version,
        badge:s.owned?'<span class="song-badge song-badge--owned">Owned</span>':''})).join('')}</ul>`:'<p class="subtext">No matching songs.</p>'}${pages(catalogue)}`:'<p class="subtext" role="status">Loading songs…</p>'}`;
  }
  function playlistLinks(){
    return home.lists.map(l=>`<li><button type="button" class="music-playlist-link" data-music="select" data-id="${e(l.id)}"><span class="music-playlist-icon" aria-hidden="true">♫</span><span><strong>${e(l.name)}</strong><small>${l.count} ${l.count===1?'song':'songs'}</small></span></button></li>`).join('') || '<li class="subtext">No playlists yet.</li>';
  }
  function bookPage(){
    const inPlaylist=addingSongs?new Set(list.tracks.map(song=>song.id)):null;
    const tracks=book.rows.map(song=>{
      const series=song.anime?.[0]?.name;
      const types=[...new Set(song.anime?.flatMap(entry=>entry.types||[]))].join(' / ');
      return `<li>
        <button type="button" class="music-row-play" data-music="single" data-id="${song.id}" aria-label="Play ${e(song.title)}">▶</button>
        <div class="music-track-summary">${songPoster(song)}<div class="music-track"><strong>${e(song.title)}</strong><small>${e(song.artist)}${series?' · '+e(series):''}</small></div></div>
        <button class="music-row-more" aria-label="Options for ${e(song.title)}" aria-expanded="false">•••</button><div class="music-list-actions">${types?`<small class="music-song-type">${e(types)}</small>`:''}
        ${songQuickActions(song,e)}${songAddButton(song,e,inPlaylist?.has(song.id))}${songCollectionButton(song,e)}</div>
      </li>`;
    }).join('');
    const body=`<section class="music-library-content"><header class="section-head"><h2>${inPlaylist?'Add Songs to '+e(list.name):'My Songs'}</h2>
      ${inPlaylist?btn('playlist-return','← Back to playlist'):''}</header>
      ${filters('Newest first')}
      ${tracks?`<ul class="music-rows music-library-tracks">${tracks}</ul>`:'<p class="subtext">No matching songs in your Songbook.</p>'}
      ${pages(book)}</section>`;
    return inPlaylist?body:`<div class="music-library"><aside class="music-playlist-sidebar" aria-label="Your playlists">
      <h2>Playlists</h2><ul>${playlistLinks()}</ul>
    </aside>${body}</div>
    <div class="music-player-bar" data-music-player="book"></div>`;
  }
  function playerSlot(id,fallback){
    return `<div class="music-player-slot" data-music-player="${e(id)}"><div class="music-player-idle">${fallback}</div></div>`;
  }
  function listsPage(){
    if(!list)return `<section class="music-playlists"><h2>My Playlists</h2><ul>${playlistLinks()}</ul></section>`;
    const prefs=scope().filters;
    const tracks=list.tracks.map((song,index)=>({song,index})).filter(({song})=>matchesSong(song,prefs)&&matchesSongFlags(song,prefs));
    if(prefs.order)tracks.sort((a,b)=>compareSongs(a.song,b.song,prefs.order)||a.index-b.index);
    const canReorder=!prefs.order&&tracks.length===list.tracks.length;
    if(!canReorder)rearranging=false;
    const first=list.tracks[0];
    const idle=first?`${songPoster(first)}<div class="music-track"><strong>${e(first.title)}</strong><small>${e(first.artist)}</small></div>
      <button class="music-start-play" data-music="listen" aria-label="Play playlist">${playerIcon('play')}</button>`:'<p class="subtext">Add songs to play this playlist.</p>';
    return `<header class="music-playlist-heading">
      <div class="playlist-identity"><button class="playlist-back" title="All playlists" aria-label="All playlists" data-music="back">‹</button><h2>${e(list.name)}</h2>
        <small>${list.tracks.length} ${list.tracks.length===1?'song':'songs'}</small></div>
      <div class="music-playlist-tools">${btn('to-book','+ Add songs')}${btn('start','Jam Party',!first||home.room?'disabled':'')}
        <details class="music-options"><summary aria-label="Playlist options">•••</summary><div>
          ${btn('shuffle','Shuffle',first?'':'disabled')}${btn('rename','Rename')}${btn('delete','Delete playlist')}</div></details></div>
    </header>
    <div class="music-session">
      <aside class="music-session-player" aria-label="Playlist player">${playerSlot(list.id,idle)}</aside>
      <section class="music-session-tracks" aria-label="Playlist tracks">
        <div class="music-track-tools"><h3>Tracks</h3><div class="music-order-tools">${btn('rearrange',rearranging?'Done':'Rearrange',`aria-pressed="${rearranging}" ${canReorder&&tracks.length>1?'':'disabled'}`)}
        ${!canReorder?'<small>Use playlist order and clear filters to rearrange.</small>':''}</div></div>
        ${filters('Playlist order')}
        <ol class="music-rows music-playlist-rows">${tracks.map(({song,index:i})=>`<li data-row="${i}">
          ${rearranging?`<button class="music-handle" type="button" aria-label="Move ${e(song.title)}. Use up or down arrow keys." data-handle="${i}">⠿</button>`:''}
          ${trackText(song)}<button class="music-row-more" aria-label="Options for ${e(song.title)}" aria-expanded="false">•••</button><div class="music-list-actions">${songQuickActions(song,e)}
            ${btn('remove','Remove',`data-i="${i}"`)}</div></li>`).join('')||'<li>No matching songs in this playlist.</li>'}
        </ol>
      </section>
    </div>`;
  }
  function jamPage(){
    if(!room){
      const returning=home.invites.filter(i=>i.returning);
      const pending=home.invites.filter(i=>!i.returning);
      const partyRow=i=>{
        const attrs=`data-id="${e(i.id)}"`;
        return `<li><strong>${e(i.host)}</strong><div>${btn('join',i.returning?'Rejoin':'Join',attrs)} ${i.returning?'':btn('decline','Decline',attrs)}</div></li>`;
      };
      return `<header class="section-head"><h2>Jam Party</h2>${btn('from-list','Start from a playlist')}</header>
        ${returning.length?`<h3>Recently joined</h3><ul class="music-rows">${returning.map(partyRow).join('')}</ul>`:''}
        <h3>Invitations</h3><ul class="music-rows">${pending.map(partyRow).join('')||'<li>No pending invitations.</li>'}</ul>`;
    }
    const song=room.queue[0],host=room.host===account;
    return `<header class="section-head music-room-heading"><h2>${e(room.name)}</h2>
      <div class="music-playlist-tools">${host?btn('invite','Invite friends'):''}<details class="music-options"><summary aria-label="Party options">•••</summary><div>${btn('leave','Leave party')}</div></details></div>
    </header>
    <section class="music-people"><h3>Participants <small>${room.members.length}</small></h3><ul>
      ${[...room.members].sort((a,b)=>Number(b.id===room.host)-Number(a.id===room.host)).map(m=>`<li>${avatar(m)}<strong>${e(m.name)}</strong>${m.id===room.host?'<small>Host</small>':''}</li>`).join('')}
    </ul></section>
    <div class="music-session">
      <aside class="music-session-player" aria-label="Jam Party player">
        ${playerSlot('jam','<p class="subtext">The queue is empty.</p>')}
        ${song?`<div class="music-room-controls">
          <small>Queued by ${e(song.name)}</small>
        </div>`:''}
      </aside>
      <section class="music-session-tracks music-party-queue" aria-label="Jam Party queue">
        <header class="section-head"><h3>Up Next</h3>${btn('queue-picker','Add a song')}</header>
        <ol class="music-rows">${room.queue.slice(1).map(s=>`<li>${trackText(s)}<small>${e(s.name)}</small></li>`).join('')||'<li>No upcoming songs.</li>'}</ol>
        ${song?`<footer class="music-party-vote"><span class="subtext">${room.since===null?'Paused':'Synced'}</span>
          ${btn('vote','Vote skip · '+room.votes.length+'/'+(Math.floor(room.members.length/2)+1),room.votes.includes(account)?'disabled':'')}</footer>`:''}
      </section>
    </div>`;
  }
  function draw(){
    if(!room||view!=='music'||tab!=='jam')closePartyChat();
    const focused=document.activeElement;
    if(view==='song-catalogue'){
      root.innerHTML=(error?`<p role="alert">${e(error)} ${btn('refresh','Retry')}</p>`:'')+
        (account?cataloguePage():'<h1>Song Catalogue</h1><button class="button" data-action="account">Sign in</button>');
      player.place(null,focused);
      return;
    }
    if(view!=='music')return;
    root.innerHTML=`<header class="section-head music-heading"><h1>Music</h1>${account?`<div class="toolbar"><a class="text-button" href="${routeHref('catalog')}?section=songs">Song Catalogue ↗</a>${btn('create','Create playlist')}</div>`:''}</header>
      <nav class="music-tabs" aria-label="Music sections">${[['book','Songbook'],['lists','Playlists'],['jam','Jam Party']].map(([id,label])=>`<button type="button" data-music="tab" data-id="${id}" aria-pressed="${tab===id}">${label}</button>`).join('')}</nav>`+
      (error?`<p role="alert">${e(error)} ${btn('refresh','Retry')}</p>`:'')+
      (!account?'<button class="button" data-action="account">Sign in</button>':tab==='book'?bookPage():tab==='lists'?listsPage():jamPage());
    player.place(root.querySelector('[data-music-player]'),focused);
  }
  function close(){document.querySelector('#modal')?.close();}
  async function pick(id){
    const who=account,data=await api('music');if(who!==account)return;
    modal(`<h2>Add to playlist</h2><div class="music-picker">${data.lists.map(l=>btn('add',e(l.name),`data-id="${e(l.id)}" data-track="${id}"`)).join('')}</div>${nameForm('Create playlist','',id)}`);
  }
  function nameForm(label,value='',track=''){
    return `<form data-music-form="${value?'rename':'create'}" data-track="${track}"><label>Playlist name<input name="name" required maxlength="80" value="${e(value)}"></label><button class="button">${label}</button></form>`;
  }
  async function picker(friends,n=1){
    const who=account,roomId=room?.id;
    const data=await api(friends?'friends?view=added&page='+n:'songbook?owned=1&page='+n);
    if(account!==who||roomId!==room?.id)return;
    modal(`<h2>${friends?'Invite friends':'Add a song'}</h2><div class="music-picker">${data.rows.map(r=>btn(friends?'send':'enqueue',e(friends?r.name:r.title+' · '+r.artist),`data-id="${e(r.id)}"`)).join('')||'<p>No entries available.</p>'}</div><div class="toolbar">${n>1?btn('picker-page','Previous',`data-kind="${friends?'friends':'songs'}" data-id="${n-1}"`):''}${data.hasMore?btn('picker-page','Next',`data-kind="${friends?'friends':'songs'}" data-id="${n+1}"`):''}</div>`);
  }
  async function move(from,to){
    await change({op:'reorder',list:list.id,rev:list.rev,from,to});await refresh();
  }
  function markDrop(row){
    root.querySelector('.music-drop-target')?.classList.remove('music-drop-target');
    row?.classList.add('music-drop-target');
  }
  root.onpointerdown=ev=>{
    const handle=ev.target.closest('[data-handle]');
    if(!handle||!rearranging||working||ev.button!==0)return;
    handle.setPointerCapture(ev.pointerId);
    drag={from:Number(handle.dataset.handle),pointer:ev.pointerId,list:list.id,rev:list.rev};
  };
  function dropRow(ev){
    return document.elementFromPoint(ev.clientX,ev.clientY)?.closest('.music-playlist-rows [data-row]');
  }
  root.onpointermove=ev=>{
    if(drag?.pointer!==ev.pointerId)return;
    markDrop(dropRow(ev));
    if(ev.clientY<65||ev.clientY>innerHeight-80){
      const direction=ev.clientY<65?-1:1;
      ev.target.closest('[data-row]')?.parentElement.children[Math.max(0,Math.min(list.tracks.length-1,Number(dropRow(ev)?.dataset.row??drag.from)+direction))]?.scrollIntoView({block:'nearest'});
    }
  };
  root.onpointercancel=()=>{drag=null;markDrop(null);};
  root.onpointerup=ev=>{
    if(drag?.pointer!==ev.pointerId)return;
    const source=drag,row=dropRow(ev);
    drag=null;markDrop(null);
    if(row&&source.list===list?.id&&source.rev===list.rev&&Number(row.dataset.row)!==source.from)
      void run(()=>move(source.from,Number(row.dataset.row)));
  };
  root.onkeydown=ev=>{
    const handle=ev.target.closest('[data-handle]');
    if(!handle||!['ArrowUp','ArrowDown'].includes(ev.key))return;
    ev.preventDefault();
    const from=Number(handle.dataset.handle),to=from+(ev.key==='ArrowUp'?-1:1);
    if(to>=0&&to<list.tracks.length)void run(async()=>{await move(from,to);root.querySelector('[data-handle="'+to+'"]')?.focus();});
  };
  root.onclick=ev=>{
    const toggle=ev.target.closest('.music-row-more');
    if(toggle)toggle.setAttribute('aria-expanded',String(toggle.getAttribute('aria-expanded')!=='true'));
    const menu=ev.target.closest('.music-options');
    if(!menu||ev.target.closest('[data-music]'))root.querySelector('.music-options[open]')?.removeAttribute('open');
  };
  async function act(t){
    const op=t.dataset.music,id=t.dataset.id,i=Number(t.dataset.i);
    if(op==='rearrange'){rearranging=!rearranging;draw();root.querySelector('[data-music="rearrange"]')?.focus();return;}
    if(op==='tab'||['to-book','from-list','back','playlist-return'].includes(op)){
      rearranging=false;addingSongs=op==='to-book';
      tab=op==='tab'?id:addingSongs?'book':'lists';
      if(!addingSongs&&op!=='playlist-return')list=null;
    }else if(op==='add-direct'){
      await change({op:'add',list:list.id,track:Number(id)});
      toast('Song added to playlist.');
    }else if(op==='filters'){
      const prefs=scope();
      prefs.expanded=!prefs.expanded;
      t.setAttribute('aria-expanded',String(prefs.expanded));
      root.querySelector('#song-filter-options').hidden=!prefs.expanded;
      return;
    }else if(op==='clear-filters'){
      Object.assign(scope(),{filters:{...SONG_FILTER_DEFAULTS},page:1});
    }else if(op==='next-page'||op==='prev')scope().page+=op==='prev'?-1:1;
    else if(op==='select'){
      tab='lists';addingSongs=false;rearranging=false;list={id,name:'',tracks:[]};
    }
    else if(op==='single'){
      player.start((view==='song-catalogue'?catalogue.rows:book.rows).filter(s=>s.id===Number(id)),false);return;
    }
    else if(op==='listen'||op==='shuffle'){player.start(list.tracks,op==='shuffle',list.id);return;}
    else if(op==='add'){
      await change({op:'add',list:id,track:Number(t.dataset.track)});close();toast('Song added to playlist.');
    }else if(op==='create'||op==='rename'){modal(nameForm(op==='rename'?'Save name':'Create playlist',op==='rename'?list.name:''));return;}
    else if(op==='delete'){modal('<h2>Delete '+e(list.name)+'?</h2>'+btn('confirm-delete','Delete playlist'));return;}
    else if(op==='confirm-delete'){await change({op:'delete-list',list:list.id,rev:list.rev});list=null;close();}
    else if(op==='remove')await change({op,list:list.id,rev:list.rev,from:i});
    else if(op==='start'){await change({op,list:list.id});tab='jam';}
    else if(op==='join'||op==='decline'){await change({op,room:id});tab='jam';}
    else if(op==='leave')await change({op,room:room.id});
    else if(op==='invite'||op==='queue-picker'){await picker(op==='invite');return;}
    else if(op==='picker-page'){await picker(t.dataset.kind==='friends',Number(id));return;}
    else if(op==='send'||op==='enqueue'){
      await change(op==='send'?{op:'invite',room:room.id,friend:id}:{op:'queue',room:room.id,track:Number(id)});
      close();toast(op==='send'?'Invitation sent.':'Song queued.');
    }else if(['vote','play','pause'].includes(op)){await hostCommand(op);return;}
    await refresh();
  }
  async function run(fn){if(working)return;working=true;try{await fn();}catch(err){report(err);if(err.status===409)await refresh();}finally{working=false;}}
  document.addEventListener('click',ev=>{const t=ev.target.closest('[data-music]');if(t)void run(()=>act(t));});
  function applyFilters(form){
    const prefs=scope();
    if(!prefs)return;
    prefs.filters=songFilters(new URLSearchParams(new FormData(form)));
    prefs.page=1;
    void refresh();
  }
  root.addEventListener('change',ev=>{if(ev.target.matches('select, input[type="checkbox"]')&&ev.target.form?.matches('[data-song-filters]'))applyFilters(ev.target.form);});
  document.addEventListener('songbook-changed',()=>{if(view==='song-catalogue'||view==='music'&&tab!=='jam')void refresh();});
  document.addEventListener('submit',ev=>{
    if(ev.target.matches('[data-song-filters]')){ev.preventDefault();applyFilters(ev.target);return;}
    const f=ev.target;if(!f.matches('[data-music-form]'))return;
    ev.preventDefault();void run(async()=>{
      const rename=f.dataset.musicForm==='rename',name=f.elements.name.value.trim();
      const result=await change(rename?{op:'rename',list:list.id,rev:list.rev,name}:{op:'create-list',name,track:Number(f.dataset.track)||null});
      if(!rename&&view==='music'){
        tab='lists';addingSongs=false;list={id:result.id,name,tracks:[]};
      }
      close();toast(rename?'Playlist renamed.':'Playlist created.');await refresh();
    });
  });
  return {pick,attach(route,id,member=false){
    if(member!==donator){closePartyChat();donator=member;}
    const changed=account!==id,enter=route!==view;
    if(enter)serial++;
    if(changed){
      closePartyChat();account=id;serial++;syncId++;clearTimeout(timer);timer=null;player.stop();home={lists:[],invites:[],room:null};
      room=null;list=null;addingSongs=false;rearranging=false;book={rows:[],hasMore:false};catalogue=null;error='';retryKeys.clear();
      scopes={book:createFilterState(),catalogue:createFilterState(),lists:createFilterState()};
    }
    view=route;
    if(route!=='music')closePartyChat();
    const visible=route==='music'||route==='song-catalogue';
    if(visible){
      document.querySelector('[data-music-root]')?.replaceWith(root);
      if(route==='music'&&enter&&new URLSearchParams(location.search).get('tab')==='jam')tab='jam';
      draw();
    }
    if(!visible)player.place(null);
    if(route==='quiz')player.suspend();
    if(visible&&(enter||changed)&&account)void refresh();
    else schedule();
  }};
}
