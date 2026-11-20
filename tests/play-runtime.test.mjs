import test from 'node:test';
import assert from 'node:assert/strict';
import {playRuntimeFixture} from './play-runtime-fixture.mjs';
import {importAnimeList,listAccount} from '../src/play-anime-list.js';
import {compactLibrarySong} from '../public/quiz-library-data.js';
import {PlayLibrary} from '../src/play-library.js';
import {watchedWeights, weightedAnimeOrder, watchedRecordings} from '../src/play-watched-selection.js';
import {audioBytes,PLAY_AUDIO_PROTOCOL,PLAY_AUDIO_IV_BYTES} from '../public/play-audio-format.js';
test('Watched weights sum square-root budgets from distinct MAL and AniList shows',()=>{
  const linked=new Map([
    [1,{myanimelist:101,anilist:201}],[2,{myanimelist:102,anilist:202}],
    [3,{myanimelist:103,anilist:203}],[4,{myanimelist:104,anilist:204}],
  ]);
  const weights=watchedWeights([
    {provider:'myanimelist',ids:[101,101,102,103,104]},
    {provider:'anilist',ids:[201]},
    {provider:'anilist',ids:[]}
  ],linked);
  assert.deepEqual([...weights],[[1,1.5],[2,.5],[3,.5],[4,.5]]);
  assert.deepEqual(weightedAnimeOrder(weights,()=>.5),[1,2,3,4]);
});
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
test('a slow mirror does not block later Watched probes or change playlist order',async()=>{
  const order=Array.from({length:10},(_,i)=>i+1);
  const options=new Map(order.map(id=>[id,[{group:id,source:String(id)}]]));
  options.get(2).push({group:22,source:'fallback'});
  const slow=Promise.withResolvers(), started=[];
  let active=0,peak=0;
  const result=watchedRecordings(order,options,9,async(group,source)=>{
    started.push(group);peak=Math.max(peak,++active);
    if(group===1)await slow.promise;
    else await Promise.resolve();
    active--;
    return group===2?null:source;
  },()=>0,url=>url);
  await new Promise(resolve=>setImmediate(resolve));
  const startedBeforeRelease=started.slice();
  slow.resolve();
  const songs=await result;
  assert.deepEqual(startedBeforeRelease,order.slice(0,9));
  assert.equal(peak,6);
  assert.deepEqual(songs.map(s=>s.group),[1,22,3,4,5,6,7,8,9]);
});
test('AniList imports all chunks, handles repeated entries and preserves provider identity',async()=>{
  const pages=[[{status:'COMPLETED',progress:0,mediaId:5},{status:'PLANNING',progress:0,mediaId:7}],[{status:'CURRENT',progress:2,mediaId:8},{status:'CURRENT',progress:2,mediaId:5}]];
  const result=await importAnimeList('anilist','https://anilist.co/user/Local/animelist',async(url,options)=>{
    assert.equal(url,'https://graphql.anilist.co');
    const {chunk,name}=JSON.parse(options.body).variables;
    assert.equal(name,'Local');
    return Response.json({data:{MediaListCollection:{hasNextChunk:chunk<2,lists:[{entries:pages[chunk-1]}]}}});
  });
  assert.deepEqual(result.ids,[5,8]);assert.equal(result.count,2);
  assert.throws(()=>listAccount('anilist','https://example.org/user/Local'));
  await assert.rejects(
    importAnimeList('anilist','Local',async()=>Response.json(
      {errors:[{status:403,message:'Upstream access denied'}]}, {status:403},
    )),
    error=>error.status===503 && error.message.includes('AniList is refusing imports from Play'),
  );
});
test('Watched imports apply selected statuses in both providers',async()=>{
  const statuses=['onHold','dropped'];
  const mal=await importAnimeList('myanimelist','Local',async url=>Response.json(url.endsWith('offset=0')
    ? [1,2,3,4,6].map(status=>({status,anime_id:status})):[]),statuses);
  assert.deepEqual(mal.ids,[3,4]);
  const entries=['CURRENT','COMPLETED','PAUSED','DROPPED','PLANNING','REPEATING'].map((status,i)=>({status,mediaId:i+1}));
  const fetcher=async()=>Response.json({data:{MediaListCollection:{hasNextChunk:false,lists:[{entries}]}}});
  assert.deepEqual((await importAnimeList('anilist','Local',fetcher,statuses)).ids,[3,4]);
  assert.deepEqual((await importAnimeList('anilist','Local',fetcher,['watching'])).ids,[1,6]);
  await assert.rejects(importAnimeList('anilist','Local',fetcher,[]),/Select at least one/);
});
test('integrated catalogue samples sheet-only and published recordings and updates after unpublishing',async()=>{
  const audio=id=>'https://naedist.animemusicquiz.com/'+id+'.mp3';
  const base=[1,2,3].map(id=>({annSongId:id,amqSongId:id,annId:id,type:'OP',audio:audio(id),title:'Song '+id,artist:'Artist',titles:['Plus '+id]}));
  base[0]=compactLibrarySong({...base[0],artists:[{names:['Group'],members:[
    {names:['Solo Name','Alias Name']},{members:[{names:['Nested Member']}]}
  ]}]},base[0].titles);
  const sheet={version:'sheet',records:[[0,'Sheet 1'],[0,'Sheet 4']],keys:{'a:1':0,'f:4.mp3':1},
    recordings:[['Song 1','Artist',1,'OP','1.mp3'],['Song 4','Artist',4,'ED','4.mp3']],
    official:[[5,50,5,'OP','Song 5','Artist',['Official 5']],[6,60,6,'ED','Song 6','Artist',['Metadata only']]]};
  const rows=[1,2,5].map(id=>({sourceIds:{amqSongIds:[id]},audio:audio(id),title:'Song '+id,artist:'Artist',answers:['Quiz '+id]}));
  const core={active:async()=>({version:'base',shards:[0]}),shard:async()=>base,
    lookup:async({annSongIds})=>({songs:base.filter(row=>annSongIds.includes(row.annSongId))}),
    assets:{fetch:async req=>Response.json(req.url.endsWith('master-answers.json')?sheet:req.url.endsWith('artist-names.json')?['Seed Member']:{names:[],songs:{},rules:{}})}};
  let version='v1';
  const lib=new PlayLibrary(core,undefined,previous=>previous===version?null:{version,rows:version==='v1'?rows:[]});
  lib.verifiedSource=async url=>url;
  const catalog=await lib.catalog();
  for(const name of ['Solo Name','Alias Name','Nested Member','Seed Member'])assert.ok(catalog.artist.includes(name));
  assert.deepEqual(catalog.coverage,{playableRecordings:5,sheetAdded:1,quizAdded:1,seedArtistNames:1});
  assert.ok(catalog.anime.includes('Metadata only'));
  const sample=await lib.sample('song-artist',5);
  assert.deepEqual(sample.songs.map(s=>s.anime).sort(),['Plus 3','Quiz 2','Quiz 5','Sheet 1','Sheet 4']);
  assert.equal((await lib.load()).ngmcRows.length,5);
  version='v2';lib.nextCheck=0;
  const refreshed=await lib.catalog();
  assert.notEqual(refreshed.version,catalog.version);
  assert.equal(refreshed.coverage.playableRecordings,4);
  assert.ok(refreshed.anime.includes('Plus 2')&&!refreshed.anime.includes('Quiz 2'));
});
test('multiplayer Workers authenticate sockets, form all formats, preload, score and survive reconnect through the proxy',async t=>{
  const gate=Promise.withResolvers();
  t.after(()=>gate.resolve());
  const mf=await playRuntimeFixture({beforeAudio:id=>id===3?gate.promise:undefined});t.after(()=>mf.dispose());
  const base='http://game',cookies=[];
  const slow=await (await mf.dispatchFetch(base+'/api/__slow-setup')).json();
  assert.match(slow.result.setupError,/timed out/);
  assert.equal(slow.created,false);
  for(let i=1;i<=8;i++){const response=await mf.dispatchFetch(base+'/api/__test-session?id='+i);assert.equal(response.status,200,await response.clone().text());cookies.push((await response.json()).cookie);}
  const connect=async(i,match='',proxy=false)=>{
    let r=await mf.dispatchFetch(base+(proxy?'/api/__fake-proxy':'/api/play-connect')+('?protocol='+PLAY_AUDIO_PROTOCOL+(match?'&match='+match:'')),{headers:{Upgrade:'websocket',Cookie:cookies[i],Origin:proxy?'https://amqtours.app':base}});
    for(let tries=0;r.status===429&&tries<3;tries++){await sleep(1100);r=await mf.dispatchFetch(base+(proxy?'/api/__fake-proxy':'/api/play-connect')+('?protocol='+PLAY_AUDIO_PROTOCOL+(match?'&match='+match:'')),{headers:{Upgrade:'websocket',Cookie:cookies[i],Origin:proxy?'https://amqtours.app':base}});}
    assert.equal(r.status,101,r.status===101?'':await r.text());const ws=r.webSocket;const messages=[];let revision=0;ws.addEventListener('message',e=>{
      const msg=JSON.parse(e.data);
      if(msg.type==='manifest'||msg.type==='audio-replaced')revision=msg.revision||0;
      if(msg.state?.preparingClip&&msg.state.playback&&msg.state.players.some(p=>p.id===msg.state.me&&!p.audioReady))
        ws.send(JSON.stringify({type:'clip-ready',index:msg.state.index,revision}));
      if(msg.state?.phase==='guess'&&msg.state.now<msg.state.startsAt)return;
      messages.push(msg);
    });ws.accept();
    const wait=async predicate=>{for(let n=0;n<250;n++){const found=messages.find(predicate);if(found)return found;await sleep(20);}throw Error('No matching socket message: '+JSON.stringify(messages.slice(-4)));};
    t.after(()=>{if(ws.readyState===1)ws.close();});return {ws,messages,wait,send:value=>ws.send(JSON.stringify(value))};
  };
  const host=await connect(0),visitor=await connect(1);
  assert.equal((await mf.dispatchFetch(base+'/api/host/play-sheet',{headers:{Cookie:cookies[0]}})).status,401);
  const listUpdate=(body,cookie)=>mf.dispatchFetch(base+'/api/play-anime-list',{method:'POST',headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(body)});
  const listBody={provider:'myanimelist',username:'https://myanimelist.net/animelist/Local'};
  assert.equal((await listUpdate(listBody)).status,401);
  host.send({type:'lobby-create',format:'lobby-team',seconds:30,songs:1,pool:'watched'});
  const watchedLobby=await host.wait(m=>m.type==='lobby'&&m.pool==='watched'&&m.watchedPool?.eligible===0);
  host.send({type:'lobby-start'});
  await host.wait(m=>m.type==='error'&&m.message.includes('Import'));
  const linked=await listUpdate(listBody,cookies[0]);assert.equal(linked.status,200,await linked.clone().text());
  const summary=(await linked.json()).animeList;assert.equal(summary.count,1);assert.equal(summary.ids,undefined);
  assert.equal((await listUpdate({...listBody,username:'Wide'},cookies[1])).status,200);
  visitor.send({type:'lobby-join',code:watchedLobby.code});
  await host.wait(m=>m.type==='lobby'&&m.players.length===2&&m.watchedPool?.eligible===40);
  visitor.send({type:'lobby-leave'});
  await host.wait(m=>m.type==='lobby'&&m.players.length===1&&m.watchedPool?.eligible===1);
  host.send({type:'lobby-start'});
  try{
    const checking=await host.wait(m=>m.type==='preparing'&&m.progress.stage==='songs');
    assert.deepEqual(checking.progress,{stage:'songs',done:0,total:1});
    assert.ok(!visitor.messages.some(m=>m.type==='preparing'&&m.match===checking.match));
  }finally{gate.resolve();}
  const watchedMatch=await host.wait(m=>m.type==='matched');
  const watchedInfo=await (await mf.dispatchFetch(base+'/api/__fixture-info?match='+watchedMatch.match)).json();
  assert.equal(watchedInfo.song.title,'Song 3');
  const ownState=await (await mf.dispatchFetch(base+'/api/play-state',{headers:{Cookie:cookies[0]}})).json();
  assert.deepEqual(ownState.animeList,summary);
  await listUpdate({remove:true},cookies[0]);
  host.send({type:'lobby-leave'});
  await host.wait(m=>m.type==='idle'&&host.messages.indexOf(m)>host.messages.indexOf(watchedMatch));
  host.messages.length=0;visitor.messages.length=0;
  host.send({type:'lobby-create',format:'lobby-ngmc',password:'private-room'});
  const lobby=await host.wait(m=>m.type==='lobby');
  const listed=await visitor.wait(m=>m.type==='idle'&&m.lobbies?.some(r=>r.code===lobby.code));
  assert.deepEqual(Object.keys(listed.lobbies[0]).sort(),['code','format','host','locked','players','pool']);
  assert.ok(listed.lobbies[0].locked);
  visitor.send({type:'lobby-join',code:lobby.code,password:'wrong'});
  await visitor.wait(m=>m.type==='error'&&m.message.includes('password'));
  visitor.send({type:'lobby-join',code:lobby.code,password:'private-room'});
  await visitor.wait(m=>m.type==='lobby'&&m.players.length===2);
  visitor.send({type:'lobby-password',password:''});
  await visitor.wait(m=>m.type==='error'&&m.message.includes('host'));
  host.send({type:'lobby-start'});
  await host.wait(m=>m.type==='error');
  host.send({type:'lobby-password',password:''});
  await visitor.wait(m=>m.type==='lobby'&&!m.locked);
  visitor.send({type:'lobby-leave'});await host.wait(m=>m.type==='lobby'&&!m.locked&&m.players.length===1);
  host.send({type:'lobby-leave'});await host.wait(m=>m.type==='idle'&&m.lobbies?.length===0&&host.messages.indexOf(m)>host.messages.indexOf(lobby));
  const arenaQueues=[host,visitor,await connect(2),await connect(3)];
  for(const socket of arenaQueues)socket.messages.length=0;
  host.send({type:'lobby-create',format:'lobby-arena',pool:'random'});
  const arenaLobby=await host.wait(m=>m.type==='lobby'&&m.format==='lobby-arena');
  const arenaListed=await visitor.wait(m=>m.type==='idle'&&m.lobbies?.some(room=>room.code===arenaLobby.code));
  assert.equal(arenaListed.lobbies.find(room=>room.code===arenaLobby.code).format,'lobby-arena');
  host.send({type:'lobby-start'});
  await host.wait(m=>m.type==='error'&&m.message.startsWith('Arena needs'));
  host.send({type:'lobby-settings',format:'lobby-ffa',seconds:20,songs:5});
  await host.wait(m=>m.type==='error'&&m.message.includes('this game mode'));
  for(const socket of arenaQueues.slice(1)){
    socket.send({type:'lobby-join',code:arenaLobby.code});
    await socket.wait(m=>m.type==='lobby'&&m.code===arenaLobby.code);
    socket.send({type:'lobby-ready',ready:true});
  }
  await host.wait(m=>m.type==='lobby'&&m.players.length===4&&m.players.slice(1).every(p=>p.ready)&&m.songs===20);
  host.send({type:'lobby-start'});
  const {match:arenaId}=await host.wait(m=>m.type==='matched');
  const arenaRoom=await connect(0,arenaId);
  const {state:arenaMatch}=await arenaRoom.wait(m=>m.type==='state');
  assert.equal(arenaMatch.mode,'2v2-arena');
  assert.equal(arenaMatch.total,20);
  assert.equal(arenaMatch.lobby.code,arenaLobby.code);
  assert.equal(arenaMatch.lobby.seconds,20);
  assert.equal(arenaMatch.readyDeadline,undefined);
  assert.equal(new Set(arenaMatch.players.map(player=>player.team)).size,2);
  for(const socket of arenaQueues){
    const after=socket.messages.length;
    socket.send({type:'lobby-leave'});
    await socket.wait(m=>m.type==='idle'&&socket.messages.indexOf(m)>=after);
    socket.ws.close();
  }
  arenaRoom.ws.close();
  const guest=await mf.dispatchFetch(base+'/api/play-connect',{headers:{Upgrade:'websocket',Origin:base}});assert.equal(guest.status,401);
  const cross=await mf.dispatchFetch(base+'/api/play-connect',{headers:{Upgrade:'websocket',Cookie:cookies[0],Origin:'https://wrong.test'}});assert.equal(cross.status,403);
  const madeUp=await mf.dispatchFetch(base+'/api/play-connect?match='+crypto.randomUUID(),{headers:{Upgrade:'websocket',Cookie:cookies[0],Origin:base}});assert.equal(madeUp.status,403);
  const wide={...listBody,username:'Wide'};
  for(const cookie of cookies.slice(0,2))assert.equal((await listUpdate(wide,cookie)).status,200);
  const watchedA=await connect(0),randomB=await connect(1);
  watchedA.send({type:'join',mode:'song-artist',format:'1v1',pool:'watched'});
  await watchedA.wait(m=>m.type==='queued'&&m.pool==='watched');
  randomB.send({type:'join',mode:'song-artist',format:'1v1'});
  await randomB.wait(m=>m.type==='queued'&&m.counts['1v1-watched']===1&&m.counts['1v1']===1);
  randomB.send({type:'join',mode:'song-artist',format:'1v1',pool:'watched'});
  const {match:watchedId}=await watchedA.wait(m=>m.type==='matched'&&m.pool==='watched');
  const distinct=(await(await mf.dispatchFetch(base+'/api/__fixture-info?match='+watchedId)).json()).animeIds;
  assert.equal(distinct.length,20);
  assert.equal(new Set(distinct).size,20);
  const watchedRoom=await connect(0,watchedId);
  const watchedRoomB=await connect(1,watchedId);
  const queuePositions=[watchedA.messages.length,randomB.messages.length];
  for(const r of [watchedRoom,watchedRoomB])r.send({type:'leave'});
  await Promise.all([watchedA,randomB].map((q,i)=>
    q.wait(m=>m.type==='idle'&&q.messages.indexOf(m)>=queuePositions[i])));
  for(const socket of [watchedRoom,watchedRoomB,watchedA,randomB])socket.ws.close();
  const rankedQueues=[];
  for(let i=0;i<8;i++){
    if(i>=2&&i<7)assert.equal((await listUpdate(wide,cookies[i])).status,200);
    const connection=await connect(i);
    rankedQueues.push(connection);
    connection.send({type:'join',mode:'ngmc-ranked',format:'ngmc-ranked',pool:'watched'});
  }
  const {match:rankedId}=await rankedQueues[0].wait(m=>m.type==='matched'&&m.pool==='watched'&&m.format==='ngmc-ranked');
  const live=async()=>await(await mf.dispatchFetch(base+'/api/play-live',{headers:{Cookie:cookies[0]}})).json();
  const playing=await live();
  assert.equal(playing.online,8);
  assert.equal(playing.waiting,0);
  assert.ok(playing.matches.some(m=>m.format==='ngmc-ranked'&&m.pool==='watched'&&m.players===8));
  const rankedInfo=await(await mf.dispatchFetch(base+'/api/__fixture-info?match='+rankedId)).json();
  assert.equal(rankedInfo.animeIds.length,35);
  assert.equal(new Set(rankedInfo.animeIds).size,35);
  await mf.dispatchFetch(base+'/api/__fixture-final-song?match='+rankedId);
  await mf.dispatchFetch(base+'/api/__expire?match='+rankedId);
  const rankingBase=base+'/api/play-rankings?format=ngmc-ranked';
  const watchedRankings=await(await mf.dispatchFetch(rankingBase+'&pool=watched')).json();
  const randomRankings=await(await mf.dispatchFetch(rankingBase+'&pool=random')).json();
  assert.equal(watchedRankings.rows.length,8);
  assert.deepEqual(watchedRankings.rows[0].record,[0,0,1]);
  assert.equal(randomRankings.rows.length,0);
  assert.ok(!(await live()).matches.some(m=>m.format==='ngmc-ranked'&&m.pool==='watched'));
  const settlementPath=base+'/api/host/play-review?match='+rankedId+'&view=settlement';
  assert.equal((await mf.dispatchFetch(settlementPath)).status,401);
  const settlement=await(await mf.dispatchFetch(settlementPath,{headers:{Authorization:'Bearer local-only-test-host-token-123456789'}})).json();
  assert.equal(settlement.ratingReceipt.players.length,8);
  assert.equal(settlement.creditReceipt.players.length,8);
  const migrate=base+'/api/host/play-review-balanced-ratings';
  assert.equal((await mf.dispatchFetch(migrate)).status,401);
  const applyBalanced=async()=>await(await mf.dispatchFetch(migrate,{method:'POST',
    headers:{Authorization:'Bearer local-only-test-host-token-123456789','Content-Type':'application/json'},body:JSON.stringify({apply:true})})).json();
  const migration=await applyBalanced();
  assert.ok(migration.appliedAt,JSON.stringify(migration.error));
  assert.ok(migration.updates.some(g=>g.id===rankedId&&g.pool==='watched'));
  assert.deepEqual(await applyBalanced(),migration);
  for(const connection of rankedQueues)connection.ws.close();
  const catalog=await (await mf.dispatchFetch(base+'/api/play-catalog')).json();assert.equal(catalog.anime.length,80);assert.equal(catalog.song.length,40);assert.equal(catalog.songs,undefined);
  assert.ok(catalog.anime.includes('Sheet Anime 1')&&!catalog.anime.includes('Anime 1'));
  for(const [format,size] of [['1v1',2],['1-team',3],['3v3',6],['ngmc-ranked',8]]){
    const ngmc=format==='ngmc-ranked';
    const queues=[];for(let i=0;i<size;i++){const q=await connect(i,'',i===0);queues.push(q);
      if(i===1){
        await q.wait(m=>m.type==='idle'&&m.counts?.[format]===1);
      }
      q.send({type:'join',mode:ngmc?'ngmc-ranked':'song-artist',format});}
    const matched=await queues[0].wait(m=>m.type==='matched'),id=matched.match;
    for(const q of queues)assert.equal((await q.wait(m=>m.type==='matched')).match,id);
    const rooms=[];for(let i=0;i<size;i++)rooms.push(await connect(i,id));
    const roster=(await rooms[0].wait(m=>m.type==='state')).state.players;
    assert.equal(roster.find(p=>p.id==='1').avatar.image,'/amq-tours-logo.png');
    assert.equal(roster.find(p=>p.id==='1').avatar.level,2);
    assert.deepEqual(Object.keys(roster.find(p=>p.id==='1').avatar).sort(),['crop','image','level','rarity']);
    if(ngmc){assert.equal(roster.find(p=>p.id==='8').avatar,null);assert.deepEqual([...mf.tourSeedRequests].sort(),['1','2','3','4','5','6','7','8']);assert.equal(roster.find(p=>p.id==='5').guessRate,40);}
    const manifest=await rooms[0].wait(m=>m.type==='manifest');
    assert.equal(manifest.sealed,true);
    assert.equal(manifest.audio.length,ngmc?38:23);
    assert.equal(new Set(manifest.audio).size,manifest.audio.length);
    assert.ok(manifest.audio.every(ticket=>/^[A-Za-z0-9_-]{379}$/.test(ticket)));
    assert.equal(manifest.total,ngmc?35:20);
    assert.equal(manifest.preload,6);
    assert.equal(manifest.answers,undefined);
    let revision=0;
    const preload=Array.from({length:manifest.preload},(_,i)=>i);
    if(format==='1v1') {
      assert.equal((await mf.dispatchFetch(base+'/api/play-connect?protocol=3&match='+id,{headers:{Upgrade:'websocket',Cookie:cookies[0],Origin:base}})).status,409);
      const path=base+'/api/play-audio/';
      const broken=(manifest.audio[0][0]==='A'?'B':'A')+manifest.audio[0].slice(1);
      assert.equal((await mf.dispatchFetch(path+broken)).status,404);
      const fixture=()=>mf.dispatchFetch(base+'/api/__fixture-info?match='+id).then(r=>r.json());
      const original=await fixture(),slot=original.slot;
      mf.unavailableAudio.add(new URL(original.song.audio).pathname);
      const unavailable=await mf.dispatchFetch(path+manifest.audio[slot]);
      assert.equal(unavailable.status,502);
      const proof=unavailable.headers.get('X-Play-Audio-Failure');
      assert.ok(proof);
      for(const r of rooms)r.send({type:'audio-failed',slot,revision,proof});
      const replacement=await rooms[0].wait(m=>m.type==='audio-replaced');
      assert.deepEqual(await rooms[1].wait(m=>m.type==='audio-replaced'),replacement);
      assert.equal(replacement.slot,slot);revision=replacement.revision;
      assert.equal(revision,1);assert.notEqual((await fixture()).song.audio,original.song.audio);
      manifest.audio[slot]=replacement.ticket;
      mf.unavailableAudio.clear();
      const media=await mf.dispatchFetch(path+replacement.ticket);
      assert.equal(media.status,200);
      assert.equal(media.headers.get('Location'),null);
      assert.match(media.headers.get('Content-Type'),/application\/octet-stream/);
      assert.match(media.headers.get('Cache-Control'),/no-store/);
      await media.arrayBuffer();
    }
    if(ngmc){for(const team of [0,1]){const initial=(await rooms[0].wait(m=>m.type==='state')).state,p=initial.players.find(p=>p.team===team);rooms[Number(p.id)-1].send({type:'volunteer'});}}
    for(const r of rooms){r.send({type:'loaded',revision,indices:preload.slice(1)});r.send({type:'ready'});}
    await sleep(80);assert.ok(!rooms[0].messages.some(m=>m.state?.phase==='guess'));
    for(const r of rooms)r.send({type:'loaded',revision,indices:[0]});
    const started=(await rooms[0].wait(m=>m.state?.phase==='guess')).state;
    assert.ok(started.players.every(p=>p.loaded===manifest.preload));
    assert.ok(started.playback);
    assert.equal(started.audioIndex,undefined);
    assert.equal(started.samplePosition,undefined);
    assert.ok(started.now>=started.startsAt);
    rooms[0].send({type:'playback',index:1});
    await sleep(30);
    assert.ok(!rooms[0].messages.some(m=>m.type==='playback'&&m.index===1));
    const {song:fixtureSong}=await (await mf.dispatchFetch(base+'/api/__fixture-info?match='+id)).json();
    const song=Number(fixtureSong.audio.match(/local-(\d+)/)[1]);
    if(format==='1v1'){
      const {slot,key}=started.playback,path=base+'/api/play-audio/';
      const wrong=(slot+1)%manifest.audio.length;
      const [selected,other]=await Promise.all([slot,wrong].map(async i=>new Uint8Array(await (await mf.dispatchFetch(path+manifest.audio[i])).arrayBuffer())));
      assert.equal(selected.length,other.length);
      const material=await crypto.subtle.importKey('raw',audioBytes(key),'AES-GCM',false,['decrypt']);
      const decrypt=bytes=>crypto.subtle.decrypt({name:'AES-GCM',iv:bytes.subarray(0,PLAY_AUDIO_IV_BYTES)},material,bytes.subarray(PLAY_AUDIO_IV_BYTES));
      const clip=new Uint8Array(await decrypt(selected));
      assert.equal(clip[8],song);
      await assert.rejects(decrypt(other),{name:'OperationError'});
      rooms[1].ws.close();
      rooms[1]=await connect(1,id);
      assert.ok((await rooms[1].wait(m=>m.type==='state')).canCompactHistory);
      rooms[1].send({type:'compact-history'});
      assert.deepEqual((await rooms[1].wait(m=>m.state?.playback)).state.playback,started.playback);
      rooms[1].send({type:'loaded',revision,indices:preload});
      rooms[1].send({type:'ready'});
    }
    rooms[0].send({type:'activity',event:'visibility',visibility:'hidden',focused:false,clientAt:123});
    const teamFields=['1-team','3v3'].includes(format),counts={};
    const firstAnswer=teamFields?{type:'answer',index:0,field:'anime',answer:'wrong'}:{type:'answer',index:0,answers:{anime:'wrong',song:'',artist:''},lock:true};
    rooms[0].send(firstAnswer);await rooms[0].wait(m=>m.state?.players.find(p=>p.id==='1')?.submittedFields?.includes('anime'));
    const unlockCursor=rooms[0].messages.length;
    rooms[0].send({type:'unlock',index:0});
    await rooms[0].wait(m=>rooms[0].messages.indexOf(m)>=unlockCursor&&m.state?.phase==='guess'&&m.state.players.find(p=>p.id==='1')?.submittedFields?.length===0);

    for(let i=0;i<rooms.length;i++){
      if(teamFields){const team=roster.find(p=>p.id===String(i+1)).team,n=counts[team]||0;counts[team]=n+1;const field=['anime','song','artist'][n];if(format==='1-team'&&field==='artist'){rooms[i].send({type:'draft',index:0,field,answers:{anime:'',song:'',artist:'Artist '+song},artists:['Artist '+song]});await rooms[i].wait(m=>m.type==='draft-saved');}else rooms[i].send({type:'answer',index:0,field,...(field==='artist'?{artists:['Artist '+song]}:{answer:{anime:'Alternative '+song,song:'Song '+song}[field]})});}
      else rooms[i].send({type:'answer',index:0,answers:{anime:ngmc&&i>=4?'wrong':'Alternative '+song,song:'Song '+song,artist:'Artist '+song},lock:true});
    }
    if(teamFields){if(format!=='1-team')for(const r of rooms)await r.wait(m=>m.state?.players.filter(p=>p.team===m.state.players.find(p=>p.id===m.state.me).team).every(p=>p.field));await mf.dispatchFetch(base+'/api/__expire?match='+id);}

    if(ngmc){await rooms[0].wait(m=>m.state?.phase==='counting'||m.state?.phase==='reveal');await mf.dispatchFetch(base+'/api/__expire?match='+id);}
    const reveal=(await rooms[0].wait(m=>m.state?.phase==='reveal')).state;
    assert.ok(reveal.players.every(p=>p.score===(ngmc?Number(Number(p.id)<=4):teamFields?1:3)));if(!ngmc)assert.ok(reveal.teams.every(p=>p===3));assert.equal(reveal.history.length,1);
    if(format==='1v1'){
      const {decoys}=await (await mf.dispatchFetch(base+'/api/__fixture-info?match='+id)).json();
      await mf.dispatchFetch(base+'/api/__expire?match='+id);await mf.dispatchFetch(base+'/api/__advance?match='+id);
      await rooms[0].wait(m=>m.state?.phase==='guess'&&m.state.index===1&&m.state.now>=m.state.startsAt);
      rooms[0].send({type:'answer',index:1,answers:{anime:decoys[0].anime,song:'',artist:''},lock:true});
      await rooms[0].wait(m=>m.state?.index===1&&m.state.players.find(p=>p.id==='1').locked);
      await mf.dispatchFetch(base+'/api/__expire?match='+id);
      const second=(await rooms[0].wait(m=>m.state?.history?.length===2)).state;
      const patch=(await rooms[1].wait(m=>m.state?.historyFrom===1)).state;
      assert.deepEqual(patch.history,second.history.slice(1));
      assert.equal(patch.songList,undefined);
      assert.equal(second.history[1].results.find(p=>p.id==='1').correct.anime,false);
      assert.equal(second.songList.length,2);assert.ok(!JSON.stringify(second).includes('decoy'));
      assert.equal(second.playback,undefined);
      assert.ok(!JSON.stringify(second.songList).includes('.mp3'));
    }
    rooms[0].ws.close();const resumed=await connect(0,id);const snapshot=(await resumed.wait(m=>m.type==='state')).state;assert.deepEqual(snapshot.teams,reveal.teams);
    const all=[resumed,...rooms.slice(1)];for(const r of all)r.send({type:'leave'});
    await all[0].wait(m=>['finished','cancelled'].includes(m.state?.phase));
    if(format==='1v1'){
      const end=(await all[1].wait(m=>['finished','cancelled'].includes(m.state?.phase))).state;
      assert.equal(end.historyFrom,undefined);assert.equal(end.history.length,2);assert.equal(end.songList.length,end.total);
    }
    if(ngmc){const rated=(await all[0].wait(m=>m.state?.ratings?.length===8)).state;const standings=await (await mf.dispatchFetch(base+'/api/play-rankings?format=ngmc-ranked')).json();
      for(const row of standings.rows){
        const p=rated.players.find(p=>p.name===row.name),rating=rated.ratings.find(r=>r.id===p.id);
        const delta=rated.teams[p.team]-rated.teams[1-p.team];
        assert.deepEqual(row.record,rating.forfeited||delta<0?[0,1,0]:delta>0?[1,0,0]:[0,0,1]);
      }
      assert.ok(rated.ratings.every(r=>Number.isFinite(r.after)&&r.seen===1));const again=await connect(0,id);assert.deepEqual((await again.wait(m=>m.state?.ratings?.length===8)).state.ratings,rated.ratings);again.ws.close();}
    const auditHeaders={Authorization:'Bearer local-only-test-host-token-123456789'};
    assert.equal((await mf.dispatchFetch(base+'/api/host/play-review?match='+id,{headers:{Cookie:cookies[0]}})).status,401);
    const reviewResponse=await mf.dispatchFetch(base+'/api/host/play-review?match='+id,{headers:auditHeaders});assert.equal(reviewResponse.status,200,await reviewResponse.clone().text());const review=await reviewResponse.json();
    assert.ok(review.events.some(e=>e.kind==='unlock'&&e.data.accepted&&e.player==='1'));
    assert.ok(review.events.some(e=>e.kind==='activity'&&e.player==='1'&&e.data.clientAt===123&&e.at>123));
    assert.ok(review.events.some(e=>e.kind==='submit'&&e.data.accepted&&e.data.answers.anime));
    if(format==='1v1'){
      await mf.dispatchFetch(base+'/api/__advance?match='+id);
      const indexed=await (await mf.dispatchFetch(base+'/api/host/play-review?flagged=1',{headers:auditHeaders})).json();
      assert.ok(indexed.matches.some(m=>m.id===id&&m.flags>0),'finished match indexed before a host opens it');
      let highlights;
      do {
        highlights=await (await mf.dispatchFetch(base+'/api/host/play-review?match='+id+'&view=highlights',{headers:auditHeaders})).json();
      } while(highlights.highlights.pending);
      assert.ok(highlights.highlights.rows.some(r=>r.kind==='decoy'&&r.player==='1'&&r.round===2));
      assert.equal(highlights.events,undefined);
      const update=headers=>mf.dispatchFetch(base+'/api/host/play-review',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({match:id,status:'reviewing',note:'Check round 1'})});
      assert.equal((await update({Cookie:cookies[0]})).status,401);
      assert.equal((await update(auditHeaders)).status,200);
      assert.equal((await (await mf.dispatchFetch(base+'/api/host/play-review?match='+id,{headers:auditHeaders})).json()).assessment.note,'Check round 1');
      assert.ok(review.events.some(e=>e.kind==='submit'&&e.data.flags.length===1));
      assert.ok(review.events.some(e=>e.kind==='round-result'&&e.data.flags.length===1&&!e.data.correct.anime));
    }
    const reviews=await (await mf.dispatchFetch(base+'/api/host/play-review?search=Local%20Player%201',{headers:auditHeaders})).json();assert.ok(reviews.matches.some(m=>m.id===id&&m.status!=='active'));
    assert.equal((await mf.dispatchFetch(base+'/api/host/play-review?match='+crypto.randomUUID(),{headers:auditHeaders})).status,404);
    for(const q of queues)q.ws.close();for(const r of all)r.ws.close();
    await mf.dispatchFetch(base+'/api/__expire?match='+id);
    assert.equal((await mf.dispatchFetch(base+'/api/host/play-review?match='+id,{headers:auditHeaders})).status,200,'review survives gameplay expiry');
    assert.deepEqual(await (await mf.dispatchFetch(base+'/api/__expire-review?match='+id)).json(),{tables:3});
    const retained=await mf.dispatchFetch(base+'/api/host/play-review?match='+id,{headers:auditHeaders});
    assert.equal(retained.status,200,'legacy expiry alarm preserves host access');
    const saved=await retained.json();assert.equal(saved.expires,null);assert.deepEqual(saved.events,review.events);
    const older=await (await mf.dispatchFetch(base+'/api/host/play-review?search='+id,{headers:auditHeaders})).json();
    assert.ok(older.matches.some(m=>m.id===id),'60-day-old match remains searchable after queue cleanup');
  }
  for(const pool of ['random','watched']){
    const queues=[await connect(0),await connect(1)];
    for(const q of queues)q.send({type:'join',mode:'1v1-ranked',format:'1v1-ranked',pool});
    const {match:id}=await queues[0].wait(m=>m.type==='matched'&&m.format==='1v1-ranked'&&m.pool===pool);
    const rooms=[await connect(0,id),await connect(1,id)];
    for(const room of rooms){
      const manifest=await room.wait(m=>m.type==='manifest');
      assert.equal(manifest.mode,'1v1-ranked');
      assert.equal(manifest.total,20);
      room.send({type:'loaded',indices:manifest.audio.map((_,i)=>i)});
      room.send({type:'ready'});
    }
    const wallet=async index=>(await (await mf.dispatchFetch(base+'/api/play-state',{headers:{Cookie:cookies[index]}})).json()).me.balance;
    const balances=await Promise.all([wallet(0),wallet(1)]);
    const started=(await rooms[0].wait(m=>m.state?.phase==='guess')).state;
    assert.equal(started.until-started.startsAt,20000);
    assert.equal(started.pool,pool);
    const {song,animeIds}=await(await mf.dispatchFetch(base+'/api/__fixture-info?match='+id)).json();
    if(pool==='watched')assert.equal(new Set(animeIds).size,20);
    if(pool==='random'){
      rooms[0].send({type:'answer',index:0,answers:{anime:song.anime},lock:true});
      await rooms[1].wait(m=>m.state?.players.find(p=>p.id==='1')?.locked);
      assert.equal(rooms[1].messages.at(-1).state.players.find(p=>p.id==='1').answers,undefined);
      rooms[1].send({type:'answer',index:0,answers:{anime:'wrong anime',song:song.title,artist:song.artist},lock:true});
      const revealed=(await rooms[0].wait(m=>m.state?.phase==='reveal')).state;
      assert.deepEqual(revealed.history[0].results.map(r=>Object.keys(r.correct)),[['anime'],['anime']]);
      assert.equal(revealed.history[0].results.find(r=>r.id==='1').earned,1);
      await mf.dispatchFetch(base+'/api/__fixture-final-song?match='+id);
      assert.equal((await mf.dispatchFetch(base+'/api/__stall-last-reveal?match='+id)).status,200);
      rooms[1].send({type:'sync'});
      const pending=(await rooms[1].wait(m=>m.state?.ratings?.length===2&&m.state.creditsPending)).state;
      assert.equal(pending.settlementPending,true);
      await queues[0].wait(m=>m.type==='idle'&&queues[0].messages.indexOf(m)>queues[0].messages.findIndex(previous=>previous.match===id));
      await mf.dispatchFetch(base+'/api/__advance?match='+id);
      await rooms[1].wait(m=>m.state?.creditReward&&!m.state.settlementPending);
    }else rooms[0].send({type:'leave'});
    const rated=(await rooms[1].wait(m=>m.state?.phase==='finished'&&m.state.ratings?.length===2)).state;
    assert.equal(rated.ratings.find(r=>r.id==='1').delta,pool==='random'?16:-25);
    assert.equal(rated.ratings.find(r=>r.id==='2').delta,pool==='random'?-16:16);
    const expected=pool==='random'?[100,50]:[0,0];
    for(const [index,amount] of expected.entries()){
      assert.equal(await wallet(index),balances[index]+amount);
      if(amount){
        const paid=await rooms[index].wait(m=>m.state?.creditReward);
        assert.deepEqual(paid.state.creditReward,{id:String(index+1),amount,bonus:0});
      }
    }
    await mf.dispatchFetch(base+'/api/__advance?match='+id);
    assert.deepEqual(await Promise.all([wallet(0),wallet(1)]),balances.map((balance,i)=>balance+expected[i]));
    const rows=await(await mf.dispatchFetch(base+'/api/play-rankings?format=1v1-ranked&pool='+pool)).json();
    assert.deepEqual(rows.rows.map(r=>r.record),[[1,0,0],[0,1,0]]);
    assert.equal(rows.rows[0].name,'Local Player '+(pool==='random'?'1':'2'));
    for(const connection of [...queues,...rooms])connection.ws.close();

    const [host,guest,visitor]=await Promise.all([connect(0),connect(1),connect(2)]);
    host.send({type:'lobby-create',format:'lobby-duel',pool});
    const lobby=await host.wait(m=>m.type==='lobby'&&m.format==='lobby-duel');
    assert.deepEqual([lobby.songs,lobby.seconds],[20,20]);
    await guest.wait(m=>m.lobbies?.some(room=>room.code===lobby.code));
    guest.send({type:'lobby-join',code:lobby.code});
    await guest.wait(m=>m.type==='lobby'&&m.players.length===2);
    visitor.send({type:'lobby-join',code:lobby.code});
    await visitor.wait(m=>m.type==='error'&&m.message.includes('full'));
    guest.send({type:'lobby-ready',ready:true});
    await host.wait(m=>m.type==='lobby'&&m.players[1]?.ready&&(pool==='random'||m.watchedPool?.eligible>=20));
    const songs=pool==='random'?7:20, seconds=pool==='random'?35:20;
    if(pool==='random'){
      host.send({type:'lobby-settings',format:'lobby-duel',songs,seconds,pool});
      const updated=await guest.wait(m=>m.type==='lobby'&&m.songs===songs&&m.seconds===seconds);
      assert.equal(updated.players[1].ready,false);
      guest.send({type:'lobby-ready',ready:true});
      await host.wait(m=>m.type==='lobby'&&m.songs===songs&&m.players[1]?.ready);
    }
    host.send({type:'lobby-start'});
    const {match:customId}=await host.wait(m=>m.type==='matched');
    const customRooms=[await connect(0,customId),await connect(1,customId)];
    for(const room of customRooms){
      const manifest=await room.wait(m=>m.type==='manifest');
      assert.equal(manifest.mode,'1v1-ranked');
      assert.equal(manifest.total,songs);
      room.send({type:'loaded',indices:manifest.audio.map((_,i)=>i)});
      room.send({type:'ready'});
    }
    const duel=(await customRooms[0].wait(m=>m.state?.phase==='guess')).state;
    assert.equal(duel.format,'lobby-duel');
    assert.equal(duel.lobby.code,lobby.code);
    assert.equal(duel.pool,pool);
    assert.equal(duel.readyDeadline,undefined);
    assert.equal(duel.until-duel.startsAt,seconds*1000);
    if(pool==='random'){
      await mf.dispatchFetch(base+'/api/__fixture-final-song?match='+customId);
      await mf.dispatchFetch(base+'/api/__expire?match='+customId);
    }else host.send({type:'lobby-leave'});
    const completed=(await customRooms[1].wait(m=>m.state?.phase==='finished')).state;
    assert.equal(completed.ratings,undefined);
    assert.equal(completed.creditReward,undefined);
    assert.deepEqual(await Promise.all([wallet(0),wallet(1)]),balances.map((balance,i)=>balance+expected[i]));
    await guest.wait(m=>m.type==='lobby-ended');
    const current=await(await mf.dispatchFetch(base+'/api/play-rankings?format=1v1-ranked&pool='+pool)).json();
    assert.deepEqual(current.rows,rows.rows);
    guest.send({type:'lobby-return',match:customId});
    await guest.wait(m=>m.type==='lobby'&&!m.busy&&m.host==='2');
    for(const socket of [host,guest]){
      const after=socket.messages.length;
      socket.send({type:'lobby-leave'});
      await socket.wait(m=>m.type==='idle'&&socket.messages.indexOf(m)>=after);
    }
    for(const connection of [host,guest,visitor,...customRooms])connection.ws.close();
  }

  const inactiveQueue=await connect(0),activeQueue=await connect(1);
  // Two inactive matches, one wrong guess that resets the streak, then three inactive matches.
  for(let game=0;game<6;game++){
    const pool=game%2===0?'random':'watched';
    const start=inactiveQueue.messages.length;
    for(const q of [inactiveQueue,activeQueue])q.send({type:'join',mode:'1v1-ranked',format:'1v1-ranked',pool});
    const {match:id}=await inactiveQueue.wait(m=>inactiveQueue.messages.indexOf(m)>=start&&m.type==='matched');
    const [idle,active]=await Promise.all([connect(0,id),connect(1,id)]);
    for(const room of [idle,active]){
      const manifest=await room.wait(m=>m.type==='manifest');
      room.send({type:'loaded',indices:manifest.audio.map((_,i)=>i)});
      room.send({type:'ready'});
    }
    const nextPhase=timeout=>mf.dispatchFetch(base+'/api/__advance?match='+id+(timeout?'&timeout':''));
    const rounds=game===0?3:1;
    for(let index=0;index<rounds;index++){
      await idle.wait(m=>m.state?.phase==='guess'&&m.state.index===index);
      if(index===0){
        await nextPhase(false);
        if(game===2){
          idle.send({type:'answer',index,answers:{anime:'Incorrect but answered'},lock:true});
          await idle.wait(m=>m.state?.players.find(p=>p.id==='1')?.locked);
        }
        active.send({type:'answer',index,answers:{anime:'Also incorrect'},lock:true});
        await active.wait(m=>m.state?.players.find(p=>p.id==='2')?.locked);
      }
      if(game!==2)await nextPhase(true);
      await idle.wait(m=>m.state?.phase==='reveal'&&m.state.index===index);
      assert.equal(inactiveQueue.messages.some(m=>m.type==='inactivity-ban'),false);
      if(index<rounds-1)await nextPhase(false);
    }
    await mf.dispatchFetch(base+'/api/__fixture-final-song?match='+id);
    await mf.dispatchFetch(base+'/api/__expire?match='+id);
    const {state}=await idle.wait(m=>m.state?.creditReward);
    assert.equal(state.phase,'finished');
    assert.equal(state.creditReward.amount,100,'a completed match pays credits even without guesses');
    if(game<5)assert.equal(inactiveQueue.messages.some(m=>m.type==='inactivity-ban'),false);
    for(const connection of [idle,active])connection.ws.close();
  }
  const ban=await inactiveQueue.wait(m=>m.type==='inactivity-ban');
  assert.ok(Math.abs(ban.until-Date.now()-86400000)<5000);
  assert.equal(activeQueue.messages.some(m=>m.type==='inactivity-ban'),false);
  for(const [mode,format,pool] of [['song-artist','1-team','watched'],['2v2-arena','2v2-arena','random'],['1v1-ranked','1v1-ranked','random']]){
    const start=inactiveQueue.messages.length;
    inactiveQueue.send({type:'join',mode,format,pool});
    await inactiveQueue.wait(m=>inactiveQueue.messages.indexOf(m)>=start&&m.type==='error'&&m.message.includes('three consecutive matches'));
  }
  activeQueue.send({type:'join',mode:'song-artist',format:'1-team'});
  await activeQueue.wait(m=>m.type==='queued'&&m.format==='1-team');
});
