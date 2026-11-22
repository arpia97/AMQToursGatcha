import {ARENA_LOBBY_FORMAT, arenaRules, arenaPlayerCounts} from '../public/play-arena-config.js';
import {DUEL_LOBBY_FORMAT, duelRules, songArtistFields, lobbyCapacity, lobbyGameMode} from '../public/play-mode-rules.js';
import {arenaSongCount} from './play-arena.js';
import {fail} from './play-match-rules.js';
import {send} from './play-sockets.js';
import {retryDurableOperation} from './durable-recovery.js';
import {quizLibraryRequest} from './quiz-library-actor.js';

const poolKey=(settings,players)=>JSON.stringify([settings.format,players.map(p=>p.id)]);


export function lobbySettings(data){
  const {format}=data;
  const pool=data.pool??'random';
  if(!['random','watched'].includes(pool))fail('Choose Random or Watched.');
  const selection=pool==='watched'?{pool}:{};
  if(format===ARENA_LOBBY_FORMAT)return {format,seconds:arenaRules.guessSeconds,...selection};
  if(format==='lobby-ngmc')return {format,songs:35,seconds:20,...selection};
  const duel=format===DUEL_LOBBY_FORMAT;
  const songs=data.songs==null||data.songs===''?(duel?duelRules.songs:20):data.songs;
  const seconds=data.seconds??(duel?duelRules.guessSeconds:undefined);
  if(![DUEL_LOBBY_FORMAT,'lobby-team','lobby-ffa'].includes(format)||!Number.isInteger(songs)||songs<1||songs>100||
    !Number.isSafeInteger(seconds)||seconds<0||seconds>8e12)fail('Choose 1–100 songs and a positive guess time, or unlimited.');
  if (!duel && data.guessFields !== undefined) {
    const fields = data.guessFields;
    if (!Array.isArray(fields) || !fields.length || fields.some(field => !songArtistFields.includes(field)))
      fail('Select at least one of Anime, Song or Artist.');
    const guessFields = songArtistFields.filter(field => fields.includes(field));
    if (guessFields.length < songArtistFields.length) return {format,songs,seconds,...selection,guessFields};
  }
  return {format,songs,seconds,...selection};
}

async function passwordDigest(password,salt=crypto.randomUUID()){
  if(typeof password!=='string'||password.length>128)fail('Use at most 128 characters for the lobby password.');
  if(!password)return null;
  const enc=new TextEncoder();
  const key=await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveBits']);
  const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt:enc.encode(salt),hash:'SHA-256',iterations:100000},key,256);
  return salt+':'+btoa(String.fromCharCode(...new Uint8Array(bits)));
}

