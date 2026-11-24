import test from 'node:test';
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {ONE_TEAM_FORMAT,ONE_TEAM_MODE,oneTeamRules,queueMode} from '../public/play-mode-rules.js';
import {defaultPlayGuessSeconds,PLAY_AUDIO_PROTOCOL} from '../public/play-audio-format.js';
import {advanceMatch,gradeRound,makeMatch,matchMove,matchView} from '../src/play-match-rules.js';
import {ballotCatalogIndex,proposeOrVote,selectWinners,rematchView,voteToRestart} from '../src/play-lobby-votes.js';
import {roundSoundCues} from '../public/play-sound-cues.js';
import {matchCreditPlan} from '../src/play-rewards.js';
import {liveMatchScore} from '../src/play-spectator.js';
import {playRuntimeFixture} from './play-runtime-fixture.mjs';

const players=Array.from({length:8},(_,i)=>({id:String(i+1),name:'Player '+(i+1)}));
const songs=Array.from({length:100},(_,i)=>({
  anime:'Anime '+i,title:'Song '+i,artist:'Artist '+i,
  answers:{anime:['Anime '+i],song:['Song '+i],artist:['Artist '+i]},
}));

test('team ballots filter only tied leaders against the full field catalog',()=>{
  const catalog=ballotCatalogIndex({anime:['Known Title','Another Title'],artist:['Artist One','Artist Two']});
  function winner(field,entries,votes){
    const state={format:'lobby-team',lobby:{guessFields:[field]},players:entries.map((_,i)=>({id:String(i)}))};
    for(const [i,answer] of entries.entries())proposeOrVote(state,state.players[i],{type:'propose',field,answer});
    for(const [i,choice] of votes.entries())proposeOrVote(state,state.players[i],{type:'vote',field,choice:state.ballot[field][choice].id});
    selectWinners(state,catalog);
    return state.players.find(p=>p.answers[field])?.answers[field];
  }
  assert.equal(winner('anime',['unknown','Known-Title'],[0,1]),'Known-Title');
  assert.equal(winner('anime',['unknown','Known Title'],[]),'Known Title');
  assert.equal(winner('anime',['unknown','other unknown','Known Title'],[0,1]),undefined);
  assert.equal(winner('anime',['unknown','Known Title'],[0,0]),'unknown');
  assert.ok(['Known Title','Another Title'].includes(winner('anime',['Known Title','Another Title','unknown'],[])));
  assert.equal(winner('artist',['artist one, Two Artist','Known Title'],[]),'artist one, Two Artist');
});

test('only a current catalog guess or vote makes a player ready for early reveal',()=>{
  const catalog=ballotCatalogIndex({anime:['Other Anime','Anime 0']});
  const state=Object.assign(makeMatch('test',ONE_TEAM_FORMAT,players.slice(0,3),songs.slice(0,1),0),
    {phase:'guess',startsAt:0,until:20000});
  const move=(id,msg)=>matchMove(state,id,{index:0,field:'anime',...msg},1000,catalog);
  const propose=(id,answer)=>move(id,{type:'propose',answer});
  const ready=id=>matchView(state,id,1000,false,catalog).players.find(p=>p.id===id).answerReady;
  propose('1','Other Anime');
  const valid=state.ballot.anime[0].id;
  assert.equal(ready('1'),true);
  propose('1','gibberish');
  const invalid=state.ballot.anime[1].id;
  assert.equal(ready('1'),false);
  propose('2','OTHER ANIME');
  assert.equal(ready('2'),true);
  move('2',{type:'vote',choice:invalid});
  assert.equal(ready('2'),false);
  move('2',{type:'vote',choice:valid});
  propose('1','Other Anime');
  move('1',{type:'withdraw',choice:valid});
  assert.equal(ready('1'),false);
  assert.equal(ready('2'),false);
  propose('2','Anime 0');
  propose('3','Anime 0');
  assert.equal(state.phase,'guess');
  propose('1','Anime 0');
  assert.equal(state.phase,'reveal');
  assert.deepEqual(state.history[0].points,[1]);
});

