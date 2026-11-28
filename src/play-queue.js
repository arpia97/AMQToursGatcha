import {isPotato, isPotatoCoop, potatoRules} from '../public/hot-potato.js';
import {playPools, poolFormat} from '../public/play-pool.js';
import {DUEL_FORMAT, ONE_TEAM_FORMAT, oneTeamRules, queueMode} from '../public/play-mode-rules.js';
import {duelRatings} from './play-duel-ratings.js';
import {ARENA_FORMAT, ARENA_LOBBY_FORMAT, arenaRules} from '../public/play-arena-config.js';
import {playRankingPage} from './play-ranking-query.js';
import {playerHistory} from './play-history.js';
import {PlayRecords} from './play-records.js';
import {RankedLeaves, ngmcTable} from './ngmc-leaves.js';
import {inactivityBanMessage,INACTIVITY_BAN_MS,RANKED_LEAVE_COST,songRatingPools} from '../public/ngmc-leave-policy.js';
import {PlayLobbies,ONE_TEAM_REMATCH_FORMAT} from './play-lobbies.js';
import { PLAY_AUDIO_PROTOCOL } from '../public/play-audio-format.js';
import {loadTourRate} from './play-tour-rate.js';
import { balancedNgmcRatings,ngmcRatings } from './ngmc-ratings.js';
import {reconcileRankedIncident} from './play-rating-repair.js';
import { DurableObject } from 'cloudflare:workers';
import { PLAY_FORMATS,fail } from './play-match-rules.js';
import {spectatorTag} from './play-spectator.js';
import {PlayPresence} from './play-presence.js';
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
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS play_match_inactivity(player TEXT PRIMARY KEY,streak INTEGER NOT NULL,until INTEGER NOT NULL)');
    this.lobbies=new PlayLobbies(this);
    this.joinRequests=new Map();this.ratingRequests=new Map();
    this.preparations=new Map();
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS ngmc_players(player TEXT PRIMARY KEY,elo REAL NOT NULL DEFAULT 1000,correct INTEGER NOT NULL DEFAULT 0,seen INTEGER NOT NULL DEFAULT 0,matches INTEGER NOT NULL DEFAULT 0,seed_rate REAL)');
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS ngmc_watched_players(player TEXT PRIMARY KEY,elo REAL NOT NULL DEFAULT 1000,correct INTEGER NOT NULL DEFAULT 0,seen INTEGER NOT NULL DEFAULT 0,matches INTEGER NOT NULL DEFAULT 0,seed_rate REAL)');
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS ngmc_results(id TEXT PRIMARY KEY,data TEXT NOT NULL,created INTEGER NOT NULL)');
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS ngmc_repaired_starts(id TEXT PRIMARY KEY,data TEXT NOT NULL)');
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS ngmc_rating_repairs(id TEXT PRIMARY KEY,data TEXT NOT NULL)');
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS recent(player TEXT,match TEXT,expires INTEGER,PRIMARY KEY(player,match))');
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS match_reviews(id TEXT PRIMARY KEY,created INTEGER NOT NULL,format TEXT NOT NULL,players TEXT NOT NULL,status TEXT NOT NULL)');
    ctx.storage.sql.exec('CREATE INDEX IF NOT EXISTS match_reviews_created ON match_reviews(created)');
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS match_flag_counts(id TEXT PRIMARY KEY,total INTEGER NOT NULL)');
    if(!this.rows('PRAGMA table_info(match_flag_counts)').some(c=>c.name==='breakdown'))
      ctx.storage.sql.exec('ALTER TABLE match_flag_counts ADD COLUMN breakdown TEXT');
    if(!this.rows("SELECT 1 FROM sqlite_master WHERE name='stats_record_jobs'").length)
      ctx.storage.transactionSync(()=>{
        ctx.storage.sql.exec('CREATE TABLE stats_record_jobs(id TEXT PRIMARY KEY,retry_at INTEGER NOT NULL DEFAULT 0)');
        ctx.storage.sql.exec('CREATE INDEX stats_records_due ON stats_record_jobs(retry_at)');
        ctx.storage.sql.exec("INSERT INTO stats_record_jobs(id) SELECT id FROM match_reviews WHERE status='finished' ORDER BY created DESC");
      });
    ctx.storage.sql.exec("CREATE INDEX IF NOT EXISTS queue_waiting_expiry ON queue(expires,format,pool,player) WHERE match IS NULL");
    ctx.storage.sql.exec("CREATE INDEX IF NOT EXISTS active_reviews ON match_reviews(id) WHERE status='active'");
    this.records=new PlayRecords(this);
    this.presence=new PlayPresence(ctx.storage);
  }
  rows(sql,...args){return [...this.ctx.storage.sql.exec(sql,...args)];}
  queueCounts(){
    const rows=this.rows('SELECT format,pool,COUNT(*) AS waiting FROM queue WHERE match IS NULL AND expires>? GROUP BY format,pool',Date.now());
    return Object.fromEntries(rows.map(row=>[poolFormat(row.format,row.pool),row.waiting]));
  }
  lobbyDirectory(){return this.lobbies.directory();}
  async joinRematch(match,pool,who,until,previousCode){
    const [result]=await this.joinRematchPlayers(match,pool,[who],until,previousCode);
    return result;
  }
  async joinRematchPlayers(match,pool,players,until,previousCode){
    const now=Date.now();
    const results=players.map(who=>{
      if(until<=now)return {error:'This lobby invitation has ended.'};
      if(this.rows('SELECT 1 FROM play_match_inactivity WHERE player=? AND until>?',who.id,now).length)
        return {error:'You can rejoin after your matchmaking ban expires.'};
      if(this.joinRequests.has(who.id)||this.rows('SELECT 1 FROM queue WHERE player=? AND expires>? AND COALESCE(match,?)<>?',who.id,now,'',match).length)
        return {error:'Leave your current queue or match first.'};
      return this.lobbies.joinRematch(match,pool,who,previousCode);
    });
    if(results.some(result=>!result.error)){
      this.broadcast();
      this.ctx.waitUntil(this.lobbies.refreshWatchedPool(match));
      await this.scheduleQueue();
    }
    return results;
  }
  unlockWatch(player,code,password){return this.lobbies.unlockWatch(player,code,password);}
  canWatch(id,player=null){
    return !!this.rows(`SELECT 1 FROM match_reviews m WHERE m.id=? AND m.status='active'
      AND NOT EXISTS(SELECT 1 FROM preparing WHERE id=m.id)
      AND (EXISTS(SELECT 1 FROM queue q WHERE q.match=m.id AND q.expires>?)
        OR EXISTS(SELECT 1 FROM play_lobbies l WHERE l.match=m.id AND (l.password_hash IS NULL OR EXISTS(
          SELECT 1 FROM play_watch_grants g WHERE g.player=? AND g.match=l.match AND g.expires>? AND g.salt=substr(l.password_hash,1,instr(l.password_hash,':')-1)))))`,id,Date.now(),player,Date.now())[0];
  }
  liveActivity(player,overview=false,details=null,presenceOnly=false){
    const now=Date.now();
    if(player)this.presence.record(player,details,now);
    if(presenceOnly)return {};
    const detailed=!!player&&overview;
    const matches=this.rows(`WITH rooms AS (
      SELECT match,format,pool,0 AS locked,NULL AS lobbyCode,NULL AS studioName,NULL AS grouping FROM queue WHERE match IS NOT NULL AND expires>? GROUP BY match,format,pool
      UNION ALL SELECT match,json_extract(settings,'$.format'),COALESCE(json_extract(settings,'$.pool'),'random'),password_hash IS NOT NULL,code,json_extract(settings,'$.studio.name'),json_extract(settings,'$.studio.format')
        FROM play_lobbies WHERE match IS NOT NULL
    ) SELECT rooms.format,rooms.pool,rooms.studioName,rooms.grouping,m.created AS started,json_array_length(m.players) AS players,
         rooms.locked,rooms.lobbyCode,CASE WHEN ? AND NOT rooms.locked THEN m.id END AS id,
         CASE WHEN ? THEN m.players END AS roster
      FROM rooms JOIN match_reviews m ON m.id=rooms.match WHERE m.status='active'
      AND NOT EXISTS(SELECT 1 FROM preparing WHERE id=m.id) ORDER BY m.created DESC`,now,Number(!!player),Number(detailed));
    const online=this.presence.online(now);
    for(const ws of this.ctx.getWebSockets()){
      const who=ws.deserializeAttachment();
      if(ws.readyState===1&&who.expires>now&&!online.has(who.id))online.set(who.id,'browsing');
    }
    const counts=this.queueCounts();
    const playing=new Set();
    const visibleMatches=matches.map(({id,locked,roster,lobbyCode,studioName,grouping,...match})=>{
      if(studioName)Object.assign(match,{studioName,grouping});
      if(!player)return locked?{...match,locked:true}:match;
      if(!detailed)return {...match,id,locked:!!locked};
      const players=JSON.parse(roster);
      for(const member of players)playing.add(member.id);
      return {...match,id,locked:!!locked,...(locked&&{lobbyCode}),...(!locked&&{
        roster:players.map(({id,name,team})=>({id,name,team})),
      })};
    });
    const result={online:online.size,waiting:Object.values(counts).reduce((sum,n)=>sum+n,0),matches:visibleMatches,counts};
    if(!detailed)return result;
    const queued=new Set(this.rows('SELECT player FROM queue WHERE match IS NULL AND expires>?',now).map(row=>row.player));
    return {...result,onlinePlayers:[...online].map(([id,status])=>({id,status:playing.has(id)?'playing':queued.has(id)?'queued':status}))};
  }
  ratingReceipt(id){
    const row=this.rows('SELECT data,created FROM ngmc_results WHERE id=?',id)[0];
    return row?{at:row.created,players:JSON.parse(row.data)}:null;
  }
  repairDelayedRatings(apply){return reconcileRankedIncident(this,apply);}
  migrateBalancedRatings(apply){return reconcileRankedIncident(this,apply,'balanced-4v4-v1');}
  clientStatus(player,counts,directory){
    const status=this.status(player,counts);
    if(status.type==='idle')status.lobbies=directory||this.lobbyDirectory();
    return status;
  }
  status(player,counts){
    const lobby=this.lobbies.forPlayer(player);
    if(lobby)return this.withPreparation(this.lobbies.status(lobby));
    const row=this.rows('SELECT * FROM queue WHERE player=?',player)[0];
    if(row?.match)return this.withPreparation({type:'matched',match:row.match,format:row.format,pool:row.pool});
    counts??=this.queueCounts();
    const pending=this.joinRequests.get(player);
    if(!row&&pending)return {type:'joining',format:pending.format,pool:pending.pool,counts};
    if(!row)return {type:'idle',counts};
    const waiting=counts[poolFormat(row.format,row.pool)]||0;
    const startsAt=row.format===ONE_TEAM_FORMAT&&waiting>=oneTeamRules.minPlayers
      ? this.oneTeamStart(this.waitingPlayers(row.format,row.pool,Date.now()))
      : isPotato(row.format) && waiting >= 2 ? this.potatoStart(row.format,row.pool) : undefined;
    return {type:'queued',format:row.format,pool:row.pool,waiting,needed:PLAY_FORMATS[row.format].size,counts,startsAt};
  }
  withPreparation(status){
    if(status.type!=='matched')return status;
    const job=this.preparations.get(status.match);
    if(job)return {...status,type:'preparing',progress:job.progress};
    if(this.rows('SELECT 1 FROM preparing WHERE id=?',status.match).length)
      return {...status,type:'preparing',progress:{stage:'retrying'}};
    return status;
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
  playerHistory(player, options){return playerHistory(this,player,options);}
  hasReview(id){return !!this.rows('SELECT 1 FROM match_reviews WHERE id=?',id)[0];}
  indexHighlights(id,count,counts=null){
    this.ctx.storage.sql.exec(`INSERT INTO match_flag_counts(id,total,breakdown) VALUES(?,?,?)
      ON CONFLICT(id) DO UPDATE SET total=excluded.total,
      breakdown=CASE WHEN excluded.breakdown IS NULL AND excluded.total=total THEN breakdown ELSE excluded.breakdown END
      WHERE excluded.total>=total`,id,count,counts?JSON.stringify(counts):null);
  }
  async reviews({before=Date.now()+1,search='',flagged=''}={}){
    const query=String(search).slice(0,100).replace(/[\\%_]/g,'\\$&');
    const rows=this.rows("SELECT m.*,COALESCE(f.total,0) AS flags,f.breakdown FROM match_reviews m "+(flagged==='1'?'JOIN':'LEFT JOIN')+" match_flag_counts f ON f.id=m.id WHERE created<? AND (players LIKE ? ESCAPE '\\' OR m.id=?) ORDER BY created DESC LIMIT 51",Number(before)||Date.now()+1,'%'+query+'%',search);
    const matches=rows.slice(0,50).map(({breakdown,players,...r})=>({...r,players:JSON.parse(players),counts:breakdown?JSON.parse(breakdown):null}));
    // Earlier index rows stored only a total. Read their already-indexed signals once.
    const missing=matches.filter(m=>m.flags && !m.counts);
    for(let i=0;i<missing.length;i+=5){
      await Promise.all(missing.slice(i,i+5).map(async m=>{
        // A temporarily unavailable older room can be retried on the next review request.
        const counts=await this.env.PLAY_MATCHES.getByName(m.id).reviewFlagCounts().catch(()=>null);
        if(counts && counts.total>=m.flags){
          this.indexHighlights(m.id,counts.total,counts);
          m.flags=counts.total;
          m.counts=counts;
        }
      }));
    }
    return {matches,next:rows.length>50?rows[49].created:null};
  }
  release(player,id){this.ctx.storage.sql.exec('DELETE FROM queue WHERE player=? AND match=?',player,id);this.broadcast();}
  loadTourRate(player,pool){return loadTourRate(player,undefined,pool==='watched'?'watched':'usual');}
  ratingSummary(player){
    const buckets=playPools.flatMap(pool=>Object.keys(songRatingPools).map(format=>poolFormat(format,pool)));
    const ratings=Object.fromEntries(buckets.map(bucket=>[bucket,1000]));
    for(const {format,rating} of this.rows(`SELECT format,rating FROM song_ratings
      WHERE player=? AND format IN (${buckets.map(()=>'?').join(',')})`,player,...buckets)){
      ratings[format]=rating;
    }
    for(const pool of playPools){
      ratings[poolFormat('ngmc-ranked',pool)]=this.rows('SELECT elo FROM '+ngmcTable(pool)+' WHERE player=?',player)[0]?.elo??1000;
    }
    return ratings;
  }
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
  // A previous-version match may still report a song-level ban during rollout.
  recordInactivityBans(){}
  recordMatchParticipation(participation){
    const sql=this.ctx.storage.sql, bans=[];
    for(const {id,answered} of participation){
      const previous=this.rows('SELECT streak FROM play_match_inactivity WHERE player=?',id)[0]?.streak??0;
      if(answered){
        if(previous)sql.exec('UPDATE play_match_inactivity SET streak=0 WHERE player=?',id);
        continue;
      }
      const streak=previous+1;
      const until=streak===3?Date.now()+INACTIVITY_BAN_MS:0;
      sql.exec(`INSERT INTO play_match_inactivity VALUES(?,?,?) ON CONFLICT(player)
        DO UPDATE SET streak=excluded.streak,until=MAX(until,excluded.until)`,id,until?0:streak,until);
      if(until){
        sql.exec('DELETE FROM queue WHERE player=? AND match IS NULL',id);
        bans.push({id,until});
      }
    }
    return bans;
  }
  assertActiveQueueAccess(ws,player){
    const ban=this.rows('SELECT until FROM play_match_inactivity WHERE player=? AND until>?',player,Date.now())[0];
    if(!ban)return;
    if(ws)send(ws,this.status(player));
    fail(inactivityBanMessage(ban.until),403);
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
    const revised=this.rows('SELECT data FROM ngmc_repaired_starts WHERE id=?',id)[0];
    const ratings=balancedNgmcRatings(revised?JSON.parse(revised.data):result.players,result.history);
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
  rankedProfileHistory(player){
    return this.rows(`
      SELECT r.format,m.created AS playedAt,
             json_extract(p.value,'$.after') AS rating,
             coalesce(json_extract(p.value,'$.after') - json_extract(p.value,'$.before'),json_extract(p.value,'$.delta')) AS ratingChange,
             json_extract(p.value,'$.correct') AS correct,
             json_extract(p.value,'$.seen') * CASE WHEN r.format IN ('1v1','1v1-watched') THEN 3 ELSE 1 END AS possible
      FROM play_records r
      JOIN match_reviews m ON m.id=r.match AND m.status='finished'
      LEFT JOIN ngmc_results n ON n.id=r.match
      LEFT JOIN song_results s ON s.id=r.match
      JOIN json_each(coalesce(n.data,s.data)) p
      WHERE r.player=? AND r.format IN ('ngmc-ranked','1v1-ranked','1v1','3v3','ngmc-ranked-watched','1v1-ranked-watched','1v1-watched','3v3-watched')
        AND CAST(json_extract(p.value,'$.id') AS TEXT)=r.player
      ORDER BY m.created,r.match`,String(player));
  }
  async rankings(format,page,sort,dir,pool='random',friendIds=null,viewer=null){
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
    return playRankingPage(this.rows.bind(this),source,ngmc?[bucket]:[bucket,bucket],{page,sort,dir,friendIds,viewer});
  }
  enqueueStatsRecord(id){this.ctx.storage.sql.exec('INSERT OR REPLACE INTO stats_record_jobs(id) VALUES(?)',id);}
  gameRecordJobs(){
    return this.rows('SELECT id FROM stats_record_jobs WHERE retry_at<=? ORDER BY retry_at,rowid LIMIT 10',Date.now()).map(({id})=>{
      const receipt=this.rows('SELECT data FROM ngmc_results WHERE id=? UNION ALL SELECT data FROM song_results WHERE id=? LIMIT 1',id,id)[0];
      return {id,ratings:receipt?JSON.parse(receipt.data):[]};
    });
  }
  gameRecordDone(id,saved){
    if(saved)this.ctx.storage.sql.exec('DELETE FROM stats_record_jobs WHERE id=?',id);
    else this.ctx.storage.sql.exec('UPDATE stats_record_jobs SET retry_at=? WHERE id=?',Date.now()+3600000,id);
  }
  matchLobbyChat(code,match,who,body=null,since=0){
    const lobby=this.rows('SELECT match FROM play_lobbies WHERE code=?',code)[0];
    if(!lobby||lobby.match&&lobby.match!==match)return null;
    if(who.spectator){
      if(lobby.match!==match)return null;
    }else if(who.id){
      if(!this.rows('SELECT 1 FROM lobby_members WHERE code=? AND player=? AND last_match=?',code,who.id,match).length)return null;
    }else if(lobby.match!==match)return null;
    if(body===null)return this.lobbies.history(code,who.spectator?since:0);
    const player=who.spectator?spectatorTag+':'+who.id:who.id;
    if(player&&this.rows('SELECT 1 FROM lobby_chat WHERE code=? AND player IN (?,?) AND at>? LIMIT 1 OFFSET 3',code,who.id,spectatorTag+':'+who.id,Date.now()-2000).length)return null;
    return this.lobbies.appendChat(code,player,who.name,body,true);
  }
  async complete(id,result=null,status='cancelled'){
    let ratings=null;
    const sql=this.ctx.storage.sql;
    const bans=this.ctx.storage.transactionSync(()=>{
      // The review transition and inactivity strikes commit together, so a retry cannot count twice.
      const first=this.rows("UPDATE match_reviews SET status=? WHERE id=? AND status='active' RETURNING id",status,id).length;
      const bans=first&&status==='finished'&&result?.participation?.length
        ? this.recordMatchParticipation(result.participation) : [];
      sql.exec("UPDATE lobby_members SET last_match=NULL,ready=0 WHERE last_match=? AND code IN (SELECT code FROM play_lobbies WHERE match=? AND json_type(settings,'$.studio')='object')",id,id);
      sql.exec('UPDATE play_lobbies SET match=NULL WHERE match=?',id);
      sql.exec('DELETE FROM queue WHERE match=?',id);
      sql.exec('DELETE FROM preparing WHERE id=?',id);
      return bans;
    });
    for(const {id:player,until} of bans){
      this.joinRequests.delete(player);
      for(const ws of this.ctx.getWebSockets(player))send(ws,{type:'inactivity-ban',until});
    }
    this.broadcast();
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
    if(status==='finished')sql.exec('INSERT OR IGNORE INTO stats_record_jobs(id) VALUES(?)',id);
    return ratings;
  }
  async prepare(row){
    const existing=this.preparations.get(row.id);
    if(existing)return existing.promise;
    const players=JSON.parse(row.players);
    const job={progress:{stage:'starting'}};
    this.preparations.set(row.id,job);
    const notify=()=>{
      for(const {id} of players){
        const status=this.status(id);
        if(status.type!=='preparing'||status.match!==row.id)continue;
        for(const ws of this.ctx.getWebSockets(id)){
          if(ws.deserializeAttachment().expires>Date.now())send(ws,status);
        }
      }
    };
    let timer;
    const poll=async()=>{
      try{
        const progress=await this.env.QUIZ_LIBRARY.getByName('quiz-song-library-v1').selectionProgress(row.id);
        if(this.preparations.get(row.id)!==job)return;
        const next=progress||(['catalog','songs'].includes(job.progress.stage)?{stage:'finalizing'}:job.progress);
        if(JSON.stringify(next)!==JSON.stringify(job.progress)){job.progress=next;notify();}
      }catch{/* Status updates are optional while the match opens. */}
      if(this.preparations.get(row.id)===job)timer=setTimeout(poll,750);
    };
    notify();
    timer=setTimeout(poll,500);
    job.promise=this.prepareRoom(row,players).finally(()=>{
      clearTimeout(timer);
      this.preparations.delete(row.id);
      this.broadcast();
    });
    return job.promise;
  }
  async prepareRoom(row,players){
    try{
      const match=this.env.PLAY_MATCHES.getByName(row.id);
      const custom=row.format.startsWith('lobby-');
      const lobby=custom&&this.rows('SELECT * FROM play_lobbies WHERE match=?',row.id)[0];
      if(custom&&!lobby){await this.complete(row.id);return;}
      const settings=lobby?{code:lobby.code,...JSON.parse(lobby.settings),sharedChat:true}:null;
      const pool=settings?.pool||row.pool||'random';
      if(row.format==='lobby-ngmc')await Promise.all(players.map(async player=>Object.assign(player,await this.rating(player.id,pool))));
      const format=row.format===ARENA_LOBBY_FORMAT?ARENA_FORMAT:
        row.format===ONE_TEAM_REMATCH_FORMAT?ONE_TEAM_FORMAT:row.format;
      if(row.format===ARENA_LOBBY_FORMAT){
        const table=ngmcTable(pool);
        for(const player of players){
          player.elo=this.rows('SELECT elo FROM '+table+' WHERE player=?',player.id)[0]?.elo??arenaRules.startingRating;
        }
      }
      const result=await match.initialize(row.id,format,players,settings,pool,row.started+180000);
      if(result?.setupError){
        this.ctx.storage.transactionSync(()=>{
          this.ctx.storage.sql.exec('UPDATE lobby_members SET last_match=NULL WHERE last_match=?',row.id);
          this.ctx.storage.sql.exec("UPDATE play_lobbies SET settings=json_remove(settings,'$.rematchStarted') WHERE match=?",row.id);
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
      this.ctx.storage.transactionSync(()=>{
        const sql=this.ctx.storage.sql;
        if(result?.teams){
          const assigned=new Map(result.teams.map(({id,team})=>[id,team]));
          const review=this.rows('SELECT players FROM match_reviews WHERE id=?',row.id)[0];
          if(review){
            const roster=JSON.parse(review.players).map(member=>({...member,team:assigned.get(member.id)}));
            sql.exec('UPDATE match_reviews SET players=? WHERE id=?',JSON.stringify(roster),row.id);
          }
        }
        sql.exec('DELETE FROM preparing WHERE id=?',row.id);
      });
    }
    catch {if(Date.now()-row.started>180000){for(const p of JSON.parse(row.players))for(const ws of this.ctx.getWebSockets(p.id))send(ws,{type:'error',message:'Song loading failed. Please queue again.'});await this.complete(row.id);}}
  }
  async scheduleQueue(at = Date.now() + 30000) {
    const current = await this.ctx.storage.getAlarm();
    if (current == null || current > at) await this.ctx.storage.setAlarm(at);
  }
  potatoStart(format,pool){
    const second=this.waitingPlayers(format,pool,Date.now(),2)[1];
    return second ? second.joined+potatoRules.waitMs : undefined;
  }
  waitingPlayers(format,pool,now,limit=isPotato(format) ? (isPotatoCoop(format) ? 8 : -1) : PLAY_FORMATS[format].size){
    return this.rows('SELECT * FROM queue WHERE format=? AND pool=? AND match IS NULL AND expires>? ORDER BY joined,player LIMIT ?',
      format,pool,now,limit);
  }
  oneTeamStart(rows){
    return rows.length>=oneTeamRules.minPlayers?rows.at(-1).joined+oneTeamRules.waitMs:undefined;
  }
  async match(format,pool='random'){
    const now=Date.now(), rankingTable=ngmcTable(pool);
    let size=PLAY_FORMATS[format].size;
    let rows;
    if(format===ARENA_FORMAT){
      this.ctx.storage.sql.exec('DELETE FROM queue WHERE format=? AND pool=? AND match IS NULL',format,pool);
      return;
    }
    if(format==='ngmc-3v3'){
      const anchor=this.rows(`SELECT p.elo,q.joined FROM queue q JOIN ${rankingTable} p ON p.player=q.player
        WHERE q.format=? AND q.pool=? AND q.match IS NULL AND q.expires>? ORDER BY q.joined,q.player LIMIT 1`,format,pool,now)[0];
      if(!anchor)return;
      const wait=now-anchor.joined;
      const spread=wait>=120000?1e12:200+wait/100;
      rows=this.rows(`SELECT q.* FROM queue q JOIN ${rankingTable} p ON p.player=q.player
        WHERE q.format=? AND q.pool=? AND q.match IS NULL AND q.expires>? AND abs(p.elo-?)<=?
        ORDER BY abs(p.elo-?),q.joined,q.player LIMIT ?`,format,pool,now,anchor.elo,spread,anchor.elo,size);
    }else{
      rows=this.waitingPlayers(format,pool,now);
      if(isPotato(format)){
        if(rows.length < 2)return;
        const deadline = rows[1].joined + potatoRules.waitMs;
        if(now < deadline){await this.scheduleQueue(deadline);return;}
        size = isPotatoCoop(format) ? rows.length : rows.length - rows.length % 2;
        rows = rows.slice(0,size);
      }
      if(format===ONE_TEAM_FORMAT){
        const deadline=this.oneTeamStart(rows);
        if(deadline===undefined)return;
        if(now<deadline){await this.scheduleQueue(deadline);return;}
        size=rows.length;
      }
    }
    if(rows.length!==size)return;
    const id=crypto.randomUUID(),players=rows.map(row=>{const rating=format.startsWith('ngmc-')?this.rows('SELECT * FROM '+rankingTable+' WHERE player=?',row.player)[0]:null;return {id:row.player,name:row.name,...(format===ARENA_FORMAT?{elo:row.rating}:{}),avatar:row.avatar?JSON.parse(row.avatar):null,...(rating?{elo:rating.elo,guessRate:rating.seen?100*rating.correct/rating.seen:rating.seed_rate}:{})};});
    const matchLeaseMs=format==='ngmc-ranked'||format===ARENA_FORMAT||format===ONE_TEAM_FORMAT||isPotato(format)?7200000:3600000;
    this.ctx.storage.transactionSync(()=>{for(const row of rows){this.ctx.storage.sql.exec('INSERT OR REPLACE INTO play_names VALUES(?,?)',row.player,row.name);this.ctx.storage.sql.exec('UPDATE queue SET match=?,expires=? WHERE player=?',id,Date.now()+matchLeaseMs,row.player);this.ctx.storage.sql.exec('INSERT INTO recent VALUES(?,?,?)',row.player,id,Date.now()+86400000);}this.ctx.storage.sql.exec('INSERT INTO preparing(id,format,players,started,pool) VALUES(?,?,?,?,?)',id,format,JSON.stringify(players),Date.now(),pool);});
    this.ctx.storage.sql.exec('INSERT OR IGNORE INTO match_reviews VALUES(?,?,?,?,?)',id,Date.now(),format,JSON.stringify(players.map(({id,name})=>({id,name}))),'active');
    await this.prepare({id,format,pool,players:JSON.stringify(players),started:Date.now()});
  }
  async fetch(request){try{if(request.headers.get('Upgrade')?.toLowerCase()!=='websocket')return new Response('WebSocket required',{status:426});const who=identity(request);const {server,response}=accept(this.ctx,who);send(server,this.clientStatus(who.id));await this.scheduleQueue();return response;}catch(error){return Response.json({error:error.status?error.message:'Unable to join queue.'},{status:error.status||503});}}
  async webSocketMessage(ws,raw){try{const input=receive(ws,raw);if(!input)return;const {who,message}=input;
    if(message.type==='lobby-chat'||message.type==='lobby-chat-history'){
      this.lobbies.chat(ws,who,message);return;
    }
    if(typeof message.type==='string'&&message.type.startsWith('lobby-')){
      if(who.protocol!==PLAY_AUDIO_PROTOCOL)fail('Refresh Play to use lobbies.');
      await this.lobbies.action(who,message);
      if(message.type==='lobby-password')send(ws,{type:'lobby-password-saved'});
      this.broadcast();
      await this.lobbies.refreshWatchedPool(this.lobbies.forPlayer(who.id)?.code);
    }else if(message.type==='join'){
      if(message.format===ARENA_FORMAT)fail('2v2 Arena has been retired.',410);
      if(this.lobbies.forPlayer(who.id))fail('Leave your lobby first.');
      if(who.protocol!==PLAY_AUDIO_PROTOCOL)fail('Refresh Play to load the updated match player.',409);
      if(!Object.hasOwn(PLAY_FORMATS,message.format)||(message.mode!==queueMode(message.format)&&
        !(message.format==='1-team'&&message.mode==='song-artist')))fail('Choose a valid match format.');
      const pool=message.pool??'random';
      if(!playPools.includes(pool))fail('Choose Random or Watched.');
      this.assertActiveQueueAccess(ws,who.id);
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
      this.assertActiveQueueAccess(ws,who.id);
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
      if(message.includeRatings===true)send(ws,{type:'ratings',ratings:this.ratingSummary(who.id)});
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
