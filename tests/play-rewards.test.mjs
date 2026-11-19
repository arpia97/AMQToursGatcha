import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {Engine} from '../src/engine.js';
import {arenaSchedule} from '../src/play-arena.js';
import {matchCreditPlan, awardMatchCredits} from '../src/play-rewards.js';

test('matchmaking settles each wallet and win bonus once, using final scores and Arena standings', () => {
  const db = new DatabaseSync(':memory:');
  try {
    const engine = new Engine((sql,...args) => db.prepare(sql).all(...args), action => {
      db.exec('BEGIN');
      try {
        const result = action();
        db.exec('COMMIT');
        return result;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    });
    engine.host('players',{players:['a','b','locked'].map(id => ({id,name:id}))});
    engine.run("UPDATE players SET account_locked=1 WHERE id='locked'");

    const players = [{id:'a',team:0},{id:'b',team:1},{id:'locked',team:0},{id:'missing',team:1}];
    const match = {phase:'finished',completed:true, teams:[2,1], players};
    const arena = arenaSchedule(2);
    Object.assign(arena.rounds[0][0],{scores:[2,1],complete:true});
    for (const [format, base] of [['1v1-ranked',100],['ngmc-ranked',400],['ngmc-3v3',200],
      ['2v2-arena',100],['1v1',100],['3v3',200],['1-team',200]]) {
      const current = {...match,format,...(format==='2v2-arena'?{arena}:{})};
      const settle = () => awardMatchCredits(engine, 'match-'+format, format, matchCreditPlan(current), format==='2v2-arena'?1:undefined);
      const bonus = format==='1-team'?0:base/10;
      const expected = [{id:'a',amount:base+bonus,bonus},{id:'b',amount:base,bonus:0}];
      assert.deepEqual(settle(),expected);
      assert.deepEqual(settle(),expected);
    }
    const arenaPlan = matchCreditPlan({...match,format:'2v2-arena',arena});
    const threeRounds = awardMatchCredits(engine, 'arena-three', '2v2-arena', arenaPlan, 3);
    assert.deepEqual(threeRounds.map(row=>[row.amount,row.bonus]),[[330,30],[300,0]]);
    // Older callers omitted the count. A retry still returns the original receipt.
    assert.deepEqual(awardMatchCredits(engine,'arena-three','2v2-arena',arenaPlan),threeRounds);
    assert.deepEqual(awardMatchCredits(engine,'arena-no-rounds','2v2-arena',arenaPlan,0),[]);
    const ledger = engine.all("SELECT player,delta,reward FROM ledger WHERE reason LIKE 'Play match:%'");
    assert.equal(ledger.length,16);
    assert.ok(ledger.every(row => row.reward===1));
    for (const id of ['a','b']) {
      const total = ledger.filter(row=>row.player===id).reduce((sum,row)=>sum+row.delta,0);
      assert.equal(engine.player(id).earned,total);
      assert.equal(engine.player(id).balance,total);
    }

    const tied = {...match,format:'3v3',teams:[2,2],players:[players[0],{...players[1],left:true}]};
    assert.deepEqual(matchCreditPlan(tied),[{id:'a',winner:false}]);
    assert.deepEqual(matchCreditPlan({...tied,players:[{...players[0],unansweredSongs:3}]}),[]);
    assert.deepEqual(matchCreditPlan({...tied,players:[{...players[0],disconnectedAt:123}]}),[]);
    assert.equal(matchCreditPlan({...tied,completed:false,reason:'Player left the match.'}),null);
    assert.equal(matchCreditPlan({...tied,phase:'cancelled'}),null);
    assert.equal(matchCreditPlan({...tied,lobby:{code:'custom'}}),null);
  } finally {
    db.close();
  }
});