test('unanimous 1-Team Autoskip waits for a catalog answer',()=>{
  const catalog=ballotCatalogIndex({anime:['Anime 0']});
  for(const format of [ONE_TEAM_FORMAT,'lobby-team','1-team']){
    const legacy=format==='1-team';
    const songsForMatch=legacy?songs.slice(0,20):songs.slice(0,2);
    const lobby=format==='lobby-team'?{songs:2,seconds:20}:null;
    const state=Object.assign(makeMatch('autoskip',format,players.slice(0,3),songsForMatch,0,lobby),
      {phase:'guess',startsAt:1,until:20000});
    const move=(id,msg)=>matchMove(state,id,{index:0,field:'anime',...msg},1000,catalog);
    for(const player of state.players)move(player.id,{type:'auto-skip',vote:true});
    assert.equal(state.phase,'guess',format);

    const timeout=structuredClone(state);
    advanceMatch(timeout,timeout.until,catalog);
    assert.equal(timeout.phase,'reveal',format);
    assert.deepEqual(timeout.history[0].points,[0],format);

    const manual=structuredClone(state);
    for(const id of ['1','2'])matchMove(manual,id,{type:'skip',index:0,vote:true},1000,catalog);
    assert.equal(manual.phase,'reveal',format);
    assert.deepEqual(manual.history[0].points,[0],format);

    move('1',{type:legacy?'answer':'propose',answer:'Gibberish'});
    assert.equal(state.phase,'guess',format);
    move(legacy?'1':'2',{type:legacy?'answer':'propose',answer:'Anime 0'});
    assert.equal(state.phase,'reveal',format);
    assert.deepEqual(state.history[0].points,[1],format);
  }
});

test('every active teammate hears the shared reveal result exactly once',()=>{
  for(const format of [ONE_TEAM_FORMAT,'1-team','lobby-team']){
    const members=players.slice(0,3).map(p=>({...p,team:0}));
    for(const hit of [true,false]){
      const guess={id:'test',format,index:0,phase:'guess',players:members,teams:[5]};
      const results=members.map((p,i)=>({id:p.id,correct:{anime:hit&&i===0},answers:i===0?{anime:'Guess'}:{}}));
      const reveal={...guess,teams:[format===ONE_TEAM_FORMAT&&!hit?4:5],phase:'reveal',history:[{index:0,points:[Number(hit)],results}]};
      for(const p of members){
        const view={...reveal,me:p.id};
        assert.deepEqual(roundSoundCues(guess,view),hit?['correct']:format===ONE_TEAM_FORMAT?['incorrect','lose-life']:['incorrect']);
        assert.deepEqual(roundSoundCues(view,view),[]);
      }
    }
  }
});

test('only the selected guess scores and five team misses finish after the reveal',()=>{
  const state=makeMatch('local',ONE_TEAM_FORMAT,players,songs,1000);
  assert.deepEqual(state.teams,[5]);
  assert.equal(state.mode,ONE_TEAM_MODE);
  Object.assign(state,{phase:'guess',startsAt:1000,until:21_000});
  const propose=(id,title,at)=>matchMove(state,id,{type:'propose',index:state.index,field:'anime',answer:title},at);
  propose('1','Wrong Title',1400);
  propose('2','Anime 0',1500);
  assert.equal(state.players.find(player=>player.id==='1').answeredMatch,true);
  propose('3','anime 0',1550);
  assert.equal(state.ballot.anime.length,2);
  assert.equal(state.players.find(p=>p.id==='3').votes.anime,state.ballot.anime[1].id);
  assert.throws(()=>matchMove(state,'3',{type:'propose',index:0,field:'artist',answer:'Artist 0'},1550),/category/);
  assert.equal(matchView(state,'2',1500).players.find(player=>player.id==='1').answers,undefined);
  const [wrong,right]=state.ballot.anime;
  const vote=(id,choice,at)=>matchMove(state,id,{type:'vote',index:state.index,field:'anime',choice},at);
  vote('1',wrong.id,1600);
  vote('2',right.id,1600);
  vote('3',right.id,1600);
  assert.equal(matchView(state,'3',1650).voteCounts[right.id],2);
  advanceMatch(state,21_000);
  assert.equal(state.history[0].results.find(player=>player.id==='2').earned,1);
  assert.deepEqual(state.history[0].points,[1]);
  assert.deepEqual(state.teams,[5]);
  assert.equal(liveMatchScore(state).unit,'Lives');
  for(let i=1;i<=oneTeamRules.lives;i++){
    Object.assign(state,{phase:'guess',index:i});
    delete state.ballot;
    for(const player of state.players)delete player.votes;
    if(i===1){
      propose('1','Wrong Title',1400);
      propose('2','Anime 1',1500);
      const [losingGuess]=state.ballot.anime;
      vote('1',losingGuess.id,1600);
    }
    gradeRound(state,21_000+i);
    assert.deepEqual(state.history.at(-1).lives,[5-i]);
  }
  assert.equal(state.phase,'reveal');
  advanceMatch(state,state.until);
  assert.equal(state.phase,'finished');
  const final=matchView(state,'1');
  assert.equal(final.total,100);
  assert.equal(final.songList.length,6);
  assert.equal(final.creditsPending,true);
  assert.deepEqual(matchCreditPlan(state).map(row=>row.outcome),Array(8).fill('cooperative'));
});

