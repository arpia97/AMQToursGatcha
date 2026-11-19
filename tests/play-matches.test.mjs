import {archivedRecords} from '../src/play-records.js';
import {loadTourRate} from '../src/play-tour-rate.js';
import {closeSocket} from '../src/play-sockets.js';
import {DatabaseSync} from 'node:sqlite';
import {playRankingPage} from '../src/play-ranking-query.js';
import {MatchReview,prepareAudioPool,audioManifest,loadedRounds,decoyHits} from '../src/play-integrity.js';
import test from 'node:test';
import assert from 'node:assert/strict';
test('Quiz ranking sorts across pages, retains overall ranks and places untimed players last',()=>{
  const db=new DatabaseSync(':memory:');
  try {
    db.exec('CREATE TABLE standings_fixture(player INTEGER,name TEXT,correct INTEGER,seen INTEGER,matches INTEGER,avgTimeMs REAL)');
    const insert=db.prepare('INSERT INTO standings_fixture VALUES(?,?,?,?,?,?)');
    for(let i=1;i<=52;i++)insert.run(i,'Player '+i,53-i,100,5,i===1?null:53000-i*1000);
    const defaults=playRankingPage((sql,...args)=>db.prepare(sql).all(...args),'SELECT * FROM standings_fixture',[],{quiz:true});
    assert.deepEqual(defaults.rows.slice(0,3).map(r=>r.correct),[52,51,50]);
    const page=(index,dir)=>playRankingPage((sql,...args)=>db.prepare(sql).all(...args),
      'SELECT * FROM standings_fixture',[],{quiz:true,page:index,sort:'time',dir});
    assert.equal(page(0,'asc').rows[0].rank,52);
    assert.deepEqual(page(1,'asc').rows.map(r=>r.rank),[2,1]);
    assert.deepEqual(page(1,'desc').rows.map(r=>r.rank),[52,1]);
  } finally {db.close();}
});
import {buildArtistLibrary,artistMatches,submittedArtists,titleMatches} from '../src/play-artists.js';
import {makeMatch,matchMove,matchView,advanceMatch} from '../src/play-match-rules.js';
import {sealPlayAudio,playAudioResponse} from '../src/play-media.js';
import {sampleStart} from '../public/play-sample.js';
import {recapHTML} from '../public/play-round-ui.js';
import {answerSearchIndex,searchAnswers} from '../public/play-answer-search.js';
test('artist aliases, equivalent groups, directed solo groups and full member answers',()=>{
  const master={artistMap:{1:{name:'Manaka Iwami',altNameLinks:[2]},2:{name:'Iwami, Manaka'},3:{name:'Éir Aoi'}},groupMap:{1:{name:'Solo Project',artistMembers:[1]},2:{name:'Duo',artistMembers:[1,3]},3:{name:'Other Duo',artistMembers:[3,1]}}};
  const library=buildArtistLibrary(master);
  assert.deepEqual([...library.rules.duo.composition].sort(),['Manaka Iwami','Éir Aoi'].sort());
  assert.deepEqual(library.rules['project solo'].composition,['Manaka Iwami']);
  assert.equal(titleMatches(['S.O.S.'], 'sos'),true);
  assert.equal(titleMatches(["Don't Stop"], 'dont stop'),true);
  assert.equal(titleMatches(['☆☆☆☆'], '☆☆☆☆'),true);
  assert.equal(titleMatches(['☆☆☆☆'], ''),false);
  assert.equal(titleMatches(['Anime Season 2'], 'Anime'),false);
  assert.equal(artistMatches('LiSA',['LiSA','Another Artist']),false);
  assert.equal(artistMatches('Manaka Iwami','Iwami Manaka',library.rules),true);
  assert.equal(artistMatches('Solo Project','Manaka Iwami',library.rules),true);
  assert.equal(artistMatches('Manaka Iwami','Solo Project',library.rules),false);
  assert.equal(artistMatches('Duo','Other Duo',library.rules),true);
  assert.equal(artistMatches('Duo','Eir Aoi, Manaka Iwami',library.rules),true);
  assert.equal(artistMatches('Duo','Manaka Iwami',library.rules),false);
  assert.equal(artistMatches('Duo',['Iwami, Manaka','Éir Aoi'],library.rules),true);
  assert.equal(artistMatches('Duo',['Duo'],library.rules),true);
  assert.equal(artistMatches('Duo',['Other Duo','Iwami, Manaka'],library.rules),true);
  assert.equal(artistMatches('Duo',['Duo','LiSA'],library.rules),false);
  assert.equal(artistMatches('Duo',['Manaka Iwami','Iwami, Manaka','Éir Aoi'],library.rules),true);
  assert.equal(artistMatches('LiSA',['LiSA','LiSA']),true);
  assert.equal(artistMatches('Duo',['Iwami, Manaka'],library.rules),false);
  assert.equal(artistMatches('Duo',['Iwami, Manaka','Éir Aoi','LiSA'],library.rules),false);
  assert.equal(artistMatches('Duo',['Iwami, Manaka','Manaka Iwami'],library.rules),false);
  assert.equal(artistMatches('Duo',[],library.rules),false);
  assert.throws(()=>submittedArtists(['']),/individual/);
  assert.throws(()=>submittedArtists(Array(51).fill('Artist')),/individual/);
  assert.equal(artistMatches('LiSA',''),false);
  assert.equal(artistMatches('水樹奈々','花澤香菜'),false);
  const index=answerSearchIndex({artist:['Iwami, Manaka','Éir Aoi','Iwami','Manaka Iwami Long Alias'],anime:['Anime Alt','Anime Name'],song:Array.from({length:100},(_,i)=>'Song '+i)});
  assert.deepEqual(searchAnswers(index,'artist','manaka iwami'),['Iwami, Manaka','Manaka Iwami Long Alias']);
  assert.deepEqual(searchAnswers(index,'artist','iwami',1),['Iwami']);
  assert.ok(library.names.includes('Éir Aoi')); // Individual group members remain selectable.
  assert.equal(searchAnswers(index,'song','song').length,20);
  const shana=answerSearchIndex({anime:['Shakugan no Shana','Burning-Eyed Shana','Shakugan no Shana S']});
  assert.deepEqual(searchAnswers(shana,'anime','shana s'),['Shakugan no Shana S','Shakugan no Shana','Burning-Eyed Shana']);
  assert.deepEqual(searchAnswers(shana,'anime','s shana',1),['Shakugan no Shana S']);
  assert.deepEqual(searchAnswers(shana,'anime','shana',0),[]);
  const bilingual=answerSearchIndex({anime:['Starmyu','Koukou Hoshi Kageki']});
  assert.deepEqual(searchAnswers(bilingual,'anime','starmuy'),['Starmyu']);
  assert.deepEqual(searchAnswers(bilingual,'anime','kageki'),['Koukou Hoshi Kageki']);
  const revenge=answerSearchIndex({anime:["Masamune-kun's Revenge","Masamune-kun no Revenge","Masamune-kun's Revenge R","Masamune-kun no Revenge R"]});
  assert.deepEqual(searchAnswers(revenge,'anime','ge r',1),["Masamune-kun's Revenge R"]);
  assert.deepEqual(searchAnswers(revenge,'anime','enge r').slice(0,2),["Masamune-kun's Revenge R","Masamune-kun no Revenge R"]);


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
    const review=log.page();assert.equal(review.expires,null);
    const submitted=review.events.find(e=>e.kind==='submit'&&e.at===900);assert.ok(review.events.some(e=>e.kind==='submit'&&e.at===901&&e.data.accepted));assert.equal(submitted.data.elapsedMs,400);assert.equal(submitted.data.clientAt,1);assert.equal(submitted.data.flags.length,1);
    assert.ok(review.events.filter(e=>e.kind==='answer-draft').every(e=>!e.data.accepted&&!e.data.flags.length));
    assert.equal(log.page({player:'1'}).events.length,1);
    assert.ok(log.page({before:submitted.seq}).events.length===0);
    db.prepare('UPDATE review_counts SET n=4001 WHERE player=?').run('0');log.add(state,'0','connected');log.add(state,'1','connected');assert.equal(log.page().events.length,5);
    db.prepare('UPDATE review_meta SET expires=1').run();assert.equal(log.page().events.length,5);assert.equal(log.page().expires,null);
  }finally{db.close();}
});
test('matches preload all ten, share only team answers, score categories once and resume without duplicate points',()=>{
  let now=100000;const s=makeMatch('local','3v3',players,songs,now);
  const move=(id,message)=>matchMove(s,id,message,now);
  for(const p of s.players){move(p.id,{type:'loaded',indices:Array.from({length:9},(_,i)=>i)});move(p.id,{type:'ready'});}
  assert.equal(s.phase,'loading');
  for(const p of s.players)move(p.id,{type:'loaded',indices:[9]});
  assert.equal(s.phase,'guess');assert.equal(s.startsAt,now);assert.equal(s.until-s.startsAt,30000);
  assert.throws(()=>move('0',{type:'answer',index:1,answers:{anime:'Anime',song:'Song',artist:'Artist'}}),/no longer/);
  now=s.startsAt;
  const p=s.players[0],teammate=s.players.find(x=>x.id!==p.id&&x.team===p.team),opponent=s.players.find(x=>x.team!==p.team);
  const answers={anime:'Alternate',song:'Song',artist:'Artist'};
  move(p.id,{type:'answer',index:0,field:'anime',answer:'wrong'});
  move(p.id,{type:'answer',index:0,field:'anime',answer:answers.anime});
  assert.equal(p.answers.anime,'Alternate','the owner can directly revise a submitted field');
  assert.deepEqual(matchView(s,opponent.id,now).players.find(x=>x.id===p.id).submittedFields,['anime']);
  move(p.id,{type:'unlock',index:0});assert.equal(p.field,null);assert.deepEqual(p.answers,{});
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
  assert.equal(s.phase,'reveal');assert.throws(()=>move(p.id,{type:'unlock',index:0}),/no longer/);assert.deepEqual(s.teams,[3,3]);assert.ok(s.players.every(p=>p.score===1));
  assert.equal(matchView(s,p.id,now).songList.length,1);
  advanceMatch(s,now+2999);assert.equal(s.phase,'reveal');assert.equal(s.index,0);
  now+=3000;advanceMatch(s,now);assert.equal(s.index,1);assert.ok(s.players.every(p=>!p.field&&!Object.keys(p.answers).length));
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
    if(i===0){
      matchMove(s,s.players[0].id,{type:'unlock',index:i},now);
      assert.equal(s.players[1].reactions.anime,undefined);
      matchMove(s,s.players[0].id,{type:'answer',index:i,field:'anime',answer:'Anime'},now);
    }
    now=s.until;advanceMatch(s,now);
    now=s.until;advanceMatch(s,now);
  }
  assert.equal(s.phase,'finished');assert.equal(matchView(s,s.players[0].id,now).songList.length,20);assert.deepEqual(s.teams,[60]);assert.ok(s.players.every(p=>p.score===20));
  advanceMatch(s,now+1000);assert.equal(s.history.length,20);
  const legacy=makeMatch('legacy','1-team',players.slice(0,3),songs,now);delete legacy.teamFields;
  legacy.phase='guess';legacy.startsAt=now;legacy.until=now+30000;
  for(const p of legacy.players)matchMove(legacy,p.id,{type:'answer',index:0,answers:{anime:'Anime',song:'Song',artist:'Artist'},lock:true},now);
  assert.throws(()=>matchMove(legacy,legacy.players[0].id,{type:'unlock',index:0},now),/no longer/);
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


test('private current answers score at timeout; team skip needs two distinct votes and recap reflects teammates',()=>{
  let now=1000;const s=makeMatch('drafts','1-team',players.slice(0,3),structuredClone(songs),now);
  s.phase='guess';s.startsAt=now;s.until=now+30000;
  const [a,b,c]=s.players;
  assert.ok(s.samplePositions.every(n=>n>=0&&n<1));
  const view=matchView(s,a.id);assert.equal(view.samplePosition,s.samplePositions[0]);assert.equal(view.samplePositions,undefined);assert.equal(view.artistMembers,undefined);
  assert.equal(sampleStart(100,.5,30),34);assert.equal(sampleStart(20,.8,30),0);assert.equal(sampleStart(NaN,.8,30),0);
  const draft=(field,answer)=>({type:'draft',index:0,field,answers:{anime:'',song:'',artist:'',[field]:answer},artists:field==='artist'?[answer]:[]});
  matchMove(s,a.id,draft('anime','Anime'),now++);
  matchMove(s,b.id,draft('anime','Alternate'),now++);
  assert.equal(matchView(s,b.id).players.find(p=>p.id===a.id).draft,undefined);
  assert.equal(matchView(s,a.id).myDraft.answers.anime,'Anime');assert.equal(a.field,undefined);
  matchMove(s,b.id,draft('song','Song'),now++);
  matchMove(s,c.id,draft('artist','Artist'),now++);
  assert.equal(s.phase,'guess');advanceMatch(s,s.until);
  assert.deepEqual(s.teams,[3]);assert.ok(s.players.every(p=>p.score===1&&p.autoSubmitted));
  const html=recapHTML(matchView(s,a.id),String,x=>x.anime);
  assert.equal((html.match(/<dt>/g)||[]).length,3);assert.ok(html.includes('Team 3/3 · +1 Point'));assert.ok(html.includes('Artist Credits'));
  const oldScore=s.teams[0];advanceMatch(s,s.until-1);assert.equal(s.teams[0],oldScore);
  assert.throws(()=>matchMove(s,a.id,draft('anime','Late'),s.until-1),/no longer/);
  // New round clears drafts and votes; repeated votes from one player are not a majority.
  for(const p of s.players){p.ready=true;p.loaded=[0,1];}
  now=s.until;advanceMatch(s,now);now=s.startsAt;
  assert.ok(s.players.every(p=>!p.draft&&!p.skip&&!p.autoSubmitted));
  matchMove(s,a.id,{type:'skip',index:1,vote:true},now);matchMove(s,a.id,{type:'skip',index:1,vote:true},now);
  assert.equal(s.phase,'guess');assert.deepEqual(matchView(s,a.id).skipVotes,[a.id]);
  matchMove(s,a.id,{type:'skip',index:1,vote:false},now);assert.deepEqual(matchView(s,a.id).skipVotes,[]);
  matchMove(s,a.id,{type:'skip',index:1,vote:true},now);matchMove(s,b.id,{type:'skip',index:1,vote:true},now);assert.equal(s.phase,'reveal');assert.equal(s.history.length,2);
  // Conflicting timeout drafts claim a field once; an explicit claim wins over drafts.
  const conflict=makeMatch('conflict','1-team',players.slice(0,3),structuredClone(songs),now);conflict.phase='guess';conflict.startsAt=now;conflict.until=now+30000;
  matchMove(conflict,'0',draft('anime','wrong'),now);matchMove(conflict,'1',draft('anime','Anime'),now+1);
  matchMove(conflict,'2',{type:'answer',index:0,field:'anime',answer:'Anime'},now+2);
  advanceMatch(conflict,conflict.until);assert.deepEqual(conflict.teams,[1]);assert.equal(conflict.players.filter(p=>p.field==='anime').length,1);
  const solo=makeMatch('solo','1v1',players.slice(0,2),structuredClone(songs),now);solo.phase='guess';solo.startsAt=now;solo.until=now+30000;
  assert.throws(()=>matchMove(solo,'0',{type:'skip',index:0,vote:true},now),/unavailable/);
  matchMove(solo,'0',{...draft('artist','Artist'),answers:{anime:'Anime',song:'Song',artist:'Artist'}},now);
  assert.equal(matchView(solo,'1').myDraft,undefined);assert.equal(matchView(solo,'1').players.find(p=>p.id==='0').answers,undefined);
  matchMove(solo,'0',{type:'artists',index:0,artists:['Artist']},now+1);
  assert.equal(solo.players.find(p=>p.id==='0').draft.answers.anime,'Anime');
  advanceMatch(solo,solo.until);assert.equal(solo.players.find(p=>p.id==='0').score,3);
});

test('custom team ballots reject duplicate proposals, settle early and credit the selected owner',()=>{
  const players=['a','b'].map(id=>({id,name:id}));
  const song={anime:'Alpha',title:'First',artist:'Singer',answers:{anime:['alpha'],song:['first'],artist:['Singer']}};
  const state=makeMatch('room','lobby-team',players,[song],0,{songs:1,seconds:0});
  state.phase='guess';state.startsAt=1;state.until=8.64e15;
  const move=(id,type,field,extra)=>matchMove(state,id,{type,index:0,field,...extra},100);
  move('a','propose','anime',{answer:'Alpha'});
  assert.throws(()=>move('b','propose','anime',{answer:'AL-PHA'}),/already/);
  move('b','propose','anime',{answer:'Beta'});
  move('b','propose','song',{answer:'First'});
  const beta=state.ballot.anime[1].id;
  move('a','vote','anime',{choice:beta});
  assert.throws(()=>move('a','withdraw','anime',{choice:beta}),/your own/);
  move('b','withdraw','anime',{choice:beta});
  assert.equal(matchView(state,'a').myVotes.anime,undefined);
  assert.throws(()=>move('a','vote','anime',{choice:beta}),/available/);
  move('b','propose','artist',{answer:'Another Singer'});
  for(const id of ['a','b']){
    move(id,'vote','anime',{choice:state.ballot.anime[0].id});
    move(id,'vote','song',{choice:state.ballot.song[0].id});
  }
  move('a','vote','song',{choice:null});
  for(const id of ['a','b'])move(id,'vote','artist',{choice:state.ballot.artist[0].id});
  assert.equal(state.phase,'guess');
  const skipped=structuredClone(state);
  for(const id of ['a','b']){
    assert.equal(skipped.phase,'guess');
    matchMove(skipped,id,{type:'skip',index:0,vote:true},100);
  }
  assert.equal(skipped.phase,'reveal');
  assert.deepEqual(skipped.teams,[2]);
  move('a','vote','song',{choice:state.ballot.song[0].id});
  assert.equal(state.phase,'reveal');
  assert.deepEqual(state.teams,[2]);
  assert.ok(state.players.every(p=>p.score===1));
});

test('historical W-L-T uses distinct scored fields per team and skips incomplete reviews',()=>{
  const db=new DatabaseSync(':memory:'),sql={exec:(query,...args)=>db.prepare(query).all(...args)};
  try{
    const players=Array.from({length:6},(_,i)=>({id:String(i),team:i%2}));
    const ratings=players.map(p=>({id:p.id,seen:1,correct:1}));
    assert.deepEqual(archivedRecords(sql,'1v1',ratings.slice(0,2)).map(p=>p.outcome),['T','T']);
    const review=new MatchReview({sql});
    const state={id:'match',format:'3v3',players,index:0,phase:'reveal'};
    review.initialize(state);
    for(const p of players)review.add(state,p.id,'round-result',{correct:p.id==='1'?{song:true}:p.team===0?{anime:true}:{artist:true}});
    assert.deepEqual(archivedRecords(sql,'3v3',ratings).map(p=>p.outcome),['L','W','L','W','L','W']);
    sql.exec("DELETE FROM review_events WHERE player='0'");
    assert.deepEqual(archivedRecords(sql,'3v3',ratings),[]);
    assert.deepEqual(archivedRecords(sql,'ngmc-ranked',ratings),[]);
  }finally{db.close();}
});

test('a long MP3 yields a playable sealed sample using bounded range requests',async()=>{
  const source='https://eudist.animemusicquiz.com/long.mp3',length=16*1024*1024;
  const secret='local-audio-range-regression-key-only';
  const state={mode:'ngmc-ranked',created:Date.now(),audioPool:[{audio:source,round:0}],samplePositions:[.7]};
  await sealPlayAudio(state,secret);
  const ranges=[];
  const upstream=async(url,{headers})=>{
    assert.equal(url,source);
    const [,start,end]=/^bytes=(\d+)-(\d+)$/.exec(headers.Range).map(Number);
    const size=Math.min(length-1,end)-start+1;
    assert.ok(size<1024*1024);ranges.push(start);
    const bytes=new Uint8Array(size);
    for(let i=(417-start%417)%417;i+4<=size;i+=417)bytes.set([255,251,144,100],i);
    return new Response(bytes,{status:206,headers:{'Content-Type':'audio/mpeg','Content-Range':'bytes '+start+'-'+(start+size-1)+'/'+length}});
  };
  const entry=state.audioPool[0],response=await playAudioResponse(new Request('https://game.test/api/play-audio/'+entry.ticket),{HOST_TOKEN:secret},{},upstream);
  assert.equal(response.status,200);assert.equal(ranges.length,2);assert.ok(ranges[1]>10*1024*1024);
  const bytes=new Uint8Array(await response.arrayBuffer());
  const key=await crypto.subtle.importKey('raw',Buffer.from(entry.key,'base64url'),'AES-GCM',false,['decrypt']);
  const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes.subarray(0,12)},key,bytes.subarray(12));
  assert.ok(new DataView(plain).getUint32(0)>0);
});
