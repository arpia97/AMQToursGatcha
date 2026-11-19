import test from 'node:test';
import assert from 'node:assert/strict';
import {playRuntimeFixture} from './play-runtime-fixture.mjs';
import {importAnimeList,listAccount} from '../src/play-anime-list.js';
import {compactLibrarySong} from '../public/quiz-library-data.js';
import {PlayLibrary} from '../src/play-library.js';
import {audioBytes,PLAY_AUDIO_PROTOCOL,PLAY_AUDIO_IV_BYTES} from '../public/play-audio-format.js';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
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
  const mf=await playRuntimeFixture();t.after(()=>mf.dispose());
  const base='http://game',cookies=[];
  for(let i=1;i<=8;i++){const response=await mf.dispatchFetch(base+'/api/__test-session?id='+i);assert.equal(response.status,200,await response.clone().text());cookies.push((await response.json()).cookie);}
  const connect=async(i,match='',proxy=false)=>{
    let r=await mf.dispatchFetch(base+(proxy?'/api/__fake-proxy':'/api/play-connect')+('?protocol='+PLAY_AUDIO_PROTOCOL+(match?'&match='+match:'')),{headers:{Upgrade:'websocket',Cookie:cookies[i],Origin:proxy?'https://amqtours.app':base}});
    for(let tries=0;r.status===429&&tries<3;tries++){await sleep(1100);r=await mf.dispatchFetch(base+(proxy?'/api/__fake-proxy':'/api/play-connect')+('?protocol='+PLAY_AUDIO_PROTOCOL+(match?'&match='+match:'')),{headers:{Upgrade:'websocket',Cookie:cookies[i],Origin:proxy?'https://amqtours.app':base}});}
    assert.equal(r.status,101,r.status===101?'':await r.text());const ws=r.webSocket;const messages=[];ws.addEventListener('message',e=>messages.push(JSON.parse(e.data)));ws.accept();
    const wait=async predicate=>{for(let n=0;n<250;n++){const found=messages.find(predicate);if(found)return found;await sleep(20);}throw Error('No matching socket message: '+JSON.stringify(messages.slice(-4)));};
    t.after(()=>{if(ws.readyState===1)ws.close();});return {ws,messages,wait,send:value=>ws.send(JSON.stringify(value))};
  };
  const host=await connect(0),visitor=await connect(1);
  assert.equal((await mf.dispatchFetch(base+'/api/host/play-sheet',{headers:{Cookie:cookies[0]}})).status,401);
  const listUpdate=(body,cookie)=>mf.dispatchFetch(base+'/api/play-anime-list',{method:'POST',headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(body)});
  const listBody={provider:'myanimelist',username:'https://myanimelist.net/animelist/Local'};
  assert.equal((await listUpdate(listBody)).status,401);
  host.send({type:'lobby-create',format:'lobby-team',seconds:30,songs:1,pool:'watched'});
  await host.wait(m=>m.type==='lobby'&&m.pool==='watched');
  host.send({type:'lobby-start'});
  await host.wait(m=>m.type==='error'&&m.message.includes('Import'));
  const linked=await listUpdate(listBody,cookies[0]);assert.equal(linked.status,200,await linked.clone().text());
  const summary=(await linked.json()).animeList;assert.equal(summary.count,1);assert.equal(summary.ids,undefined);
  host.send({type:'lobby-start'});
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
  host.ws.close();visitor.ws.close();
  const guest=await mf.dispatchFetch(base+'/api/play-connect',{headers:{Upgrade:'websocket',Origin:base}});assert.equal(guest.status,401);
  const cross=await mf.dispatchFetch(base+'/api/play-connect',{headers:{Upgrade:'websocket',Cookie:cookies[0],Origin:'https://wrong.test'}});assert.equal(cross.status,403);
  const madeUp=await mf.dispatchFetch(base+'/api/play-connect?match='+crypto.randomUUID(),{headers:{Upgrade:'websocket',Cookie:cookies[0],Origin:base}});assert.equal(madeUp.status,403);
  const catalog=await (await mf.dispatchFetch(base+'/api/play-catalog')).json();assert.equal(catalog.anime.length,80);assert.equal(catalog.song.length,40);assert.equal(catalog.songs,undefined);
  assert.ok(catalog.anime.includes('Sheet Anime 1')&&!catalog.anime.includes('Anime 1'));
  for(const [format,size] of [['1v1',2],['1-team',3],['3v3',6],['ngmc-ranked',8]]){
    const ngmc=format==='ngmc-ranked',first=ngmc?12:10;
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
    assert.equal(manifest.preload,first+3);
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
      rooms[0].send({type:'answer',index:1,answers:{anime:decoys[0].anime,song:'',artist:''},lock:true});
      await rooms[0].wait(m=>m.state?.index===1&&m.state.players.find(p=>p.id==='1').locked);
      await mf.dispatchFetch(base+'/api/__expire?match='+id);
      const second=(await rooms[0].wait(m=>m.state?.history?.length===2)).state;
      assert.equal(second.history[1].results.find(p=>p.id==='1').correct.anime,false);
      assert.equal(second.songList.length,2);assert.ok(!JSON.stringify(second).includes('decoy'));
      assert.equal(second.playback,undefined);
      assert.ok(!JSON.stringify(second.songList).includes('.mp3'));
    }
    rooms[0].ws.close();const resumed=await connect(0,id);const snapshot=(await resumed.wait(m=>m.type==='state')).state;assert.deepEqual(snapshot.teams,reveal.teams);
    const all=[resumed,...rooms.slice(1)];for(const r of all)r.send({type:'leave'});
    await all[0].wait(m=>['finished','cancelled'].includes(m.state?.phase));
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
});
