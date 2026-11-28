import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {Engine} from '../src/engine.js';
import {songTypePools,drawSongType} from '../src/song-type-quiz.js';
import {yearQuizMove} from '../src/year-quiz.js';
import {yearDirectory} from '../public/quiz-year-ui.js';

test('decades from the 1960s onward remain available and empty earlier decades are hidden',()=>{
  const html=yearDirectory([{year:2025,id:'year-2025'}],1920);
  for(let decade=1960;decade<=Math.floor(new Date().getUTCFullYear()/10)*10;decade+=10)
    assert.ok(html.includes('data-year-decade="'+decade+'"'));
  assert.doesNotMatch(html,/data-year-decade="19[2-5]0"/);
  assert.match(html,/aria-pressed="true" data-year-decade="20\d0"/);
  assert.doesNotMatch(html,/data-quiz-open="year-1924"/);
});

test('global difficulty halves partition shared recordings before filtering by type',()=>{
  const groups=[[1,2],[3],[4],[5],[6],[7,8]];
  const songs={1:['OP',null,false,false,0],2:['ED',null,false,false,0],
    3:['IN',null,false,false,40],4:['ED',null,false,false,40],5:['ED',null,false,false,99],
    6:['ED',null,false,false,null],7:['IN',null,false,false,100],8:['IN',null,false,false,100]};
  const pools=songTypePools({groups,extras:new Map(),ngmcRows:[]},{songs});
  assert.deepEqual(pools.get('song-type-ed-hard').map(r=>r.group),[0,2]);
  assert.deepEqual(pools.get('song-type-ed-easy').map(r=>r.group),[3]);
  assert.deepEqual(pools.get('song-type-ed-all').map(r=>r.group),[0,2,3,4]);
  assert.deepEqual(pools.get('song-type-in-all').map(r=>r.group),[1,5]);
  const candidates=Array.from({length:150},(_,i)=>({group:i,shows:[i]}));
  assert.equal(new Set(drawSongType(candidates)).size,100);
  assert.deepEqual(drawSongType([{group:7,shows:[1]}]),[7]);
});

test('song type draws prefer distinct shows across shared IDs and titles and fill sparse pools',()=>{
  const candidates=Array.from({length:100},(_,i)=>({group:i,shows:[i,'anime '+i]}));
  const shared={group:100,shows:[1,'anime 0']};
  const pick=drawSongType([candidates[0],shared,...candidates.slice(1)],()=>0);
  assert.equal(new Set(pick).size,100);
  assert.ok(!pick.includes(100));
  assert.deepEqual(drawSongType([candidates[0],shared],()=>0),[0,100]);
});

test('song type attempts pay improvements once per variant and boards rank tied scores by time',async()=>{
  const db=new DatabaseSync(':memory:');
  const e=new Engine((sql,...args)=>db.prepare(sql).all(...args),fn=>{
    db.exec('BEGIN');try{const r=fn();db.exec('COMMIT');return r;}catch(err){db.exec('ROLLBACK');throw err;}
  });
  e.host('players',{players:[{id:'a',name:'Alpha'},{id:'b',name:'Beta'}]});
  let now=Date.now();e.now=()=>now;
  const songs=Array.from({length:100},(_,i)=>({title:'Track '+i,type:'ED',audio:'test'+i,answers:['Anime']}));
  async function complete(player,id,score,ms){
    const move=(path,body={},key=crypto.randomUUID())=>yearQuizMove(e,player,path,id,{quiz:id,...body},key,async()=>({songs}),()=>{});
    const start=await move('quiz-start');
    assert.equal(start.run.songCount,100);
    assert.deepEqual(start.run.audioWindow,songs.slice(0,6).map(s=>s.audio));
    let next;
    for(let index=0;index<100;index++){
      const ref={run:start.run.id,index};
      await move('quiz-ready',ref);now+=ms;
      const reveal=await move('quiz-answer',{...ref,answer:index<score?'Anime':'Other'});
      assert.equal(reveal.run.progressDetails,undefined);
      if(index===4){
        const resume=await move('quiz-run');
        assert.equal(resume.run.progressDetails.length,5);
        assert.deepEqual(resume.run.audioWindow,songs.slice(4,10).map(s=>s.audio));
      }
      const key=crypto.randomUUID();
      next=await move('quiz-next',ref,key);
      if(index===98)assert.deepEqual(next.run.audioWindow,[songs[99].audio]);
      if(index===99)assert.deepEqual(await move('quiz-next',ref,key),next);
    }
    return next.run.reward.total;
  }
  const id='song-type-ed-hard';
  assert.equal(await complete('a',id,80,3100),4000);
  assert.equal(await complete('a',id,100,3100),1000);
  assert.equal(await complete('a',id,100,2900),0);
  assert.equal(await complete('b',id,100,2500),5000);
  assert.deepEqual(e.quiz.leaderboard(id).rows.map(p=>p.id),['b','a']);
  assert.equal(e.quiz.leaderboard('song-type-ed-easy').total,0);
  assert.equal(await complete('a','song-type-ed-easy',1,3100),50);
  db.close();
});


