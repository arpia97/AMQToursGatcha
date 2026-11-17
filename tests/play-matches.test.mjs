import {loadTourRate} from '../src/play-tour-rate.js';
import {closeSocket} from '../src/play-sockets.js';
import {DatabaseSync} from 'node:sqlite';
import {MatchReview,prepareAudioPool,audioManifest,loadedRounds,decoyHits,REVIEW_RETENTION} from '../src/play-integrity.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {buildArtistLibrary,artistMatches,submittedArtists} from '../src/play-artists.js';
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
  assert.equal(artistMatches('Duo',['Iwami, Manaka','Éir Aoi'],library.rules),true);
  assert.equal(artistMatches('Duo',['Duo'],library.rules),true);
  assert.equal(artistMatches('Duo',['Iwami, Manaka'],library.rules),false);
  assert.equal(artistMatches('Duo',['Iwami, Manaka','Éir Aoi','LiSA'],library.rules),false);
  assert.equal(artistMatches('Duo',['Iwami, Manaka','Manaka Iwami'],library.rules),false);
  assert.equal(artistMatches('Duo',[],library.rules),false);
  assert.throws(()=>submittedArtists(['']),/individual/);
  assert.throws(()=>submittedArtists(Array(51).fill('Artist')),/individual/);
  assert.equal(artistMatches('LiSA',''),false);
  assert.equal(artistMatches('水樹奈々','花澤香菜'),false);
  const index=answerSearchIndex({artist:['Iwami, Manaka','Éir Aoi'],anime:['Anime Alt','Anime Name'],song:Array.from({length:100},(_,i)=>'Song '+i)});
  assert.deepEqual(searchAnswers(index,'artist','manaka iwami'),['Iwami, Manaka']);
  assert.equal(searchAnswers(index,'song','song').length,20);
});
const songs=Array.from({length:20},(_,i)=>({audio:'https://example.test/'+i+'.mp3',anime:'Anime',title:'Song',artist:'Artist',answers:{anime:['anime','alternate'],song:['song'],artist:['Artist']},artistRules:{}}));
const players=Array.from({length:6},(_,i)=>({id:String(i),name:'Player '+i}));

