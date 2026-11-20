import {DatabaseSync} from 'node:sqlite';
import {ngmcControls} from '../public/ngmc-ui.js';
import {RankedLeaves} from '../src/ngmc-leaves.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {ngmcGuesses,balanceNgmc} from '../src/ngmc-rules.js';
import {ngmcSongPool} from '../src/ngmc-selection.js';
import {balancedNgmcRatings,ngmcRatings} from '../src/ngmc-ratings.js';
import {reconcileRankedIncident} from '../src/play-rating-repair.js';
import {makeMatch,advanceMatch,matchMove,matchView,gradeRound} from '../src/play-match-rules.js';
const players=Array.from({length:8},(_,i)=>({id:String(i),name:'Player '+i,elo:1000+i*20,guessRate:[7,8,18.99,19,27.99,28,39.99,40][i]}));
const songs=Array.from({length:35},()=>({audio:'local',anime:'Anime',title:'Song',artist:'Artist',answers:{anime:['anime']}}));
const create=()=>makeMatch('local','ngmc-ranked',players,songs,0);
test('Balanced averages seven match-start comparisons and downweights sparse differences',()=>{
 const roster=players.map(p=>({...p,elo:1000}));
 const song={results:roster.map((p,i)=>({id:p.id,earned:Number(i===0)}))};
 const unanimous={results:roster.map(p=>({id:p.id,earned:1}))};
 const rate=(songs,ps=roster)=>balancedNgmcRatings(ps,songs);
 assert.ok(Math.abs(rate([song,unanimous])[0].delta-3)<1e-9);
 assert.ok(Math.abs(rate(Array(8).fill(song))[0].delta-24)<1e-9);
 roster[0].elo=600;
 const ratings=rate(Array(35).fill(song));
 assert.ok(ratings[0].delta>24&&ratings[0].delta<48);
 assert.ok(Math.abs(ratings.reduce((acc,r)=>acc+r.delta,0))<1e-9);
 assert.equal(ratings[0].correct,35);
 assert.ok(rate([unanimous]).every(p=>p.delta===0));
 assert.throws(()=>rate([{results:[]}]),/Incomplete/);
});
test('late rating receipts repair subsequent games, balances and in-flight starts exactly once',async()=>{
 const db=new DatabaseSync(':memory:');
 db.exec(`CREATE TABLE match_reviews(id,format,status,created);CREATE TABLE preparing(id,players,pool);
   CREATE TABLE ngmc_results(id,data,created);CREATE TABLE ngmc_players(player,elo);
   CREATE TABLE ngmc_rating_repairs(id PRIMARY KEY,data);CREATE TABLE ngmc_repaired_starts(id PRIMARY KEY,data);`);
 const run=(s,...v)=>db.prepare(s).run(...v),rows=(s,...v)=>db.prepare(s).all(...v);
 const storage={sql:{exec:run},transactionSync:fn=>{db.exec('BEGIN');try{fn();db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}}};
 const base=Date.UTC(2026,10,19), roster=[{id:'a',elo:1000},{id:'b',elo:1000}];
 const history=[[['a',1],['b',0]]],rounds=[{results:[{id:'a',earned:1},{id:'b',earned:0}]}];
 const original=ngmcRatings(roster,rounds),next=original.map(p=>({id:p.id,elo:p.after}));
 const corrected=ngmcRatings(next,rounds),rooms={};
 for(const [i,id] of ['late','second','pending'].entries()){
   run('INSERT INTO match_reviews VALUES(?,?,?,?)',id,'ngmc-ranked',i===2?'active':'finished',base+10*i);
   rooms[id]={review:()=>({pool:'random',ended:i<2?base+10*i+5:null,history,startRatings:i===2?next:roster}),syncRatingRepair:()=>{}};
   if(i<2)run('INSERT INTO ngmc_results VALUES(?,?,?)',id,JSON.stringify(original),base+(i?16:30));
 }
 for(const p of original)run('INSERT INTO ngmc_players VALUES(?,?)',p.id,p.before+2*p.delta);
 const q={rows,ctx:{storage},env:{PLAY_MATCHES:{getByName:id=>rooms[id]}},ratingReceipt:id=>{
   const row=rows('SELECT data FROM ngmc_results WHERE id=?',id)[0];return row&&{players:JSON.parse(row.data)};
 }};
 const plan=await reconcileRankedIncident(q,false);
 assert.equal(plan.appliedAt,undefined);assert.deepEqual(plan.updates.map(g=>g.id),['second']);
 assert.deepEqual(plan.updates[0].ratings,corrected);
 assert.ok(Math.abs(plan.pending[0].starts[0].elo-corrected[0].after)<1e-8);
 const receipt=await reconcileRankedIncident(q,true);
 assert.deepEqual(await reconcileRankedIncident(q,true),receipt);
 for(const p of corrected)assert.ok(Math.abs(rows('SELECT elo FROM ngmc_players WHERE player=?',p.id)[0].elo-p.after)<1e-8);
 db.close();
});
const answer=(s,hit)=>{s.phase='guess';for(const p of s.players)p.answers={anime:hit(p)?'Anime':'wrong'};gradeRound(s,1000);};
test('NGMC uses exact thresholds, optimal balance and uniform anime/type/song draws without repeats',()=>{
 assert.deepEqual([0,7.99,8,18.99,19,27.99,28,39.99,40,100].map(ngmcGuesses),[1,1,2,2,3,3,4,4,5,5]);
 const balanced=balanceNgmc(players);assert.equal(balanced.filter(p=>p.team===0).length,4);assert.equal(balanced.reduce((sum,p)=>sum+(p.team?1:-1)*p.elo,0),0);
 const rows=[{annId:1,amqSongId:1,type:'Opening 1',audio:'a'},{annId:1,amqSongId:2,type:'Ending 1',audio:'b'},{annId:2,amqSongId:3,type:'Opening 1',audio:'c'},{annId:2,amqSongId:1,type:'Ending 1',audio:'a'}];
 const sizes=[],pool=ngmcSongPool(rows,3,n=>{sizes.push(n);return 0;});assert.deepEqual(sizes.slice(0,3),[2,2,1]);assert.equal(new Set(pool.map(r=>r.amqSongId)).size,3);
 assert.throws(()=>ngmcSongPool(rows,4),/Not enough/);
});
test('NGMC gates 12 downloads and counter signup, counts once, excludes exhausted players, refills and ends at 35',()=>{
 const s=create();for(const p of s.players){p.ready=true;p.loaded=Array.from({length:11},(_,i)=>i);}
 const volunteer=s.players[0],opponent=s.players.find(p=>p.team!==volunteer.team);
 const controls=now=>ngmcControls(matchView(s,opponent.id,now),String);
 assert.match(controls(19_999),/Be Counter/);
 matchMove(s,volunteer.id,{type:'volunteer'},19_999);
 assert.throws(()=>matchMove(s,opponent.id,{type:'volunteer'},20_000),/signup period has ended/);
 assert.match(controls(20_000),/Counter Signup Closed/);
 assert.doesNotMatch(controls(20_000),/Be Counter/);
 for(const p of s.players)p.loaded.push(11);
 advanceMatch(s,39_999);assert.equal(s.phase,'loading');
 advanceMatch(s,40_000);assert.equal(s.phase,'guess');assert.equal(s.until-s.startsAt,20_000);
 assert.equal(s.autoCounting[opponent.team],true);assert.equal(s.autoCounting[volunteer.team],false);
 const slow=create();advanceMatch(slow,40_000);assert.equal(slow.phase,'loading');
 const lateCounter=slow.players[0];
 matchMove(slow,lateCounter.id,{type:'volunteer'},40_001);
 assert.equal(slow.counters[lateCounter.team],lateCounter.id);
 assert.equal(slow.autoCounting[lateCounter.team],false);
 const mixed=create(),human=mixed.players[0],auto=mixed.players.find(p=>p.team!==human.team);
 matchMove(mixed,auto.id,{type:'auto-count'},100);
 matchMove(mixed,human.id,{type:'volunteer'},300);
 assert.throws(()=>matchMove(mixed,human.id,{type:'auto-count'},400),/already has a counting assignment/);
 for(const p of mixed.players){p.ready=true;p.loaded=Array.from({length:12},(_,i)=>i);}
 advanceMatch(mixed,500);assert.equal(mixed.phase,'guess');
 for(let i=0;i<2;i++){
   const manual=mixed.players.filter(p=>p.team===human.team&&p.guesses>0).sort((a,b)=>b.elo-a.elo)[0];
   const lowest=mixed.players.filter(p=>p.team===auto.team&&p.guesses>0).sort((a,b)=>a.elo-b.elo)[0];
   answer(mixed,()=>true);assert.equal(mixed.counts[auto.team],lowest.id);
   matchMove(mixed,human.id,{type:'count',index:i,player:manual.id},1001);
   assert.equal(mixed.history.at(-1).spent[human.team],manual.id);
   advanceMatch(mixed,mixed.until);assert.equal(matchView(mixed,auto.id).autoCounting[auto.team],true);
 }
 const claimant=mixed.players.find(p=>p.team===auto.team&&p.id!==auto.id);
 answer(mixed,()=>true);
 const autoChoice=mixed.counts[auto.team];
 matchMove(mixed,claimant.id,{type:'volunteer'},1001);
 assert.equal(mixed.counters[auto.team],claimant.id);
 assert.equal(mixed.autoCounting[auto.team],false);
 assert.throws(()=>matchMove(mixed,auto.id,{type:'volunteer'},1002),/already has a counter/);
 matchMove(mixed,claimant.id,{type:'count',index:2,player:claimant.id},1003);
 assert.equal(mixed.counts[auto.team],autoChoice);
 matchMove(mixed,human.id,{type:'count',index:2,player:human.id},1004);
 assert.equal(mixed.history.at(-1).spent[auto.team],autoChoice);
 advanceMatch(mixed,mixed.until);
 answer(mixed,()=>true);
 assert.equal(mixed.counts[auto.team],null);
 assert.match(ngmcControls(matchView(mixed,claimant.id,1001),String),/Spend a Guess/);
 const chosen=mixed.players.filter(p=>p.team===auto.team&&p.guesses>0).sort((a,b)=>b.elo-a.elo)[0];
 matchMove(mixed,claimant.id,{type:'count',index:3,player:chosen.id},1001);
 advanceMatch(mixed,mixed.until);
 assert.equal(mixed.history.at(-1).spent[auto.team],chosen.id);
 const filled=create();for(const p of filled.players){p.ready=true;p.loaded=Array.from({length:12},(_,i)=>i);}
 for(const team of [0,1])matchMove(filled,filled.players.find(p=>p.team===team).id,{type:'volunteer'},500);
 assert.equal(filled.phase,'guess');
 const a=s.players.filter(p=>p.team===0),b=s.players.filter(p=>p.team===1);
 s.counters=[a[0].id,b[0].id];answer(s,()=>true);assert.equal(s.phase,'counting');
 assert.equal(matchView(s,a[0].id).players.find(p=>p.id===a[1].id).answers,undefined);
 assert.throws(()=>matchMove(s,a[1].id,{type:'count',index:0,player:a[1].id},1001),/Only your team counter/);
 matchMove(s,a[0].id,{type:'count',index:0,player:a[1].id},1001);const before=a[1].guesses;
 matchMove(s,a[0].id,{type:'count',index:0,player:a[0].id},1002);assert.equal(a[1].guesses,before);
 advanceMatch(s,9000);assert.equal(s.phase,'reveal');assert.equal(a[1].guesses,before-1);assert.deepEqual(s.teams,[5,5]);
 assert.equal(s.until,12000);
 assert.equal(s.history.at(-1).spent[1],[...b].sort((x,y)=>x.elo-y.elo)[0].id);
 s.counters=[null,null];a.forEach(p=>p.guesses=0);a[0].guesses=1;b[0].guesses=0;
 answer(s,p=>p.id===a[0].id||p.id===b[0].id);assert.deepEqual(s.teams,[5,4]);assert.ok(a.every(p=>p.guesses===p.initialGuesses));assert.deepEqual(s.history.at(-1).reset,[0]);
 s.index=34;advanceMatch(s,s.until);assert.equal(s.phase,'finished');
 const knockout=create();knockout.teams=[5,1];answer(knockout,p=>p.team===0);assert.deepEqual(knockout.teams,[5,0]);advanceMatch(knockout,knockout.until);assert.equal(knockout.phase,'finished');
 const waiting=create();waiting.index=12;waiting.phase='buffering';waiting.counterDeadline=0;for(const p of waiting.players){p.ready=true;p.loaded=[12];}waiting.players[0].loaded=[];advanceMatch(waiting,1000);assert.equal(waiting.phase,'buffering');assert.equal(matchView(waiting,waiting.players[0].id).players[0].audioReady,false);matchMove(waiting,waiting.players[0].id,{type:'loaded',indices:[12]},1001);assert.equal(waiting.phase,'guess');
 const early=create();early.phase='guess';early.startsAt=100;early.until=20100;early.players.forEach(p=>p.answers={anime:''});for(const p of early.players)matchMove(early,p.id,{type:'answer',index:0,answers:{anime:'Anime'},lock:true},101);assert.equal(early.phase,'reveal');assert.equal(early.history.length,1);
 const timed=create();timed.phase='guess';timed.startsAt=1000;timed.until=21000;
 const locked=timed.players[0],submit={type:'answer',index:0,answers:{anime:'Anime'},lock:true,lockedElapsedMs:1};
 matchMove(timed,locked.id,submit,2234);assert.equal(locked.lockedElapsedMs,1234);
 matchMove(timed,locked.id,submit,4567);assert.equal(locked.lockedElapsedMs,1234,'retry cannot change recorded lock time');
 assert.equal(matchView(timed,timed.players[1].id).players.find(p=>p.id===locked.id).lockedElapsedMs,1234);
 matchMove(timed,locked.id,{type:'unlock',index:0},5000);assert.equal(locked.locked,false);assert.equal(locked.lockedElapsedMs,undefined);
 assert.throws(()=>matchMove(timed,locked.id,{type:'unlock',index:1},5001),/no longer/);
 matchMove(timed,locked.id,submit,6000);assert.equal(locked.lockedElapsedMs,5000,'relocking records the new server receipt');
 gradeRound(timed,21000);advanceMatch(timed,timed.until);assert.equal(locked.lockedElapsedMs,undefined,'new song clears lock time');
 const all=create();for(let i=0;i<35;i++){answer(all,()=>true);advanceMatch(all,all.until);}assert.equal(all.phase,'finished');assert.equal(all.history.length,35);assert.deepEqual(all.teams,[5,5]);
});
test('NGMC ratings match Python global TrueSkill and apply simultaneous per-song pair adjustments',()=>{
 const roster=players.map(p=>({...p,elo:1000}));
 const history=[{results:roster.map((p,i)=>({id:p.id,correct:{anime:i<4}}))}];
 const ratings=ngmcRatings(roster,history);
 // Python trueskill 0.4.5, explicit ENV_GLOBAL, mu 20, sigma .25, beta .125,
 // tau .0025, draw_probability .8, mpmath. One pair = +/-9.4477360038514.
 for(let i=0;i<8;i++)assert.ok(Math.abs(ratings[i].delta-(i<4?1:-1)*4*9.4477360038514)<.00001);
 assert.ok(Math.abs(ratings.reduce((sum,p)=>sum+p.delta,0))<1e-8);
 const unanimous=[{results:roster.map(p=>({id:p.id,correct:{anime:true}}))}];assert.ok(ngmcRatings(roster,unanimous).every(p=>p.delta===0));
 const upset=[{id:'low',elo:500},{id:'high',elo:1500}];
 const round={results:[{id:'low',earned:1},{id:'high',earned:0}]};
 const [low,high]=ngmcRatings(upset,[round]);
 assert.ok(low.delta>400&&low.delta<410);
 assert.ok(Math.abs(low.delta+high.delta)<1e-8);
 const spreadRoster=roster.map((p,i)=>({...p,elo:500+i*200}));
 const longMatch=Array.from({length:25},(_,song)=>({results:spreadRoster.map((p,i)=>({id:p.id,earned:(i+song)%2}))}));
 assert.ok(ngmcRatings(spreadRoster,longMatch).every(p=>Number.isFinite(p.after)));
});

