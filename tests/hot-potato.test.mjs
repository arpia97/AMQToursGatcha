import test from 'node:test';
import assert from 'node:assert/strict';
import {makeMatch, matchMove, gradeRound, advanceMatch} from '../src/play-match-rules.js';
import {beginPotatoSong} from '../src/hot-potato.js';
import {canAnswerPotato, passTargets, mustPass, POTATO_FORMAT, POTATO_COOP, POTATO_COOP_LOBBY} from '../public/hot-potato.js';

const songs = Array.from({length:100}, (_,i)=>({
  anime:'Anime '+i,title:'Track',artist:'Singer',answers:{anime:['Anime '+i]},
}));
function game(format=POTATO_FORMAT,n=4,lobby=null) {
  const players=Array.from({length:n},(_,i)=>({id:String(i+1),name:'Player '+(i+1)}));
  return Object.assign(makeMatch('fixture',format,players,songs,0,lobby),{phase:'guess',startsAt:0,until:20000});
}
const guess=(s,id,text)=>matchMove(s,id,{type:'answer',index:s.index,answers:{anime:text},lock:true},1000);
const pass=(s,id,target)=>matchMove(s,id,{type:'pass-potato',index:s.index,player:target},1000);
const holder=(s,team=0)=>s.players.find(p=>p.id===s.potatoes[team].holder);

test('Team VS accepts even sizes including 1v1; cooperative matchmaking and custom rooms have distinct minimums',()=>{
  for(const count of [2,4,10])assert.deepEqual(game(POTATO_FORMAT,count).teams,[5,5]);
  assert.throws(()=>game(POTATO_FORMAT,5));
  for(const count of [2,7,8])assert.deepEqual(game(POTATO_COOP,count).teams,[5]);
  for(const count of [1,9])assert.throws(()=>game(POTATO_COOP,count));
  assert.equal(game(POTATO_COOP_LOBBY,1,{seconds:20}).teams.length,1);
});
test('a pass spends only the recipient’s guess; only the holder can submit and a receiver cannot pass again',()=>{
  const s=game(),first=holder(s),second=passTargets(s,0)[0];
  assert.throws(()=>guess(s,second.id,'Anime 0'));
  assert.throws(()=>matchMove(s,second.id,{type:'draft',index:0,answers:{anime:'Anime 0'}},1000));
  pass(s,first.id,second.id);
  assert.throws(()=>pass(s,second.id,first.id));
  guess(s,second.id,'Anime 0');
  guess(s,second.id,'Anime 0');
  assert.equal(first.guesses,5);
  assert.equal(second.guesses,4);
  gradeRound(s,20000);
  assert.deepEqual(s.teams,[5,4]);
  assert.equal(holder(s,1).guesses,4);
});
test('previous answerers must pass after a reset; a mandatory timeout spends a teammate’s guess as a miss',()=>{
  const s=game(POTATO_COOP,3),prior=holder(s);
  for(const p of s.players)p.guesses=0;
  beginPotatoSong(s);
  assert.ok(s.players.every(p=>p.guesses===5));
  assert.equal(mustPass(s,0),true);
  assert.throws(()=>guess(s,prior.id,'Anime 0'));
  gradeRound(s,20000);
  assert.equal(s.teams[0],4);
  assert.notEqual(holder(s).id,prior.id);
  assert.equal(holder(s).guesses,4);
  assert.equal(prior.guesses,5);
});
test('an opening holder who leaves transfers the turn without trapping the team',()=>{
  const s=game(POTATO_COOP,2),prior=holder(s);
  matchMove(s,prior.id,{type:'leave'},800);
  assert.notEqual(holder(s).id,prior.id);
  assert.equal(holder(s).guesses,4);
  guess(s,holder(s).id,'Anime 0');
  assert.deepEqual(s.teams,[5]);
});

test('only remaining eligible teammate may keep answering; zero-budget teammates are ineligible',()=>{
  const s=game(POTATO_COOP,3),p=holder(s);
  for(const other of s.players)if(other!==p)other.guesses=0;
  beginPotatoSong(s);
  assert.deepEqual(passTargets(s,0),[]);
  assert.equal(canAnswerPotato(s,p),true);
  guess(s,p.id,'nonsense');
  assert.deepEqual(s.teams,[4]);
  assert.equal(p.guesses,4);
});
test('equal hits and equal misses preserve both teams’ lives, one-sided hit ends a last-life game, song 100 ends a tie',()=>{
  for(const answer of ['Anime 0','nonsense']){
    const s=game();for(const t of [0,1])guess(s,holder(s,t).id,answer);
    assert.deepEqual(s.teams,[5,5]);
  }
  const finalLife=game();
  finalLife.teams[1]=1;
  guess(finalLife,holder(finalLife).id,'Anime 0');gradeRound(finalLife,20000);
  advanceMatch(finalLife,finalLife.until);
  assert.deepEqual(finalLife.teams,[5,0]);assert.equal(finalLife.phase,'finished');
  const draw=game();draw.index=99;
  gradeRound(draw,20000);advanceMatch(draw,draw.until);
  assert.deepEqual(draw.teams,[5,5]);assert.equal(draw.phase,'finished');
});