test('one-team completes a playable set with lives remaining and preserves legacy formats',()=>{
  const state=makeMatch('local',ONE_TEAM_FORMAT,players.slice(0,3),songs.slice(0,2));
  assert.equal(defaultPlayGuessSeconds(ONE_TEAM_MODE),20);
  assert.equal(defaultPlayGuessSeconds('song-artist'),30);
  for(const player of state.players){player.ready=true;player.loaded=[0,1];}
  advanceMatch(state,1000);
  assert.equal(state.until-state.startsAt,20_000);
  state.index=1;
  matchMove(state,'1',{type:'propose',index:1,field:'anime',answer:'Anime 1'},1100);
  const choice=state.ballot.anime[0].id;
  matchMove(state,'2',{type:'vote',index:1,field:'anime',choice},1200);
  assert.equal(state.phase,'guess');
  assert.equal(state.players.find(player=>player.id==='2').answeredMatch,true);
  assert.deepEqual(matchView(state,'2',1200).players.find(player=>player.id==='2').submittedFields,['anime']);
  matchMove(state,'3',{type:'vote',index:1,field:'anime',choice},1201,ballotCatalogIndex({anime:['Anime 1']}));
  assert.equal(state.phase,'reveal');
  advanceMatch(state,state.until);
  assert.deepEqual(state.teams,[5]);
  assert.equal(state.completed,true);
  const endedAt=state.until-86400000;
  assert.equal(rematchView(state,endedAt,'1').required,2);
  voteToRestart(state,'1',true,endedAt);
  assert.equal(rematchView(state,endedAt),undefined);
  voteToRestart(state,'2',true,endedAt);
  assert.equal(rematchView(state,endedAt),undefined);
  state.rematch.transferred=true;
  assert.deepEqual(rematchView(state,endedAt),{joinUntil:endedAt+120_000});
  assert.equal(rematchView(state,endedAt+120_000),undefined);
  assert.throws(()=>makeMatch('invalid',ONE_TEAM_FORMAT,players.slice(0,2),songs));
  const legacy=makeMatch('legacy','1-team',players.slice(0,3),songs.slice(0,20));
  assert.equal(queueMode(legacy.format),ONE_TEAM_MODE);
  assert.equal(legacy.mode,'song-artist');
  assert.equal(legacy.teamFields,true);
  assert.deepEqual(legacy.teams,[0]);
});

