import {fail,text} from './engine.js';
import {cardInvestment} from '../public/card-values.js';

const HOUR=3600000, STEP=300000, OPEN=Number.MAX_SAFE_INTEGER;
const WORK_PER_FATIGUE=2*HOUR, REST_PER_FATIGUE=10*HOUR;
const ROLL_RANGE=720000, FULL_HIT_THRESHOLD=62500;
const FLOOR_CHANCE=FULL_HIT_THRESHOLD/ROLL_RANGE*.05;
const finds={Pending:8,D:8,C:12,B:17,A:25,S:36,SS:47,SSS:63,Ubers:79,AG:100};
const stages=['Tired','Sad','Miserable','Despaired','Agonized','Suicidal'];
const prizeFor=(rarity,level)=>Math.round(finds[rarity]*(1+.12*(level-1)));
export const fatigueCapacity=level=>24+6*(level-1);
function recover(e,debt,at,now=e.now()){
  // Escrow snapshots can predate the rebalance. Credit rest at each period's rate.
  const cutoff=Math.min(e.mineBalanceSince,now);
  return Math.max(0,debt-Math.max(0,cutoff-at)/(4*HOUR)-Math.max(0,now-Math.max(at,cutoff))/REST_PER_FATIGUE);
}
export function mineCondition(debt,level){
  const max=fatigueCapacity(level), fraction=Math.min(1,Math.max(0,debt/max));
  // A rested level-one card works two hours before showing its first fatigue badge.
  const status=fraction<1/24?'':stages[Math.min(5,Math.floor(fraction*5))];
  return {debt,capacity:max,status,efficiency:Math.round((100-95*fraction)*10)/10};
}
function stored(e,player,card,slot){
  const row=e.one('SELECT debt,at FROM mine_wear WHERE player=? AND card=? AND slot=?',player,card,slot);
  return row?recover(e,row.debt,row.at):0;
}
function store(e,player,card,slot,debt,at=e.now()){
  if(debt>0)e.run('INSERT OR REPLACE INTO mine_wear(player,card,slot,debt,at) VALUES(?,?,?,?,?)',player,card,slot,debt,at);
  else e.run('DELETE FROM mine_wear WHERE player=? AND card=? AND slot=?',player,card,slot);
}
const active=(e,player,card)=>e.one('SELECT * FROM mine_shifts WHERE player=? AND card=? AND ends=? AND retired=0',player,card,OPEN);
const debtAt=(row,now,workPerFatigue=WORK_PER_FATIGUE)=>Math.min(fatigueCapacity(row.level),row.debt+Math.max(0,Math.min(row.ends,now)-row.segment)/workPerFatigue);
// Tick cadence remains tied to the original assignment across enhancements.
function schedule(row,workPerFatigue=WORK_PER_FATIGUE){
  const anchor=row.start+Math.floor((row.segment-row.start)/STEP)*STEP;
  const ramp=Math.ceil((row.segment-anchor+(fatigueCapacity(row.level)-row.debt)*workPerFatigue)/STEP);
  return {anchor,ramp};
}
function drawRamp(e,row){
  const {anchor,ramp}=schedule(row), hits=[];
  for(let n=1;n<=ramp;n++){
    const debt=debtAt(row,anchor+(n-.5)*STEP);
    const efficiency=1-.95*debt/fatigueCapacity(row.level);
    if(e.rand(ROLL_RANGE)<Math.round(FULL_HIT_THRESHOLD*efficiency))hits.push(n);
  }
  return JSON.stringify(hits);
}
function gap(e,probability){
  return 1+Math.floor(Math.log1p(-(e.rand(10000000)+.5)/10000000)/Math.log1p(-probability));
}
function earned(e,row,now,{anchor,ramp}=schedule(row),floorChance=FLOOR_CHANCE){
  const tick=Math.floor((Math.min(now,row.ends)-anchor)/STEP);
  let hits=JSON.parse(row.hits).filter(n=>n<=tick).length;
  if(tick>ramp){
    const tail=row.tail?JSON.parse(row.tail):{next:ramp+gap(e,floorChance),hits:0};
    if(!row.tail||tail.next<=tick){
      while(tail.next<=tick){tail.hits++;tail.next+=gap(e,floorChance);}
      e.run('UPDATE mine_shifts SET tail=? WHERE player=? AND card=?',JSON.stringify(tail),row.player,row.card);
    }
    hits+=tail.hits;
  }
  return {hits,available:row.bank+(hits-row.claimed)*row.prize};
}
function startSegment(e,row,at,level,debt,bank,prize){
  Object.assign(row,{level,debt,segment:at,bank,prize});
  e.run('UPDATE mine_shifts SET segment=?,level=?,debt=?,bank=?,prize=?,hits=?,tail=NULL,claimed=0 WHERE player=? AND card=?',
    at,level,debt,bank,prize,drawRamp(e,row),row.player,row.card);
}
export function installMine(e){
  e.run(`CREATE TABLE IF NOT EXISTS mine_shifts(
    player TEXT NOT NULL,card TEXT NOT NULL,start INTEGER NOT NULL,ends INTEGER NOT NULL,
    level INTEGER NOT NULL,prize INTEGER NOT NULL,hits TEXT NOT NULL,claimed INTEGER NOT NULL DEFAULT 0,
    retired INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(player,card))`);
  e.run('CREATE TABLE IF NOT EXISTS mine_wear(player TEXT NOT NULL,card TEXT NOT NULL,slot INTEGER NOT NULL,debt REAL NOT NULL,at INTEGER NOT NULL,PRIMARY KEY(player,card,slot))');
  const cols=new Set(e.all('PRAGMA table_info(mine_shifts)').map(c=>c.name));
  if(!cols.has('segment'))e.tx(()=>{
    if(!cols.has('tail')){
      e.run('ALTER TABLE mine_shifts ADD COLUMN tail TEXT');
      e.run('UPDATE mine_shifts SET ends=? WHERE retired=0 AND ends=start+? AND EXISTS(SELECT 1 FROM inventory i WHERE i.player=mine_shifts.player AND i.card=mine_shifts.card)',OPEN,24*HOUR);
    }
    // Replace older second-resolution stop triggers; explicit transfers already timestamp the cutoff.
    e.run('DROP TRIGGER IF EXISTS mine_base_removed');
    e.run('DROP TRIGGER IF EXISTS mine_base_replaced');
    for(const col of ['segment INTEGER NOT NULL DEFAULT 0','debt REAL NOT NULL DEFAULT 0','bank INTEGER NOT NULL DEFAULT 0'])
      e.run('ALTER TABLE mine_shifts ADD COLUMN '+col);
    for(const row of e.all('SELECT * FROM mine_shifts')){
      const end=Math.min(row.ends,e.now()),debt=Math.min(fatigueCapacity(row.level),Math.max(0,end-row.start)/HOUR);
      if(row.retired){
        if(e.one('SELECT 1 FROM inventory WHERE player=? AND card=? AND acquired_at<=?',row.player,row.card,end))store(e,row.player,row.card,0,debt,end);
        continue;
      }
      const {available}=earned(e,row,end,{anchor:row.start,ramp:288},.005),rarity=e.catalogStore.card(row.card)?.rarity;
      startSegment(e,row,end,row.level,debt,available,prizeFor(rarity||'D',row.level));
    }
    e.run("INSERT OR IGNORE INTO settings(key,value) VALUES('mine-balance-v2',?)",e.now());
  });
  const balance=e.one("SELECT value FROM settings WHERE key='mine-balance-v2'");
  if(balance)e.mineBalanceSince=balance.value;
  else e.tx(()=>{
    const now=e.now();
    // Settle existing rolls at the previous rate, preserving unpaid credits and wear.
    for(const row of e.all('SELECT * FROM mine_shifts WHERE retired=0')){
      const at=Math.min(now,row.ends);
      const bank=earned(e,row,at,schedule(row,HOUR),1/288).available;
      startSegment(e,row,at,row.level,debtAt(row,at,HOUR),bank,row.prize);
    }
    e.run("INSERT INTO settings(key,value) VALUES('mine-balance-v2',?)",now);
    e.mineBalanceSince=now;
  });
  const stop="UPDATE mine_shifts SET ends=min(ends,max(start,CAST(unixepoch('subsec')*1000 AS INTEGER))) WHERE player=OLD.player AND card=OLD.card AND retired=0 AND ends="+OPEN+";";
  e.run('CREATE TRIGGER IF NOT EXISTS mine_base_removed AFTER DELETE ON inventory BEGIN '+stop+' END');
  e.run('CREATE TRIGGER IF NOT EXISTS mine_base_replaced AFTER UPDATE OF level ON inventory WHEN NEW.level<OLD.level BEGIN '+stop+' END');
  e.run('CREATE TRIGGER IF NOT EXISTS mine_inventory_removed AFTER DELETE ON inventory BEGIN DELETE FROM mine_wear WHERE player=OLD.player AND card=OLD.card; END');
  e.run('CREATE TRIGGER IF NOT EXISTS mine_spares_removed AFTER UPDATE OF copies ON inventory WHEN NEW.copies<OLD.copies BEGIN DELETE FROM mine_wear WHERE player=OLD.player AND card=OLD.card AND slot>=NEW.copies; END');
}
function slotsFor(e,player){return e.player(player).donator?5:3;}
export function mineView(e,player){
  e.assertAccountUnlocked(player);
  const now=e.now(),rows=e.all('SELECT * FROM mine_shifts WHERE player=? AND retired=0 ORDER BY start,card',player);
  const shifts=rows.map(row=>({card:row.card,start:row.start,level:row.level,working:row.ends===OPEN,prize:row.prize,
    available:earned(e,row,now).available,...mineCondition(debtAt(row,now),row.level)}));
  const resting=e.all('SELECT w.card,w.debt,w.at,i.level FROM mine_wear w JOIN inventory i ON i.player=w.player AND i.card=w.card WHERE w.player=? AND w.slot=0 AND w.at+w.debt*?>?',player,REST_PER_FATIGUE,now)
    .map(r=>{
      const debt=recover(e,r.debt,r.at,now);
      return {card:r.card,...mineCondition(debt,r.level),readyAt:now+debt*REST_PER_FATIGUE};
    }).filter(r=>r.debt>0);
  return {now,slots:slotsFor(e,player),shifts,resting};
}
// Collection tiles represent the enhanced base, not interchangeable spare copies.
export function addCollectionMineStatus(e,player,items){
  if(!items.length)return;
  const now=e.now(), visible=new Map(items.map(item=>[item.card,item]));
  const rows=e.all(`SELECT card,debt,segment,ends,level,NULL AS at FROM mine_shifts
    WHERE player=? AND retired=0 AND ends=?
    UNION ALL SELECT card,debt,NULL,NULL,NULL,at FROM mine_wear
    WHERE player=? AND slot=0 AND at+debt*?>?`,player,OPEN,player,REST_PER_FATIGUE,now);
  for(const row of rows){
    const item=visible.get(row.card);
    if(!item)continue;
    const working=row.at===null;
    const debt=working?debtAt(row,now):recover(e,row.debt,row.at,now);
    const status=mineCondition(debt,item.level).status;
    if(status)item.mineStatus=status;
  }
}
export function changeMine(e,player,b){
  e.assertAccountUnlocked(player);
  const card=text(b.card,100),now=e.now();
  const row=e.one('SELECT * FROM mine_shifts WHERE player=? AND card=?',player,card);
  if(b.op==='assign'){
    if(row&&!row.retired)fail('This card is already assigned or has a completed shift to collect.',409);
    if(e.one('SELECT count(*) AS n FROM mine_shifts WHERE player=? AND retired=0',player).n>=slotsFor(e,player))fail('Your mining slots are full.',409);
    const stock=e.one('SELECT level FROM inventory WHERE player=? AND card=? AND copies>0',player,card);
    const rarity=e.catalogStore.card(card)?.rarity;
    if(!stock||!Object.hasOwn(finds,rarity))fail('Choose an owned card from your collection.');
    const debt=stored(e,player,card,0),level=stock.level,prize=prizeFor(rarity,level),start=Math.max(now,(row?.start||0)+1);
    const hits=drawRamp(e,{start,segment:start,ends:OPEN,level,debt});
    e.run('INSERT OR REPLACE INTO mine_shifts(player,card,start,ends,level,prize,hits,segment,debt) VALUES(?,?,?,?,?,?,?,?,?)',player,card,start,OPEN,level,prize,hits,start,debt);
    store(e,player,card,0,0);
    return {message:'Card assigned to the mine.'};
  }
  if(!['collect','recall'].includes(b.op))fail('Unknown mining action.');
  if(!row||row.retired||b.start!==row.start)fail('This shift has already changed.',409);
  const {available,hits}=earned(e,row,now),recall=b.op==='recall'||row.ends!==OPEN;
  if(available)e.wallet(player,available,'Aoji Credit Mine',true);
  if(recall&&row.ends===OPEN)store(e,player,card,0,debtAt(row,now));
  e.run('UPDATE mine_shifts SET ends=?,claimed=?,bank=0,retired=? WHERE player=? AND card=?',recall?Math.min(now,row.ends):OPEN,hits,Number(recall),player,card);
  return {credits:available,message:recall?'Shift ended · '+available+' credits collected.':available+' credits collected.'};
}
// Inventory stacks consist of one enhanced base (slot zero) and ordinary spares.
// Sparse wear rows let fresh cards remain free of per-copy storage.
export function cardWear(e,player,card,variant,copies){
  if(variant==='extra')return stored(e,player,card,copies-1);
  const row=active(e,player,card);
  return row?debtAt(row,e.now()):stored(e,player,card,0);
}
function stopBase(e,player,card){
  e.run('UPDATE mine_shifts SET ends=max(start,?) WHERE player=? AND card=? AND ends=? AND retired=0',e.now(),player,card,OPEN);
}
export function takeMineBase(e,player,card,copies){
  stopBase(e,player,card);
  store(e,player,card,0,copies>1?stored(e,player,card,copies-1):0);
}
export function receiveMineCard(e,player,card,existing,level,wear){
  const incoming=wear?recover(e,wear.debt,wear.at):0;
  if(!existing){if(incoming)store(e,player,card,0,incoming);return;}
  // The lower-level base becomes its invested number of plain spare copies.
  const replaces=level>existing.level;
  const displaced=replaces?cardWear(e,player,card,'card',existing.copies):incoming;
  if(replaces){
    takeMineBase(e,player,card,1);
    store(e,player,card,0,incoming);
  }
  if(displaced){
    const count=cardInvestment(replaces?existing.level:level);
    for(let i=0;i<count;i++)store(e,player,card,existing.copies+i,displaced/count);
  }
}
export function enhanceMineCard(e,player,card,item,cost){
  const row=active(e,player,card);
  const spares=e.all('SELECT debt,at FROM mine_wear WHERE player=? AND card=? AND slot>=? AND slot<?',player,card,item.copies-cost,item.copies);
  const debt=Math.min(fatigueCapacity(item.level+1),cardWear(e,player,card,'card',item.copies)+spares.reduce((sum,s)=>sum+recover(e,s.debt,s.at),0));
  if(row){
    const level=item.level+1,prize=prizeFor(e.catalogStore.card(card).rarity,level);
    startSegment(e,row,e.now(),level,debt,earned(e,row,e.now()).available,prize);
  }else if(debt)store(e,player,card,0,debt);
}
