import assert from 'node:assert/strict';
import test from 'node:test';
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
