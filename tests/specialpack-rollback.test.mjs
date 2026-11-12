import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { Engine } from "../src/engine.js";
import { SPECIALPACK_ROLLBACK_ID, SPECIALPACK_SCOPE_DIGEST, specialPackRollbackSnapshot, inspectSpecialPackRollback, applySpecialPackRollback } from "../src/specialpack-rollback.js";

function fixture(t) {
  const db=new DatabaseSync(":memory:");t.after(()=>db.close());
  const e=new Engine((s,...a)=>db.prepare(s).all(...a).map(r=>({...r})),fn=>{
    db.exec("BEGIN");try{const r=fn();db.exec("COMMIT");return r;}
    catch(error){db.exec("ROLLBACK");throw error;}
  },()=>1794467000000);
  e.host("players",{players:["test-a","test-b","test-c","test-owner","test-offerer","test-recipient"].map(id=>({id,name:id}))});
  e.run("UPDATE players SET balance=50,earned=800,access_reset=1,invite='discarded-hash' WHERE id IN ('test-a','test-b','test-c')");
  e.run("UPDATE players SET balance=100,earned=9000 WHERE id='test-owner'");
  e.run("UPDATE players SET balance=75,earned=8000 WHERE id='test-recipient'");
  const inv=(p,c,n=1,l=1)=>e.run("INSERT INTO inventory(player,card,copies,level,acquired_at,protected) VALUES(?,?,?,?,10,1)",p,c,n,l);
  for(const p of ["test-a","test-b","test-c"]){
    inv(p,"discard-me");e.run("INSERT INTO special_packs VALUES(?,1,'[]',0)",p);
    e.run("INSERT INTO receipts VALUES(?,'old','{}','{}',1)",p+":pack");
  }
  for(const c of ["111337","11849","19571","429"])inv("test-owner","mal-character-"+c);
  inv("test-owner","mal-character-204620",2,2);inv("test-owner","mal-person-34785",1,2);
  inv("test-recipient","unrelated");
  e.run("INSERT INTO profile_showcase VALUES('test-owner','mal-person-34785',0)");
  e.run("UPDATE players SET avatar_card='mal-person-34785' WHERE id='test-owner'");
  for(const [id,seller,buyer,c,price] of [
    [101,"test-owner","test-a","651",50],[102,"test-b","test-owner","19571",10],
    [103,"test-b","test-owner","111337",50],[104,"test-c","test-owner","204620",60],
  ]) e.run("INSERT INTO market_listings(id,seller,buyer,card,kind,level,price,created,status,sold_at) VALUES(?,?,?,?,'character',1,?,1,'sold',2)",id,seller,buyer,"mal-character-"+c,price);
  for(const [id,seller,card,offer,proposer,bundle] of [
    [201,"test-owner","mal-character-154269",301,"test-a",["mal-person-1870","mal-person-4","mal-person-10765","mal-character-2645","mal-character-429","mal-character-11849"]],
    [202,"test-owner","mal-character-422",302,"test-c",["mal-person-34785"]],
    [203,"test-b","mal-person-34785",303,"test-owner",["mal-character-2754","mal-character-2645"]],
  ]) {
    e.run("INSERT INTO trade_listings(id,seller,card,level,status,accepted_offer,created_at,updated_at) VALUES(?,?,?,1,'completed',?,1,2)",id,seller,card,offer);
    e.run("INSERT INTO trade_offers(id,listing,proposer,card,level,status,created_at,updated_at) VALUES(?,?,?,?,1,'accepted',1,2)",offer,id,proposer,bundle[0]);
    bundle.forEach((c,i)=>e.run("INSERT INTO trade_offer_cards(offer,position,card,level) VALUES(?,?,?,1)",offer,i,c));
  }
  for(const [id,card] of [[204,"mal-person-10765"],[205,"mal-person-4"]])
    e.run("INSERT INTO trade_listings(id,seller,card,level,created_at,updated_at) VALUES(?,'test-owner',?,1,1,1)",id,card);
  e.run("INSERT INTO trade_offers(id,listing,proposer,card,level,created_at,updated_at) VALUES(304,205,'test-offerer','mal-character-274463',1,1,1)");
  e.run("INSERT INTO trade_offer_cards(offer,position,card,level) VALUES(304,0,'mal-character-274463',1)");
  e.run("INSERT INTO trade_listings(id,seller,card,level,status,accepted_offer,created_at,updated_at) VALUES(206,'test-recipient','mal-character-204620',1,'completed',305,1,2)");
  e.run("INSERT INTO ledger(id,player,delta,reason,at) VALUES(401,'test-recipient',60,'Instant card sale: Sample Person · Lv. 1',3)");
  const cards=["651","19571","111337","204620","154269","2645","429","11849","422","2754"].map(c=>({player:"test-owner",card:"mal-character-"+c}));
  cards.push(...["1870","4","10765","34785"].map(c=>({player:"test-owner",card:"mal-person-"+c})),{player:"test-offerer",card:"mal-character-274463"});
  cards.sort((a,b)=>(a.player+":"+a.card).localeCompare(b.player+":"+b.card));
  const scope={targets:['test-a','test-b','test-c'],marketIds:[101,102,103,104],tradeIds:[201,202,203],escrowIds:[204,205],escrowCards:['mal-person-10765','mal-person-4'],counterparty:'test-owner',recoveryCard:'mal-person-1870',recoveryAmount:60,expectedWalletDelta:10,onwardListing:206,onwardSeller:'test-recipient',onwardOffer:305,saleLedger:401,saleReason:'Instant card sale: Sample Person · Lv. 1'};
  const plan={repairId:SPECIALPACK_ROLLBACK_ID,confirmation:"REVERT THREE SPECIAL PACK ACCOUNTS",recovery:"counterparty-value",scope,snapshot:specialPackRollbackSnapshot(e,scope),
    affected:cards.map(c=>({...c,before:e.one("SELECT * FROM inventory WHERE player=? AND card=?",c.player,c.card)||null})),wallet:e.one("SELECT id,balance,earned FROM players WHERE id='test-owner'")};
  const apply=()=>e.mutate("host:account-rollback",SPECIALPACK_ROLLBACK_ID,plan,()=>applySpecialPackRollback(e,plan,"digest","bookmark",SPECIALPACK_SCOPE_DIGEST));
  return {e,db,plan,apply};
}

