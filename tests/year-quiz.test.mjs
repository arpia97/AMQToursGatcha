import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {Engine} from '../src/engine.js';
import {yearDirectory} from '../public/quiz-year-ui.js';
import {yearQuizMove} from '../src/year-quiz.js';
import {yearPools,drawYear,eligibleYear} from '../src/year-quiz-selection.js';

const types=['OP','ED','IN'];
function pool(make){
  return new Map(types.map((type,i)=>[type,new Map(Array.from({length:10},(_,j)=>make(i,j)))]));
}
test('a show with both a rare insert and an opening is preserved for the insert when necessary',()=>{
  const p=pool((t,i)=>[t*10+i,new Set([t*10+i])]);
  p.get('OP').set(20,new Set([20,31]));
  for(let i=0;i<10;i++){
    const songs=drawYear(p);
    assert.equal(songs.length,30);
    assert.equal(new Set(songs.map(s=>s.group)).size,30);
    assert.equal(new Set(songs.map(s=>s.anime)).size,30);
    for(const type of types)assert.equal(songs.filter(s=>s.type===type).length,10);
  }
});
test('sparse years can reuse shows but never recordings or another type to fill a quota',()=>{
  const p=pool((t,i)=>[i,new Set([t*10+i])]);
  assert.ok(eligibleYear(p));
  assert.equal(new Set(drawYear(p).map(s=>s.group)).size,30);
  p.set('IN',p.get('ED'));
  assert.equal(eligibleYear(p),false);
  assert.equal(drawYear(p),null);
});
test('year is the anime premiere year and the type belongs to its occurrence',()=>{
  const data={sources:['a'],ngmcRows:[{annId:1,annSongId:101,amqSongId:1,type:'OP1'},{annId:2,annSongId:102,amqSongId:1,type:'ED2'}]};
  const pools=yearPools(data,{anime:{1:['TV',2024*4+3],2:['TV',2025*4]},songs:{}});
  assert.ok(pools.get(2024).get('OP').get(1).has(0));
  assert.ok(pools.get(2025).get('ED').get(2).has(0));
});
test('Year Quiz grades alternatives and pays only score improvements and the first perfect score',async()=>{
  const db=new DatabaseSync(':memory:');
  const e=new Engine((sql,...args)=>db.prepare(sql).all(...args),fn=>{
    db.exec('BEGIN');try{const r=fn();db.exec('COMMIT');return r;}catch(err){db.exec('ROLLBACK');throw err;}
  });
  e.host('players',{players:[{id:'p',name:'Player'}]});
  let now=Date.UTC(2026,10,28);
  e.now=()=>now;
  const songs=Array.from({length:30},(_,i)=>({audio:'test'+i,type:types[i%3],answers:['Canon','Alt'],title:'Song',artist:'Artist'}));
  const id='year-2025';
  const call=(path,body={},key=crypto.randomUUID())=>yearQuizMove(e,'p',path,id,body,key,async()=>({songs}),()=>{});
  const get=()=>call('quiz-run');
  const startingBalance=e.player('p').balance;
  async function complete(score){
    const {run}=await call('quiz-start');
    assert.equal(run.types.length,30);
    assert.equal(run.answer,undefined);
    let final;
    for(let index=0;index<30;index++){
      const ref={run:run.id,index};
      await call('quiz-ready',ref);now+=4000;
      const correct=index<score;
      const reveal=await call('quiz-answer',{...ref,answer:correct?'Alt':'miss'});
      assert.equal(reveal.run.correct,correct);
      const key=crypto.randomUUID();
      final=await call('quiz-next',ref,key);
      if(index===19)assert.equal(final.run.finished,false);
      if(index===29)assert.deepEqual(await call('quiz-next',ref,key),final);
    }
    assert.equal(final.run.history.length,30);
    return final;
  }
  const first=await complete(15);
  assert.deepEqual(first.run.reward,{best:15,improvement:450,milestones:0,total:450});
  assert.equal(first.me.balance,startingBalance+450);
  assert.equal((await get()).run.score,15);
  const better=await complete(20);
  assert.equal(better.run.reward.total,150);
  const perfect=await complete(30);
  assert.deepEqual(perfect.run.reward,{best:30,improvement:300,milestones:100,total:400});
  assert.equal(perfect.me.balance,startingBalance+1000);
  assert.equal((await complete(30)).run.reward.total,0);
  assert.equal((await complete(12)).run.reward.best,30);
  assert.equal(e.player('p').balance,startingBalance+1000);
  assert.equal(e.one('SELECT count(*) AS n FROM quiz_progress').n,0);
  await assert.rejects(yearQuizMove(e,'p','quiz-start','year-2026',{},'x',async()=>({songs}),()=>{}),/completed year/);
});

test('2020s progress includes ten years, while only eligible years can open a quiz',()=>{
  const quiz=(year,best)=>({year,id:'year-'+year,played:best!==undefined,best:best??0});
  const quizzes=[quiz(2025,24),quiz(2024,30),quiz(2023),quiz(2022,18),quiz(2021),quiz(2020),quiz(2019,23)];
  const directory=yearDirectory(quizzes,2020);
  assert.match(directory,/<dt>Score<\/dt><dd>72 \/ 300<\/dd>/);
  assert.match(directory,/<b>24%<\/b>/);
  assert.match(directory,/<dd>3 \/ 10<\/dd>/);
  assert.equal((directory.match(/class="year-card"/g)||[]).length,10);
  for(const year of [2026,2027,2028,2029]){
    assert.ok(directory.includes('disabled aria-label="'+year+', inactive"'));
    assert.ok(!directory.includes('data-quiz-open="year-'+year+'"'));
  }
  assert.doesNotMatch(directory,/data-year-decade="19[2-5]0"/);
  assert.match(yearDirectory([quiz(1955),...quizzes],1950),/data-quiz-open="year-1955"/);
  const next=yearDirectory([quiz(2026),...quizzes],2020);
  assert.ok(next.includes('data-quiz-open="year-2026"'));
  assert.match(next,/<b>24%<\/b>/);
  assert.match(yearDirectory([quiz(2025)],2020),/<b>0%<\/b>/);
  assert.match(yearDirectory(quizzes,2010),/<b>77%<\/b>/);
});
