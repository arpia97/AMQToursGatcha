import test from 'node:test';
import assert from 'node:assert/strict';
import {indexQuizRecordings} from '../src/master-song-answers.js';
import {playSongInventory} from '../src/play-song-inventory.js';

test('song inventory deduplicates source recordings and credits overlapping additions to Quiz',()=>{
  const sheet={
    records:[[0,'A'],[0,'B'],[0,'C']],
    keys:{'a:1':0,'f:sheet-only.mp3':1,'f:shared.mp3':2},
    recordings:[['A','Artist',1,'OP','base.mp3'],['B','Artist',2,'OP','sheet-only.mp3'],['C','Artist',3,'OP','shared.mp3']],
  };
  const quizzes=indexQuizRecordings([
    {audio:'shared.mp3',answers:['C']},
    {audio:'https://eudist.animemusicquiz.com/shared.mp3',answers:['C','Alt C']},
    {audio:'quiz.mp3',answers:['D']},
    {audio:'base.mp3',answers:['A']},
  ]);
  const inventory=playSongInventory(sheet,quizzes);
  inventory.addAmqPlus({amqSongId:1,annSongId:10},0,3);
  inventory.addAmqPlus({amqSongId:1,annSongId:11},0,3);
  inventory.addAmqPlus({annSongId:20},undefined,undefined);
  assert.deepEqual(inventory.counts(),{sourceOrder:'quiz-sheets-amq-plus',total:5,sheets:3,quiz:3,amqPlus:2,quizAdded:3,sheetsAdded:1,amqPlusAdded:1});
});

test('a recording linked from AMQ+ through another source belongs to the same combined song',()=>{
  const sheet={records:[[0,'A']],keys:{'a:1':0}};
  const quizzes=indexQuizRecordings([{audio:'a.mp3',answers:['A']}]);
  const inventory=playSongInventory(sheet,quizzes);
  inventory.addAmqPlus({amqSongId:1},0,undefined);
  inventory.addAmqPlus({amqSongId:2},0,0);
  assert.deepEqual(inventory.counts(),{sourceOrder:'quiz-sheets-amq-plus',total:1,sheets:1,quiz:1,amqPlus:2,quizAdded:1,sheetsAdded:0,amqPlusAdded:0});
});