test('ranked leave receipts deduct once per match and apply a timed ban at three active strikes',()=>{
 const db=new DatabaseSync(':memory:');
 const sql={exec:(query,...args)=>db.prepare(query).all(...args)};
 const leaves=new RankedLeaves({sql,transactionSync:fn=>{db.exec('BEGIN');try{fn();db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}}});
 db.exec("CREATE TABLE ngmc_players(player TEXT PRIMARY KEY,elo REAL); INSERT INTO ngmc_players VALUES('a',1000); CREATE TABLE queue(player TEXT,match TEXT)");
 const day=86400000;
 leaves.record('old','a',day);
 leaves.record('one','a',15*day);
 leaves.record('two','a',16*day);
 leaves.record('two','a',16*day+1);
 assert.equal(leaves.banUntil('a'),null);
 leaves.record('three','a',17*day);
 assert.equal(leaves.banUntil('a'),20*day);
 leaves.record('three','a',19*day);
 assert.equal(leaves.banUntil('a'),20*day);
 assert.equal(sql.exec('SELECT elo FROM ngmc_players')[0].elo,900);
 assert.equal(leaves.banUntil('b'),null);
 db.exec('CREATE TABLE song_ratings(format TEXT,player TEXT,name TEXT,rating REAL,correct INTEGER,seen INTEGER,matches INTEGER,PRIMARY KEY(format,player))');
 for(const [match,format] of [['s1','1v1'],['s1','1v1'],['s2','1v1'],['s3','1v1'],['six','3v3']])
   leaves.record(match,'b',day,format,'Bee');
 assert.deepEqual(sql.exec('SELECT rating FROM song_ratings ORDER BY format').map(r=>r.rating),[925,975]);
 assert.equal(leaves.banUntil('b','1v1'),4*day);assert.equal(leaves.banUntil('b','3v3'),null);
 assert.equal(leaves.banUntil('b'),null);db.close();
});
test('only active ranked departures count, including disconnects beyond reconnect grace',()=>{
 const state=create(),p=state.players[0];
 state.phase='guess';state.startsAt=1000;state.until=200000;
 p.disconnectedAt=1000;
 advanceMatch(state,120999);assert.equal(p.left,false);
 advanceMatch(state,121000);assert.equal(p.rankedLeftAt,121000);
 matchMove(state,p.id,{type:'leave'},121005);assert.equal(p.rankedLeftAt,121000);
 for(const [format,phase] of [['ngmc-3v3','guess'],['ngmc-ranked','loading'],['ngmc-ranked','finished']]){
   const match=create();match.format=format;match.phase=phase;match.startsAt=1;match.until=200000;
   matchMove(match,match.players[0].id,{type:'leave'},1234);assert.equal(match.players[0].rankedLeftAt,undefined);
 }
});

test('matchmaking ready checks distinguish a missed confirmation from slow audio',()=>{
  for(const format of ['ngmc-ranked','ngmc-3v3','1v1']){
    const state=create();state.format=format;
    const [late,...others]=state.players;
    for(const p of others)matchMove(state,p.id,{type:'accept-ready'},89999);
    advanceMatch(state,89999);assert.equal(state.phase,'loading');
    matchMove(state,late.id,{type:'accept-ready'},90000);
    assert.equal(state.phase,'cancelled');assert.equal(late.left,true);
    assert.equal(late.rankedLeftAt,format!=='ngmc-3v3'?90000:undefined);
    assert.ok(others.every(p=>!p.left&&p.rankedLeftAt==null));
  }
  const slow=create();
  for(const p of slow.players)matchMove(slow,p.id,{type:'accept-ready'},1);
  advanceMatch(slow,90000);assert.equal(slow.phase,'loading');
  assert.ok(slow.players.every(p=>!p.left&&!p.loaded.length));
});