for(const [id,count,credits] of [['year-2025',30,30],['song-type-ed-hard',100,50]]){
  test(id+' saves a stopped result once, recaps only played songs and can restart in Sudden Death',async()=>{
    const db=new DatabaseSync(':memory:');
    const e=new Engine((sql,...args)=>db.prepare(sql).all(...args),fn=>{
      db.exec('BEGIN');try{const r=fn();db.exec('COMMIT');return r;}catch(err){db.exec('ROLLBACK');throw err;}
    });
    e.host('players',{players:[{id:'a',name:'Alpha'}]});
    let now=Date.UTC(2026,10,29),draws=0;
    e.now=()=>now;
    const draw=()=>({songs:Array.from({length:count},(_,i)=>({title:'Song '+i,type:'ED',
      artist:'Singer',audio:'audio'+i,answers:['Anime '+i]}))});
    const move=(path,body={},key=crypto.randomUUID())=>yearQuizMove(e,'a',path,id,{quiz:id,...body},key,()=>{draws++;return draw();},()=>{});
    const balance=e.player('a').balance;
    const start=await move('quiz-start',{suddenDeath:true});
    assert.equal(start.run.suddenDeath,true);
    let ref={run:start.run.id,index:0};
    await move('quiz-ready',ref);now+=3000;
    await move('quiz-answer',{...ref,answer:'Anime 0'});
    await move('quiz-next',ref);ref.index++;await move('quiz-ready',ref);now+=500;
    const stopped=await move('quiz-stop',ref,'stop-on-second');
    assert.equal(stopped.run.score,1);
    assert.equal(stopped.run.stoppedEarly,true);
    assert.deepEqual(stopped.run.history.map(t=>[t.title,t.correct,t.skipped]),[['Song 0',true,false],['Song 1',false,true]]);
    assert.equal(stopped.me.balance,balance+credits);
    assert.deepEqual(await move('quiz-stop',ref,'stop-on-second'),stopped);
    assert.deepEqual((await move('quiz-run')).run,stopped.run);
    if(id.startsWith('song-type'))assert.equal(e.quiz.leaderboard(id).rows[0].durationMs,null);

    const next=await move('quiz-start',{suddenDeath:true});ref={run:next.run.id,index:0};
    const missed=await move('quiz-answer',{...ref,skip:true});
    assert.equal(missed.run.correct,false);
    const restart=await move('quiz-restart',{...ref,suddenDeath:true});
    assert.notEqual(restart.run.id,next.run.id);
    assert.equal(draws,3);
    ref={run:restart.run.id,index:0};
    assert.equal((await move('quiz-ready',ref)).run.startsAt,now);
    const ready=await move('quiz-start');
    assert.equal(ready.run.id,ref.run);
    await move('quiz-stop',ref);
    const fresh=await move('quiz-start');
    const freshRef={run:fresh.run.id,index:0};
    assert.ok((await move('quiz-ready',freshRef)).run.startsAt>now);
    const beforeAudio=await move('quiz-stop',freshRef);
    assert.deepEqual(beforeAudio.run.history,[]);
    assert.equal(beforeAudio.run.reward.best,1);
    assert.equal(beforeAudio.me.balance,balance+credits);
    if(id.startsWith('song-type')){
      const full=await move('quiz-start');
      for(let index=0;index<count;index++){
        ref={run:full.run.id,index};await move('quiz-ready',ref);now+=3000;
        await move('quiz-answer',{...ref,answer:index===0?'Anime 0':'miss'});
        await move('quiz-next',ref);
      }
      assert.ok(e.quiz.leaderboard(id).rows[0].durationMs>0);
      assert.equal(e.player('a').balance,balance+credits);
    }
    db.close();
  });
}
