import {balancedNgmcRatings,ngmcRatings} from './ngmc-ratings.js';

import {ngmcTable} from './ngmc-leaves.js';
import {RANKED_LEAVE_COST} from '../public/ngmc-leave-policy.js';

const incident='delayed-ngmc-nov20-2026';

export function replayDelayedRatings(games){
  const effects=[],updates=[],pending=[],balances=new Map();
  for(const game of games){
    const original=game.receipt?.players??game.startRatings;
    if(!original?.length||original.some(p=>!Number.isFinite(p.before??p.elo)))throw Error('Missing starting ratings.');
    const starts=original.map(p=>{
      let change=0;
      for(const previous of effects){
        if(previous.ended>game.started)continue;
        const effect=previous.players.get(p.id);
        if(effect)change+=effect.corrected-(previous.posted<=game.started?effect.original:0);
      }
      return {id:p.id,elo:(p.before??p.elo)+change};
    });
    const changed=starts.some((p,i)=>Math.abs(p.elo-(original[i].before??original[i].elo))>0.000001);
    if(!game.receipt){
      if(changed)pending.push({id:game.id,starts});
      continue;
    }
    let corrected=original;
    if(changed){
      const ids=new Set(original.map(p=>p.id));
      if(game.history.length!==original[0].seen||Array.from(game.history).some(song=>!song||song.length!==ids.size||
        new Set(song.map(([id])=>id)).size!==ids.size||song.some(([id,n])=>!ids.has(id)||![0,1].includes(n))))
        throw Error('Incomplete ranked song history. No correction applied.');
      const ratings=ngmcRatings(starts,game.history.map(song=>({results:song.map(([id,earned])=>({id,earned}))})));
      corrected=ratings.map((p,i)=>{
        const old=original[i];
        if(!Number.isFinite(p.after)||p.correct!==old.correct)throw Error('Ranked history and receipt disagree.');
        return old.forfeited?{...old,before:p.before,after:p.before+old.delta}:p;
      });
      updates.push({id:game.id,ratings:corrected});
    }
    const players=new Map();
    for(let i=0;i<original.length;i++){
      const old=original[i],next=corrected[i];
      // A leave strike was already deducted at departure, independently of settlement.
      if(old.forfeited)continue;
      players.set(old.id,{original:old.delta,corrected:next.delta});
      const change=next.delta-old.delta;
      if(change)balances.set(old.id,(balances.get(old.id)||0)+change);
    }
    effects.push({ended:game.ended,posted:game.receipt.at,players});
  }
  return {updates,pending,balances:[...balances].map(([id,delta])=>({id,delta}))};
}

function replayBalanced(games,leaves){
  const updates=[],pending=[],board=new Map(),originalBoard=new Map(),starts=new Map();
  const add=(table,id,delta)=>table.set(id,(table.get(id)??1000)+delta);
  const events=leaves.map(leave=>({at:leave.at,kind:'leave',leave}));
  for(const game of games){
    events.push({at:game.started,kind:'start',game});
    if(game.receipt)events.push({at:game.ended,kind:'end',game});
  }
  const order={leave:0,end:1,start:2};
  events.sort((a,b)=>a.at-b.at||order[a.kind]-order[b.kind]);
  for(const {kind,game,leave} of events){
    if(kind==='leave'){
      add(board,leave.player,-RANKED_LEAVE_COST);add(originalBoard,leave.player,-RANKED_LEAVE_COST);
      continue;
    }
    const original=game.receipt?.players??game.startRatings;
    if(kind==='start'){
      const roster=original.map(({id})=>({id,elo:board.get(id)??1000}));
      starts.set(game.id,roster);
      if(!game.receipt)pending.push({id:game.id,starts:roster});
      continue;
    }
    const rounds=game.history.map(song=>({results:song.map(([id,earned])=>({id,earned}))}));
    const ratings=balancedNgmcRatings(starts.get(game.id),rounds);
    for(let i=0;i<ratings.length;i++){
      const r=ratings[i],old=original[i];
      if(r.correct!==old.correct||r.seen!==old.seen||!r.seen)throw Error('Ranked song history and receipt disagree.');
      if(old.forfeited){
        if(!leaves.some(l=>l.match===game.id&&l.player===r.id))throw Error('Missing ranked leave receipt.');
        Object.assign(r,{forfeited:true,delta:-RANKED_LEAVE_COST,after:r.before-RANKED_LEAVE_COST});
      }else{
        add(board,r.id,r.delta);add(originalBoard,r.id,old.delta);
      }
    }
    updates.push({id:game.id,ratings});
  }
  return {updates,pending,balances:[...board].map(([id,after])=>({id,expected:originalBoard.get(id),delta:after-originalBoard.get(id)}))};
}

