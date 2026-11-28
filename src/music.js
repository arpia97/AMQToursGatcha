import {fail,integer,text} from './engine.js';
import {ownedSongs} from './songbook.js';

const DAY=86400000;
const MAX_TRACKS=250;

export function installMusic(e){
  e.run('CREATE TABLE IF NOT EXISTS music_lists(id TEXT PRIMARY KEY,player TEXT NOT NULL,name TEXT NOT NULL,tracks TEXT NOT NULL,rev INTEGER NOT NULL)');
  e.run('CREATE INDEX IF NOT EXISTS music_owner ON music_lists(player,name)');
  e.run('CREATE TABLE IF NOT EXISTS music_rooms(id TEXT PRIMARY KEY,host TEXT NOT NULL,state TEXT NOT NULL,rev INTEGER NOT NULL,expires INTEGER NOT NULL)');
  e.run('CREATE TABLE IF NOT EXISTS music_chat(room TEXT NOT NULL,seq INTEGER NOT NULL,player TEXT NOT NULL,name TEXT NOT NULL,body TEXT NOT NULL,at INTEGER NOT NULL,PRIMARY KEY(room,seq))');
  e.run('CREATE INDEX IF NOT EXISTS music_expiry ON music_rooms(expires)');
  // joined: 0 = invited, 1 = participating, 2 = left and may rejoin this room.
  e.run('CREATE TABLE IF NOT EXISTS music_guests(room TEXT NOT NULL,player TEXT NOT NULL,joined INTEGER NOT NULL,seen INTEGER NOT NULL,PRIMARY KEY(room,player))');
  e.run('CREATE INDEX IF NOT EXISTS music_invites ON music_guests(player,joined)');
  e.run('CREATE UNIQUE INDEX IF NOT EXISTS music_active_room ON music_guests(player) WHERE joined=1');
}
function closeRoom(e,id){
  e.run("DELETE FROM music_chat WHERE room=?",id);
  e.run('DELETE FROM music_guests WHERE room=?',id);
  e.run('DELETE FROM music_rooms WHERE id=?',id);
}
export function clearPlayerMusic(e,id){
  for(const r of e.all('SELECT id FROM music_rooms WHERE host=?',id))closeRoom(e,r.id);
  e.run('DELETE FROM music_guests WHERE player=?',id);
  e.run('DELETE FROM music_lists WHERE player=?',id);
}
function playlist(e,player,id){
  const r=e.one('SELECT * FROM music_lists WHERE id=? AND player=?',text(id,100),player);
  if(!r)fail('Playlist not found.',404);
  return {...r,tracks:JSON.parse(r.tracks)};
}
function recordings(e,player,ids){
  const byId=new Map(ownedSongs(e,player,ids).map(r=>[r.id,r]));
  return ids.map(id=>{if(!byId.has(id))fail('Choose a song in your songbook.',404);return byId.get(id);});
}
function lists(e,player){
  return e.all('SELECT id,name,rev,json_array_length(tracks) AS count FROM music_lists WHERE player=? ORDER BY name COLLATE NOCASE,id',player);
}
function membership(e,player){
  return e.one('SELECT room FROM music_guests WHERE player=? AND joined=1',player)?.room;
}
function expire(e){
  for(const r of e.all('SELECT id FROM music_rooms WHERE expires<=?',e.now()))closeRoom(e,r.id);
}
function roomRow(e,id){
  const r=e.one('SELECT * FROM music_rooms WHERE id=?',id);
  if(!r||r.expires<=e.now())fail('This Jam Party has ended.',404);
  return {...r,state:JSON.parse(r.state)};
}
function save(e,r){
  r.rev++;
  e.run('UPDATE music_rooms SET state=?,rev=?,expires=?,host=? WHERE id=?',JSON.stringify(r.state),r.rev,e.now()+DAY,r.host,r.id);
}
function skip(s,now){
  s.queue.shift();
  s.since=s.queue.length && s.since!==null?now:null;
  s.position=0;s.duration=null;s.votes=[];
}
function position(s,now){
  return s.position+(s.since===null?0:Math.max(0,now-s.since)/1000);
}
function sync(e,r){
  const s=r.state;
  if(s.duration!==null&&s.since!==null&&position(s,e.now())>=s.duration){
    skip(s,e.now());save(e,r);
  }
}
function participants(e,id){
  return e.all('SELECT g.player AS id,coalesce(p.display_name,p.name) AS name,p.avatar_card,p.avatar_crop,(SELECT level FROM inventory WHERE player=p.id AND card=p.avatar_card) AS avatar_level,g.seen FROM music_guests g JOIN players p ON p.id=g.player WHERE room=? AND joined=1 ORDER BY g.rowid',id);
}
function roomView(e,player,row,revision){
  const id=row.id,r={...row,state:JSON.parse(row.state)};
  const now=e.now();
  if(row.seen<now-30000)e.run('UPDATE music_guests SET seen=? WHERE player=? AND room=?',now,player,id);
  // New members arrive with a fresh heartbeat. Until the oldest known
  // heartbeat can expire, an unchanged room needs no roster scan.
  const checks=e.musicPresenceChecks??=new Map();
  let stale=false;
  if(now>=(checks.get(id)??0)){
    const oldest=e.one('SELECT MIN(seen) AS seen FROM music_guests WHERE room=? AND joined=1',id).seen;
    stale=oldest<now-180000;
    if(checks.size>=512)checks.delete(checks.keys().next().value);
    if(stale)checks.delete(id);
    else checks.set(id,oldest+180001);
  }
  if(stale){
    e.run('UPDATE music_guests SET joined=2 WHERE room=? AND joined=1 AND seen<?',id,now-180000);
    const members=participants(e,id);
    if(!members.some(m=>m.id===r.host))r.host=members[0].id;
    r.state.votes=r.state.votes.filter(v=>members.some(m=>m.id===v));
    if(r.state.votes.length>members.length/2)skip(r.state,now);
    save(e,r);
  }
  sync(e,r);
  if(revision===r.rev)return {id,rev:r.rev,now};
  const members=participants(e,id);
  const cards=e.catalogStore.cards([...new Set(members.map(p=>p.avatar_card).filter(Boolean))]);
  return {id,rev:r.rev,now,host:r.host,cards,members:members.map(({seen,...p})=>p),...r.state};
}
export function musicRead(e,player,params){
  e.assertAccountUnlocked(player);
  const view=params.get('view');
  if(view==='playlist'){
    const list=playlist(e,player,params.get('id'));
    return {...list,tracks:recordings(e,player,list.tracks)};
  }
  if(view==='room'){
    return e.tx(()=>{
      const current=e.one('SELECT r.*,g.seen FROM music_guests g JOIN music_rooms r ON r.id=g.room WHERE g.player=? AND g.joined=1',player);
      if(!current)return {room:null};
      const id=current.id;
      if(current.expires<=e.now()){closeRoom(e,id);return {room:null};}
      const room=roomView(e,player,current,Number(params.get('rev')||-1));
      if(!params.has('chatRoom'))return {room};
      const after=params.get('chatRoom')===id?Number(params.get('after'))||0:0;
      const chat=e.all('SELECT seq,player,name,body,at FROM music_chat WHERE room=? AND seq>? ORDER BY seq',id,after);
      return {room,chat};
    });
  }
  const id=membership(e,player);
  const invites=e.all('SELECT r.id,coalesce(p.display_name,p.name) AS host,g.joined=2 AS "returning" FROM music_guests g JOIN music_rooms r ON g.room=r.id JOIN players p ON p.id=r.host WHERE g.player=? AND g.joined IN (0,2) AND r.expires>? ORDER BY g.seen DESC',player,e.now());
  return {...(view==='invites'?{}:{lists:lists(e,player)}),invites,room:id&&e.one('SELECT id FROM music_rooms WHERE id=? AND expires>?',id,e.now())?id:null};
}
function trackEntry(track,player,name){
  return {key:crypto.randomUUID(),title:track.title,artist:track.artist,audio:track.audio,posterIds:(track.anime||[]).map(entry=>entry.mal),by:player,name};
}
// Caller supplies the Game transaction and idempotency receipt.
export function musicAction(e,player,b){
  e.assertAccountUnlocked(player);
  const op=b.op;
  if(op==='create-list'){
    const id=crypto.randomUUID(),name=text(b.name,80);
    const tracks=b.track==null?[]:recordings(e,player,[integer(b.track,1)]).map(s=>s.id);
    e.run('INSERT INTO music_lists VALUES(?,?,?,?,1)',id,player,name,JSON.stringify(tracks));
    return {id};
  }
  if(['rename','delete-list','add','remove','reorder'].includes(op)){
    const l=playlist(e,player,b.list);
    if(op!=='add'&&l.rev!==b.rev)fail('Your playlist changed. Reopen it and try again.',409);
    if(op==='delete-list'){e.run('DELETE FROM music_lists WHERE id=?',l.id);return {};}
    if(op==='rename')l.name=text(b.name,80);
    if(op==='add'){
      const [song]=recordings(e,player,[integer(b.track,1)]);
      if(l.tracks.includes(song.id))fail('That song is already in this playlist.');
      if(l.tracks.length>=MAX_TRACKS)fail('This playlist is full.');
      l.tracks.push(song.id);
    }
    if(op==='remove')l.tracks.splice(integer(b.from,0,l.tracks.length-1),1);
    if(op==='reorder'){
      const from=integer(b.from,0,l.tracks.length-1),to=integer(b.to,0,l.tracks.length-1);
      l.tracks.splice(to,0,l.tracks.splice(from,1)[0]);
    }
    e.run('UPDATE music_lists SET tracks=?,name=?,rev=rev+1 WHERE id=?',JSON.stringify(l.tracks),l.name,l.id);
    return {id:l.id};
  }
  expire(e);
  const active=membership(e,player),now=e.now();
  const user=e.player(player),name=user.display_name||user.name;
  if(op==='start'){
    if(active)fail('Leave your current party first.',409);
    const list=playlist(e,player,b.list),queue=recordings(e,player,list.tracks).map(s=>trackEntry(s,player,name));
    if(!queue.length)fail('Add a song before starting a party.');
    const id=crypto.randomUUID();
    e.run('INSERT INTO music_rooms VALUES(?,?,?,1,?)',id,player,JSON.stringify({name:list.name,queue,position:0,since:now,duration:null,votes:[]}),now+DAY);
    e.run('INSERT INTO music_guests VALUES(?,?,1,?)',id,player,now);
    return {id};
  }
  const id=text(b.room,100),r=roomRow(e,id);
  if(op==='join'||op==='decline'){
    const invitation=e.one('SELECT joined FROM music_guests WHERE room=? AND player=?',id,player);
    const rejoining=op==='join'&&invitation?.joined===2;
    if(invitation?.joined!==0&&!rejoining)fail('An invitation is required.',403);
    if(op==='decline'){e.run('DELETE FROM music_guests WHERE room=? AND player=?',id,player);return {};}
    if(active)fail('Leave your current party first.',409);
    e.run('UPDATE music_guests SET joined=1,seen=? WHERE room=? AND player=?',now,id,player);
    save(e,r);return {id};
  }
  if(active!==id)fail('Join the party first.',403);
  if(op==='chat'){
    const body=text(b.body,220);
    const last=e.one('SELECT seq FROM music_chat WHERE room=? ORDER BY seq DESC LIMIT 1',id);
    const seq=(last?.seq||0)+1;
    e.run('INSERT INTO music_chat VALUES(?,?,?,?,?,?)',id,seq,player,name,body,now);
    if(seq>80)e.run('DELETE FROM music_chat WHERE room=? AND seq<=?',id,seq-80);
    return {seq};
  }
  sync(e,r);
  const s=r.state;
  if(op==='leave'){
    e.run('UPDATE music_guests SET joined=2,seen=? WHERE room=? AND player=?',now,id,player);
    const rest=participants(e,id);
    if(!rest.length){closeRoom(e,id);return {};}
    if(r.host===player)r.host=rest[0].id;
    s.votes=s.votes.filter(p=>p!==player);
    if(s.votes.length>rest.length/2)skip(s,now);
  }else if(op==='invite'){
    if(r.host!==player)fail('Only the host can invite friends.',403);
    const target=text(b.friend,100);
    if(!e.one('SELECT 1 FROM player_friends WHERE player=? AND friend=?',player,target))fail('Choose someone from your friends list.',403);
    if(e.one('SELECT 1 FROM music_guests WHERE room=? AND player=?',id,target))fail('Already invited or in this party.');
    e.run('INSERT INTO music_guests VALUES(?,?,0,?)',id,target,now);
    e.economy.notices.add(target,'jam:'+id+':'+target+':'+now,'jam-invite','',1,0,{byName:name});
  }else if(op==='queue'){
    if(s.queue.length>=MAX_TRACKS)fail('The party queue is full.');
    const [song]=recordings(e,player,[integer(b.track,1)]);
    s.queue.push(trackEntry(song,player,name));
    if(s.queue.length===1)s.since=now;
  }else{
    if(!s.queue.length||b.entry!==s.queue[0].key)fail('The song has changed.',409);
    if(op==='vote'){
      if(!s.votes.includes(player))s.votes.push(player);
      if(s.votes.length>participants(e,id).length/2)skip(s,now);
    }else{
      if(r.host!==player)fail('Only the host controls playback.',403);
      if(op==='next')skip(s,now);
      else if(op==='pause'){s.position=position(s,now);s.since=null;}
      else if(op==='play'&&s.since===null)s.since=now;
      else if(op==='duration'&&s.duration===null&&Number.isFinite(b.seconds)&&b.seconds>0&&b.seconds<86400)s.duration=b.seconds;
      else if(op==='seek'&&Number.isFinite(b.seconds)&&b.seconds>=0&&b.seconds<=(s.duration??86400)){s.position=b.seconds;if(s.since!==null)s.since=now;}
      else if(op!=='play'&&op!=='duration')fail('Invalid playback control.');
    }
  }
  save(e,r);return {id};
}