test('survival queues separate song pools and move rematch voters before spectators join',async t=>{
  const worker=await playRuntimeFixture();
  t.after(()=>worker.dispose());
  const base='http://game',cookies=[];
  const fetch=(path,options)=>worker.dispatchFetch(base+path,options);
  for(let id=1;id<=5;id++){
    cookies[id]=(await (await fetch('/api/__test-session?id='+id)).json()).cookie;
  }
  const watchedList=await fetch('/api/play-anime-list',{method:'POST',headers:{Cookie:cookies[1],'Content-Type':'application/json'},
    body:JSON.stringify({provider:'myanimelist',username:'https://myanimelist.net/animelist/Wide'})});
  assert.equal(watchedList.status,200);
  const allSockets=[];
  t.after(()=>allSockets.forEach(ws=>ws.close()));
  async function connect(id,match,watch=false){
    const path=watch?'/api/play-watch?match='+match:
      '/api/play-connect?protocol='+PLAY_AUDIO_PROTOCOL+(match?'&match='+match:'');
    const response=await fetch(path,{
      headers:{Upgrade:'websocket',Origin:base,Cookie:cookies[id]},
    });
    assert.equal(response.status,101,response.status===101?'':await response.text());
    const ws=response.webSocket,messages=[];
    ws.addEventListener('message',event=>messages.push(JSON.parse(event.data)));
    ws.accept();allSockets.push(ws);
    const send=message=>ws.send(JSON.stringify(message));
    return {send,join:pool=>send({type:'join',mode:ONE_TEAM_MODE,format:ONE_TEAM_FORMAT,pool}),
      clearMessages:()=>{messages.length=0;},
      async wait(predicate){
        for(let turn=0;turn<250;turn++){
          const message=messages.find(predicate);
          if(message)return message;
          await delay(20);
        }
        throw Error('Missing socket message: '+JSON.stringify(messages.slice(-2)));
      }};
  }
  const clients=await Promise.all([1,2,3,4].map(id=>connect(id)));
  clients[3].join('random');
  for(const client of clients.slice(0,3))client.join('watched');
  const queued=await clients[0].wait(message=>message.type==='queued'&&message.waiting===3&&message.needed===8);
  assert.ok(queued.startsAt>Date.now()+18_000 && queued.startsAt<=Date.now()+20_000);
  const newcomer=await connect(5);
  await delay(60);
  newcomer.join('watched');
  const reset=await clients[0].wait(message=>message.type==='queued'&&message.waiting===4);
  assert.ok(reset.startsAt>queued.startsAt);
  newcomer.clearMessages();
  newcomer.send({type:'cancel'});
  await newcomer.wait(message=>message.type==='idle'&&message.counts?.[ONE_TEAM_FORMAT+'-watched']===3);
  await fetch('/api/__age-queue?format='+ONE_TEAM_FORMAT+'&pool=watched&ms=20000');
  const {match}=await clients[0].wait(message=>message.type==='matched'&&message.pool==='watched');
  const room=await connect(1,match);
  const manifest=await room.wait(message=>message.type==='manifest');
  assert.equal(manifest.mode,ONE_TEAM_MODE);
  assert.ok(manifest.total>0&&manifest.total<100);
  assert.equal(manifest.sealed,true);
  const {state}=await room.wait(message=>message.type==='state');
  assert.equal(state.players.length,3);
  assert.equal(state.pool,'watched');
  assert.deepEqual(state.teams,[5]);
  const live=await (await fetch('/api/play-watch?match='+match,{headers:{Cookie:cookies[4]}})).json();
  assert.equal(live.unit,'Lives');
  const counts=await (await fetch('/api/play-queue-counts')).json();
  assert.equal(counts[ONE_TEAM_FORMAT],1);
  assert.equal(counts[ONE_TEAM_FORMAT+'-watched'],undefined);

  const spectator=await connect(5,match,true);
  const second=await connect(2,match);
  const third=await connect(3,match);
  await Promise.all([second,third].map(ws=>ws.wait(message=>message.type==='manifest')));
  const fixtureResult=await fetch('/api/__fixture-final-song?match='+match);
  assert.equal(fixtureResult.status,200);
  assert.equal((await fetch('/api/__advance?match='+match)).status,200);
  const finished=await room.wait(message=>message.state?.phase==='finished'&&message.state.creditReward);
  assert.equal(finished.state.creditReward.amount,2);
  assert.ok(state.players.every(p=>p.rigs===0));
  assert.ok(finished.state.players.every(p=>p.rigs===(p.id==='1'?1:0)));
  assert.equal(finished.state.rematch.required,2);

  spectator.send({type:'rematch-join'});
  await spectator.wait(message=>message.type==='error'&&message.message.includes('invitation'));
  room.send({type:'rematch-vote',yes:true});
  await room.wait(message=>message.state?.rematch?.yes===1);
  third.send({type:'rematch-vote',yes:false});
  await third.wait(message=>message.state?.rematch?.myVote===false);
  second.send({type:'rematch-vote',yes:true});
  const invitation=await spectator.wait(message=>message.state?.rematch?.joinUntil);
  assert.deepEqual(Object.keys(invitation.state.rematch),['joinUntil']);
  for(const client of clients.slice(0,2)){
    const ready=await client.wait(message=>message.type==='lobby'&&message.rematchOf===match);
    assert.deepEqual(ready.players.map(p=>p.id).sort(),['1','2']);
  }
  clients[2].clearMessages();
  clients[2].send({type:'ping'});
  await clients[2].wait(message=>message.type==='idle');
  spectator.send({type:'rematch-join'});
  await spectator.wait(message=>message.type==='rematch-joined');
  const lobby=await newcomer.wait(message=>message.type==='lobby'&&message.players.length===3);
  assert.equal(lobby.pool,'watched');
  assert.equal(lobby.rematchOf,match);
  assert.deepEqual(lobby.players.map(player=>player.id).sort(),['1','2','5']);
  assert.ok(lobby.players.find(player=>player.id==='5').avatar);

  third.send({type:'rematch-join'});
  await third.wait(message=>message.type==='rematch-joined');
  await clients[0].wait(message=>message.type==='lobby'&&message.players.length===4);
  const participantClients={'1':clients[0],'2':clients[1],'3':clients[2],'5':newcomer};
  for(const [id,client] of Object.entries(participantClients))if(id!==lobby.host)client.send({type:'lobby-ready',ready:true});
  await clients[0].wait(message=>message.type==='lobby'&&message.players.filter(p=>p.ready).length===3);
  participantClients[lobby.host].send({type:'lobby-start'});
  const restarted=await clients[0].wait(message=>message.type==='matched'&&message.match!==match);
  const restartedRoom=await connect(1,restarted.match);
  const restartedState=(await restartedRoom.wait(message=>message.type==='state')).state;
  assert.equal(restartedState.pool,'watched');
  assert.equal(restartedState.players.length,4);
  assert.equal(restartedState.format,ONE_TEAM_FORMAT);
  assert.deepEqual(restartedState.teams,[5]);
});

