import {playPlayerAvatar} from './play-avatar.js';
import {openMatchChat} from './play-match-chat.js';
import {liveProgressText,liveScoreHTML} from './play-live-score.js';
import {poolName} from './play-pool.js';

const phases={loading:'Getting Everyone Ready',buffering:'Waiting for Audio',guess:'Guessing',
  counting:'Counting Guesses',reveal:'Answers Revealed',finished:'Match Complete',cancelled:'Match Ended'};
const fields={anime:'Anime',song:'Song',artist:'Artist'};
const ended=phase=>phase==='finished'||phase==='cancelled';

export function watchPlayMatch({dialog,api,apiBase,title,id,viewer,esc}){
  const root=dialog.querySelector('.watch-match');
  const status=root.querySelector('.watch-status');
  const live=root.querySelector('.watch-live');
  const clock=root.querySelector('.watch-clock');
  const controller=new AbortController();
  const path='play-watch?match='+encodeURIComponent(id);
  const url=new URL(path,apiBase);
  url.protocol=url.protocol==='https:'?'wss:':'ws:';
  let socket,state,chat,offset=0,reconnect,attempts=0;
  const interval=setInterval(tick,250);
  dialog.addEventListener('close',()=>{
    controller.abort();clearTimeout(reconnect);clearInterval(interval);socket?.close();chat?.close();
  },{once:true});

  function tick(){
    const seconds=state?.until&&['guess','counting','reveal'].includes(state.phase)
      ? Math.max(0,Math.ceil((state.until-Date.now()-offset)/1000)) : null;
    const text=seconds===null?'':seconds+'s';
    if(clock.textContent!==text)clock.textContent=text;
  }

  function render(){
    const {reveal,players}=state;
    const results=new Map((reveal?.results||[]).map(result=>[result.id,result]));
    const groups=Map.groupBy(players,player=>player.team);
    const solo=state.format==='lobby-ffa';
    const individual=groups.size===players.length;
    const progress=liveProgressText(state);
    status.textContent=poolName(state.pool)+' · '+(state.aborted?'Match Aborted':(phases[state.phase]||'Live'))+' · '+progress;
    live.innerHTML='<section class="watch-scores" aria-label="Live score"><h3>'+esc(state.unit)+'</h3>'+liveScoreHTML(state,esc)+'</section>'+
      (reveal?'<section class="watch-reveal"><h3>'+esc(reveal.anime)+'</h3><p>'+esc(reveal.title)+' · '+esc(reveal.artist)+'</p></section>':'')+
      '<div class="watch-rosters'+(solo?' watch-solo':'')+'">'+[...groups].sort(([a],[b])=>a-b).map(([team,members])=>
        '<section>'+(individual?'':'<h3>'+(groups.size===1?'Players':'Team '+(team+1))+'</h3>')+'<ul>'+
        members.map(player=>{
          const result=results.get(player.id);
          const answers=result?Object.entries(result.correct||{}).map(([key,correct])=>{
            if(!Object.hasOwn(fields,key))return '';
            const answer=result.answers?.[key];
            return '<span class="'+(correct?'correct':'incorrect')+'" title="'+fields[key]+'">'+(correct?'✓ ':'× ')+esc(answer||'No Answer')+'</span>';
          }).join(''):'';
          return '<li><div class="watch-player">'+playPlayerAvatar(player,esc)+'<strong>'+esc(player.name)+'</strong><small>'+
            (player.left?'Left':esc(player.score)+' pts')+'</small></div>'+
            (answers?'<div class="watch-answers">'+answers+'</div>':'')+'</li>';
        }).join('')+'</ul></section>'
      ).join('')+'</div>'+(state.reason?'<p class="watch-reason">'+esc(state.reason)+'</p>':'');
    tick();
  }

  async function checkAvailability(){
    try{await api(path,undefined,undefined,{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(8000)])});}
    catch(error){
      if(controller.signal.aborted)return;
      if([401,403,404].includes(error.status)){
        status.textContent=error.message;clearInterval(interval);clock.textContent='';return;
      }
    }
    if(!controller.signal.aborted)connect();
  }

  function connect(){
    socket=new WebSocket(url);
    socket.onmessage=event=>{
      let message;
      try{message=JSON.parse(event.data);}catch{return;}
      if(controller.signal.aborted)return;
      if(message.type==='chat-history'&&state){
        chat??=openMatchChat({id,players:state.players,me:viewer},body=>{
          if(socket?.readyState!==1){status.textContent='Reconnecting to match chat…';return false;}
          socket.send(JSON.stringify({type:'chat-send',body}));return true;
        },{container:root.querySelector('.watch-chat')});
        for(const row of message.rows)chat.receive(row,false);
        return;
      }
      if(message.type==='chat-message'){chat?.receive(message.row);return;}
      if(message.type==='chat-error'){status.textContent=message.message;return;}
      if(message.type!=='spectator'||message.state?.id!==id)return;
      attempts=0;offset=message.now-Date.now();state=message.state;render();
      if(ended(state.phase))clearInterval(interval);
    };
    socket.onclose=event=>{
      if(controller.signal.aborted)return;
      if(ended(state?.phase)){status.textContent='Match Complete · Chat disconnected';return;}
      if(event.code===4001){
        status.textContent='Spectator view opened in another tab.';clearInterval(interval);clock.textContent='';return;
      }
      status.textContent='Reconnecting to '+title+'…';
      reconnect=setTimeout(checkAvailability,Math.min(10_000,1000*2**attempts++));
    };
  }
  connect();
}
