import test from 'node:test';
import assert from 'node:assert/strict';
import {ngmcGuesses,balanceNgmc} from '../src/ngmc-rules.js';
import {ngmcSongPool} from '../src/ngmc-selection.js';
import {ngmcRatings} from '../src/ngmc-ratings.js';
import {makeMatch,advanceMatch,matchMove,matchView,gradeRound} from '../src/play-match-rules.js';
const players=Array.from({length:8},(_,i)=>({id:String(i),name:'Player '+i,elo:1000+i*20,guessRate:[7,8,18.99,19,27.99,28,39.99,40][i]}));
const songs=Array.from({length:35},()=>({audio:'local',anime:'Anime',title:'Song',artist:'Artist',answers:{anime:['anime']}}));
const create=()=>makeMatch('local','ngmc-ranked',players,songs,0);
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
 advanceMatch(s,120000);assert.equal(s.phase,'loading');for(const p of s.players)p.loaded.push(11);
 advanceMatch(s,119999);assert.equal(s.phase,'loading');advanceMatch(s,120000);assert.equal(s.phase,'guess');assert.equal(s.until-s.startsAt,20000);
 const a=s.players.filter(p=>p.team===0),b=s.players.filter(p=>p.team===1);
 s.counters=[a[0].id,b[0].id];answer(s,()=>true);assert.equal(s.phase,'counting');
 assert.equal(matchView(s,a[0].id).players.find(p=>p.id===a[1].id).answers,undefined);
 assert.throws(()=>matchMove(s,a[1].id,{type:'count',index:0,player:a[1].id},1001),/Only your team counter/);
 matchMove(s,a[0].id,{type:'count',index:0,player:a[1].id},1001);const before=a[1].guesses;
 matchMove(s,a[0].id,{type:'count',index:0,player:a[0].id},1002);assert.equal(a[1].guesses,before);
 advanceMatch(s,9000);assert.equal(s.phase,'reveal');assert.equal(a[1].guesses,before-1);assert.deepEqual(s.teams,[5,5]);
 assert.equal(s.history.at(-1).spent[1],[...b].sort((x,y)=>x.elo-y.elo)[0].id);
 s.counters=[null,null];a.forEach(p=>p.guesses=0);a[0].guesses=1;b[0].guesses=0;
 answer(s,p=>p.id===a[0].id||p.id===b[0].id);assert.deepEqual(s.teams,[5,4]);assert.ok(a.every(p=>p.guesses===p.initialGuesses));assert.deepEqual(s.history.at(-1).reset,[0]);
 s.index=34;advanceMatch(s,s.until);assert.equal(s.phase,'finished');
 const knockout=create();knockout.teams=[5,1];answer(knockout,p=>p.team===0);assert.deepEqual(knockout.teams,[5,0]);advanceMatch(knockout,knockout.until);assert.equal(knockout.phase,'finished');
 const waiting=create();waiting.index=12;waiting.phase='buffering';waiting.counterDeadline=0;for(const p of waiting.players){p.ready=true;p.loaded=[12];}waiting.players[0].loaded=[];advanceMatch(waiting,1000);assert.equal(waiting.phase,'buffering');assert.equal(matchView(waiting,waiting.players[0].id).players[0].audioReady,false);matchMove(waiting,waiting.players[0].id,{type:'loaded',indices:[12]},1001);assert.equal(waiting.phase,'guess');
 const early=create();early.phase='guess';early.startsAt=100;early.until=20100;early.players.forEach(p=>p.answers={anime:''});for(const p of early.players)matchMove(early,p.id,{type:'answer',index:0,answers:{anime:'Anime'},lock:true},101);assert.equal(early.phase,'reveal');assert.equal(early.history.length,1);
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
});
