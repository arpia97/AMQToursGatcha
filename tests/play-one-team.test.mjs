import test from 'node:test';
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {ONE_TEAM_FORMAT,ONE_TEAM_MODE,oneTeamRules,queueMode} from '../public/play-mode-rules.js';
import {defaultPlayGuessSeconds,PLAY_AUDIO_PROTOCOL} from '../public/play-audio-format.js';
import {advanceMatch,gradeRound,makeMatch,matchMove,matchView} from '../src/play-match-rules.js';
import {rematchView,voteToRestart} from '../src/play-lobby-votes.js';
import {matchCreditPlan} from '../src/play-rewards.js';
import {liveMatchScore} from '../src/play-spectator.js';
import {playRuntimeFixture} from './play-runtime-fixture.mjs';

const players=Array.from({length:8},(_,i)=>({id:String(i+1),name:'Player '+(i+1)}));
const songs=Array.from({length:100},(_,i)=>({
  anime:'Anime '+i,title:'Song '+i,artist:'Artist '+i,
  answers:{anime:['Anime '+i],song:['Song '+i],artist:['Artist '+i]},
}));

test('only the selected guess scores and five team misses finish after the reveal',()=>{
  const state=makeMatch('local',ONE_TEAM_FORMAT,players,songs,1000);
  assert.deepEqual(state.teams,[5]);
  assert.equal(state.mode,ONE_TEAM_MODE);
  Object.assign(state,{phase:'guess',startsAt:1000,until:21_000});
  const propose=(id,title,at)=>matchMove(state,id,{type:'propose',index:state.index,field:'anime',answer:title},at);
  propose('1','Wrong Title',1400);
  propose('2','Anime 0',1500);
  assert.equal(state.players.find(player=>player.id==='1').answeredMatch,true);
  assert.throws(()=>propose('3','anime 0',1550),/already been submitted/);
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
  matchMove(state,'3',{type:'vote',index:1,field:'anime',choice},1201);
  assert.equal(state.phase,'reveal');
  advanceMatch(state,state.until);
  assert.deepEqual(state.teams,[5]);
  assert.equal(state.completed,true);
  const endedAt=state.until-86400000;
  assert.equal(rematchView(state,endedAt,'1').required,2);
  voteToRestart(state,'1',true,endedAt);
  assert.equal(rematchView(state,endedAt),undefined);
  voteToRestart(state,'2',true,endedAt);
  assert.deepEqual(rematchView(state,endedAt),{joinUntil:endedAt+120_000});
  assert.equal(rematchView(state,endedAt+120_000),undefined);
  assert.throws(()=>makeMatch('invalid',ONE_TEAM_FORMAT,players.slice(0,2),songs));
  const legacy=makeMatch('legacy','1-team',players.slice(0,3),songs.slice(0,20));
  assert.equal(queueMode(legacy.format),ONE_TEAM_MODE);
  assert.equal(legacy.mode,'song-artist');
  assert.equal(legacy.teamFields,true);
  assert.deepEqual(legacy.teams,[0]);
});

test('survival queues keep Random and Watched separate and allow smaller Watched sets',async t=>{
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
  assert.equal(finished.state.rematch.required,2);

  spectator.send({type:'rematch-join'});
  await spectator.wait(message=>message.type==='error'&&message.message.includes('invitation'));
  room.send({type:'rematch-vote',yes:true});
  await room.wait(message=>message.state?.rematch?.yes===1);
  second.send({type:'rematch-vote',yes:true});
  const invitation=await spectator.wait(message=>message.state?.rematch?.joinUntil);
  assert.deepEqual(Object.keys(invitation.state.rematch),['joinUntil']);
  for(const ws of [room,second,spectator]){
    ws.send({type:'rematch-join'});
    await ws.wait(message=>message.type==='rematch-joined');
  }
  const host=await clients[0].wait(message=>message.type==='lobby'&&message.players.length===3);
  assert.equal(host.pool,'watched');
  assert.deepEqual(host.players.map(player=>player.id),['1','2','5']);
  assert.ok(host.players[2].avatar);
  const directory=await newcomer.wait(message=>message.type==='lobby'&&message.players.length===3);
  assert.equal(directory.rematchOf,match);
  third.send({type:'rematch-join'});
  await third.wait(message=>message.type==='rematch-joined');
  await clients[0].wait(message=>message.type==='lobby'&&message.players.length===4);
  for(const client of [clients[1],clients[2],newcomer])client.send({type:'lobby-ready',ready:true});
  await clients[0].wait(message=>message.type==='lobby'&&message.players.filter(p=>p.ready).length===3);
  clients[0].send({type:'lobby-start'});
  const restarted=await clients[0].wait(message=>message.type==='matched'&&message.match!==match);
  const restartedRoom=await connect(1,restarted.match);
  const restartedState=(await restartedRoom.wait(message=>message.type==='state')).state;
  assert.equal(restartedState.pool,'watched');
  assert.equal(restartedState.players.length,4);
  assert.equal(restartedState.format,ONE_TEAM_FORMAT);
  assert.deepEqual(restartedState.teams,[5]);
});
