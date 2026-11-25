import {lobbyCapacity} from './play-mode-rules.js';
import {lobbyModeNames} from './play-lobby-ui.js';
import {poolName} from './play-pool.js';

export function mountOverviewRooms(root,{esc,loadRooms,openLobby,signal}){
  const board=root.querySelector('.room-board'), status=root.querySelector('[data-room-status]');
  let rooms=[],snapshot,last=0,busy=false;
  root.querySelector('[data-create-overview]').addEventListener('click',()=>openLobby(),{signal});
  board.addEventListener('click',e=>{
    const code=e.target.closest('[data-room-code]')?.dataset.roomCode;
    const room=rooms.find(r=>r.code===code);
    if(room)openLobby(room);
  },{signal});
  return async function refresh(){
    if(!loadRooms||busy||document.hidden||Date.now()-last<12000)return;
    busy=true;last=Date.now();
    try{
      const list=await loadRooms(signal);
      if(signal.aborted)return;
      rooms=list.filter(r=>r.players<lobbyCapacity(r.format));
      const next=JSON.stringify(rooms);
      status.hidden=rooms.length>0;status.textContent='No open lobbies.';
      root.querySelector('[data-room-count]').textContent=rooms.length;
      if(next===snapshot)return;
      snapshot=next;
      board.innerHTML=rooms.map(r=>{
        const cap=lobbyCapacity(r.format);
        return '<article class="roomtile"><h3>'+esc(r.host)+'’s Lobby</h3><p>'+esc(lobbyModeNames[r.format]||r.format)+' · '+poolName(r.pool)+'</p>'+
          '<span class="access '+(r.locked?'locked':'open')+'">'+(r.locked?'Private':'Open')+'</span><div class="roomfoot"><span>'+r.players+(Number.isFinite(cap)?' / '+cap:'')+' players</span>'+
          '<button class="button secondary" data-room-code="'+esc(r.code)+'">Join lobby</button></div></article>';
      }).join('');
    }catch{if(!signal.aborted){status.hidden=false;status.textContent='Lobby list unavailable. Retrying…';}}
    finally{busy=false;}
  };
}
