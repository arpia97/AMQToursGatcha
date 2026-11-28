import {posterIds} from './song-posters.js';

function timestamp(seconds){
  const total=Math.floor(seconds||0);
  return Math.floor(total/60)+':'+String(total%60).padStart(2,'0');
}

const paths={
  play:'M8 5v14l11-7z',pause:'M8 5v14M16 5v14',next:'m6 5 10 7-10 7z M19 5v14',
  previous:'m18 5-10 7 10 7z M5 5v14',stop:'M6 6h12v12H6z',
  volume:'M3 9h4l5-4v14l-5-4H3z M16 8q4 4 0 8',mute:'M3 9h4l5-4v14l-5-4H3z M16 9l5 6m0-6-5 6'
};
export const playerIcon=id=>`<svg aria-hidden="true" viewBox="0 0 24 24" fill="${['play','next','previous','stop'].includes(id)?'currentColor':'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${paths[id]}"/></svg>`;
export function createMusicPlayer({hostCommand,refreshRoom,toast}){
  const audio=new Audio();
  audio.preload='metadata';
  const dock=document.createElement('aside');
  dock.className='music-dock';dock.hidden=true;dock.setAttribute('aria-label','Music player');
  dock.innerHTML=`<song-poster aria-hidden="true"></song-poster>
    <div class="music-player-track"><small></small><strong></strong><span></span></div>
    <div class="music-player-progress">
      <span aria-hidden="true" data-elapsed>0:00</span>
      <input type="range" data-control="seek" min="0" max="0" step="1" aria-label="Playback position">
      <span aria-hidden="true" data-duration>—</span>
    </div>
    <div class="music-player-controls">
      <button type="button" data-control="previous"></button><button type="button" data-control="listen"></button><button type="button" data-control="party" hidden></button><button type="button" data-control="next">Next</button>
      <button type="button" data-control="close" aria-label="Stop playback">×</button>
    </div>
    <div class="music-player-volume" role="group" aria-label="Volume"><button type="button" data-control="sound"></button><input aria-label="Volume" type="range" data-control="volume" min="0" max="1" step=".05" value=".5"></div>`;
  document.body.append(dock);
  const control=id=>dock.querySelector('[data-control="'+id+'"]');
  const seek=control('seek');
  let queue=[],at=0,room=null,myId=null,key='',enabled=false,offset=0,wantsPlay=false,lastDuration='';
  let bookQueue=null;
  let slot=null,listId=null,scrubbing=false;
  let lastVolume=.5;
  audio.volume=lastVolume;
  function track(){return room?room.queue[0]:queue[at];}
  function target(){
    return room.position+(room.since===null?0:Math.max(0,Date.now()+offset-room.since)/1000);
  }
  function setButton(id,icon,label){
    const button=control(id);
    if(button.title===label && button.dataset.icon===icon)return;
    button.dataset.icon=icon;button.title=label;button.setAttribute('aria-label',label);
    button.innerHTML=playerIcon(icon);
  }
  function paint(){
    const s=track();
    const placement=slot?.isConnected?slot.dataset.musicPlayer:null;
    const inline=!!s&&placement!==null&&placement===(room?'jam':listId);
    const bar=!!s&&placement==='book';
    const parent=inline||bar?slot:document.body;
    if(dock.parentNode!==parent)parent.append(dock);
    dock.classList.toggle('music-player--inline',!!inline);
    dock.classList.toggle('music-player--bar',bar);
    dock.hidden=!s;
    document.body.classList.toggle('music-playing',!!s&&!inline&&!bar);
    if(!s)return;
    const poster=dock.querySelector('song-poster'),ids=posterIds(s).join(',');
    if(poster.dataset.mal!==ids)poster.dataset.mal=ids;
    dock.querySelector('strong').textContent=s.title;
    dock.querySelector('.music-player-track span').textContent=s.artist;
    dock.querySelector('small').textContent=inline?'Now Playing':room?'Jam Party · '+room.name:listId?'Playlist':'Songbook';
    control('listen').hidden=!!room;
    if(!room)setButton('listen',audio.paused?'play':'pause',audio.paused?'Play':'Pause');
    const silent=audio.muted||audio.volume===0||!!room&&!enabled;
    setButton('sound',silent?'mute':'volume',silent?(room?'Listen here':'Unmute'):'Mute for me');
    control('volume').value=silent?0:audio.volume;
    control('previous').hidden=!!room;
    setButton('previous','previous','Previous song');
    setButton('next','next','Next song');
    setButton('close','stop','Stop playback');
    control('party').hidden=!room||room.host!==myId;
    setButton('party',room?.since===null?'play':'pause',room?.since===null?'Resume party':'Pause party');
    control('next').hidden=!!room&&room.host!==myId;
    control('close').hidden=!!room;
    const duration=Number.isFinite(audio.duration)?audio.duration:room?.duration;
    const elapsed=room&&audio.readyState<1?target():audio.currentTime;
    seek.disabled=!Number.isFinite(duration)||!!room&&room.host!==myId;
    seek.max=Number.isFinite(duration)?Math.ceil(duration):0;
    if(!scrubbing)seek.value=Math.min(elapsed,Number(seek.max));
    dock.querySelector('[data-elapsed]').textContent=timestamp(Number(seek.value));
    dock.querySelector('[data-duration]').textContent=Number.isFinite(duration)?timestamp(duration):'—';
  }
  control('party').onclick=()=>hostCommand(room.since===null?'play':'pause').catch(err=>toast(err.message,true));
  function play(){
    if(wantsPlay||!audio.paused)return;
    wantsPlay=true;
    const requested=key;
    audio.play().catch(err=>{
      if(requested!==key||err.name==='AbortError')return;
      enabled=false;
      if(err.name!=='NotAllowedError')toast('This recording could not be played.',true);
    }).finally(()=>{if(requested===key){wantsPlay=false;paint();}});
  }
  function align(){
    const s=track(),next=s?(room?'jam:'+s.key:'local:'+s.id):'';
    if(next!==key){
      key=next;wantsPlay=false;lastDuration='';scrubbing=false;audio.pause();
      if(s)audio.src=s.audio;
      else{audio.removeAttribute('src');audio.load();}
    }
    if(s&&room&&audio.readyState>=1){
      const seconds=Math.min(target(),Number.isFinite(audio.duration)?audio.duration:Infinity);
      if(Math.abs(audio.currentTime-seconds)>1.25)audio.currentTime=seconds;
      if(room.host===myId&&room.duration===null&&lastDuration!==key&&Number.isFinite(audio.duration)&&audio.duration>0){
        lastDuration=key;
        hostCommand('duration',audio.duration).catch(()=>{lastDuration='';});
      }
    }
    if(!enabled||!s||room&&room.since===null)audio.pause();
    else play();
    paint();
  }
  function suspend(){
    enabled=false;audio.pause();paint();
  }
  function stop(){
    enabled=false;room=null;bookQueue=null;queue=[];at=0;listId=null;align();
  }
  async function stepBook(delta){
    const cursor=bookQueue;
    if(!cursor||cursor.loading)return;
    const index=at+delta;
    if(index>=0&&index<queue.length){at=index;enabled=true;align();return;}
    cursor.loading=true;
    try{
      const page=delta<0?(cursor.page>1?cursor.page-1:'last'):(cursor.hasMore?cursor.page+1:1);
      const result=await cursor.loadPage(page);
      if(cursor!==bookQueue)return;
      if(!result.rows.length){stop();return;}
      queue=result.rows;at=delta<0?queue.length-1:0;
      cursor.page=result.page;cursor.hasMore=result.hasMore;
      if(key==='local:'+queue[at].id)audio.currentTime=0;
      enabled=true;align();
    }catch(err){if(bookQueue===cursor)toast(err.message,true);}
    finally{cursor.loading=false;}
  }
  function localNext(){
    if(bookQueue){void stepBook(1);return;}
    if(++at>=queue.length){stop();return;}
    align();
  }
  audio.addEventListener('loadedmetadata',align);
  audio.addEventListener('timeupdate',paint);
  audio.addEventListener('play',()=>{
    paint();
    document.dispatchEvent(new Event('music-playback-start'));
  });
  audio.addEventListener('pause',paint);
  audio.addEventListener('ended',()=>{
    if(room){
      if(room.host===myId&&room.duration===null)hostCommand('next').catch(()=>refreshRoom());
      else refreshRoom();
    }else localNext();
  });
  audio.addEventListener('error',()=>{if(key){suspend();toast('Audio unavailable. Retry playback or skip this song.',true);}});
  dock.onclick=ev=>{
    const action=ev.target.closest('button')?.dataset.control;
    if(action==='previous'&&!room){
      if(bookQueue){void stepBook(-1);return;}
      if(audio.currentTime>3||at===0)audio.currentTime=0;
      else {at--;align();}
      return;
    }
    if(action==='sound'){
      const turnOn=audio.muted||audio.volume===0||!!room&&!enabled;
      audio.muted=!turnOn;
      if(turnOn&&audio.volume===0)audio.volume=lastVolume;
      if(room){
        enabled=turnOn;
        if(turnOn&&audio.error)audio.load();
        align();
      }else paint();
      return;
    }
    if(action==='listen'&&!room){
      if(audio.error)audio.load();
      enabled=audio.paused;align();
    }else if(action==='next'){
      if(room)hostCommand('next').catch(err=>toast(err.message,true));
      else localNext();
    }else if(action==='close')stop();
  };
  seek.addEventListener('pointerdown',()=>{scrubbing=true;});
  window.addEventListener('pointerup',()=>{scrubbing=false;});
  window.addEventListener('pointercancel',()=>{scrubbing=false;});
  dock.oninput=ev=>{
    if(ev.target===control('volume')){
      audio.volume=Number(ev.target.value);
      audio.muted=false;
      if(audio.volume>0)lastVolume=audio.volume;
      if(room){enabled=audio.volume>0;align();}else paint();
    }
    if(ev.target===seek)dock.querySelector('[data-elapsed]').textContent=timestamp(Number(seek.value));
  };
  dock.onchange=ev=>{if(ev.target!==seek)return;const n=Number(seek.value);
    scrubbing=false;
    if(room)hostCommand('seek',n).catch(err=>toast(err.message,true));else audio.currentTime=n;
  };
  window.addEventListener('storage',ev=>{if(ev.key==='amqtours-gameplay-audio')suspend();});
  // A preview in the Song Pack reveal also takes precedence over the mini player.
  document.addEventListener('play',ev=>{if(ev.target instanceof HTMLMediaElement&&ev.target!==audio)suspend();},true);
  return {stop,suspend,place(next,focused){
    slot=next;
    paint();
    if(focused&&dock.contains(focused)&&!dock.hidden&&!focused.hidden)focused.focus({preventScroll:true});
  },start(tracks,shuffle,id=null,cursor=null){
    if(room){toast('Leave your Jam Party to play a personal playlist.',true);return;}
    stop();queue=[...tracks];listId=id;bookQueue=cursor;
    if(cursor){at=queue.findIndex(s=>s.id===cursor.id);if(at<0){stop();return;}}
    if(shuffle)for(let i=queue.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[queue[i],queue[j]]=[queue[j],queue[i]];}
    enabled=true;align();
  },room(state,id,clockOffset){
    if(!state&&!room)return;
    if(state&&room?.id!==state.id){bookQueue=null;queue=[];at=0;listId=null;enabled=false;}
    room=state;myId=id;offset=clockOffset;align();
  },sync(clockOffset){offset=clockOffset;if(room)align();}};
}
