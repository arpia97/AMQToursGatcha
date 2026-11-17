import test from 'node:test';
import assert from 'node:assert/strict';
import {buildArtistLibrary,artistMatches} from '../src/play-artists.js';
import {makeMatch,matchMove,matchView,advanceMatch} from '../src/play-match-rules.js';
import {answerSearchIndex,searchAnswers} from '../public/play-answer-search.js';
test('artist aliases, equivalent groups, directed solo groups and full member answers',()=>{
  const master={artistMap:{1:{name:'Manaka Iwami',altNameLinks:[2]},2:{name:'Iwami, Manaka'},3:{name:'Éir Aoi'}},groupMap:{1:{name:'Solo Project',artistMembers:[1]},2:{name:'Duo',artistMembers:[1,3]},3:{name:'Other Duo',artistMembers:[3,1]}}};
  const library=buildArtistLibrary(master);
  assert.equal(artistMatches('Manaka Iwami','Iwami Manaka',library.rules),true);
  assert.equal(artistMatches('Solo Project','Manaka Iwami',library.rules),true);
  assert.equal(artistMatches('Manaka Iwami','Solo Project',library.rules),false);
  assert.equal(artistMatches('Duo','Other Duo',library.rules),true);
  assert.equal(artistMatches('Duo','Eir Aoi, Manaka Iwami',library.rules),true);
  assert.equal(artistMatches('Duo','Manaka Iwami',library.rules),false);
  assert.equal(artistMatches('LiSA',''),false);
  assert.equal(artistMatches('水樹奈々','花澤香菜'),false);
  const index=answerSearchIndex({artist:['Iwami, Manaka','Éir Aoi'],anime:['Anime Alt','Anime Name'],song:Array.from({length:100},(_,i)=>'Song '+i)});
  assert.deepEqual(searchAnswers(index,'artist','manaka iwami'),['Iwami, Manaka']);
  assert.equal(searchAnswers(index,'song','song').length,20);
});
const songs=Array.from({length:20},(_,i)=>({audio:'https://example.test/'+i+'.mp3',anime:'Anime',title:'Song',artist:'Artist',answers:{anime:['anime','alternate'],song:['song'],artist:['Artist']},artistRules:{}}));
const players=Array.from({length:6},(_,i)=>({id:String(i),name:'Player '+i}));
test('matches preload all ten, share only team answers, score categories once and resume without duplicate points',()=>{
  let now=100000;const s=makeMatch('local','3v3',players,songs,now);
  const move=(id,message)=>matchMove(s,id,message,now);
  for(const p of s.players){move(p.id,{type:'loaded',indices:Array.from({length:9},(_,i)=>i)});move(p.id,{type:'ready'});}
  assert.equal(s.phase,'loading');
  for(const p of s.players)move(p.id,{type:'loaded',indices:[9]});
  assert.equal(s.phase,'guess');assert.equal(s.startsAt,now+3000);
  assert.throws(()=>move('0',{type:'answer',index:0,answers:{anime:'Anime',song:'Song',artist:'Artist'}}),/no longer/);
  now=s.startsAt;
  const p=s.players[0],teammate=s.players.find(x=>x.id!==p.id&&x.team===p.team),opponent=s.players.find(x=>x.team!==p.team);
  const answers={anime:'Alternate',song:'Song',artist:'Artist'};
  move(p.id,{type:'answer',index:0,answers,lock:true});
  assert.equal(matchView(s,teammate.id,now).players.find(x=>x.id===p.id).answers.anime,'Alternate');
  assert.equal(matchView(s,opponent.id,now).players.find(x=>x.id===p.id).answers,undefined);
  assert.equal(matchView(s,p.id,now).songs,undefined);assert.equal(matchView(s,p.id,now).history.length,0);
  move(p.id,{type:'answer',index:0,answers:{anime:'wrong',song:'wrong',artist:'wrong'},lock:true});
  assert.equal(p.answers.anime,'Alternate');
  for(const other of s.players.filter(x=>x.id!==p.id))move(other.id,{type:'answer',index:0,answers,lock:true});
  assert.equal(s.phase,'reveal');assert.deepEqual(s.teams,[3,3]);assert.ok(s.players.every(p=>p.score===3));
  now=s.until;advanceMatch(s,now);assert.equal(s.index,1);
  const copy=JSON.parse(JSON.stringify(s));advanceMatch(copy,now);assert.deepEqual(copy.teams,[3,3]);
  now=s.until;advanceMatch(s,now);assert.equal(s.history.length,2);assert.deepEqual(s.teams,[3,3]);
  assert.throws(()=>matchView(s,'stranger'),/not in/);
});
test('one-team match handles full completion, a buffering timeout and departed players',()=>{
  let now=1;const s=makeMatch('co-op','1-team',players.slice(0,3),songs,now);
  for(const p of s.players){matchMove(s,p.id,{type:'loaded',indices:Array.from({length:20},(_,i)=>i)},now);matchMove(s,p.id,{type:'ready'},now);}
  for(let i=0;i<20;i++){
    now=s.startsAt;
    for(const p of s.players)matchMove(s,p.id,{type:'answer',index:i,answers:{anime:'Anime',song:'Song',artist:'Artist'},lock:true},now);
    now=s.until;advanceMatch(s,now);
  }
  assert.equal(s.phase,'finished');assert.deepEqual(s.teams,[60]);assert.ok(s.players.every(p=>p.score===60));
  advanceMatch(s,now+1000);assert.equal(s.history.length,20);
  const timeout=makeMatch('timeout','1v1',players.slice(0,2),songs,now);advanceMatch(timeout,timeout.until);assert.equal(timeout.phase,'cancelled');
  const left=makeMatch('left','1v1',players.slice(0,2),songs,now);for(const p of left.players)matchMove(left,p.id,{type:'leave'},now);assert.equal(left.phase,'cancelled');
});
