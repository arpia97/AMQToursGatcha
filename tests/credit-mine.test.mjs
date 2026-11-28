import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {Engine} from '../src/engine.js';
import {changeMine,mineView,mineCondition,cardWear,installMine,receiveMineCard} from '../src/credit-mine.js';

const hour=3600000;
function fixture(startTime=Date.now()){
  const db=new DatabaseSync(':memory:');let now=startTime,roll=0;
  const e=new Engine((sql,...args)=>db.prepare(sql).all(...args),fn=>{
    db.exec('BEGIN');try{const result=fn();db.exec('COMMIT');return result;}catch(err){db.exec('ROLLBACK');throw err;}
  },()=>now,()=>roll);
  e.host('players',{players:[{id:'a',name:'Alice'},{id:'b',name:'Bee'}]});
  const cards=Array.from({length:6},(_,i)=>({id:'community-mine'+i,name:'Miner '+i,kind:'character',fixedRarity:'AG'}));
  e.host('catalog',{cards});
  for(const c of cards)e.addCard('a',c.id);
  const act=(op,i,extra={},key=crypto.randomUUID())=>{
    const b={op,card:cards[i].id,...extra};return e.mutate('a:mine',key,b,()=>changeMine(e,'a',b));
  };
  return {act,e,advance:ms=>now+=ms,view:()=>mineView(e,'a'),setRoll:n=>roll=n};
}
test('only owned cards fill slots; active Donators have two more slots',()=>{
  const {e,act,view,advance}=fixture();
  for(let i=0;i<3;i++)act('assign',i);
  assert.throws(()=>act('assign',3),/full/);
  assert.throws(()=>act('assign',0),/assigned/);
  assert.throws(()=>changeMine(e,'b',{op:'assign',card:'community-mine0'}),/owned/);
  e.run("UPDATE players SET donator_until=? WHERE id='a'",e.now()+hour);
  assert.equal(view().slots,5);
  act('assign',3);act('assign',4);assert.throws(()=>act('assign',5),/full/);
  advance(hour);assert.equal(view().slots,3);assert.throws(()=>act('assign',5),/full/);
});
test('working fatigue increases continuously, resting takes five times as long as working and claim frequency does not affect finds',()=>{
  const {e,act,advance,view}=fixture();act('assign',0);
  const read=()=>view().shifts[0],start=read().start;
  assert.equal(read().efficiency,100);
  advance(hour/2);assert.equal(read().efficiency,99);
  assert.equal(act('collect',0,{start},'first').credits,600);
  assert.equal(act('collect',0,{start},'first').credits,600);
  assert.equal(act('collect',0,{start}).credits,0);
  advance(23.5*hour);assert.equal(read().efficiency,52.5);
  advance(24*hour);assert.equal(read().status,'Suicidal');assert.equal(read().efficiency,5);
  advance(2*hour);assert.equal(read().working,true);
  assert.equal(act('recall',0,{start}).credits,(50*12-6)*100);
  advance(40*hour);assert.equal(view().resting[0].debt,20);
  assert.equal(view().resting[0].readyAt,e.now()+200*hour);
  act('assign',0);assert.equal(read().debt,20);
  assert.throws(()=>act('collect',0,{start}),/changed/);
  act('recall',0,{start:read().start});advance(200*hour);assert.equal(view().resting.length,0);
  act('assign',0);assert.equal(read().efficiency,100);
});
test('a 27-minute unattended shift keeps its original rolls and fatigue across a worker restart',()=>{
  const {e,act,advance,view,setRoll}=fixture();
  setRoll(0);act('assign',0);
  setRoll(719999);act('assign',1);
  advance(27*60000);
  const before=view().shifts;
  assert.deepEqual(before.map(s=>s.available),[500,0]);
  assert.ok(before.every(s=>s.efficiency<100));
  installMine(e);
  assert.deepEqual(view().shifts,before);
  act('collect',0,{start:before[0].start});
  assert.equal(view().shifts[0].available,0);
  assert.equal(view().shifts[0].efficiency,before[0].efficiency);
});
test('legacy shifts retire their Tired badge while working and resting, retaining fatigue',()=>{
  const {act,advance,view}=fixture(Date.parse('2026-11-28T18:00:00Z'));
  act('assign',0);advance(3*hour);
  const shift=view().shifts[0];
  assert.equal(shift.status,'');assert.ok(shift.efficiency<100);
  act('recall',0,{start:shift.start});
  assert.equal(view().resting[0].status,'');
  act('assign',0);assert.equal(view().shifts[0].status,'Tired');
});
test('full-efficiency AG averages 2500 per day, with a 1906.25 first-day mean and 125 at the floor',()=>{
  const {act,view,setRoll,e}=fixture();
  // Roll at the boundaries of the actual first and 288th five-minute checks.
  for(const [card,roll,expectedHits] of [[0,62447,1],[1,62448,0],[2,32863,288]]){
    setRoll(roll);act('assign',card);
    const hits=JSON.parse(e.one('SELECT hits FROM mine_shifts WHERE card=?','community-mine'+card).hits);
    assert.equal(hits.filter(t=>t<=288).length,expectedHits);
  }
  const reward=view().shifts[0].prize;
  assert.equal(reward*288*62500/720000,2500);
  const firstDay=Array.from({length:288},(_,i)=>reward*62500/720000*(1-.95*(i+.5)/576));
  assert.ok(Math.abs(firstDay.reduce((sum,n)=>sum+n,0)-1906.25)<1e-8);
  assert.equal(reward*288*62500/720000*.05,125);
  assert.deepEqual([0,1,5,10,15,20,24].map(f=>mineCondition(f,1).status),
    ['','Tired','Sad','Miserable','Despaired','Agonized','Suicidal']);
  assert.equal(mineCondition(1,2).status,'');
  assert.equal(mineCondition(1.25,2).status,'Tired');
});
test('enhancing an assigned base keeps debt, original tick cadence and credits already earned',()=>{
  const {e,act,advance,view}=fixture(),card='community-mine0';
  e.addCard('a',card);act('assign',0);const {start}=view().shifts[0];advance(6*hour+120000);
  const prior=view().shifts[0];
  e.action('a','enhance',{card,expectedLevel:1,enhancementRevision:3});
  const next=view().shifts[0];assert.equal(next.level,2);assert.equal(next.debt,prior.debt);assert.equal(next.capacity,30);
  assert.ok(next.efficiency>prior.efficiency);assert.equal(next.available,prior.available);assert.equal(next.start,start);
  advance(180000);assert.equal(act('collect',0,{start}).credits,prior.available+112);
});
test('a marketplace sale transfers a worn base, its fresh spare stays behind, and escrow recovers slowly',()=>{
  const {e,act,advance,view}=fixture(),card='community-mine0';
  e.addCard('a',card);act('assign',0);advance(12*hour);const {start}=view().shifts[0];
  e.action('a','list-card',{card,variant:'card',venue:'shop',price:1});advance(4*hour);
  e.wallet('b',5,'Fixture');e.action('b','buy-listing',{listing:e.one('SELECT id FROM market_listings').id});
  assert.equal(cardWear(e,'b',card,'card',1),5.6);assert.equal(cardWear(e,'a',card,'card',1),0);
  assert.equal(act('collect',0,{start}).credits,14400);
  assert.equal(cardWear(e,'a',card,'card',1),0);
  changeMine(e,'b',{card,op:'assign'});assert.equal(mineView(e,'b').shifts[0].debt,5.6);
});
test('auction cancellation and trade settlement keep wear on the exact spare consumed in an upgrade',()=>{
  const {e,act,advance}=fixture(),card='community-mine0',other='community-mine1';
  e.addCard('b',card);act('assign',0);advance(8*hour);act('recall',0,{start:mineView(e,'a').shifts[0].start});
  e.action('a','list-card',{card,variant:'card',venue:'auction',price:10});
  advance(4*hour);e.action('a','cancel-listing',{listing:e.one('SELECT id FROM auctions WHERE seller=?','a').id,venue:'auction'});
  assert.equal(cardWear(e,'a',card,'card',1),3.6);
  const {listing}=e.action('a','trade-list',{card,variant:'card',expectedLevel:1});
  e.addCard('b',other);e.action('b','trade-offer',{listing,card:other,variant:'card',expectedLevel:1});
  e.action('a','trade-accept',{offer:e.one('SELECT id FROM trade_offers WHERE listing=?',listing).id});
  assert.equal(cardWear(e,'b',card,'card',2),0);assert.equal(cardWear(e,'b',card,'extra',2),3.6);
  e.action('b','enhance',{card,expectedLevel:1,enhancementRevision:3});
  assert.equal(cardWear(e,'b',card,'card',1),3.6);
});
test('a paid auction transfers fatigue to the bidder and lets the seller collect earned credits exactly once',()=>{
  const {e,act,advance,view}=fixture(),card='community-mine0';
  act('assign',0);advance(4*hour);const {start}=view().shifts[0];
  e.action('a','list-card',{card,variant:'card',venue:'auction',price:1,hours:1});
  const auction=e.one('SELECT id FROM auctions WHERE seller=?','a').id;
  e.wallet('b',20,'Fixture');e.action('b','bid',{auction,amount:10});advance(4*hour);
  e.economy.tick();e.action('b','claim',{auction});
  assert.equal(cardWear(e,'b',card,'card',1),1.6);
  assert.equal(act('collect',0,{start},'settled').credits,4800);
  assert.equal(act('collect',0,{start},'settled').credits,4800);
  assert.equal(e.one("SELECT count(*) AS n FROM ledger WHERE player='a' AND reason='Aoji Credit Mine'").n,1);
});
test('a higher-level acquisition preserves the former working base as worn spares and keeps fresh copies separate',()=>{
  const {act,e,advance}=fixture(),card='community-mine0';
  e.run("UPDATE inventory SET level=2 WHERE player='a' AND card=?",card);
  act('assign',0);advance(12*hour);e.economy.acquire('a',card,3);
  assert.equal(cardWear(e,'a',card,'card',3),0);
  assert.equal(cardWear(e,'a',card,'extra',3),3);
  e.economy.take('a',card,'extra');assert.equal(cardWear(e,'a',card,'extra',2),3);
  e.economy.take('a',card,'card');assert.equal(cardWear(e,'a',card,'card',1),3);
});

