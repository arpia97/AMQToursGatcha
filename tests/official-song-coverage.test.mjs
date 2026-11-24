import assert from 'node:assert/strict';
import test from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {OfficialReferenceStore} from '../src/official-reference-store.js';
import {QuizLibraryCore} from '../src/quiz-library.js';
import {compareAmqPlus,compareLocalSources} from '../src/official-song-coverage.js';

test('coverage counts unique recordings and separates quiz coverage and upload eligibility',async()=>{
  const ref={version:'example',ids:[1,2,-3,4,5,-6,7],ann:{44:4},exact:{},loose:{'22\tending\tduo':2}};
  const plus=[[0,[{amqSongId:1},{amqSongId:99,annSongId:100},{amqSongId:99,annSongId:101},
    {amqSongId:88,annSongId:0},{amqSongId:88,annSongId:44}]]];
  const master={recordings:[['Ending!','Duo',22],['Other','Duo',23]],keys:{'a:3':1}};
  const quiz={rows:[{sourceIds:{amqSongIds:['2','5'],annSongIds:[]}}, // Ambiguous; cannot credit both.
    {sourceIds:{amqSongIds:['2']}},{sourceIds:{amqSongIds:['5']}},{sourceIds:{amqSongIds:['5']}}]};
  const counts=compareLocalSources(ref,await compareAmqPlus(ref,plus),master,quiz);
  assert.deepEqual(counts,{officialVersion:'example',missing:5,sheets:2,remaining:2,eligible:1,plusOnly:1});
});

test('host refresh publishes the new reference once and retains it after failed or conditional requests',async()=>{
  const sql=new DatabaseSync(':memory:');
  const db={
    run:(query,...args)=>sql.prepare(query).run(...args),
    all:(query,...args)=>sql.prepare(query).all(...args),
    one:(query,...args)=>sql.prepare(query).get(...args),
    tx:action=>{sql.exec('BEGIN');try{action();sql.exec('COMMIT');}catch(error){sql.exec('ROLLBACK');throw error;}},
  };
  const store=new OfficialReferenceStore(new QuizLibraryCore(db,null));
  const source={masterListId:'20990101000000-1',songMap:{1:{name:'Track',songArtistId:1}},artistMap:{1:{name:'Artist'}},groupMap:{},
    animeMap:{1:{annId:2,songLinks:{OP:[{songId:1,annSongId:10,uploaded:true}]}}}};
  let downloads=0;
  const get=async()=>{downloads++;return Response.json(source,{headers:{etag:'"export-1"'}});};
  const [first,second]=await Promise.all([store.refresh(get),store.refresh(get)]);
  assert.deepEqual(first,second);
  assert.equal(first.changed,true);
  assert.equal(downloads,1);
  const saved=store.status(),snapshot=store.snapshot(saved.revision);
  assert.deepEqual(JSON.parse(snapshot).ids,[1]);
  const checked=await store.refresh(async(_,options)=>{
    assert.equal(options.headers['If-None-Match'],'"export-1"');
    return new Response(null,{status:304});
  });
  assert.equal(checked.changed,false);
  await assert.rejects(store.refresh(async()=>Response.json({...source,animeMap:{}})),/incomplete/);
  assert.equal(store.status().revision,saved.revision);
  assert.equal(store.snapshot(saved.revision),snapshot);
  sql.close();
});
