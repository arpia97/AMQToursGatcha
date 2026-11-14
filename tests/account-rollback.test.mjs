import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { Engine } from "../src/engine.js";
import { BOP_ROLLBACK_ID, inspectAccountRollback, applyAccountRollback } from "../src/account-rollback.js";
import { TARGETED_RECOVERY_ID, TARGETED_RECOVERY_DIGEST, inspectTargetedRecovery, applyTargetedRecovery } from "../src/targeted-recovery.js";

function fixture(t) {
  const db = new DatabaseSync(":memory:");
  t.after(() => db.close());
  const e = new Engine((s,...a) => db.prepare(s).all(...a).map(r=>({...r})), fn => {
    db.exec("BEGIN");
    try { const r=fn(); db.exec("COMMIT"); return r; }
    catch (error) { db.exec("ROLLBACK"); throw error; }
  }, () => 1794465000000);
  e.host("players", { players:["16","124","47"].map(id=>({id,name:id})) });
  e.run("UPDATE players SET balance=125,earned=5300,access_reset=1,invite='discarded-hash' WHERE id='16'");
  e.run("UPDATE players SET balance=777,earned=9000 WHERE id<>'16'");
  const inv=(player,card,copies=1,level=1,protectedCard=0)=>e.run(
    "INSERT INTO inventory(player,card,copies,level,acquired_at,protected) VALUES(?,?,?,?,10,?)",
    player,card,copies,level,protectedCard);
  inv("16","own"); inv("124","kaguya",1,1,1); inv("124","takina",1,3,1);
  inv("47","returned-original"); inv("47","material-a"); inv("47","material-b");
  inv("47","material-c");
  const specs=[
    [1,"124","rei",["kaguya"]], [2,"124","sylphiette",["takina"]],
    [3,"47","returned-original",["material-a"]],
    [4,"47","voice-a",["returned-original","material-b"]],
    [5,"47","voice-b",["material-c"]],
  ];
  for(const [id,seller,card,materials] of specs) {
    e.run("INSERT INTO trade_listings(id,seller,card,level,status,accepted_offer,created_at,updated_at) VALUES(?,?,?,1,'completed',?,1,2)",id,seller,card,id);
    e.run("INSERT INTO trade_offers(id,listing,proposer,card,level,status,created_at,updated_at) VALUES(?,?,'16',?,1,'accepted',1,2)",id,id,materials[0]);
    materials.forEach((c,i)=>e.run("INSERT INTO trade_offer_cards(offer,position,card,level) VALUES(?,?,?,1)",id,i,c));
  }
  e.run("INSERT INTO receipts VALUES('16:pack','old','{}','{}',1)");
  e.run("INSERT INTO special_packs VALUES('16',1,'[]',0)");
  e.run("INSERT INTO profile_showcase(player,card,position) VALUES('124','kaguya',0)");
  e.run("UPDATE players SET avatar_card='kaguya' WHERE id='124'");
  const keys=[...new Set(specs.flatMap(([,p,c,m])=>[c,...m].map(c=>p+':'+c)))].sort((a,b)=>a.localeCompare(b));
  const plan={repairId:BOP_ROLLBACK_ID,player:"16",confirmation:"REVERT BOP ACCOUNT 16",
    expectedBalance:125,expectedEarned:5300,
    receipts:e.all("SELECT scope,key,at FROM receipts ORDER BY scope,key"),
    ownInventory:e.all("SELECT * FROM inventory WHERE player='16' ORDER BY card"),
    trades:specs.map(([listing])=>({listing,offer:listing,at:2})),
    inventory:keys.map(k=>{const [player,card]=k.split(':');return {player,card,before:e.one("SELECT * FROM inventory WHERE player=? AND card=?",player,card)||null};}),
  };
  const apply=()=>e.mutate("host:account-rollback",BOP_ROLLBACK_ID,plan,()=>applyAccountRollback(e,plan,"digest","bookmark"));
  return {e,db,plan,apply};
}