test('archived one-team songs show the same graded answer for the owner and every teammate', async () => {
  const {readPlayHistory} = await import('../src/play-history.js');
  const {songHistoryHTML} = await import('../public/play-history.js');
  const roster = [{id:'owner', score:1}, {id:'voter', score:0}];
  const rounds = [true, false].map((hit, index) => ({
    index, anime:'Anime', results:[
      {id:'owner', earned:Number(hit), correct:{anime:hit}, answers:{anime:hit?'Anime':'Wrong'}},
      {id:'voter', earned:0, correct:{anime:false}, answers:{}},
    ],
  }));
  const storage = {sql:{exec(query) {
    const records = query.includes('review_meta') ? [{players:roster, rounds:2}] : rounds;
    return {toArray:() => records.map(row => ({data:JSON.stringify(row)}))};
  }}};
  for (const format of [ONE_TEAM_FORMAT, '1-team', 'lobby-team']) {
    for (const player of roster) {
      const data = readPlayHistory(storage, null, player.id, true, format);
      assert.equal(data.score, player.score);
      assert.deepEqual(data.songs.map(song => song.teamResult.correct.anime), [true,false]);
      const html = songHistoryHTML({...data,format}, String);
      assert.match(html, /Team Result/);
      assert.match(html, /Hit<\/span>/);
      assert.match(html, /Missed<\/span>/);
      assert.match(html, /Wrong/);
      assert.doesNotMatch(html, /Lobby Score|Your Result/);
    }
  }
  const individual = readPlayHistory(storage, null, 'voter', true, 'ngmc-ranked');
  assert.deepEqual(individual.songs[0].lobbyScore, {correct:1,total:2});
  assert.equal(individual.songs[0].earned, 0);
});
