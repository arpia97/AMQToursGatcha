import { ngmcRatings } from './ngmc-ratings.js';
import { DurableObject } from 'cloudflare:workers';
import { PLAY_FORMATS,fail } from './play-match-rules.js';
import {accept,identity,receive,send,socketError} from './play-sockets.js';
// Only matchmaking lives here; every match has its own isolated actor.
export class PlayQueue extends DurableObject {
  constructor(ctx,env){super(ctx,env);this.ctx=ctx;this.env=env;
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS queue(player TEXT PRIMARY KEY,name TEXT,format TEXT,joined INTEGER,expires INTEGER,match TEXT)');
    ctx.storage.sql.exec('CREATE INDEX IF NOT EXISTS queue_format ON queue(format,match,joined)');
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS preparing(id TEXT PRIMARY KEY,format TEXT,players TEXT,started INTEGER)');
    if(![...ctx.storage.sql.exec('PRAGMA table_info(queue)')].some(c=>c.name==='avatar'))ctx.storage.sql.exec('ALTER TABLE queue ADD COLUMN avatar TEXT');
    this.joinRequests=new Map();
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS ngmc_players(player TEXT PRIMARY KEY,elo REAL NOT NULL DEFAULT 1000,correct INTEGER NOT NULL DEFAULT 0,seen INTEGER NOT NULL DEFAULT 0,matches INTEGER NOT NULL DEFAULT 0,seed_rate REAL)');
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS ngmc_results(id TEXT PRIMARY KEY,data TEXT NOT NULL,created INTEGER NOT NULL)');
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS recent(player TEXT,match TEXT,expires INTEGER,PRIMARY KEY(player,match))');
  }
  rows(sql,...args){return [...this.ctx.storage.sql.exec(sql,...args)];}
  status(player){const row=this.rows('SELECT * FROM queue WHERE player=?',player)[0];return row?.match?{type:'matched',match:row.match}:row?{type:'queued',format:row.format,waiting:this.rows('SELECT COUNT(*) AS n FROM queue WHERE format=? AND match IS NULL AND expires>?',row.format,Date.now())[0].n,needed:PLAY_FORMATS[row.format].size}:{type:'idle'};}
  broadcast(){for(const ws of this.ctx.getWebSockets()){const who=ws.deserializeAttachment();if(who.expires<=Date.now())ws.close(4003,'Session expired.');else send(ws,this.status(who.id));}}
  canAccess(player,id){return !!this.rows('SELECT 1 FROM recent WHERE player=? AND match=? AND expires>?',player,id,Date.now())[0];}
  release(player,id){this.ctx.storage.sql.exec('DELETE FROM queue WHERE player=? AND match=?',player,id);this.broadcast();}
  async loadTourRate(player){
    const response=await fetch('https://amqtours.app/api/archive/profile?id='+encodeURIComponent(player)+'&mode=usual',{signal:AbortSignal.timeout(15000),redirect:'error'});
    if(response.status===404)return null;
    if(!response.ok)fail('Tour guess rates are unavailable. Please retry.',503);
    const data=await response.json(),row=data.modes?.find(m=>m.mode==='usual');
    if(!Array.isArray(data.modes))fail('Tour guess rates are unavailable. Please retry.',503);
    return row&&Number.isFinite(row.correct)&&Number.isFinite(row.encounters)&&row.encounters>0?Math.max(0,Math.min(100,100*row.correct/row.encounters)):null;
  }
  async rating(player){
    let row=this.rows('SELECT * FROM ngmc_players WHERE player=?',player)[0];
    if(!row){const seed=await this.loadTourRate(player);this.ctx.storage.sql.exec('INSERT OR IGNORE INTO ngmc_players(player,seed_rate) VALUES(?,?)',player,seed);row=this.rows('SELECT * FROM ngmc_players WHERE player=?',player)[0];}
    return {elo:row.elo,guessRate:row.seen?100*row.correct/row.seen:row.seed_rate};
  }
  settle(id,result){
    const saved=this.rows('SELECT data FROM ngmc_results WHERE id=?',id)[0];if(saved)return JSON.parse(saved.data);
    if(!result?.history?.length)return [];
    const ratings=ngmcRatings(result.players,result.history);
    this.ctx.storage.transactionSync(()=>{
      for(const r of ratings)this.ctx.storage.sql.exec('UPDATE ngmc_players SET elo=?,correct=correct+?,seen=seen+?,matches=matches+1 WHERE player=?',r.after,r.correct,r.seen,r.id);
      this.ctx.storage.sql.exec('INSERT INTO ngmc_results VALUES(?,?,?)',id,JSON.stringify(ratings),Date.now());
    });
    return ratings;
  }
  async complete(id,result=null){const ratings=result?.mode==='ngmc-ranked'?this.settle(id,result):null;this.ctx.storage.sql.exec('DELETE FROM queue WHERE match=?',id);this.ctx.storage.sql.exec('DELETE FROM preparing WHERE id=?',id);this.broadcast();return ratings;}
  async prepare(row){
    try{await this.env.PLAY_MATCHES.getByName(row.id).initialize(row.id,row.format,JSON.parse(row.players));this.ctx.storage.sql.exec('DELETE FROM preparing WHERE id=?',row.id);this.broadcast();}
    catch {if(Date.now()-row.started>180000){for(const p of JSON.parse(row.players))for(const ws of this.ctx.getWebSockets(p.id))send(ws,{type:'error',message:'Song loading failed. Please queue again.'});await this.complete(row.id);}}
  }
  async match(format){
    const rows=this.rows('SELECT * FROM queue WHERE format=? AND match IS NULL AND expires>? ORDER BY joined,player LIMIT ?',format,Date.now(),PLAY_FORMATS[format].size);
    if(rows.length!==PLAY_FORMATS[format].size)return;
    const id=crypto.randomUUID(),players=rows.map(row=>{const rating=format==='ngmc-ranked'?this.rows('SELECT * FROM ngmc_players WHERE player=?',row.player)[0]:null;return {id:row.player,name:row.name,avatar:row.avatar?JSON.parse(row.avatar):null,...(rating?{elo:rating.elo,guessRate:rating.seen?100*rating.correct/rating.seen:rating.seed_rate}:{})};});
    this.ctx.storage.transactionSync(()=>{for(const row of rows){this.ctx.storage.sql.exec('UPDATE queue SET match=?,expires=? WHERE player=?',id,Date.now()+(format==='ngmc-ranked'?7200000:3600000),row.player);this.ctx.storage.sql.exec('INSERT INTO recent VALUES(?,?,?)',row.player,id,Date.now()+86400000);}this.ctx.storage.sql.exec('INSERT INTO preparing VALUES(?,?,?,?)',id,format,JSON.stringify(players),Date.now());});
    await this.prepare({id,format,players:JSON.stringify(players),started:Date.now()});
  }
  async fetch(request){try{if(request.headers.get('Upgrade')?.toLowerCase()!=='websocket')return new Response('WebSocket required',{status:426});const who=identity(request);const {server,response}=accept(this.ctx,who);send(server,this.status(who.id));await this.ctx.storage.setAlarm(Date.now()+30000);return response;}catch(error){return Response.json({error:error.status?error.message:'Unable to join queue.'},{status:error.status||503});}}
  async webSocketMessage(ws,raw){try{const input=receive(ws,raw);if(!input)return;const {who,message}=input;
    if(message.type==='join'){
      if(!Object.hasOwn(PLAY_FORMATS,message.format)||(message.format==='ngmc-ranked'?message.mode!=='ngmc-ranked':message.mode!=='song-artist'))fail('Choose a valid match format.');
      const token=crypto.randomUUID();this.joinRequests.set(who.id,token);
      if(message.format==='ngmc-ranked')await this.rating(who.id);
      if(this.joinRequests.get(who.id)!==token||ws.readyState!==1)return;
      this.joinRequests.delete(who.id);
      const old=this.rows('SELECT * FROM queue WHERE player=?',who.id)[0];
      if(old?.match){send(ws,this.status(who.id));return;}
      this.ctx.storage.sql.exec('INSERT OR REPLACE INTO queue(player,name,format,joined,expires,match,avatar) VALUES(?,?,?,?,?,NULL,?)',who.id,who.name,message.format,old?.format===message.format?old.joined:Date.now(),Date.now()+60000,JSON.stringify(who.avatar||null));
      this.broadcast();await this.match(message.format);
    }else if(message.type==='cancel'){this.joinRequests.delete(who.id);this.ctx.storage.sql.exec('DELETE FROM queue WHERE player=? AND match IS NULL',who.id);this.broadcast();}
    else if(message.type==='ping'){this.ctx.storage.sql.exec('UPDATE queue SET expires=? WHERE player=? AND match IS NULL',Date.now()+60000,who.id);send(ws,this.status(who.id));}
    else fail('Unknown queue action.');
    await this.ctx.storage.setAlarm(Date.now()+30000);
  }catch(error){socketError(ws,error);}}
  webSocketClose(ws,code,reason){ws.close(code,reason);/* A short lease lets refresh/reconnect retain queue position. */}
  webSocketError(ws){ws.close(1011,'Reconnect to resume.');}
  async alarm(){
    this.ctx.storage.sql.exec('DELETE FROM queue WHERE expires<?',Date.now());
    this.ctx.storage.sql.exec('DELETE FROM recent WHERE expires<?',Date.now());
    for(const row of this.rows('SELECT * FROM preparing'))await this.prepare(row);
    for(const format of Object.keys(PLAY_FORMATS))await this.match(format);
    this.broadcast();
    if(this.rows('SELECT COUNT(*) AS n FROM queue')[0].n||this.ctx.getWebSockets().length)await this.ctx.storage.setAlarm(Date.now()+30000);
    else {const next=this.rows('SELECT MIN(expires) AS at FROM recent')[0]?.at;if(next)await this.ctx.storage.setAlarm(next);}
  }
}
