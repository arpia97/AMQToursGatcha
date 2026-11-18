import {RankedLeaves} from './ngmc-leaves.js';
import {RANKED_LEAVE_COST} from '../public/ngmc-leave-policy.js';
import {PlayLobbies} from './play-lobbies.js';
import { PLAY_AUDIO_PROTOCOL } from '../public/play-audio-format.js';
import {loadTourRate} from './play-tour-rate.js';
import { ngmcRatings } from './ngmc-ratings.js';
import { DurableObject } from 'cloudflare:workers';
import { PLAY_FORMATS,fail } from './play-match-rules.js';
import {accept,identity,receive,send,socketError,closeSocket} from './play-sockets.js';
// Only matchmaking lives here; every match has its own isolated actor.
export class PlayQueue extends DurableObject {
  constructor(ctx,env){super(ctx,env);this.ctx=ctx;this.env=env;
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS queue(player TEXT PRIMARY KEY,name TEXT,format TEXT,joined INTEGER,expires INTEGER,match TEXT)');
    ctx.storage.sql.exec('CREATE INDEX IF NOT EXISTS queue_format ON queue(format,match,joined)');
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS preparing(id TEXT PRIMARY KEY,format TEXT,players TEXT,started INTEGER)');
    if(![...ctx.storage.sql.exec('PRAGMA table_info(queue)')].some(c=>c.name==='avatar'))ctx.storage.sql.exec('ALTER TABLE queue ADD COLUMN avatar TEXT');
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS song_ratings(format TEXT, player TEXT, name TEXT, rating REAL, correct INTEGER, seen INTEGER, matches INTEGER, PRIMARY KEY(format,player))');
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS song_results(id TEXT PRIMARY KEY, data TEXT NOT NULL)');
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS play_names(player TEXT PRIMARY KEY,name TEXT NOT NULL)');
    this.rankedLeaves=new RankedLeaves(ctx.storage);
    this.lobbies=new PlayLobbies(this);
    this.joinRequests=new Map();this.ratingRequests=new Map();
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS ngmc_players(player TEXT PRIMARY KEY,elo REAL NOT NULL DEFAULT 1000,correct INTEGER NOT NULL DEFAULT 0,seen INTEGER NOT NULL DEFAULT 0,matches INTEGER NOT NULL DEFAULT 0,seed_rate REAL)');
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS ngmc_results(id TEXT PRIMARY KEY,data TEXT NOT NULL,created INTEGER NOT NULL)');
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS recent(player TEXT,match TEXT,expires INTEGER,PRIMARY KEY(player,match))');
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS match_reviews(id TEXT PRIMARY KEY,created INTEGER NOT NULL,format TEXT NOT NULL,players TEXT NOT NULL,status TEXT NOT NULL)');
    ctx.storage.sql.exec('CREATE INDEX IF NOT EXISTS match_reviews_created ON match_reviews(created)');
  }
  rows(sql,...args){return [...this.ctx.storage.sql.exec(sql,...args)];}
  status(player){const lobby=this.lobbies.forPlayer(player);if(lobby)return this.lobbies.status(lobby);const row=this.rows('SELECT * FROM queue WHERE player=?',player)[0];if(!row&&this.joinRequests.has(player))return {type:'joining',format:'ngmc-ranked'};return row?.match?{type:'matched',match:row.match}:row?{type:'queued',format:row.format,waiting:this.rows('SELECT COUNT(*) AS n FROM queue WHERE format=? AND match IS NULL AND expires>?',row.format,Date.now())[0].n,needed:PLAY_FORMATS[row.format].size}:{type:'idle'};}
  broadcast(){for(const ws of this.ctx.getWebSockets()){const who=ws.deserializeAttachment();if(who.expires<=Date.now())ws.close(4003,'Session expired.');else send(ws,this.status(who.id));}}
  canAccess(player,id){return this.lobbies.forPlayer(player)?.last_match===id||!!this.rows('SELECT 1 FROM recent WHERE player=? AND match=? AND expires>?',player,id,Date.now())[0];}
  hasReview(id){return !!this.rows('SELECT 1 FROM match_reviews WHERE id=?',id)[0];}
  reviews({before=Date.now()+1,search=''}={}){
    const query=String(search).slice(0,100).replace(/[\\%_]/g,'\\$&');
    const rows=this.rows("SELECT * FROM match_reviews WHERE created<? AND (players LIKE ? ESCAPE '\\' OR id=?) ORDER BY created DESC LIMIT 51",Number(before)||Date.now()+1,'%'+query+'%',search);
    return {matches:rows.slice(0,50).map(r=>({...r,players:JSON.parse(r.players)})),next:rows.length>50?rows[49].created:null};
  }
  release(player,id){this.ctx.storage.sql.exec('DELETE FROM queue WHERE player=? AND match=?',player,id);this.broadcast();}
  loadTourRate(player){return loadTourRate(player);}
  async rating(player){
    let row=this.rows('SELECT * FROM ngmc_players WHERE player=?',player)[0];
    if(!row){
      if(!this.ratingRequests.has(player))this.ratingRequests.set(player,(async()=>{const seed=await this.loadTourRate(player);this.ctx.storage.sql.exec('INSERT OR IGNORE INTO ngmc_players(player,seed_rate) VALUES(?,?)',player,seed);})().finally(()=>this.ratingRequests.delete(player)));
      await this.ratingRequests.get(player);row=this.rows('SELECT * FROM ngmc_players WHERE player=?',player)[0];
    }
    return {elo:row.elo,guessRate:row.seen?100*row.correct/row.seen:row.seed_rate};
  }
  recordRankedLeave(match,player,at){
    const receipt=this.rankedLeaves.record(match,player,at);
    if(receipt){
      for(const ws of this.ctx.getWebSockets(player))send(ws,{type:'ranked-departure',...receipt});
      this.broadcast();
    }
  }
  settle(id,result){
    const saved=this.rows('SELECT data FROM ngmc_results WHERE id=?',id)[0];if(saved)return JSON.parse(saved.data);
    const departed=new Set();
    for(const p of result.players)if(p.rankedLeftAt!=null){
      this.recordRankedLeave(id,p.id,p.rankedLeftAt);departed.add(p.id);
    }
    if(!result?.history?.length)return [];
    const ratings=ngmcRatings(result.players,result.history);
    this.ctx.storage.transactionSync(()=>{
      for(const r of ratings){
        const forfeited=departed.has(r.id);
        if(forfeited){r.delta=-RANKED_LEAVE_COST;r.after=r.before+r.delta;r.forfeited=true;}
        this.ctx.storage.sql.exec('UPDATE ngmc_players SET elo=elo+?,correct=correct+?,seen=seen+?,matches=matches+1 WHERE player=?',forfeited?0:r.delta,r.correct,r.seen,r.id);
      }
      this.ctx.storage.sql.exec('INSERT INTO ngmc_results VALUES(?,?,?)',id,JSON.stringify(ratings),Date.now());
    });
    return ratings;
  }
  settleSongs(id,result){
    const saved=this.rows('SELECT data FROM song_results WHERE id=?',id)[0];
    if(saved)return JSON.parse(saved.data);
    if(!result.history.length)return [];
    const {format,history}=result;
    const players=result.players.map(player=>({...player,elo:this.rows(
      'SELECT rating FROM song_ratings WHERE format=? AND player=?',format,player.id)[0]?.rating??1000}));
    const ratings=ngmcRatings(players,history);
    this.ctx.storage.transactionSync(()=>{
      for(const r of ratings){
        const player=players.find(p=>p.id===r.id);
        this.ctx.storage.sql.exec(
          `INSERT INTO song_ratings VALUES(?,?,?,?,?,?,1) ON CONFLICT(format,player) DO UPDATE SET
           name=excluded.name,rating=excluded.rating,correct=correct+excluded.correct,
           seen=seen+excluded.seen,matches=matches+1`,format,r.id,player.name,r.after,r.correct,r.seen*(format==='1v1'?3:1));
      }
      this.ctx.storage.sql.exec('INSERT INTO song_results VALUES(?,?)',id,JSON.stringify(ratings));
    });
    return ratings;
  }
  rankings(format,page){
    const offset=page*50;
    const rows=format.startsWith('ngmc-')?this.rows(
      `SELECT coalesce(n.name,(SELECT json_extract(j.value,'$.name') FROM match_reviews m,json_each(m.players) j
        WHERE m.format='ngmc-ranked' AND json_extract(j.value,'$.id')=p.player ORDER BY m.created DESC LIMIT 1),p.player) AS name,
        elo AS rating,correct,seen,matches FROM ngmc_players p LEFT JOIN play_names n ON n.player=p.player
        WHERE matches>0 ORDER BY elo DESC,correct DESC,p.player LIMIT 51 OFFSET ?`,offset)
      :this.rows('SELECT name,rating,correct,seen,matches FROM song_ratings WHERE format=? ORDER BY rating DESC,correct DESC,player LIMIT 51 OFFSET ?',format,offset);
    return {rows:rows.slice(0,50),more:rows.length>50};
  }
  async complete(id,result=null,status='cancelled'){const ratings=result?.format==='ngmc-3v3'||result?.format?.startsWith('lobby-')?null:result?.mode==='ngmc-ranked'?this.settle(id,result):result&&status==='finished'?this.settleSongs(id,result):null;this.ctx.storage.sql.exec('UPDATE play_lobbies SET match=NULL WHERE match=?',id);this.ctx.storage.sql.exec('UPDATE match_reviews SET status=? WHERE id=?',status,id);this.ctx.storage.sql.exec('DELETE FROM queue WHERE match=?',id);this.ctx.storage.sql.exec('DELETE FROM preparing WHERE id=?',id);this.broadcast();return ratings;}
  async prepare(row){
    try{
      const players=JSON.parse(row.players),match=this.env.PLAY_MATCHES.getByName(row.id);
      const custom=row.format.startsWith('lobby-');
      const lobby=custom&&this.rows('SELECT * FROM play_lobbies WHERE match=?',row.id)[0];
      if(custom&&!lobby){await this.complete(row.id);return;}
      await match.initialize(row.id,row.format,players,lobby?{code:lobby.code,...JSON.parse(lobby.settings)}:null);
      if(lobby){
        const remaining=this.lobbies.roster(lobby.code);
        for(const p of players)if(!remaining.some(m=>m.id===p.id))await match.depart(p.id);
      }
      this.ctx.storage.sql.exec('DELETE FROM preparing WHERE id=?',row.id);this.broadcast();
    }
    catch {if(Date.now()-row.started>180000){for(const p of JSON.parse(row.players))for(const ws of this.ctx.getWebSockets(p.id))send(ws,{type:'error',message:'Song loading failed. Please queue again.'});await this.complete(row.id);}}
  }
  async match(format){
    const now=Date.now(),size=PLAY_FORMATS[format].size;
    let rows;
    if(format==='ngmc-3v3'){
      const anchor=this.rows(`SELECT p.elo,q.joined FROM queue q JOIN ngmc_players p ON p.player=q.player
        WHERE q.format=? AND q.match IS NULL AND q.expires>? ORDER BY q.joined,q.player LIMIT 1`,format,now)[0];
      if(!anchor)return;
      const wait=now-anchor.joined;
      const spread=wait>=120000?1e12:200+wait/100;
      rows=this.rows(`SELECT q.* FROM queue q JOIN ngmc_players p ON p.player=q.player
        WHERE q.format=? AND q.match IS NULL AND q.expires>? AND abs(p.elo-?)<=?
        ORDER BY abs(p.elo-?),q.joined,q.player LIMIT ?`,format,now,anchor.elo,spread,anchor.elo,size);
    }else{
      rows=this.rows('SELECT * FROM queue WHERE format=? AND match IS NULL AND expires>? ORDER BY joined,player LIMIT ?',format,now,size);
    }
    if(rows.length!==PLAY_FORMATS[format].size)return;
    const id=crypto.randomUUID(),players=rows.map(row=>{const rating=format.startsWith('ngmc-')?this.rows('SELECT * FROM ngmc_players WHERE player=?',row.player)[0]:null;return {id:row.player,name:row.name,avatar:row.avatar?JSON.parse(row.avatar):null,...(rating?{elo:rating.elo,guessRate:rating.seen?100*rating.correct/rating.seen:rating.seed_rate}:{})};});
    this.ctx.storage.transactionSync(()=>{for(const row of rows){this.ctx.storage.sql.exec('INSERT OR REPLACE INTO play_names VALUES(?,?)',row.player,row.name);this.ctx.storage.sql.exec('UPDATE queue SET match=?,expires=? WHERE player=?',id,Date.now()+(format==='ngmc-ranked'?7200000:3600000),row.player);this.ctx.storage.sql.exec('INSERT INTO recent VALUES(?,?,?)',row.player,id,Date.now()+86400000);}this.ctx.storage.sql.exec('INSERT INTO preparing VALUES(?,?,?,?)',id,format,JSON.stringify(players),Date.now());});
    this.ctx.storage.sql.exec('INSERT OR IGNORE INTO match_reviews VALUES(?,?,?,?,?)',id,Date.now(),format,JSON.stringify(players.map(({id,name})=>({id,name}))),'active');
    await this.prepare({id,format,players:JSON.stringify(players),started:Date.now()});
  }
  async fetch(request){try{if(request.headers.get('Upgrade')?.toLowerCase()!=='websocket')return new Response('WebSocket required',{status:426});const who=identity(request);const {server,response}=accept(this.ctx,who);send(server,this.status(who.id));await this.ctx.storage.setAlarm(Date.now()+30000);return response;}catch(error){return Response.json({error:error.status?error.message:'Unable to join queue.'},{status:error.status||503});}}
  async webSocketMessage(ws,raw){try{const input=receive(ws,raw);if(!input)return;const {who,message}=input;
    if(typeof message.type==='string'&&message.type.startsWith('lobby-')){
      if(who.protocol!==PLAY_AUDIO_PROTOCOL)fail('Refresh Play to use lobbies.');
      await this.lobbies.action(who,message);this.broadcast();
    }else if(message.type==='join'){
      if(this.lobbies.forPlayer(who.id))fail('Leave your lobby first.');
      if(who.protocol!==PLAY_AUDIO_PROTOCOL)fail('Refresh Play to load the updated match player.',409);
      if(!Object.hasOwn(PLAY_FORMATS,message.format)||(message.format.startsWith('ngmc-')?message.mode!=='ngmc-ranked':message.mode!=='song-artist'))fail('Choose a valid match format.');
      const token=crypto.randomUUID();this.joinRequests.set(who.id,token);
      if(message.format.startsWith('ngmc-')){send(ws,{type:'joining',format:message.format});try{await this.rating(who.id);}catch(error){if(this.joinRequests.get(who.id)!==token)return;this.joinRequests.delete(who.id);send(ws,this.status(who.id));throw error;}}
      if(this.joinRequests.get(who.id)!==token)return;
      this.joinRequests.delete(who.id);if(ws.readyState!==1)return;
      if(message.format==='ngmc-ranked'){
        const until=this.rankedLeaves.banUntil(who.id);
        if(until>Date.now()){
          send(ws,this.status(who.id));
          fail('NGMC Ranked is locked until '+new Date(until).toUTCString()+' after three active leaves.',403);
        }
      }
      const old=this.rows('SELECT * FROM queue WHERE player=?',who.id)[0];
      if(old?.match){send(ws,this.status(who.id));return;}
      this.ctx.storage.sql.exec('INSERT OR REPLACE INTO queue(player,name,format,joined,expires,match,avatar) VALUES(?,?,?,?,?,NULL,?)',who.id,who.name,message.format,old?.format===message.format?old.joined:Date.now(),Date.now()+60000,JSON.stringify(who.avatar||null));
      this.broadcast();await this.match(message.format);
    }else if(message.type==='cancel'){this.joinRequests.delete(who.id);this.ctx.storage.sql.exec('DELETE FROM queue WHERE player=? AND match IS NULL',who.id);this.broadcast();}
    else if(message.type==='ping'){this.lobbies.heartbeat(who.id);this.ctx.storage.sql.exec('UPDATE queue SET expires=? WHERE player=? AND match IS NULL',Date.now()+60000,who.id);send(ws,this.status(who.id));}
    else fail('Unknown queue action.');
    await this.ctx.storage.setAlarm(Date.now()+30000);
  }catch(error){if(!error.status)console.error('Play queue action failed',{name:error.name,message:String(error.message).slice(0,200)});socketError(ws,error);}}
  webSocketClose(ws,code,reason){closeSocket(ws,code,reason);/* A short lease lets refresh/reconnect retain queue position. */}
  webSocketError(ws){ws.close(1011,'Reconnect to resume.');}
  async alarm(){
    this.ctx.storage.sql.exec('DELETE FROM queue WHERE expires<?',Date.now());
    this.ctx.storage.sql.exec('DELETE FROM recent WHERE expires<?',Date.now());
    for(const m of this.rows('SELECT player FROM lobby_members WHERE expires<?',Date.now()))await this.lobbies.leave(m.player);
    for(const row of this.rows('SELECT * FROM preparing'))await this.prepare(row);
    for(const format of Object.keys(PLAY_FORMATS))await this.match(format);
    this.broadcast();
    if(this.rows('SELECT 1 FROM lobby_members LIMIT 1').length||this.rows('SELECT COUNT(*) AS n FROM queue')[0].n||this.ctx.getWebSockets().length)await this.ctx.storage.setAlarm(Date.now()+30000);
    else {const next=this.rows('SELECT MIN(expires) AS at FROM recent')[0]?.at;if(next)await this.ctx.storage.setAlarm(next);}
  }
}
