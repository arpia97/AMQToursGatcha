import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {QuizLibraryCore} from '../src/quiz-library.js';
import {PlayAnswerRegistry,registeredGroupAnswers} from '../src/play-answer-registry.js';
import {PlayLibrary} from '../src/play-library.js';

const exportRow=(overrides={})=>({
  songInfo:{songName:'Track',artist:'Band',annSongId:900,siteIds:{annId:45},
    animeNames:{romaji:'Original'},allAlternativeAnswers:['Registered alias']},...overrides,
});
const media='https://naedist.animemusicquiz.com/track-sample.mp3';

test('registered AMQ working titles persist, merge at quiz priority and leave other songs alone',async()=>{
  const sql=new DatabaseSync(':memory:');
  const db={
    all:(query,...args)=>sql.prepare(query).all(...args),
    one:(query,...args)=>sql.prepare(query).get(...args),
    run:(query,...args)=>sql.prepare(query).run(...args),
    tx:fn=>{sql.exec('BEGIN');try{fn();sql.exec('COMMIT');}catch(error){sql.exec('ROLLBACK');throw error;}},
  };
  try {
    const base={amqSongId:70,annSongId:900,annId:45,title:'Track',artist:'Band',type:'OP',audio:media,titles:['AMQ+ title']};
    const core=new QuizLibraryCore(db,{fetch:async req=>Response.json(req.url.endsWith('artist-names.json')?[]:{names:[],songs:{},rules:{}})});
    core.active=async()=>({version:'base',shards:[0]});
    core.shard=async()=>({900:base});
    core.lookup=async()=>({songs:[base]});
    const registry=new PlayAnswerRegistry(core);
    const sheet={version:'sheets',keys:{'n:900':0},records:[[1,'Sheet title']],recordings:[['Track','Band',45,'OP','track-sample.mp3']]};
    let quizRows=[];
    let quizVersion='before';
    const play=new PlayLibrary(core,undefined,prev=>prev===quizVersion?null:{version:quizVersion,rows:quizRows},()=>sheet,()=>registry.snapshot());
    play.verifiedSource=async url=>url;
    const titleList=async ()=>(await play.sample('song-artist',1)).songs[0].animeTitles;
    assert.deepEqual(await titleList(),['Sheet title']);
    const upload={songs:[exportRow(),null,{songInfo:{animeNames:{romaji:'Unusable'}}}]};
    assert.deepEqual(registry.register(upload),{updated:1,skipped:2,registered:1});
    const oldRevision=registry.snapshot().revision;
    assert.deepEqual(registry.register(upload),{updated:0,skipped:2,registered:1});
    assert.equal(new PlayAnswerRegistry(core).snapshot().revision,oldRevision);
    assert.throws(()=>registry.register({songs:[{}]}),/No usable/);
    assert.deepEqual(await titleList(),['Original','Registered alias']);
    assert.ok((await play.catalog()).anime.includes('Registered alias'));
    assert.equal((await play.inventory()).registeredMatches,1);
    quizVersion='after';
    quizRows=[{audio:media,answers:['Quiz preferred name','Quiz alias'],title:'Track',artist:'Band'}];
    await play.inventory(true);
    assert.deepEqual(await titleList(),['Quiz preferred name','Quiz alias','Original','Registered alias']);
    const other={registrationSources:[{...base,amqSongId:71,annSongId:901,audio:null}]};
    assert.equal(registeredGroupAnswers(registry.snapshot(),[other]).size,0);
    const conflicting={registrationSources:[{...base,amqSongId:71}]};
    assert.equal(registeredGroupAnswers(registry.snapshot(),[{registrationSources:[base]},conflicting]).size,0);
    const second=new PlayAnswerRegistry(core);
    assert.deepEqual([...second.snapshot().rows.values()],[['Original','Registered alias']]);
  }finally{sql.close();}
});