test('an old assignment keeps its earned credits and carries hours already worked into the new curve',()=>{
  const {e,act,advance,view}=fixture(),card='community-mine0',start=e.now();
  e.run('DROP TABLE mine_shifts');
  e.run('CREATE TABLE mine_shifts(player TEXT,card TEXT,start INTEGER,ends INTEGER,level INTEGER,prize INTEGER,hits TEXT,claimed INTEGER,retired INTEGER,tail TEXT,PRIMARY KEY(player,card))');
  e.run('INSERT INTO mine_shifts VALUES(?,?,?,?,?,?,?,?,?,?)','a',card,start,Number.MAX_SAFE_INTEGER,1,152,'[1,2,3,4,5,100]',2,0,null);
  advance(4*hour);installMine(e);
  const mine=view().shifts[0];assert.equal(mine.debt,4);assert.equal(mine.available,456);assert.equal(mine.prize,100);
  assert.equal(act('collect',0,{start}).credits,456);installMine(e);assert.equal(act('collect',0,{start}).credits,0);
});

test('rebalance banks old finds once and honors pre-change rest in inventory and escrow',()=>{
  const {e,act,view,advance}=fixture(),start=e.now(),card='community-mine0';
  act('assign',0);act('assign',1);advance(8*hour);
  act('recall',1,{start});
  e.run("UPDATE mine_wear SET debt=8 WHERE card='community-mine1'");
  e.run("UPDATE mine_shifts SET hits='[1,2,3]',claimed=1,bank=25 WHERE card=?",card);
  advance(4*hour);
  e.run("DELETE FROM settings WHERE key='mine-balance-v2'");installMine(e);
  assert.equal(view().shifts[0].debt,12);assert.equal(view().shifts[0].available,225);
  assert.equal(view().resting[0].debt,7);
  advance(10*hour);installMine(e);
  assert.equal(view().shifts[0].debt,17);assert.equal(view().resting[0].debt,6);
  assert.equal(act('collect',0,{start}).credits,225+120*100);
  assert.equal(act('collect',0,{start}).credits,0);
  receiveMineCard(e,'b',card,null,1,{debt:8,at:start+8*hour});
  assert.equal(cardWear(e,'b',card,'card',1),6);
});

