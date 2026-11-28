import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {jamPollDelay} from '../public/jam-polling.js';
import {Engine} from '../src/engine.js';
import {musicRead,musicAction,clearPlayerMusic} from '../src/music.js';
import {playRuntimeFixture} from './play-runtime-fixture.mjs';

function fixture(){
  const db=new DatabaseSync(':memory:');let now=1000000;
  const e=new Engine((s,...a)=>db.prepare(s).all(...a),fn=>{
    db.exec('BEGIN');try{const result=fn();db.exec('COMMIT');return result;}catch(err){db.exec('ROLLBACK');throw err;}
  },()=>now);
  e.host('players',{players:['a','b','c'].map(id=>({id,name:id}))});
  for(const [id,owner] of [[1,'a'],[2,'a'],[3,'b']])e.run('INSERT INTO songbook_owned VALUES(?,?,?,?)',id,owner,JSON.stringify({title:'song'+id,artist:'artist',audio:'https://eudist.animemusicquiz.com/'+id+'.mp3'}),now);
  const act=(p,op,b={},key=crypto.randomUUID())=>e.mutate(p+':music',key,{op,...b},()=>musicAction(e,p,{op,...b}));
  const view=(p,params='')=>musicRead(e,p,new URLSearchParams(params));
  return {e,act,view,tick:n=>now+=n};
}
test('playlist ownership, retry, rename and concurrent reordering',()=>{
  const {act,view}=fixture();
  const {id}=act('a','create-list',{name:'Mix',track:1},'retry');
  assert.equal(act('a','create-list',{name:'Mix',track:1},'retry').id,id);
  act('a','add',{list:id,track:2});
  assert.throws(()=>act('a','add',{list:id,track:3}),/songbook/);
  assert.throws(()=>view('b','view=playlist&id='+id),/not found/);
  act('a','reorder',{list:id,rev:2,from:0,to:1});
  assert.throws(()=>act('a','remove',{list:id,rev:2,from:0}),/changed/);
  assert.deepEqual(view('a','view=playlist&id='+id).tracks.map(t=>t.id),[2,1]);
  act('a','rename',{list:id,rev:3,name:'New Mix'});
  act('a','remove',{list:id,rev:4,from:0});
  act('a','delete-list',{list:id,rev:5});
  assert.deepEqual(view('a').lists,[]);
});
test('private parties synchronize late joins, host controls, elapsed tracks, owned guest additions and skip votes',()=>{
  const {e,act,view,tick}=fixture();
  const list=act('a','create-list',{name:'Mix',track:1}).id;
  act('a','add',{list,track:2});
  const room=act('a','start',{list}).id;
  const state=p=>view(p,'view=room').room;
  assert.equal(state('c'),null);
  assert.throws(()=>act('c','join',{room}),/invitation/);
  assert.throws(()=>act('a','invite',{room,friend:'c'}),/friends list/);
  e.friends.set('a',{player:'b',added:true});
  act('a','invite',{room,friend:'b'});
  assert.equal(view('b').invites[0].id,room);
  assert.equal(e.one("SELECT count(*) AS n FROM player_notices WHERE player='b' AND kind='jam-invite'").n,1);
  const entry=state('a').queue[0].key;
  act('a','duration',{room,entry,seconds:40});tick(12000);
  act('b','join',{room});
  const guest=state('b');
  assert.equal((guest.now-guest.since)/1000,12);
  assert.equal(view('b','view=room&rev='+guest.rev).room.queue,undefined);
  assert.throws(()=>act('b','pause',{room,entry}),/host/);
  act('a','pause',{room,entry});tick(3000);
  assert.equal(state('b').position,12);assert.equal(state('b').since,null);
  act('a','seek',{room,entry,seconds:32});act('a','play',{room,entry});
  assert.throws(()=>act('b','queue',{room,track:2}),/songbook/);
  act('b','queue',{room,track:3});tick(8100);
  const second=state('b').queue[0];
  assert.equal(second.title,'song2');
  assert.throws(()=>act('b','vote',{room,entry}),/song has changed/);
  act('b','vote',{room,entry:second.key});assert.equal(state('a').queue[0].key,second.key);
  act('a','vote',{room,entry:second.key});assert.equal(state('a').queue[0].by,'b');
  assert.equal(e.one("SELECT count(*) AS n FROM songbook_owned WHERE player='b'").n,1);
  act('a','leave',{room});assert.equal(state('b').host,'b');
  act('b','leave',{room});assert.equal(e.one('SELECT count(*) AS n FROM music_rooms').n,0);
});
test('leaving preserves access to that ongoing party without preserving votes or chat access',()=>{
  const {act,e,view,tick}=fixture();
  const list=act('a','create-list',{name:'Party',track:1}).id;
  const room=act('a','start',{list}).id;
  for(const friend of ['b','c']){
    e.friends.set('a',{player:friend,added:true});
    act('a','invite',{room,friend});
  }
  act('c','decline',{room});
  assert.throws(()=>act('c','join',{room}),/invitation/);
  act('b','join',{room});
  const initial=view('a','view=room').room;
  act('b','vote',{room,entry:initial.queue[0].key});
  act('b','leave',{room});
  const remaining=view('a','view=room').room;
  assert.deepEqual(remaining.members.map(m=>m.id),['a']);
  assert.deepEqual(remaining.votes,[]);
  assert.deepEqual(view('b','view=room&chatRoom='+room),{room:null});
  assert.throws(()=>act('b','chat',{room,body:'hello'}),/Join the party/);
  assert.equal(view('b','view=invites').invites.find(i=>i.id===room).returning,1);
  const other=act('b','start',{list:act('b','create-list',{name:'Other party',track:3}).id}).id;
  assert.throws(()=>act('b','join',{room}),/Leave your current party/);
  act('b','leave',{room:other});
  tick(12000);
  act('b','join',{room},'rejoin');act('b','join',{room},'rejoin');
  const rejoined=view('b','view=room').room;
  assert.deepEqual(rejoined.members.map(m=>m.id),['a','b']);
  assert.equal(rejoined.queue[0].key,initial.queue[0].key);
  assert.equal(rejoined.now-rejoined.since,12000);
  assert.equal(e.one("SELECT COUNT(*) AS n FROM player_notices WHERE player='b' AND kind='jam-invite'").n,1);
  act('b','leave',{room});act('a','leave',{room});
  assert.deepEqual(view('b').invites,[]);
  act('a','start',{list});
  assert.throws(()=>act('b','join',{room}),/ended/);
  assert.deepEqual(view('b').invites,[]);
});
test('stale hosts hand control to listeners, reset and expiry clear private access',()=>{
  const {act,e,view,tick}=fixture();
  const list=act('a','create-list',{name:'Party',track:1}).id;
  const room=act('a','start',{list}).id;
  e.friends.set('a',{player:'b',added:true});act('a','invite',{room,friend:'b'});
  act('b','join',{room});tick(181000);
  assert.equal(view('b','view=room').room.host,'b');
  assert.equal(view('a','view=room').room,null);
  act('a','join',{room});
  assert.equal(view('a','view=room').room.host,'b');
  act('a','leave',{room});
  clearPlayerMusic(e,'b');assert.equal(view('b','view=room').room,null);
  act('a','start',{list});tick(86400001);assert.equal(view('a','view=room').room,null);
});

