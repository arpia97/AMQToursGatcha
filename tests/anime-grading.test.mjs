import assert from 'node:assert/strict';
import test from 'node:test';
import shipped from '../src/anime-grading-aliases.json' with {type:'json'};
import {buildGradingCatalog} from '../tools/build-anime-grading-aliases.mjs';
import {animeGradingKey,playAnimeGradingKey} from '../src/anime-grading.js';
import {playFieldMatches} from '../src/play-artists.js';
import {advanceQuizRun} from '../src/quiz-run-state.js';
import {ballotCatalogIndex,catalogAnswer} from '../src/play-lobby-votes.js';
import {animeAnswerKey,animeWordSeparators} from '../public/quiz-rules.js';

test('all shipped edition aliases grade together and no expanded key belongs to a different edition',async()=>{
  const {groups,editions,owners}=await buildGradingCatalog();
  // If a future catalog adds different works distinguished only by a word dash,
  // require a grading exception before shipping the refreshed catalog.
  const dashVariants=new Map();
  for(const [id,names] of editions)for(const name of names){
    const original=name.replaceAll(' ','');
    const key=animeWordSeparators(name).replaceAll(' ','');
    if(!dashVariants.has(key))dashVariants.set(key,new Map());
    const variants=dashVariants.get(key);
    if(!variants.has(original))variants.set(original,new Set());
    variants.get(original).add(id);
  }
  for(const [key,variants] of dashVariants){
    if(variants.size<2)continue;
    const [first,...rest]=variants.values();
    assert.ok([...first].some(id=>rest.every(ids=>ids.has(id))), 'Dash collision between editions: '+key);
  }
  assert.deepEqual(shipped,groups,'Regenerate the alias index when refreshing the catalogs');
  for(const compact of [false,true]){
    const seen=new Map();
    for(const [id,names] of editions)for(const name of names){
      const raw=animeAnswerKey(name,compact), graded=animeGradingKey(name,compact);
      if(owners.get(animeAnswerKey(name,true)).size>1){
        assert.equal(graded,raw,'Shared title '+name);
      }else{
        assert.equal(seen.get(graded)??id,id,'Cross-edition match for '+name);
        seen.set(graded,id);
      }
    }
  }
  for(const names of groups){
    const ballot=ballotCatalogIndex({anime:[names[0]]});
    for(const accepted of names)for(const typed of names){
      const run={id:'test',index:0,answers:[],songs:[{answers:[accepted]}],timing:{index:0,startsAt:1,endsAt:1000}};
      advanceQuizRun(run,'quiz-answer',{run:'test',index:0,answer:typed},100);
      assert.ok(run.answers[0].correct,accepted+' / '+typed);
      assert.ok(playFieldMatches({animeTitles:[accepted]},'anime',typed));
      assert.ok(catalogAnswer(ballot,'anime',typed));
    }
  }
});

test('an alternate edition and both of its language titles apply to the recording that accepts it',()=>{
  const main='Cowboy Bebop', alternate='Angel Links', translated='Seihou Tenshi Angel Links';
  for(const answers of [[main],[main,alternate]]){
    const run={id:'test',index:0,answers:[],songs:[{answers}],timing:{index:0,startsAt:1,endsAt:1000}};
    advanceQuizRun(run,'quiz-answer',{run:'test',index:0,answer:translated},100);
    assert.equal(run.answers[0].correct,answers.includes(alternate));
    assert.equal(playFieldMatches({animeTitles:answers},'anime',translated),answers.includes(alternate));
  }
  assert.notEqual(playAnimeGradingKey(main),playAnimeGradingKey(translated));
});