export class PlayLobbies {
  constructor(queue){
    this.queue=queue;
    this.watchedPools=new Map();
    this.sql=queue.ctx.storage.sql;
    this.sql.exec('CREATE TABLE IF NOT EXISTS play_lobbies(code TEXT PRIMARY KEY,settings TEXT,match TEXT)');
    if(!queue.rows('PRAGMA table_info(play_lobbies)').some(c=>c.name==='password_hash'))
      this.sql.exec('ALTER TABLE play_lobbies ADD COLUMN password_hash TEXT');
    this.sql.exec('CREATE TABLE IF NOT EXISTS lobby_members(player TEXT PRIMARY KEY,code TEXT,name TEXT,avatar TEXT,expires INTEGER)');
    if(!queue.rows('PRAGMA table_info(lobby_members)').some(c=>c.name==='last_match')){
      queue.ctx.storage.transactionSync(()=>{
        this.sql.exec('ALTER TABLE lobby_members ADD COLUMN last_match TEXT');
        this.sql.exec('UPDATE lobby_members SET last_match=(SELECT m.match FROM play_lobbies m WHERE m.code=lobby_members.code)');
      });
    }
    if(!queue.rows('PRAGMA table_info(lobby_members)').some(c=>c.name==='ready'))
      this.sql.exec('ALTER TABLE lobby_members ADD COLUMN ready INTEGER NOT NULL DEFAULT 0');
    this.sql.exec('CREATE INDEX IF NOT EXISTS lobby_roster ON lobby_members(code)');
    this.sql.exec(`CREATE TABLE IF NOT EXISTS lobby_chat(
      seq INTEGER PRIMARY KEY,code TEXT NOT NULL,player TEXT NOT NULL,name TEXT,body TEXT NOT NULL,at INTEGER NOT NULL
    )`);
    this.sql.exec('CREATE INDEX IF NOT EXISTS lobby_chat_room ON lobby_chat(code,seq)');
  }
  forPlayer(player){
    return this.queue.rows('SELECT l.*,m.last_match FROM play_lobbies l JOIN lobby_members m USING(code) WHERE m.player=?',player)[0];
  }
  readyRoster(code){return this.queue.rows('SELECT player AS id,name,avatar,ready FROM lobby_members WHERE code=? AND last_match IS NULL ORDER BY rowid',code);}
  roster(code){return this.queue.rows('SELECT player AS id,name,avatar FROM lobby_members WHERE code=? ORDER BY rowid',code);}
  directory(){
    return this.queue.rows(`SELECT l.code,json_extract(l.settings,'$.format') AS format,json_extract(l.settings,'$.pool') AS pool,
      l.password_hash IS NOT NULL AS locked,COUNT(*) AS players,
      (SELECT h.name FROM lobby_members h WHERE h.code=l.code AND h.last_match IS NULL ORDER BY h.rowid LIMIT 1) AS host
      FROM play_lobbies l JOIN lobby_members m ON l.code=m.code WHERE l.match IS NULL
      GROUP BY l.code HAVING host IS NOT NULL ORDER BY l.rowid DESC`);
  }
  status(row){
    if(row.last_match)return {type:row.match===row.last_match?'matched':'lobby-ended',match:row.last_match,code:row.code};
    const players=this.readyRoster(row.code).map(({id,name,avatar,ready})=>({id,name,avatar:JSON.parse(avatar),ready:!!ready}));
    const settings=JSON.parse(row.settings);
    if (settings.format===ARENA_LOBBY_FORMAT) {
      settings.songs=arenaPlayerCounts.includes(players.length)?arenaSongCount(players.length):null;
    }
    const check=this.watchedPools.get(row.code);
    const watchedPool=check?.key===poolKey(settings,players)?check.result:null;
    return {type:'lobby',code:row.code,busy:!!row.match,locked:!!row.password_hash,players,host:players[0]?.id,...settings,
      ...(settings.pool==='watched'?{watchedPool:watchedPool??null}:{})};
  }
  async refreshWatchedPool(code){
    if(!code)return;
    const row=this.queue.rows('SELECT * FROM play_lobbies WHERE code=?',code)[0];
    const settings=row&&JSON.parse(row.settings);
    if(settings?.pool!=='watched'){
      this.watchedPools.delete(code);
      return;
    }
    if(row.match)return;
    const players=this.readyRoster(code);
    if(!players.length)return;
    const key=poolKey(settings,players);
    const cached=this.watchedPools.get(code);
    const previous=cached?.key===key?cached:null;
    if(previous&&(previous.pending||previous.expires>Date.now()))return;
    const check={key,pending:true,result:previous?.result};
    this.watchedPools.set(code,check);
    try{
      const {env}=this.queue;
      const lists=await env.GAME.getByName('amqtours-economy-v1').watchedAnimeLists(players.map(p=>p.id));
      const count=await quizLibraryRequest(env,'/play-watched-count',{lists,ranked:settings.format==='lobby-ngmc'});
      check.result=Number.isInteger(count?.eligible)?{eligible:count.eligible}:{unavailable:true};
    }catch{
      check.result={unavailable:true};
    }
    check.pending=false;
    check.expires=Date.now()+20000;
    if(this.watchedPools.get(code)!==check)return;
    if(previous?.result?.eligible!==check.result.eligible||previous?.result?.unavailable!==check.result.unavailable)
      this.queue.broadcast();
  }
  heartbeat(id){this.sql.exec('UPDATE lobby_members SET expires=? WHERE player=?',Date.now()+90000,id);}
  appendChat(code,player,name,body){
    const row=this.sql.exec('INSERT INTO lobby_chat(code,player,name,body,at) VALUES(?,?,?,?,?) RETURNING *',
      code,player,name,body,Date.now()).one();
    this.sql.exec('DELETE FROM lobby_chat WHERE code=? AND seq IN (SELECT seq FROM lobby_chat WHERE code=? ORDER BY seq DESC LIMIT -1 OFFSET 80)',code,code);
    for(const member of this.readyRoster(code)){
      for(const socket of this.queue.ctx.getWebSockets(member.id)){
        if(socket.deserializeAttachment()?.expires>row.at)send(socket,{type:'lobby-chat',code,row});
      }
    }
  }
  chat(ws,who,message){
    const lobby=this.forPlayer(who.id);
    if(!lobby||lobby.last_match||message.code!==lobby.code)return;
    if(message.type==='lobby-chat-history'){
      const rows=this.queue.rows('SELECT seq,player,name,body,at FROM lobby_chat WHERE code=? ORDER BY seq',lobby.code);
      send(ws,{type:'lobby-chat-history',code:lobby.code,rows});return;
    }
    const body=typeof message.body==='string'?message.body.trim():'';
    if(!body||body.length>220)return;
    const recent=this.sql.exec('SELECT COUNT(*) AS n FROM lobby_chat WHERE code=? AND player=? AND at>?',lobby.code,who.id,Date.now()-2000).one().n;
    if(recent<4)this.appendChat(lobby.code,who.id,who.name,body);
    else send(ws,{type:'error',message:'Give the chat a moment before sending again.'});
  }
  async leave(id){
    const row=this.forPlayer(id);if(!row)return;
    const activeMatch=row.match===row.last_match?row.match:null;
    if(activeMatch)await this.queue.env.PLAY_MATCHES.getByName(activeMatch).depart(id,row.code);
    const leaving=this.queue.ctx.storage.transactionSync(()=>{
      const removed=this.sql.exec('DELETE FROM lobby_members WHERE player=? AND code=? RETURNING name',id,row.code).toArray()[0];
      if(!removed)return null;
      const others=this.queue.rows('SELECT DISTINCT last_match FROM lobby_members WHERE code=? AND last_match IS NOT NULL',row.code);
      const matches=new Set([row.last_match,...others.map(member=>member.last_match)]);
      matches.delete(null);matches.delete(activeMatch);
      const closed=this.sql.exec('DELETE FROM play_lobbies WHERE code=? AND NOT EXISTS(SELECT 1 FROM lobby_members WHERE code=?) RETURNING code',row.code,row.code).toArray().length;
      if(closed)this.sql.exec('DELETE FROM lobby_chat WHERE code=?',row.code);
      return {name:removed.name,matches,closed};
    });
    if(!leaving)return;
    if(!leaving.closed)this.appendChat(row.code,'',null,leaving.name+' left the lobby.');
    await Promise.allSettled([...leaving.matches].map(match=>retryDurableOperation(()=>
      this.queue.env.PLAY_MATCHES.getByName(match).depart(id,row.code))));
    this.queue.release(id,row.match||'');
    await this.refreshWatchedPool(row.code);
  }
  async action(who,message){
    const row=this.forPlayer(who.id);
    if(message.type==='lobby-return'){
      if(!row||row.last_match!==message.match||row.match===message.match)fail('This match is still active or the lobby has changed.');
      this.sql.exec('UPDATE lobby_members SET last_match=NULL,ready=0 WHERE player=?',who.id);
      return;
    }
    if(message.type==='lobby-leave'){await this.leave(who.id);return;}
    if(['lobby-create','lobby-join'].includes(message.type)){
      if(row||this.queue.status(who.id).type!=='idle')fail('Leave your current queue or lobby first.');
      let code,hash=null,settings;
      if(message.type==='lobby-create'){
        code=crypto.randomUUID().slice(0,8).toUpperCase();
        settings=lobbySettings(message);
        hash=await passwordDigest(message.password??'');
      }else{
        code=String(message.code).trim().toUpperCase();
        const room=this.queue.rows('SELECT match,password_hash,settings FROM play_lobbies WHERE code=?',code)[0];
        if(!room||room.match||this.roster(code).length>=lobbyCapacity(JSON.parse(room.settings).format))fail('Lobby is unavailable or full.');
        hash=room.password_hash;
        if(hash&&await passwordDigest(message.password??'',hash.split(':')[0])!==hash)fail('Incorrect lobby password.',403);
      }
      this.queue.ctx.storage.transactionSync(()=>{
        if(this.queue.status(who.id).type!=='idle')fail('Leave your current queue or lobby first.');
        if(settings)this.sql.exec('INSERT INTO play_lobbies(code,settings,password_hash) VALUES(?,?,?)',code,JSON.stringify(settings),hash);
        else{
          const current=this.queue.rows('SELECT match,password_hash,settings FROM play_lobbies WHERE code=?',code)[0];
          if(!current||current.match||current.password_hash!==hash||this.roster(code).length>=lobbyCapacity(JSON.parse(current.settings).format))fail('Lobby changed or is full. Try again.');
        }
        this.sql.exec('INSERT INTO lobby_members(player,code,name,avatar,expires) VALUES(?,?,?,?,?)',who.id,code,who.name,JSON.stringify(who.avatar||null),Date.now()+90000);
      });
      return;
    }
    if(!row||row.match||row.last_match)fail('Lobby is unavailable.');
    const players=this.readyRoster(row.code);
    if(message.type==='lobby-ready'){
      if(typeof message.ready!=='boolean')fail('Choose a ready status.');
      this.sql.exec('UPDATE lobby_members SET ready=? WHERE player=?',Number(message.ready),who.id);
      return;
    }
    if(players[0].id!==who.id)fail('Only the lobby host can do that.',403);
    if(message.type==='lobby-password'){
      const hash=await passwordDigest(message.password);
      const current=this.forPlayer(who.id);
      if(current?.code!==row.code||current.match||this.readyRoster(row.code)[0]?.id!==who.id)fail('Lobby host or match has changed.');
      this.sql.exec('UPDATE play_lobbies SET password_hash=? WHERE code=?',hash,row.code);
      return;
    }
    if(!['lobby-settings','lobby-start'].includes(message.type))fail('Unknown lobby action.');
    if(message.type==='lobby-settings'){
      if(lobbyGameMode(JSON.parse(row.settings).format)!==lobbyGameMode(message.format))fail('Choose a format for this game mode.');
      const settings=JSON.stringify(lobbySettings(message));
      if(settings!==row.settings)this.queue.ctx.storage.transactionSync(()=>{
        this.sql.exec('UPDATE play_lobbies SET settings=? WHERE code=?',settings,row.code);
        this.sql.exec('UPDATE lobby_members SET ready=0 WHERE code=? AND last_match IS NULL',row.code);
      });
      return;
    }
    if(!players.every(p=>p.id===who.id||p.ready))fail('Every player must be ready before starting.');
    const settings=JSON.parse(row.settings);
    if(settings.format==='lobby-ngmc'&&![6,8].includes(players.length))fail('NGMC needs 6 players for 3v3 or 8 for 4v4.');
    if(settings.format===DUEL_LOBBY_FORMAT&&players.length!==2)fail('1v1 needs two players.');
    if(settings.format===ARENA_LOBBY_FORMAT&&!arenaPlayerCounts.includes(players.length))
      fail('Arena needs 4, 8, 12 or 16 players.');
    const match=crypto.randomUUID(),now=Date.now(),roster=players.map(p=>({...p,avatar:JSON.parse(p.avatar)}));
    const pending={id:match,format:settings.format,players:JSON.stringify(roster),started:now};
    this.queue.ctx.storage.transactionSync(()=>{
      this.sql.exec('UPDATE play_lobbies SET match=? WHERE code=?',match,row.code);
      this.sql.exec('UPDATE lobby_members SET last_match=? WHERE code=? AND last_match IS NULL',match,row.code);
      this.sql.exec('INSERT INTO preparing(id,format,players,started) VALUES(?,?,?,?)',match,pending.format,pending.players,now);
      for(const p of roster)this.sql.exec('INSERT INTO recent VALUES(?,?,?)',p.id,match,now+86400000);
      this.sql.exec('INSERT INTO match_reviews VALUES(?,?,?,?,?)',match,now,settings.format,JSON.stringify(players.map(({id,name,ready})=>({id,name,ready:id===who.id||!!ready}))),'active');
    });
    await this.queue.prepare(pending);
  }
}
