import {playPools, poolFormat} from '../public/play-pool.js';
import {DUEL_FORMAT, queueMode} from '../public/play-mode-rules.js';
import {duelRatings} from './play-duel-ratings.js';
import {ARENA_FORMAT, ARENA_LOBBY_FORMAT, arenaRules} from '../public/play-arena-config.js';
import {arenaBatch} from './play-arena.js';
import {playRankingPage} from './play-ranking-query.js';
import {PlayRecords} from './play-records.js';
import {RankedLeaves, ngmcTable} from './ngmc-leaves.js';
import {RANKED_LEAVE_COST,songRatingPools} from '../public/ngmc-leave-policy.js';
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
    for(const table of ['queue','preparing']){
      if(!ctx.storage.sql.exec('PRAGMA table_info('+table+')').toArray().some(c=>c.name==='pool'))
        ctx.storage.sql.exec("ALTER TABLE "+table+" ADD COLUMN pool TEXT NOT NULL DEFAULT 'random'");
    }
    ctx.storage.sql.exec('CREATE INDEX IF NOT EXISTS queue_song_pool ON queue(format,pool,match,joined)');
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS song_ratings(format TEXT, player TEXT, name TEXT, rating REAL, correct INTEGER, seen INTEGER, matches INTEGER, PRIMARY KEY(format,player))');
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS song_results(id TEXT PRIMARY KEY, data TEXT NOT NULL)');
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS play_names(player TEXT PRIMARY KEY,name TEXT NOT NULL)');
    this.rankedLeaves=new RankedLeaves(ctx.storage);
    this.lobbies=new PlayLobbies(this);
    this.joinRequests=new Map();this.ratingRequests=new Map();
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS ngmc_players(player TEXT PRIMARY KEY,elo REAL NOT NULL DEFAULT 1000,correct INTEGER NOT NULL DEFAULT 0,seen INTEGER NOT NULL DEFAULT 0,matches INTEGER NOT NULL DEFAULT 0,seed_rate REAL)');
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS ngmc_watched_players(player TEXT PRIMARY KEY,elo REAL NOT NULL DEFAULT 1000,correct INTEGER NOT NULL DEFAULT 0,seen INTEGER NOT NULL DEFAULT 0,matches INTEGER NOT NULL DEFAULT 0,seed_rate REAL)');
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS ngmc_results(id TEXT PRIMARY KEY,data TEXT NOT NULL,created INTEGER NOT NULL)');
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS recent(player TEXT,match TEXT,expires INTEGER,PRIMARY KEY(player,match))');
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS match_reviews(id TEXT PRIMARY KEY,created INTEGER NOT NULL,format TEXT NOT NULL,players TEXT NOT NULL,status TEXT NOT NULL)');
    ctx.storage.sql.exec('CREATE INDEX IF NOT EXISTS match_reviews_created ON match_reviews(created)');
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS match_flag_counts(id TEXT PRIMARY KEY,total INTEGER NOT NULL)');
    this.records=new PlayRecords(this);
  }
  rows(sql,...args){return [...this.ctx.storage.sql.exec(sql,...args)];}
  queueCounts(){
    const rows=this.rows('SELECT format,pool,COUNT(*) AS waiting FROM queue WHERE match IS NULL AND expires>? GROUP BY format,pool',Date.now());
    return Object.fromEntries(rows.map(row=>[poolFormat(row.format,row.pool),row.waiting]));
  }
  lobbyDirectory(){return this.lobbies.directory();}
  clientStatus(player,counts,directory){
    const status=this.status(player,counts);
    if(status.type==='idle')status.lobbies=directory||this.lobbyDirectory();
    return status;
  }
  status(player,counts){
    const lobby=this.lobbies.forPlayer(player);
    if(lobby)return this.lobbies.status(lobby);
    const row=this.rows('SELECT * FROM queue WHERE player=?',player)[0];
    if(row?.match)return {type:'matched',match:row.match,format:row.format,pool:row.pool};
    counts??=this.queueCounts();
    const pending=this.joinRequests.get(player);
    if(!row&&pending)return {type:'joining',format:pending.format,pool:pending.pool,counts};
    return row?{type:'queued',format:row.format,pool:row.pool,waiting:counts[poolFormat(row.format,row.pool)]||0,needed:PLAY_FORMATS[row.format].size,counts}:{type:'idle',counts};
  }
  broadcast(){
    const counts=this.queueCounts(),directory=this.lobbyDirectory();
    for(const ws of this.ctx.getWebSockets()){
      const who=ws.deserializeAttachment();
      if(who.expires<=Date.now())ws.close(4003,'Session expired.');
      else send(ws,this.clientStatus(who.id,counts,directory));
    }
  }
  canAccess(player,id){return this.lobbies.forPlayer(player)?.last_match===id||!!this.rows('SELECT 1 FROM recent WHERE player=? AND match=? AND expires>?',player,id,Date.now())[0];}
  hasReview(id){return !!this.rows('SELECT 1 FROM match_reviews WHERE id=?',id)[0];}
  indexHighlights(id,count){
    this.ctx.storage.sql.exec('INSERT INTO match_flag_counts VALUES(?,?) ON CONFLICT(id) DO UPDATE SET total=MAX(total,excluded.total)',id,count);
  }
  reviews({before=Date.now()+1,search='',flagged=''}={}){
    const query=String(search).slice(0,100).replace(/[\\%_]/g,'\\$&');
    const rows=this.rows("SELECT m.*,COALESCE(f.total,0) AS flags FROM match_reviews m "+(flagged==='1'?'JOIN':'LEFT JOIN')+" match_flag_counts f ON f.id=m.id WHERE created<? AND (players LIKE ? ESCAPE '\\' OR m.id=?) ORDER BY created DESC LIMIT 51",Number(before)||Date.now()+1,'%'+query+'%',search);
    return {matches:rows.slice(0,50).map(r=>({...r,players:JSON.parse(r.players)})),next:rows.length>50?rows[49].created:null};
  }
  release(player,id){this.ctx.storage.sql.exec('DELETE FROM queue WHERE player=? AND match=?',player,id);this.broadcast();}
  loadTourRate(player,pool){return loadTourRate(player,undefined,pool==='watched'?'watched':'usual');}
  async rating(player,pool='random'){
    const table=ngmcTable(pool),key=pool+':'+player;
    const lookup=()=>this.rows('SELECT * FROM '+table+' WHERE player=?',player)[0];
    let row=lookup();
    if(!row){
      if(!this.ratingRequests.has(key))this.ratingRequests.set(key,(async()=>{
        const seed=await this.loadTourRate(player,pool);
        this.ctx.storage.sql.exec('INSERT OR IGNORE INTO '+table+'(player,seed_rate) VALUES(?,?)',player,seed);
      })().finally(()=>this.ratingRequests.delete(key)));
      await this.ratingRequests.get(key);row=lookup();
    }
    return {elo:row.elo,guessRate:row.seen?100*row.correct/row.seen:row.seed_rate};
  }
  recordRankedLeave(match,player,at,pool){
    this.notifyDeparture(player,'ngmc-ranked',this.rankedLeaves.record(match,player,at,'ngmc-ranked',player,pool),pool);
  }
  recordSongReadyLeave(match,format,player,name,at,pool){
    if(!Object.hasOwn(songRatingPools,format))throw Error('Unknown ranked format.');
    this.notifyDeparture(player,format,this.rankedLeaves.record(match,player,at,format,name,pool),pool);
  }
  notifyDeparture(player,format,receipt,pool){
    if(receipt){
      for(const ws of this.ctx.getWebSockets(player))send(ws,{type:'ranked-departure',format,pool,...receipt});
      this.broadcast();
    }
  }
  settle(id,result){
    const saved=this.rows('SELECT data FROM ngmc_results WHERE id=?',id)[0];if(saved)return JSON.parse(saved.data);
    const departed=new Set();
    for(const p of result.players)if(p.rankedLeftAt!=null){
      this.recordRankedLeave(id,p.id,p.rankedLeftAt,result.pool);departed.add(p.id);
    }
    if(!result?.history?.length)return [];
    const ratings=ngmcRatings(result.players,result.history);
    this.ctx.storage.transactionSync(()=>{
      for(const r of ratings){
        const forfeited=departed.has(r.id);
        if(forfeited){r.delta=-RANKED_LEAVE_COST;r.after=r.before+r.delta;r.forfeited=true;}
        this.ctx.storage.sql.exec('UPDATE '+ngmcTable(result.pool)+' SET elo=elo+?,correct=correct+?,seen=seen+?,matches=matches+1 WHERE player=?',forfeited?0:r.delta,r.correct,r.seen,r.id);
      }
      this.ctx.storage.sql.exec('INSERT INTO ngmc_results VALUES(?,?,?)',id,JSON.stringify(ratings),Date.now());
    });
    return ratings;
  }
  settleSongs(id,result){
    const saved=this.rows('SELECT data FROM song_results WHERE id=?',id)[0];
    if(saved)return JSON.parse(saved.data);
    const {format,history}=result,bucket=poolFormat(format,result.pool);
    const duel=format===DUEL_FORMAT;
    if(!duel&&!history.length)return [];
    if(duel)for(const p of result.players)if(p.rankedLeftAt!=null)
      this.recordSongReadyLeave(id,format,p.id,p.name,p.rankedLeftAt,result.pool);
    const players=result.players.map(player=>({...player,elo:this.rows(
      'SELECT rating FROM song_ratings WHERE format=? AND player=?',bucket,player.id)[0]?.rating??1000}));
    const ratings=duel?duelRatings(players,history,result.records):ngmcRatings(players,history);
    this.ctx.storage.transactionSync(()=>{
      for(const r of ratings){
        const player=players.find(p=>p.id===r.id);
        this.ctx.storage.sql.exec(
          `INSERT INTO song_ratings VALUES(?,?,?,?,?,?,1) ON CONFLICT(format,player) DO UPDATE SET
           name=excluded.name,rating=excluded.rating,correct=correct+excluded.correct,
           seen=seen+excluded.seen,matches=matches+1`,bucket,r.id,player.name,r.after,r.correct,r.seen*(format==='1v1'?3:1));
      }
      this.ctx.storage.sql.exec('INSERT INTO song_results VALUES(?,?)',id,JSON.stringify(ratings));
    });
    return ratings;
  }
  async rankings(format,page,sort,dir,pool='random'){
    if(this.records.pending()){
      const alarm=await this.ctx.storage.getAlarm();
      if(alarm===null||alarm>Date.now()+30000)await this.ctx.storage.setAlarm(Date.now()+1000);
    }
    const ngmc=format==='ngmc-ranked',bucket=poolFormat(format,pool);
    const stats=ngmc?`SELECT p.player,coalesce(n.name,(SELECT json_extract(j.value,'$.name')
      FROM match_reviews m,json_each(m.players) j WHERE m.format='ngmc-ranked' AND json_extract(j.value,'$.id')=p.player
      ORDER BY m.created DESC LIMIT 1),p.player) AS name,elo AS rating,correct,seen,matches
      FROM ${ngmcTable(pool)} p LEFT JOIN play_names n ON n.player=p.player WHERE matches>0`
      :'SELECT player,name,rating,correct,seen,matches FROM song_ratings WHERE format=?';
    const source=`SELECT s.*,r.wins,r.losses,r.ties FROM (${stats}) s LEFT JOIN
      (SELECT player,SUM(outcome='W') AS wins,SUM(outcome='L') AS losses,SUM(outcome='T') AS ties
       FROM play_records WHERE format=? GROUP BY player) r ON r.player=s.player`;
    return playRankingPage(this.rows.bind(this),source,ngmc?[bucket]:[bucket,bucket],{page,sort,dir});
  }
  async complete(id,result=null,status='cancelled'){
    let ratings=null;
    if(Object.hasOwn(songRatingPools,result?.format)&&status==='cancelled'){
      for(const p of result.players)if(p.rankedLeftAt!=null)this.recordSongReadyLeave(id,result.format,p.id,p.name,p.rankedLeftAt,result.pool);
    }
    if(result?.mode==='ngmc-ranked'&&!['lobby-ngmc','ngmc-3v3'].includes(result.format))ratings=this.settle(id,result);
    else if(status==='finished'&&Object.hasOwn(songRatingPools,result?.format))
      ratings=this.settleSongs(id,result);
    if(status==='finished'&&['ngmc-ranked',...Object.keys(songRatingPools)].includes(result?.format)){
      const bucket=poolFormat(result.format,result.pool);
      if(result.records?.length)this.records.save(id,bucket,result.records);
      else this.ctx.storage.sql.exec('INSERT OR IGNORE INTO pending_play_records VALUES(?,?)',id,bucket);
    }
    const sql=this.ctx.storage.sql;
    sql.exec('UPDATE play_lobbies SET match=NULL WHERE match=?',id);
    sql.exec('UPDATE match_reviews SET status=? WHERE id=?',status,id);
    sql.exec('DELETE FROM queue WHERE match=?',id);
    sql.exec('DELETE FROM preparing WHERE id=?',id);
    this.broadcast();
    return ratings;
  }
  async prepare(row){
    try{
      const players=JSON.parse(row.players),match=this.env.PLAY_MATCHES.getByName(row.id);
      const custom=row.format.startsWith('lobby-');
      const lobby=custom&&this.rows('SELECT * FROM play_lobbies WHERE match=?',row.id)[0];
      if(custom&&!lobby){await this.complete(row.id);return;}
      const settings=lobby?{code:lobby.code,...JSON.parse(lobby.settings)}:null;
      const pool=settings?.pool||row.pool||'random';
      if(row.format==='lobby-ngmc')await Promise.all(players.map(async player=>Object.assign(player,await this.rating(player.id,pool))));
      const format=row.format===ARENA_LOBBY_FORMAT?ARENA_FORMAT:row.format;
      if(row.format===ARENA_LOBBY_FORMAT){
        const table=ngmcTable(pool);
        for(const player of players){
          player.elo=this.rows('SELECT elo FROM '+table+' WHERE player=?',player.id)[0]?.elo??arenaRules.startingRating;
        }
      }
      const result=await match.initialize(row.id,format,players,settings,pool);
      if(result?.setupError){
        this.ctx.storage.transactionSync(()=>{
          this.ctx.storage.sql.exec('UPDATE lobby_members SET last_match=NULL WHERE last_match=?',row.id);
          this.ctx.storage.sql.exec('DELETE FROM recent WHERE match=?',row.id);
        });
        await this.complete(row.id);
        for(const p of players)for(const ws of this.ctx.getWebSockets(p.id))send(ws,{type:'error',message:result.setupError});
        return;
      }
      if(lobby){
        const remaining=this.lobbies.roster(lobby.code);
        for(const p of players)if(!remaining.some(m=>m.id===p.id))await match.depart(p.id);
      }
      this.ctx.storage.sql.exec('DELETE FROM preparing WHERE id=?',row.id);this.broadcast();
    }
    catch {if(Date.now()-row.started>180000){for(const p of JSON.parse(row.players))for(const ws of this.ctx.getWebSockets(p.id))send(ws,{type:'error',message:'Song loading failed. Please queue again.'});await this.complete(row.id);}}
  }
  async scheduleQueue(at = Date.now() + 30000) {
    const current = await this.ctx.storage.getAlarm();
    if (current == null || current > at) await this.ctx.storage.setAlarm(at);
  }
  async match(format,pool='random'){
    const now=Date.now(), rankingTable=ngmcTable(pool);
    let size=PLAY_FORMATS[format].size;
    let rows;
    if(format===ARENA_FORMAT){
      const waiting=this.rows(`SELECT q.*, COALESCE(p.elo, ?) AS rating FROM queue q
        LEFT JOIN ${rankingTable} p ON p.player=q.player WHERE q.format=? AND q.pool=? AND q.match IS NULL AND q.expires>?
        ORDER BY q.joined,q.player LIMIT ?`, arenaRules.startingRating,format,pool,now,arenaRules.maxPlayers);
      const batch=arenaBatch(waiting,now);
      if(!batch.size){
        if(batch.deadline)await this.scheduleQueue(batch.deadline);
        return;
      }
      size=batch.size;
      rows=waiting.slice(0,size);
    }else if(format==='ngmc-3v3'){
      const anchor=this.rows(`SELECT p.elo,q.joined FROM queue q JOIN ${rankingTable} p ON p.player=q.player
        WHERE q.format=? AND q.pool=? AND q.match IS NULL AND q.expires>? ORDER BY q.joined,q.player LIMIT 1`,format,pool,now)[0];
      if(!anchor)return;
      const wait=now-anchor.joined;
      const spread=wait>=120000?1e12:200+wait/100;
      rows=this.rows(`SELECT q.* FROM queue q JOIN ${rankingTable} p ON p.player=q.player
        WHERE q.format=? AND q.pool=? AND q.match IS NULL AND q.expires>? AND abs(p.elo-?)<=?
        ORDER BY abs(p.elo-?),q.joined,q.player LIMIT ?`,format,pool,now,anchor.elo,spread,anchor.elo,size);
    }else{
      rows=this.rows('SELECT * FROM queue WHERE format=? AND pool=? AND match IS NULL AND expires>? ORDER BY joined,player LIMIT ?',format,pool,now,size);
    }
    if(rows.length!==size)return;
    const id=crypto.randomUUID(),players=rows.map(row=>{const rating=format.startsWith('ngmc-')?this.rows('SELECT * FROM '+rankingTable+' WHERE player=?',row.player)[0]:null;return {id:row.player,name:row.name,...(format===ARENA_FORMAT?{elo:row.rating}:{}),avatar:row.avatar?JSON.parse(row.avatar):null,...(rating?{elo:rating.elo,guessRate:rating.seen?100*rating.correct/rating.seen:rating.seed_rate}:{})};});
    this.ctx.storage.transactionSync(()=>{for(const row of rows){this.ctx.storage.sql.exec('INSERT OR REPLACE INTO play_names VALUES(?,?)',row.player,row.name);this.ctx.storage.sql.exec('UPDATE queue SET match=?,expires=? WHERE player=?',id,Date.now()+(format==='ngmc-ranked'?7200000:3600000),row.player);this.ctx.storage.sql.exec('INSERT INTO recent VALUES(?,?,?)',row.player,id,Date.now()+86400000);}this.ctx.storage.sql.exec('INSERT INTO preparing(id,format,players,started,pool) VALUES(?,?,?,?,?)',id,format,JSON.stringify(players),Date.now(),pool);});
    this.ctx.storage.sql.exec('INSERT OR IGNORE INTO match_reviews VALUES(?,?,?,?,?)',id,Date.now(),format,JSON.stringify(players.map(({id,name})=>({id,name}))),'active');
    await this.prepare({id,format,pool,players:JSON.stringify(players),started:Date.now()});
  }
  async fetch(request){try{if(request.headers.get('Upgrade')?.toLowerCase()!=='websocket')return new Response('WebSocket required',{status:426});const who=identity(request);const {server,response}=accept(this.ctx,who);send(server,this.clientStatus(who.id));await this.scheduleQueue();return response;}catch(error){return Response.json({error:error.status?error.message:'Unable to join queue.'},{status:error.status||503});}}
  async webSocketMessage(ws,raw){try{const input=receive(ws,raw);if(!input)return;const {who,message}=input;
    if(typeof message.type==='string'&&message.type.startsWith('lobby-')){
      if(who.protocol!==PLAY_AUDIO_PROTOCOL)fail('Refresh Play to use lobbies.');
      await this.lobbies.action(who,message);
      if(message.type==='lobby-password')send(ws,{type:'lobby-password-saved'});
      this.broadcast();
      await this.lobbies.refreshWatchedPool(this.lobbies.forPlayer(who.id)?.code);
    }else if(message.type==='join'){
      if(this.lobbies.forPlayer(who.id))fail('Leave your lobby first.');
      if(who.protocol!==PLAY_AUDIO_PROTOCOL)fail('Refresh Play to load the updated match player.',409);
      if(!Object.hasOwn(PLAY_FORMATS,message.format)||message.mode!==queueMode(message.format))fail('Choose a valid match format.');
      const pool=message.pool??'random';
      if(!playPools.includes(pool))fail('Choose Random or Watched.');
      const pending={format:message.format,pool};this.joinRequests.set(who.id,pending);
      try{
        if(message.format.startsWith('ngmc-')){
          send(ws,{type:'joining',...pending});
          await this.rating(who.id,pool);
        }
      }catch(error){
        if(this.joinRequests.get(who.id)!==pending)return;
        this.joinRequests.delete(who.id);send(ws,this.status(who.id));throw error;
      }
      if(this.joinRequests.get(who.id)!==pending)return;
      this.joinRequests.delete(who.id);if(ws.readyState!==1)return;
      if(message.format==='ngmc-ranked'||Object.hasOwn(songRatingPools,message.format)){
        const until=this.rankedLeaves.banUntil(who.id,message.format,pool);
        if(until>Date.now()){
          send(ws,this.status(who.id));
          fail((songRatingPools[message.format]||'NGMC Ranked')+' is locked until '+new Date(until).toUTCString()+' after three active leaves.',403);
        }
      }
      const old=this.rows('SELECT * FROM queue WHERE player=?',who.id)[0];
      if(old?.match){send(ws,this.status(who.id));return;}
      this.ctx.storage.sql.exec('INSERT OR REPLACE INTO queue(player,name,format,joined,expires,match,avatar,pool) VALUES(?,?,?,?,?,NULL,?,?)',who.id,who.name,message.format,old?.format===message.format&&old.pool===pool?old.joined:Date.now(),Date.now()+60000,JSON.stringify(who.avatar||null),pool);
      this.broadcast();await this.match(message.format,pool);
    }else if(message.type==='cancel'){this.joinRequests.delete(who.id);this.ctx.storage.sql.exec('DELETE FROM queue WHERE player=? AND match IS NULL',who.id);this.broadcast();}
    else if(message.type==='ping'){
      this.lobbies.heartbeat(who.id);
      this.ctx.storage.sql.exec('UPDATE queue SET expires=? WHERE player=? AND match IS NULL',Date.now()+60000,who.id);
      send(ws,this.clientStatus(who.id));
      await this.lobbies.refreshWatchedPool(this.lobbies.forPlayer(who.id)?.code);
    }
    else fail('Unknown queue action.');
    await this.scheduleQueue();
  }catch(error){if(!error.status)console.error('Play queue action failed',{name:error.name,message:String(error.message).slice(0,200)});socketError(ws,error);}}
  webSocketClose(ws,code,reason){closeSocket(ws,code,reason);/* A short lease lets refresh/reconnect retain queue position. */}
  webSocketError(ws){ws.close(1011,'Reconnect to resume.');}
  async alarm(){
    this.ctx.storage.sql.exec('DELETE FROM queue WHERE expires<?',Date.now());
    this.ctx.storage.sql.exec('DELETE FROM recent WHERE expires<?',Date.now());
    for(const m of this.rows('SELECT player FROM lobby_members WHERE expires<?',Date.now()))await this.lobbies.leave(m.player);
    for(const row of this.rows('SELECT * FROM preparing'))await this.prepare(row);
    for(const {format,pool} of this.rows('SELECT DISTINCT format,pool FROM queue WHERE match IS NULL'))await this.match(format,pool);
    this.broadcast();
    if(this.records.pending())await this.records.recoverBatch();
    if(this.records.pending()||this.rows('SELECT 1 FROM lobby_members LIMIT 1').length||this.rows('SELECT COUNT(*) AS n FROM queue')[0].n||this.ctx.getWebSockets().length)await this.scheduleQueue();
    else {const next=this.rows('SELECT MIN(expires) AS at FROM recent')[0]?.at;if(next)await this.ctx.storage.setAlarm(next);}
  }
}