test("scoped rollback reverses all trades once, preserves investment and unrelated wallets, and revokes access without granting another bonus",t=>{
  const {e,plan,apply}=fixture(t);
  const before=e.all("SELECT * FROM inventory ORDER BY player,card");
  const netZero=e.one("SELECT * FROM inventory WHERE player='47' AND card='returned-original'");
  assert.equal(inspectAccountRollback(e,plan).trades.length,5);
  assert.deepEqual(e.all("SELECT * FROM inventory ORDER BY player,card"),before);
  const result=apply(); assert.deepEqual(apply(),result);
  assert.equal(result.tradesReversed,5);
  assert.deepEqual(e.one("SELECT copies,level,protected FROM inventory WHERE player='124' AND card='takina'"),{copies:2,level:2,protected:1});
  assert.equal(e.one("SELECT count(*) n FROM inventory WHERE player='124' AND card IN ('rei','sylphiette')").n,2);
  assert.equal(e.one("SELECT count(*) n FROM inventory WHERE card IN ('kaguya','material-a','material-b','material-c')").n,0);
  assert.deepEqual(e.one("SELECT * FROM inventory WHERE player='47' AND card='returned-original'"),netZero);
  assert.equal(e.one("SELECT count(*) n FROM inventory WHERE player='47' AND card IN ('voice-a','voice-b')").n,2);
  assert.deepEqual(e.one("SELECT balance,earned,password,invite,access_reset FROM players WHERE id='16'"),{balance:5000,earned:5000,password:null,invite:null,access_reset:1});
  assert.equal(e.one("SELECT count(*) n FROM inventory WHERE player='16'").n,0);
  assert.equal(e.one("SELECT count(*) n FROM trade_listings WHERE status='cancelled'").n,5);
  assert.equal(e.one("SELECT count(*) n FROM profile_showcase WHERE player='124'").n,0);
  for(const id of ["124","47"]) assert.deepEqual(e.one("SELECT balance,earned FROM players WHERE id=?",id),{balance:777,earned:9000});
  assert.equal(e.economy.specialPack.ensureGranted("16").seen,1);
  assert.equal(e.one("SELECT count(*) n FROM inventory WHERE player='16'").n,0);
  assert.equal(JSON.parse(e.one("SELECT result FROM receipts WHERE scope='16:pack'").result).reverted,true);
});

test("stale or incomplete snapshots and a changed target fail before touching any player",t=>{
  for(const change of [
    f=>f.e.run("UPDATE inventory SET copies=2 WHERE player='47' AND card='material-a'"),
    f=>f.e.run("INSERT INTO receipts VALUES('16:pack','new','{}','{}',3)"),
    f=>f.plan.inventory.pop(), f=>f.plan.trades.pop(), f=>f.plan.player="124",
    f=>f.e.run("UPDATE players SET password='new' WHERE id='16'"),
    f=>f.e.run("UPDATE inventory SET level=6 WHERE player='124' AND card='takina'"),
  ]) {
    const f=fixture(t); change(f);
    const before=f.e.all("SELECT * FROM inventory ORDER BY player,card");
    assert.throws(f.apply);
    assert.equal(f.e.player("16").balance,125);
    assert.deepEqual(f.e.all("SELECT * FROM inventory ORDER BY player,card"),before);
    assert.equal(f.e.one("SELECT count(*) n FROM receipts WHERE scope='host:account-rollback'").n,0);
  }
});

test("a later failure rolls back earlier counterparty changes and the receipt",t=>{
  const {e,db,apply}=fixture(t);
  const before=e.all("SELECT * FROM inventory ORDER BY player,card");
  db.exec("CREATE TRIGGER reject_reset BEFORE UPDATE OF balance ON players WHEN NEW.id='16' BEGIN SELECT RAISE(ABORT,'injected reset failure'); END");
  assert.throws(apply,/injected reset failure/);
  assert.deepEqual(e.all("SELECT * FROM inventory ORDER BY player,card"),before);
  assert.equal(e.one("SELECT count(*) n FROM trade_listings WHERE status='completed'").n,5);
  assert.equal(e.one("SELECT count(*) n FROM receipts WHERE scope='host:account-rollback'").n,0);
});