test('collection badges follow the working base, its recovery, and the new owner after a sale',()=>{
  const {e,act,advance,view}=fixture(),card='community-mine0';
  const status=player=>{
    const own=e.state(player,{includeRanks:false}).inventory.find(row=>row.card===card)?.mineStatus;
    const profile=e.economy.wishlist.page(player,'collection',1,{viewer:player}).rows.find(row=>row.card===card);
    assert.equal(profile?.mineStatus,own);
    return own;
  };
  assert.equal(status('a'),undefined);
  act('assign',0);
  assert.equal(status('a'),undefined);
  assert.equal(view().shifts[0].status,'');
  advance(2*hour-1);
  assert.equal(status('a'),undefined);
  advance(1);
  assert.equal(status('a'),'Tired');
  advance(28*hour);
  assert.equal(status('a'),view().shifts[0].status);
  act('recall',0,{start:view().shifts[0].start});
  assert.equal(status('a'),'Despaired');
  advance(40*hour);
  assert.equal(status('a'),'Miserable');
  e.addCard('a',card);
  e.action('a','list-card',{card,variant:'card',venue:'shop',price:1});
  e.wallet('b',5,'Fixture');
  e.action('b','buy-listing',{listing:e.one('SELECT id FROM market_listings').id});
  assert.equal(status('a'),undefined);
  assert.equal(status('b'),'Miserable');
  advance(105*hour);
  assert.equal(status('b'),undefined);
  assert.ok(cardWear(e,'b',card,'card',1)>0);
  advance(5*hour);
  assert.equal(status('b'),undefined);
});
