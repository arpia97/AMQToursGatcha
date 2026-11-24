import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {tourRecord,playRecord} from '../src/game-record-format.js';
import {storeGame} from '../src/game-record-sync.js';
import {songBroadcastLayout} from '../public/play-round-ui.js';
import {DUEL_FORMAT,ONE_TEAM_FORMAT} from '../public/play-mode-rules.js';
import {ARENA_FORMAT} from '../public/play-arena-config.js';

test('tour restarts link actual participants and tier order to each segment and keep tour ratings scoped',async()=>{
  const tour={id:'t',revision:1,name:'Cup',format:'4v4',mode:'watched',teams:[{id:'a',players:['1']},{id:'b',players:['2']}],
    signupPlayers:[{id:'1',name:'Initial',elo:99},{id:'3',name:'Sub',elo:89}]};
  const match={id:'m',a:'a',b:'b'}, report={id:'r',files:[
    {rosters:{a:['1'],b:['2']},events:[{number:1,correct:['1'],incorrect:['2']}]},
    {rosters:{a:['3'],b:['2']},events:[{number:1,correct:['3'],incorrect:['2']}]}]};
  const record=tourRecord(tour,match,report,[{player:'3',before:89,after:91}]);
  assert.deepEqual(record.songs.map(s=>s.results[0].playerId),['1','3']);
  assert.equal(record.players.find(p=>p.id==='3').ratingAfter,91);
  const sql=new DatabaseSync(':memory:');
  sql.exec(readFileSync(new URL('../game-records.sql',import.meta.url),'utf8'));
  const db={prepare:text=>({bind:(...args)=>()=>sql.prepare(text).run(...args)}),batch:ops=>{sql.exec('BEGIN');try{ops.forEach(fn=>fn());sql.exec('COMMIT');}catch(e){sql.exec('ROLLBACK');throw e;}}};
  await storeGame(db,record,1);await storeGame(db,record,1);
  await storeGame(db,{...record,songs:record.songs.slice(0,1)},2);await storeGame(db,record,1);
  assert.equal(sql.prepare('select count(*) as n from game_songs').get().n,1);
  assert.equal(sql.prepare('select count(*) as n from game_players').get().n,3);
  assert.deepEqual(record.songs[1].teams.a,['3']);sql.close();
});
test('Multiplayer records export only stat fields and preserve unknown rating history',()=>{
  const p=playRecord({id:'m',format:'1v1',players:[{id:'27',name:'Alice',team:0}],decoy:'private'},
    {teams:[1],players:[{id:'27',score:1}]},[{index:0,anime:'Title',results:[{id:'27',correct:{anime:true},answers:{anime:'private'}}]}],[]);
  assert.equal(p.players[0].ratingAfter,null);assert.equal(p.teams[0].players[0],'27');
  assert.ok(!JSON.stringify(p).includes('private'));

});
test('download notices and recovery actions follow the board for all shared match layouts',()=>{
  for(const mode of [DUEL_FORMAT,ARENA_FORMAT,'song-artist',ONE_TEAM_FORMAT]){
    const html=songBroadcastLayout({mode,format:mode,teams:[0,0],total:20,index:0},{answerForm:'<form></form>',resumeAudio:'<button>Resume</button>'});
    assert.ok(html.indexOf('song-broadcast-header')<html.indexOf('sa-ready-wrap'));
    assert.ok(html.indexOf('</form>')<html.indexOf('sa-download-status'));
    assert.ok(html.indexOf('sa-scoreboard')<html.indexOf('sa-match-audio-footer'));
  }
});