function recoveryFixture(t) {
  const db = new DatabaseSync(":memory:");
  t.after(() => db.close());
  const e = new Engine((s,...a) => db.prepare(s).all(...a).map(r=>({...r})), fn => {
    db.exec("BEGIN");
    try { const r=fn(); db.exec("COMMIT"); return r; }
    catch (error) { db.exec("ROLLBACK"); throw error; }
  }, () => 1794636000000);
  e.host("players", {players:[{id:"71",name:"Recovery fixture"},{id:"72",name:"Unaffected fixture"}]});
  e.run("UPDATE players SET balance=2900,earned=7000,account_locked=1 WHERE id='71'");
  e.run("INSERT INTO inventory(player,card,copies,level,protected) VALUES('71','remove',1,1,1),('71','downgrade',1,2,1),('71','unrelated-max',1,6,1),('72','remove',1,1,0)");
  e.run("INSERT INTO card_alchemy VALUES('71',130,88,99)");
  e.run("INSERT INTO card_upgrade_progress VALUES('71','downgrade',1),('71','unrelated-max',15)");
  e.run("INSERT INTO profile_showcase VALUES('71','remove',0),('71','unrelated-max',1)");
  e.run("INSERT INTO card_title_awards VALUES('71','unchanged-title','unrelated-max','Unchanged','B',1,0)");
  e.run("INSERT INTO quiz_progress(player,quiz,best,at) VALUES('71','retained-quiz',20,1)");
  const plan={repairId:TARGETED_RECOVERY_ID,confirmation:"APPLY REVIEWED TARGETED RECOVERY",player:"71",
    account:e.one("SELECT id,balance,earned,account_locked,avatar_card,avatar_crop FROM players WHERE id='71'"),
    alchemy:e.one("SELECT * FROM card_alchemy WHERE player='71'"),ledgerMax:e.one("SELECT max(id) AS n FROM ledger WHERE player='71'").n,
    inventory:["remove","downgrade"].map(card=>{const before=e.one("SELECT * FROM inventory WHERE player='71' AND card=?",card);return {card,before,after:card==='remove'?null:{...before,level:1}};}),
    upgradeProgress:e.all("SELECT * FROM card_upgrade_progress WHERE player='71' AND card='downgrade'"),cashRecovery:2900,xpRecovery:90,unrecoveredSourceCredits:85900};
  const apply=()=>e.mutate("host:account-rollback",plan.repairId,plan,()=>applyTargetedRecovery(e,plan,TARGETED_RECOVERY_DIGEST,"test-bookmark"));
  return {e,db,plan,apply};
}

test("targeted recovery preserves unrelated progress and lock, cleans references, and retries once",t=>{
  const {e,plan,apply}=recoveryFixture(t);
  assert.equal(inspectTargetedRecovery(e,plan,TARGETED_RECOVERY_DIGEST).cardsRemoved,1);
  const result=apply();
  assert.deepEqual(apply(),result);
  assert.deepEqual(e.one("SELECT balance,earned,account_locked FROM players WHERE id='71'"),{balance:0,earned:7000,account_locked:1});
  assert.equal(e.one("SELECT * FROM inventory WHERE player='71' AND card='remove'"),undefined);
  assert.deepEqual(e.one("SELECT level,copies,protected FROM inventory WHERE player='71' AND card='downgrade'"),{level:1,copies:1,protected:1});
  assert.deepEqual(e.one("SELECT xp,refinements,version FROM card_alchemy WHERE player='71'"),{xp:40,refinements:88,version:100});
  assert.equal(e.one("SELECT count(*) n FROM profile_showcase WHERE player='71' AND card='remove'").n,0);
  assert.equal(e.one("SELECT count(*) n FROM card_upgrade_progress WHERE player='71' AND card='downgrade'").n,0);
  assert.equal(e.one("SELECT level FROM inventory WHERE player='71' AND card='unrelated-max'").level,6);
  assert.equal(e.one("SELECT count(*) n FROM card_title_awards WHERE player='71'").n,1);
  assert.equal(e.one("SELECT best FROM quiz_progress WHERE player='71'").best,20);
  assert.equal(e.one("SELECT count(*) n FROM inventory WHERE player='72'").n,1);
  assert.equal(e.one("SELECT count(*) n FROM receipts WHERE scope='host:account-rollback'").n,1);
});

test("targeted recovery rejects stale guards and rolls all writes back on a late failure",t=>{
  for (const alter of [
    f=>f.e.run("UPDATE players SET account_locked=0 WHERE id='71'"),
    f=>f.e.run("UPDATE inventory SET copies=2 WHERE player='71' AND card='remove'"),
    f=>f.e.run("UPDATE card_alchemy SET version=version+1 WHERE player='71'"),
    f=>f.e.run("INSERT INTO ledger(player,delta,reason,at) VALUES('71',1,'intervening activity',1)"),
    f=>f.e.run("UPDATE card_upgrade_progress SET spent=2 WHERE player='71' AND card='downgrade'"),
    f=>f.plan.confirmation="unreviewed",
    f=>f.db.exec("CREATE TRIGGER reject_recovery BEFORE UPDATE OF balance ON players WHEN NEW.id='71' BEGIN SELECT RAISE(ABORT,'injected recovery failure'); END"),
  ]) {
    const f=recoveryFixture(t);alter(f);
    const inv=f.e.all("SELECT * FROM inventory ORDER BY player,card"),xp=f.e.one("SELECT * FROM card_alchemy WHERE player='71'");
    assert.throws(f.apply);
    assert.deepEqual(f.e.all("SELECT * FROM inventory ORDER BY player,card"),inv);
    assert.deepEqual(f.e.one("SELECT * FROM card_alchemy WHERE player='71'"),xp);
    assert.equal(f.e.one("SELECT balance FROM players WHERE id='71'").balance,2900);
    assert.equal(f.e.one("SELECT count(*) n FROM receipts WHERE scope='host:account-rollback'").n,0);
  }
});