function readLeaves(q){
  return q.rows(`SELECT player,match,at,'random' AS pool FROM ngmc_leaves
    UNION ALL SELECT player,match,at,'watched' FROM song_leaves WHERE format='ngmc-ranked-watched'
    ORDER BY at,match,player`);
}

function readGames(q,from){
  return q.rows(`SELECT m.id,m.status,m.created,r.data,r.created AS posted,p.players AS preparing,p.pool
    FROM match_reviews m LEFT JOIN ngmc_results r ON r.id=m.id LEFT JOIN preparing p ON p.id=m.id
    WHERE m.format='ngmc-ranked' AND m.created>=? ORDER BY m.created,m.id`,from);
}

export async function reconcileRankedIncident(q,apply,key=incident){
  const sql=q.ctx.storage.sql;
  const balanced=key==='balanced-4v4-v1',from=balanced?0:Date.UTC(2026,10,19);
  const saved=()=>q.rows('SELECT data FROM ngmc_rating_repairs WHERE id=?',key)[0]?.data;
  let audit=JSON.parse(saved()||'null');
  if(!balanced&&q.rows("SELECT 1 FROM ngmc_rating_repairs WHERE id='balanced-4v4-v1'").length)return audit;
  if(!audit){
    const rows=readGames(q,from), pools={random:[],watched:[]},leaves=balanced?readLeaves(q):[];
    if(balanced&&q.rows('SELECT COUNT(*) AS n FROM ngmc_results')[0].n!==rows.filter(row=>row.data).length)
      throw Error('Missing ranked match index entries.');
    for(const row of rows){
      const room=await q.env.PLAY_MATCHES.getByName(row.id).review({view:'settlement'});
      const receipt=row.data?{at:row.posted,players:JSON.parse(row.data)}:null;
      if(!receipt&&row.status!=='active'&&!room?.history?.length)continue;
      if(!receipt&&row.status!=='active')throw Error('Ranked settlement is still pending. Retry after settlement.');
      if(receipt&&(!room?.ended||room.ended>receipt.at))throw Error('Cannot establish ranked match end time.');
      const pool=room?.pool??row.pool;
      if(!Object.hasOwn(pools,pool))throw Error('Missing ranked pool.');
      pools[pool].push({id:row.id,started:row.created,ended:room?.ended,receipt,history:room?.history,
        startRatings:room?.startRatings??JSON.parse(row.preparing||'null')});
    }
    const updates=[],pending=[],balances=[];
    for(const [pool,games] of Object.entries(pools)){
      const replay=balanced?replayBalanced(games,leaves.filter(l=>l.pool===pool)):replayDelayedRatings(games);
      for(const update of replay.updates)updates.push({...update,pool,original:games.find(g=>g.id===update.id).receipt.players});
      pending.push(...replay.pending);
      for(const b of replay.balances){
        const before=q.rows('SELECT elo FROM '+ngmcTable(pool)+' WHERE player=?',b.id)[0]?.elo;
        if(!Number.isFinite(before))throw Error('Missing player rating.');
        if(balanced&&Math.abs(before-b.expected)>.001)throw Error('Existing rating does not reconcile with match and leave receipts.');
        balances.push({...b,pool,before,after:before+b.delta});
      }
    }
    audit={updates,pending,balances};
    if(apply){
      q.ctx.storage.transactionSync(()=>{
        if(saved()||JSON.stringify(readGames(q,from))!==JSON.stringify(rows)||(balanced&&JSON.stringify(readLeaves(q))!==JSON.stringify(leaves)))throw Error('Ranked matches changed. Preview and retry.');
        for(const u of updates){
          sql.exec('UPDATE ngmc_results SET data=? WHERE id=?',JSON.stringify(u.ratings),u.id);
          q.enqueueStatsRecord?.(u.id);
        }
        for(const b of balances){
          if(!q.rows('UPDATE '+ngmcTable(b.pool)+' SET elo=elo+? WHERE player=? AND elo=? RETURNING player',b.delta,b.id,b.before).length)
            throw Error('Player rating changed. Preview and retry.');
        }
        for(const p of pending)sql.exec('INSERT OR REPLACE INTO ngmc_repaired_starts VALUES(?,?)',p.id,JSON.stringify(p.starts));
        audit.appliedAt=Date.now();
        sql.exec('INSERT INTO ngmc_rating_repairs VALUES(?,?)',key,JSON.stringify(audit));
      });
    }
  }
  if(apply){
    for(const game of [...audit.updates,...audit.pending]){
      const ratings=q.ratingReceipt(game.id)?.players;
      await q.env.PLAY_MATCHES.getByName(game.id).syncRatingRepair(game.id,game.starts??ratings.map(p=>({id:p.id,elo:p.before})),ratings);
    }
  }
  return audit;
}
