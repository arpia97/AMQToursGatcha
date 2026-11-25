import {mountOverviewRooms} from './play-overview-rooms.js';
import {lobbyCreateFields,lobbyCreateMessage,readGuessFields} from './play-lobby-ui.js?v=custom-lobby';
import {playPage} from './play-navigation.js?v=custom-lobby';

const modes=[
  ['1v1-ranked','1v1 Duel','2 players · Unranked'],
  ['ngmc-ranked','NGMC','3v3 or 4v4 · Unranked'],
  ['2v2-arena','2v2 Arena','Round robin'],
  ['song-artist','Song/Artist','Free-for-all'],
  ['one-team','Song/Artist 1-Team','Cooperative'],
  ['variety','Hot Potato','Team VS or 1-Team'],
];

export function mountCustomLobby(root,{create,onBrowse,onCreate,submit,loadRooms,openLobby,esc}){
  const controller=new AbortController();
  const {signal}=controller;
  if(!create){
    root.innerHTML='<section class="overview-page custom-lobbies"><header class="custom-lobby-heading"><h1>Custom Lobby</h1><button class="button mint" data-create-overview>＋ Create a lobby</button></header>'+
      '<section class="custom-panel"><header class="overview-section-head"><h2>Open Lobbies <span class="overview-total" data-room-count>—</span></h2></header>'+
      '<div class="room-board"></div><p class="overview-empty" role="status" data-room-status>Loading lobbies…</p></section></section>';
    const refresh=mountOverviewRooms(root,{esc,loadRooms,openLobby:room=>room?openLobby(room):onCreate(),signal});
    void refresh();
    const timer=setInterval(refresh,15000);
    document.addEventListener('visibilitychange',refresh,{signal});
    signal.addEventListener('abort',()=>clearInterval(timer),{once:true});
    return ()=>controller.abort();
  }
  root.innerHTML='<section class="overview-page custom-lobbies"><header class="custom-lobby-heading"><h1>Create a lobby</h1><button class="button secondary" data-browse>All lobbies</button></header>'+
    '<form class="custom-lobby-form"><fieldset class="custom-panel custom-modes"><legend>Game mode</legend><div class="custom-mode-grid">'+
    modes.map(([id,name,detail],i)=>'<label class="custom-mode"><input type="radio" name="mode" value="'+id+'" '+(i===0?'checked':'')+'>'+
      '<svg aria-hidden="true" class="play-icon" viewBox="0 0 24 24"><path d="'+playPage(id).icon+'"/></svg><span><strong>'+name+'</strong><small>'+detail+'</small></span></label>').join('')+
    '</div></fieldset><section class="custom-panel custom-settings"><h2>Lobby settings</h2><div class="custom-options"></div>'+
    '<label>Password (optional)<input name="password" type="password" maxlength="128" autocomplete="new-password"></label>'+
    '<button type="submit" class="button mint">Create lobby</button></section></form></section>';
  const form=root.querySelector('form'), options=form.querySelector('.custom-options');
  const update=()=>{options.innerHTML=lobbyCreateFields(form.elements.mode.value,form.elements.pool?.value);};
  update();
  root.querySelector('[data-browse]').addEventListener('click',onBrowse,{signal});
  form.addEventListener('change',event=>{
    if(event.target.name==='mode')update();
    if(event.target.name==='guessFields')readGuessFields(form,true);
  },{signal});
  form.addEventListener('submit',event=>{
    event.preventDefault();
    submit(form.elements.mode.value,lobbyCreateMessage(form,form.elements.mode.value));
  },{signal});
  return ()=>controller.abort();
}
