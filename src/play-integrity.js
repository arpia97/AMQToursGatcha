import {answerKey,artistMatches} from './play-artists.js';

export const REVIEW_RETENTION=30*86400000;
const MAX_EVENTS=36000,MAX_PLAYER_EVENTS=4000;
function shuffle(values){
  for(let i=values.length-1;i>0;i--){const n=new Uint32Array(1);crypto.getRandomValues(n);const j=n[0]%(i+1);[values[i],values[j]]=[values[j],values[i]];}
  return values;
}
// Only the current candidate index is published. Future round order and unused
// candidates remain server-side; no answer key is shipped to the browser.
export function prepareAudioPool(state,decoys=[]){
  const first=state.mode==='ngmc-ranked'?12:10;
  state.decoys=decoys.filter(d=>!state.songs.some(s=>s.audio===d.audio)).slice(0,3);
  const entries=state.songs.map((s,round)=>({audio:s.audio,round}));
  const initial=shuffle([...entries.slice(0,first),...state.decoys.map(d=>({audio:d.audio,round:null}))]);
  state.audioPool=[...initial,...shuffle(entries.slice(first))];
  state.audioPreload=initial.length;
}
export function audioManifest(state){
  return {type:'manifest',id:state.id,mode:state.mode||'song-artist',total:state.songs.length,
    preload:state.audioPreload||(state.mode==='ngmc-ranked'?12:10),audio:(state.audioPool||state.songs).map(s=>s.audio)};
}
export function loadedRounds(state,indices){
  if(!state.audioPool)return indices;
  if(!Array.isArray(indices)||indices.length>state.audioPool.length||indices.some(i=>!Number.isInteger(i)||i<0||i>=state.audioPool.length))return null;
  return [...new Set(indices.map(i=>state.audioPool[i].round).filter(i=>i!==null))];
}
function matches(song,field,value){
  return field==='artist'?song.answers.artist.some(a=>artistMatches(a,value,song.artistRules)):song.answers[field].includes(answerKey(value));
}
export function decoyHits(state,answers,artists){
  const fields=state.mode==='ngmc-ranked'?['anime']:['anime','song','artist'];
  return (state.decoys||[]).flatMap(song=>fields.flatMap(field=>{
    const value=field==='artist'?(artists??answers[field]):answers[field];
    // Shared anime titles/artists are not useful evidence. Suppress anything
    // that is an accepted answer anywhere in the actual match, not just now.
    if(!value||!matches(song,field,value)||state.songs.some(s=>matches(s,field,value)))return [];
    return [{field,anime:song.anime,song:song.title,artist:song.artist}];
  }));
}
export class MatchReview {
  constructor(storage){
    this.storage=storage;this.sql=storage.sql;
    this.sql.exec('CREATE TABLE IF NOT EXISTS review_meta(id INTEGER PRIMARY KEY,data TEXT NOT NULL,expires INTEGER NOT NULL)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS review_events(seq INTEGER PRIMARY KEY,at INTEGER NOT NULL,player TEXT NOT NULL,kind TEXT NOT NULL,data TEXT NOT NULL)');
    this.sql.exec('CREATE INDEX IF NOT EXISTS review_player ON review_events(player,seq)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS review_counts(player TEXT PRIMARY KEY,n INTEGER NOT NULL)');
  }
  initialize(state){
    this.sql.exec('INSERT OR IGNORE INTO review_meta VALUES(1,?,?)',JSON.stringify({id:state.id,format:state.format,created:state.created,players:state.players.map(({id,name,team})=>({id,name,team}))}),state.created+REVIEW_RETENTION);
  }
  expires(){return [...this.sql.exec('SELECT expires FROM review_meta WHERE id=1')][0]?.expires;}
  add(state,player,kind,data={},at=Date.now()){
    const count=[...this.sql.exec('SELECT n FROM review_counts WHERE player=?',String(player||''))][0]?.n||0;
    if(count>MAX_PLAYER_EVENTS)return;
    if(count===MAX_PLAYER_EVENTS){kind='log-limit';data={message:'This player reached the review event limit; later events were not retained.'};}
    const last=[...this.sql.exec('SELECT seq FROM review_events ORDER BY seq DESC LIMIT 1')][0]?.seq||0;
    if(last>MAX_EVENTS)return;
    if(last===MAX_EVENTS){kind='log-limit';player='';data={message:'Review event limit reached; later events were not retained.'};}
    this.sql.exec('INSERT INTO review_events VALUES(?,?,?,?,?)',last+1,at,String(player||''),kind,JSON.stringify({round:state.index+1,phase:state.phase,...data}));
    this.sql.exec('INSERT INTO review_counts VALUES(?,1) ON CONFLICT(player) DO UPDATE SET n=n+1',String(player||''));
  }
  activity(state,who,message,at=Date.now()){
    if(['finished','cancelled'].includes(state.phase))return;
    const kinds=['visibility','focus','pagehide','pageshow','snapshot'];
    if(!kinds.includes(message.event)||!['visible','hidden'].includes(message.visibility)||typeof message.focused!=='boolean')return;
    // Bounded, explicitly untrusted browser observations. No destination URLs,
    // other-window contents, clipboard, IP address or screenshots are collected.
    this.add(state,who,'activity',{event:message.event,visibility:message.visibility,focused:message.focused,clientAt:Number.isFinite(message.clientAt)?message.clientAt:null,source:'client-reported'},at);
  }
  submission(state,id,message,before,error,at=Date.now()){
    if(!['answer','artists'].includes(message.type))return;
    const player=state.players.find(p=>p.id===id);
    const answers=message.type==='artists'?{artist:Array.isArray(message.artists)?message.artists.slice(0,50).map(x=>String(x).slice(0,300)).join(', ').slice(0,3500):''}:message.field?{[String(message.field).slice(0,20)]:String(message.answer??message.artists?.join?.(', ')??'').slice(0,3500)}:Object.fromEntries(['anime','song','artist'].filter(f=>message.answers?.[f]!==undefined).map(f=>[f,String(message.answers[f]).slice(0,3500)]));
    const alreadyLocked=before.locked||state.teamFields&&before.field&&before.field===message.field&&message.field!=='artist';
    const accepted=!error&&!alreadyLocked;
    const final=accepted&&(state.teamFields&&message.type==='answer'||message.lock===true);
    const flags=final?decoyHits(state,player.answers,player.artists):[];
    this.add({...state,index:before.index,phase:before.phase},id,final?'submit':message.type==='artists'?'artist-edit':'answer-draft',{
      answers,accepted,locked:!!player?.locked,requestedRound:Number.isInteger(message.index)?message.index+1:null,
      elapsedMs:before.startsAt?at-before.startsAt:null,clientAt:Number.isFinite(message.clientAt)?message.clientAt:null,
      ...(error?{error:error.status?error.message:'Request failed.'}:alreadyLocked?{error:'Already locked; submission ignored.'}:{}),flags
    },at);
  }
  round(state,at=Date.now()){
    const row=state.history.at(-1);if(!row)return;
    for(const result of row.results){
      const player=state.players.find(p=>p.id===result.id);
      this.add(state,result.id,'round-result',{answers:result.answers,correct:result.correct,earned:result.earned,flags:decoyHits(state,result.answers,player?.artists)},at);
    }
  }
  page({before=Infinity,player=''}={}){
    const meta=[...this.sql.exec('SELECT data,expires FROM review_meta WHERE id=1')][0];
    if(!meta||meta.expires<=Date.now())return null;
    const rows=[...this.sql.exec('SELECT * FROM review_events WHERE seq<? '+(player?'AND player=? ':'')+'ORDER BY seq DESC LIMIT 101',Number(before)||Infinity,...(player?[String(player).slice(0,100)]:[]))];
    return {...JSON.parse(meta.data),expires:meta.expires,events:rows.slice(0,100).map(r=>({...r,data:JSON.parse(r.data)})),next:rows.length>100?rows[99].seq:null};
  }
}