test('unused audio never becomes a round; review suppresses shared answers and preserves server receipts with bounded private retention',()=>{
  const state=makeMatch('local','1v1',players.slice(0,2),structuredClone(songs));
  const decoy={audio:'https://example.test/unused.mp3',anime:'Unused Anime',title:'Unused Song',artist:'Unused Artist',answers:{anime:['unused anime'],song:['unused song'],artist:['Unused Artist']}};
  prepareAudioPool(state,[decoy]);const manifest=audioManifest(state);
  assert.equal(manifest.audio.length,21);assert.equal(manifest.total,20);assert.equal(manifest.preload,11);
  assert.equal(manifest.decoys,undefined);assert.equal(manifest.audioPool,undefined);
  assert.equal(matchView(state,'0').audioPool,undefined);assert.equal(matchView(state,'0').decoys,undefined);
  assert.equal(manifest.audio[matchView(state,'0').audioIndex],songs[0].audio);
  const decoyIndex=manifest.audio.indexOf(decoy.audio);
  assert.ok(decoyIndex<manifest.preload);assert.deepEqual(loadedRounds(state,[decoyIndex]),[]);
  assert.deepEqual(loadedRounds(state,Array.from({length:manifest.preload},(_,i)=>i)).sort((a,b)=>a-b),Array.from({length:10},(_,i)=>i));
  assert.equal(loadedRounds(state,[21]),null);
  assert.equal(decoyHits(state,{anime:'Unused Anime'}).length,1);
  state.songs[19].answers.anime.push('unused anime');assert.deepEqual(decoyHits(state,{anime:'Unused Anime'}),[]);
  state.songs[19].answers.anime.pop();
  const db=new DatabaseSync(':memory:');try{
    const log=new MatchReview({sql:{exec:(sql,...args)=>db.prepare(sql).all(...args)}});log.initialize(state);
    const before={index:0,phase:'guess',startsAt:500,locked:false};
    state.players.find(p=>p.id==='0').answers={anime:'Unused Anime'};
    log.submission(state,'0',{type:'answer',index:0,answers:{anime:'Unused Anime'},lock:true,clientAt:1},before,null,900);
    log.submission(state,'0',{type:'answer',index:0,answers:{anime:'Unused Anime'},lock:true},{...before,locked:true},null,901);
    log.submission(state,'0',{type:'answer',index:0,answers:{anime:'Unused Anime'},lock:true},before,{status:409,message:'Too late'},902);
    log.activity(state,'1',{event:'visibility',visibility:'hidden',focused:false,clientAt:10},903);
    const review=log.page();assert.equal(review.expires,state.created+REVIEW_RETENTION);
    const submitted=review.events.find(e=>e.kind==='submit');assert.equal(submitted.at,900);assert.equal(submitted.data.elapsedMs,400);assert.equal(submitted.data.clientAt,1);assert.equal(submitted.data.flags.length,1);
    assert.ok(review.events.filter(e=>e.kind==='answer-draft').every(e=>!e.data.accepted&&!e.data.flags.length));
    assert.equal(log.page({player:'1'}).events.length,1);
    assert.ok(log.page({before:submitted.seq}).events.length===0);
    db.prepare('UPDATE review_counts SET n=4001 WHERE player=?').run('0');log.add(state,'0','connected');log.add(state,'1','connected');assert.equal(log.page().events.length,5);
    db.prepare('UPDATE review_meta SET expires=1').run();assert.equal(log.page(),null);
  }finally{db.close();}
});
test('matches preload all ten, share only team answers, score categories once and resume without duplicate points',()=>{
  let now=100000;const s=makeMatch('local','3v3',players,songs,now);
  const move=(id,message)=>matchMove(s,id,message,now);
  for(const p of s.players){move(p.id,{type:'loaded',indices:Array.from({length:9},(_,i)=>i)});move(p.id,{type:'ready'});}
  assert.equal(s.phase,'loading');
  for(const p of s.players)move(p.id,{type:'loaded',indices:[9]});
  assert.equal(s.phase,'guess');assert.equal(s.startsAt,now+3000);assert.equal(s.until-s.startsAt,30000);
  assert.throws(()=>move('0',{type:'answer',index:0,answers:{anime:'Anime',song:'Song',artist:'Artist'}}),/no longer/);
  now=s.startsAt;
  const p=s.players[0],teammate=s.players.find(x=>x.id!==p.id&&x.team===p.team),opponent=s.players.find(x=>x.team!==p.team);
  const answers={anime:'Alternate',song:'Song',artist:'Artist'};
  move(p.id,{type:'answer',index:0,field:'anime',answer:'wrong'});
  move(p.id,{type:'answer',index:0,field:'anime',answer:answers.anime});
  assert.equal(matchView(s,teammate.id,now).players.find(x=>x.id===p.id).answers.anime,'Alternate');
  assert.equal(matchView(s,opponent.id,now).players.find(x=>x.id===p.id).answers,undefined);
  assert.equal(matchView(s,opponent.id,now).players.find(x=>x.id===p.id).field,undefined);
  assert.equal(matchView(s,p.id,now).songs,undefined);assert.equal(matchView(s,p.id,now).songList.length,0);
  assert.throws(()=>move(teammate.id,{type:'answer',index:0,field:'anime',answer:'steal'}),/already claimed/);
  assert.throws(()=>move(p.id,{type:'answer',index:0,field:'song',answer:'Song'}),/another field/);
  assert.equal(p.answers.anime,'Alternate');
  for(const team of [0,1])s.players.filter(x=>x.team===team).forEach((other,i)=>{const field=['anime','song','artist'][i];move(other.id,{type:'answer',index:0,field,answer:answers[field]});});
  const artistOwner=s.players.find(p=>p.team===0&&p.field==='artist');
  move(artistOwner.id,{type:'answer',index:0,field:'artist',artists:['Artist','Extra']});
  assert.deepEqual(artistOwner.artists,['Artist','Extra']);
  move(artistOwner.id,{type:'answer',index:0,field:'artist',artists:[]});
  assert.equal(artistOwner.field,'artist');assert.equal(artistOwner.answers.artist,'');
  move(artistOwner.id,{type:'answer',index:0,field:'artist',artists:['Artist']});
  assert.equal(s.phase,'guess'); // Owners may revise until the deadline.
  const resumed=JSON.parse(JSON.stringify(s));assert.equal(matchView(resumed,p.id,now).players.find(x=>x.id===p.id).field,'anime');
  now=s.until;advanceMatch(s,now);
  assert.equal(s.phase,'reveal');assert.deepEqual(s.teams,[3,3]);assert.ok(s.players.every(p=>p.score===1));
  assert.equal(matchView(s,p.id,now).songList.length,1);
  now=s.until;advanceMatch(s,now);assert.equal(s.index,1);assert.ok(s.players.every(p=>!p.field&&!Object.keys(p.answers).length));
  const copy=JSON.parse(JSON.stringify(s));advanceMatch(copy,now);assert.deepEqual(copy.teams,[3,3]);
  now=s.until;advanceMatch(s,now);assert.equal(s.history.length,2);assert.deepEqual(s.teams,[3,3]);
  assert.throws(()=>matchView(s,'stranger'),/not in/);
});
test('one-team match handles full completion, a buffering timeout and departed players',()=>{
  let now=1;const s=makeMatch('co-op','1-team',players.slice(0,3),songs,now);
  for(const p of s.players){matchMove(s,p.id,{type:'loaded',indices:Array.from({length:20},(_,i)=>i)},now);matchMove(s,p.id,{type:'ready'},now);}
  for(let i=0;i<20;i++){
    now=s.startsAt;
    s.players.forEach((p,index)=>{const field=['anime','song','artist'][index];matchMove(s,p.id,{type:'answer',index:i,field,answer:{anime:'Anime',song:'Song',artist:'Artist'}[field]},now);});
    matchMove(s,s.players[1].id,{type:'reaction',index:i,field:'anime',value:'O'},now);
    assert.equal(matchView(s,s.players[0].id,now).players[1].reactions.anime,'O');
    assert.throws(()=>matchMove(s,s.players[1].id,{type:'reaction',index:i,field:'anime',value:'bad'},now),/valid/);
    now=s.until;advanceMatch(s,now);
    now=s.until;advanceMatch(s,now);
  }
  assert.equal(s.phase,'finished');assert.equal(matchView(s,s.players[0].id,now).songList.length,20);assert.deepEqual(s.teams,[60]);assert.ok(s.players.every(p=>p.score===20));
  advanceMatch(s,now+1000);assert.equal(s.history.length,20);
  const legacy=makeMatch('legacy','1-team',players.slice(0,3),songs,now);delete legacy.teamFields;
  legacy.phase='guess';legacy.startsAt=now;legacy.until=now+30000;
  for(const p of legacy.players)matchMove(legacy,p.id,{type:'answer',index:0,answers:{anime:'Anime',song:'Song',artist:'Artist'},lock:true},now);
  assert.equal(legacy.phase,'reveal');assert.ok(legacy.players.every(p=>p.score===3));
  const timeout=makeMatch('timeout','1v1',players.slice(0,2),songs,now);advanceMatch(timeout,timeout.until);assert.equal(timeout.phase,'cancelled');
  const left=makeMatch('left','1v1',players.slice(0,2),songs,now);for(const p of left.players)matchMove(left,p.id,{type:'leave'},now);assert.equal(left.phase,'cancelled');
});

test('NGMC seed lookup retries transient failures and reserved socket closures are normalized',async()=>{
  let calls=0;assert.equal(await loadTourRate('local',async()=>{calls++;if(calls===1)throw new TypeError('network reset');return Response.json({modes:[{mode:'usual',correct:11,encounters:50}]});}),22);assert.equal(calls,2);
  assert.equal(await loadTourRate('local',async()=>new Response(null,{status:404})),null);
  await assert.rejects(loadTourRate('local',async(url,options)=>{assert.equal(options.redirect,'manual');return new Response(null,{status:302,headers:{Location:'https://wrong.test'}});}),error=>error.status===503);
  await assert.rejects(loadTourRate('local',async()=>Response.json({error:'invalid'})),error=>error.status===503&&/guess rates/.test(error.message));
  for(const code of [1005,1006,1015]){let sent;closeSocket({close:value=>{sent=value;}},code);assert.equal(sent,1000);}
});
