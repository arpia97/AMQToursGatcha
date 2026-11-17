import test from 'node:test';
import assert from 'node:assert/strict';
import {playRuntimeFixture} from './play-runtime-fixture.mjs';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
test('multiplayer Workers authenticate sockets, form all formats, preload, score and survive reconnect through the proxy',async t=>{
  const mf=await playRuntimeFixture();t.after(()=>mf.dispose());
  const base='http://game',cookies=[];
  for(let i=1;i<=8;i++){const response=await mf.dispatchFetch(base+'/api/__test-session?id='+i);assert.equal(response.status,200,await response.clone().text());cookies.push((await response.json()).cookie);}
  const connect=async(i,match='',proxy=false)=>{
    let r=await mf.dispatchFetch(base+(proxy?'/api/__fake-proxy':'/api/play-connect')+(match?'?match='+match:''),{headers:{Upgrade:'websocket',Cookie:cookies[i],Origin:proxy?'https://amqtours.app':base}});
    for(let tries=0;r.status===429&&tries<3;tries++){await sleep(1100);r=await mf.dispatchFetch(base+(proxy?'/api/__fake-proxy':'/api/play-connect')+(match?'?match='+match:''),{headers:{Upgrade:'websocket',Cookie:cookies[i],Origin:proxy?'https://amqtours.app':base}});}
    assert.equal(r.status,101,r.status===101?'':await r.text());const ws=r.webSocket;const messages=[];ws.addEventListener('message',e=>messages.push(JSON.parse(e.data)));ws.accept();
    const wait=async predicate=>{for(let n=0;n<250;n++){const found=messages.find(predicate);if(found)return found;await sleep(20);}throw Error('No matching socket message: '+JSON.stringify(messages.slice(-4)));};
    t.after(()=>{if(ws.readyState===1)ws.close();});return {ws,messages,wait,send:value=>ws.send(JSON.stringify(value))};
  };
  const guest=await mf.dispatchFetch(base+'/api/play-connect',{headers:{Upgrade:'websocket',Origin:base}});assert.equal(guest.status,401);
  const cross=await mf.dispatchFetch(base+'/api/play-connect',{headers:{Upgrade:'websocket',Cookie:cookies[0],Origin:'https://wrong.test'}});assert.equal(cross.status,403);
  const madeUp=await mf.dispatchFetch(base+'/api/play-connect?match='+crypto.randomUUID(),{headers:{Upgrade:'websocket',Cookie:cookies[0],Origin:base}});assert.equal(madeUp.status,403);
  const catalog=await (await mf.dispatchFetch(base+'/api/play-catalog')).json();assert.equal(catalog.anime.length,80);assert.equal(catalog.song.length,40);assert.equal(catalog.songs,undefined);
  for(const [format,size] of [['1v1',2],['1-team',3],['3v3',6],['ngmc-ranked',8]]){
    const ngmc=format==='ngmc-ranked',first=ngmc?12:10;
    const queues=[];for(let i=0;i<size;i++){const q=await connect(i,'',i===0);queues.push(q);q.send({type:'join',mode:ngmc?'ngmc-ranked':'song-artist',format});}
    const matched=await queues[0].wait(m=>m.type==='matched'),id=matched.match;
    for(const q of queues)assert.equal((await q.wait(m=>m.type==='matched')).match,id);
    const rooms=[];for(let i=0;i<size;i++)rooms.push(await connect(i,id));
    const roster=(await rooms[0].wait(m=>m.type==='state')).state.players;
    assert.equal(roster.find(p=>p.id==='1').avatar.image,'/amq-tours-logo.png');
    assert.equal(roster.find(p=>p.id==='1').avatar.level,2);
    assert.deepEqual(Object.keys(roster.find(p=>p.id==='1').avatar).sort(),['crop','image','level','rarity']);
    if(ngmc)assert.equal(roster.find(p=>p.id==='8').avatar,null);
    const manifest=await rooms[0].wait(m=>m.type==='manifest');assert.equal(manifest.audio.length,ngmc?35:20);assert.equal(new Set(manifest.audio).size,ngmc?35:20);assert.equal(manifest.answers,undefined);if(ngmc)assert.ok(manifest.audio.every(url=>!/local-[12]\.mp3$/.test(url)));
    if(ngmc){for(const team of [0,1]){const initial=(await rooms[0].wait(m=>m.type==='state')).state,p=initial.players.find(p=>p.team===team);rooms[Number(p.id)-1].send({type:'volunteer'});}}
    for(const r of rooms){r.send({type:'loaded',indices:Array.from({length:first-1},(_,i)=>i)});r.send({type:'ready'});}
    await sleep(80);assert.ok(!rooms[0].messages.some(m=>m.state?.phase==='guess'));
    for(const r of rooms)r.send({type:'loaded',indices:[first-1]});
    await rooms[0].wait(m=>m.state?.phase==='guess');
    assert.ok(rooms[0].messages.find(m=>m.state?.phase==='guess').state.players.every(p=>p.loaded===first));
    await mf.dispatchFetch(base+'/api/__advance?match='+id);
    const song=Number(manifest.audio[0].match(/local-(\d+)/)[1]);
    for(let i=0;i<rooms.length;i++)rooms[i].send({type:'answer',index:0,answers:{anime:ngmc&&i>=4?'wrong':'Alternative '+song,song:'Song '+song,artist:'Artist '+song},lock:true});
    if(ngmc){await rooms[0].wait(m=>m.state?.phase==='counting'||m.state?.phase==='reveal');await mf.dispatchFetch(base+'/api/__expire?match='+id);}
    const reveal=(await rooms[0].wait(m=>m.state?.phase==='reveal')).state;
    assert.ok(reveal.players.every(p=>p.score===(ngmc?Number(Number(p.id)<=4):3)));if(!ngmc)assert.ok(reveal.teams.every(p=>p===3));assert.equal(reveal.history.length,1);
    rooms[0].ws.close();const resumed=await connect(0,id);const snapshot=(await resumed.wait(m=>m.type==='state')).state;assert.deepEqual(snapshot.teams,reveal.teams);
    const all=[resumed,...rooms.slice(1)];for(const r of all)r.send({type:'leave'});
    await all[0].wait(m=>['finished','cancelled'].includes(m.state?.phase));
    if(ngmc){const rated=(await all[0].wait(m=>m.state?.ratings?.length===8)).state;assert.ok(rated.ratings.every(r=>Number.isFinite(r.after)&&r.seen===1));const again=await connect(0,id);assert.deepEqual((await again.wait(m=>m.state?.ratings?.length===8)).state.ratings,rated.ratings);again.ws.close();}
    for(const q of queues)q.ws.close();for(const r of all)r.ws.close();
  }
});