test("three-account correction replays once, reverses credits/cards, refunds escrow and preserves the reviewed onward activity",t=>{
  const {e,plan,apply}=fixture(t);
  const before=specialPackRollbackSnapshot(e,plan.scope);
  assert.equal(inspectSpecialPackRollback(e,plan,SPECIALPACK_SCOPE_DIGEST).wallet.delta,10);
  assert.deepEqual(specialPackRollbackSnapshot(e,plan.scope),before);
  const result=apply();assert.deepEqual(apply(),result);
  for(const p of ["test-a","test-b","test-c"]){
    assert.deepEqual(e.one("SELECT balance,earned,password,invite,access_reset FROM players WHERE id=?",p),{balance:5000,earned:5000,password:null,invite:null,access_reset:1});
    assert.equal(e.one("SELECT count(*) n FROM inventory WHERE player=?",p).n,0);
    assert.equal(e.economy.specialPack.ensureGranted(p).seen,1);
    assert.equal(JSON.parse(e.one("SELECT result FROM receipts WHERE scope=?",p+":pack").result).reverted,true);
  }
  assert.deepEqual(e.one("SELECT balance,earned FROM players WHERE id='test-owner'"),{balance:110,earned:9000});
  assert.deepEqual(e.one("SELECT copies,level FROM inventory WHERE player='test-owner' AND card='mal-character-204620'"),{copies:1,level:2});
  for(const c of ["mal-character-19571","mal-character-111337","mal-character-11849","mal-character-429","mal-person-34785","mal-person-10765","mal-person-4","mal-person-1870"])
    assert.equal(e.one("SELECT count(*) n FROM inventory WHERE player='test-owner' AND card=?",c).n,0);
  assert.equal(e.one("SELECT count(*) n FROM inventory WHERE player='test-owner'").n,5);
  assert.equal(e.one("SELECT copies FROM inventory WHERE player='test-offerer' AND card='mal-character-274463'").copies,1);
  assert.equal(e.one("SELECT status FROM trade_offers WHERE id=304").status,"returned");
  assert.equal(e.one("SELECT count(*) n FROM profile_showcase WHERE player='test-owner'").n,0);
  assert.equal(e.one("SELECT avatar_card FROM players WHERE id='test-owner'").avatar_card,null);
  assert.equal(e.one("SELECT count(*) n FROM market_listings WHERE status='cancelled'").n,4);
  assert.equal(e.one("SELECT count(*) n FROM trade_listings WHERE status='cancelled'").n,5);
  assert.deepEqual(e.one("SELECT * FROM trade_listings WHERE id=206"),before.onward);
  assert.deepEqual(e.one("SELECT balance,earned FROM players WHERE id='test-recipient'"),{balance:75,earned:8000});
  assert.equal(e.one("SELECT count(*) n FROM inventory WHERE player='test-recipient'").n,1);
});

test("changed wallets, source activity, escrow, inventory and recovery scope reject the whole correction",t=>{
  for(const change of [
    f=>f.e.wallet("test-owner",1,"Unrelated new activity"),
    f=>f.e.run("UPDATE inventory SET copies=3 WHERE player='test-owner' AND card='mal-character-204620'"),
    f=>f.e.run("INSERT INTO receipts VALUES('test-b:pack','new','{}','{}',5)"),
    f=>f.e.run("UPDATE trade_offers SET status='withdrawn' WHERE id=304"),
    f=>f.plan.recovery="unreviewed",f=>f.plan.affected.pop(),
  ]) {
    const f=fixture(t);change(f);const before=f.e.all("SELECT * FROM inventory ORDER BY player,card");
    assert.throws(f.apply);assert.deepEqual(f.e.all("SELECT * FROM inventory ORDER BY player,card"),before);
    assert.equal(f.e.one("SELECT count(*) n FROM receipts WHERE scope='host:account-rollback'").n,0);
  }
});

test("a late reset failure rolls back every card, wallet, listing and receipt change",t=>{
  const {e,db,plan,apply}=fixture(t),before=specialPackRollbackSnapshot(e,plan.scope),inventory=e.all("SELECT * FROM inventory ORDER BY player,card");
  db.exec("CREATE TRIGGER reject_final_reset BEFORE UPDATE OF balance ON players WHEN NEW.id='test-c' BEGIN SELECT RAISE(ABORT,'injected final reset failure'); END");
  assert.throws(apply,/injected final reset failure/);
  assert.deepEqual(specialPackRollbackSnapshot(e,plan.scope),before);
  assert.deepEqual(e.all("SELECT * FROM inventory ORDER BY player,card"),inventory);
  assert.equal(e.player("test-owner").balance,100);
  assert.equal(e.one("SELECT count(*) n FROM receipts WHERE scope='host:account-rollback'").n,0);
});