test('Music HTTP route returns the signed-in player’s playlists and rejects guests',async()=>{
  const mf=await playRuntimeFixture({songCount:2});
  try{
    const url='http://game/api/music';
    assert.equal((await mf.dispatchFetch(url)).status,401);
    const {cookie}=await(await mf.dispatchFetch('http://game/api/__test-session?id=1')).json();
    const headers={Cookie:cookie,'Content-Type':'application/json','Idempotency-Key':'local-music-list'};
    const saved=await mf.dispatchFetch(url,{method:'POST',headers,body:JSON.stringify({op:'create-list',name:'Evening songs'})});
    assert.equal(saved.status,200);
    const {id}=await saved.json();
    const summary=await(await mf.dispatchFetch(url,{headers})).json();
    assert.deepEqual(summary.lists,[{id,name:'Evening songs',rev:1,count:0}]);
    assert.deepEqual(summary.invites,[]);
  }finally{await mf.dispose();}
});
test('party chat is private, incremental and independent of playback revision',()=>{
  const {act,view}=fixture();
  const list=act('a','create-list',{name:'Late set',track:1}).id;
  const room=act('a','start',{list}).id;
  const initial=view('a','view=room').room;
  assert.throws(()=>act('b','chat',{room,body:'hi'}),/Join the party/);
  act('a','chat',{room,body:'hello'},'again');act('a','chat',{room,body:'hello'},'again');
  const delta=view('a','view=room&rev='+initial.rev+'&chatRoom='+room+'&after=0');
  assert.equal(delta.room.queue,undefined);assert.deepEqual(delta.chat.map(m=>[m.name,m.body]),[['a','hello']]);
  assert.equal(view('a','view=room&chatRoom='+room+'&after=1').chat.length,0);
  assert.throws(()=>act('a','chat',{room,body:'x'.repeat(221)}));
  for(let i=0;i<85;i++)act('a','chat',{room,body:String(i)});
  assert.equal(view('a','view=room&chatRoom=').chat.length,80);
});


test('invite polls leave playlists out and detect invitations, joins and departures',()=>{
  const {act,e,view}=fixture();
  const list=act('a','create-list',{name:'Party',track:1}).id;
  act('b','create-list',{name:'Private mix',track:3});
  const room=act('a','start',{list}).id;
  e.friends.set('a',{player:'b',added:true});
  act('a','invite',{room,friend:'b'});
  const invites=view('b','view=invites');
  assert.equal(invites.lists,undefined);
  assert.equal(invites.invites[0].id,room);
  assert.equal(view('c','view=invites').invites.length,0);
  act('b','join',{room});
  assert.equal(view('b','view=invites').room,room);
  act('b','leave',{room});
  assert.equal(view('b','view=room').room,null);
  assert.equal(view('b').lists[0].name,'Private mix');
});

test('Jam polling pauses only idle hidden tabs and keeps joined sessions alive',()=>{
  assert.equal(jamPollDelay({joined:false,inJam:true,hidden:true}),0);
  assert.equal(jamPollDelay({joined:false,inJam:false}),0);
  assert.equal(jamPollDelay({joined:false,inJam:true}),30000);
  assert.equal(jamPollDelay({joined:true,chatOpen:true}),3500);
  assert.equal(jamPollDelay({joined:true,playing:true}),8000);
  assert.equal(jamPollDelay({joined:true,playing:true,hidden:true}),12000);
  assert.equal(jamPollDelay({joined:true}),15000);
  assert.equal(jamPollDelay({joined:true,hidden:true}),45000);
});
