import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { Engine } from "../src/engine.js";
import { AKINO_QUIZ_ID, AKINO_RETIREMENT_ID, AKINO_RETIREMENT_SCOPE, quizRetirementPreview, retireAkinoQuiz } from "../src/quiz-retirement.js";

function fixture(t) {
  const db = new DatabaseSync(":memory:");
  t.after(() => db.close());
  const make = () => new Engine((s,...a) => db.prepare(s).all(...a).map(r => ({...r})), fn => {
    db.exec("BEGIN");
    try { const result=fn(); db.exec("COMMIT"); return result; }
    catch(error) { db.exec("ROLLBACK"); throw error; }
  }, () => 1794670000000, () => 0);
  const e = make();
  e.host("players", {players:[{id:"p",name:"Player"},{id:"q",name:"Other"},{id:"r",name:"Unaffected"}]});
  e.run("UPDATE players SET password='fixture-hash',avatar_crop='fixture-crop',private_collection=1 WHERE id='p'");
  for(const [id,name] of [[AKINO_QUIZ_ID,"AKINO"],["other","Arai, Akino"]]) {
    e.run("INSERT INTO quizzes(id,name,cover,title,published,source,updated) VALUES(?,?,'','Same Title',1,'fixture',1)",id,name);
    e.run("INSERT INTO quiz_songs VALUES(?,0,'{}')",id);
    e.run("INSERT INTO quiz_answers VALUES(?,'Answer',?)",id,id);
    e.run("INSERT INTO quiz_progress(player,quiz,best,at) VALUES('p',?,20,1)",id);
    e.run("INSERT INTO quiz_runs VALUES('p',?,'{}')",id);
    e.run("INSERT INTO quiz_reward_history VALUES('p',?,20)",id);
    e.run("INSERT INTO profile_title_preferences VALUES('p',?,0)",id);
  }
  e.run("INSERT INTO profile_title_order VALUES('p',?)",JSON.stringify(["quiz:"+AKINO_QUIZ_ID,"quiz:other","award:unchanged"]));
  e.run("INSERT INTO inventory(player,card,copies,level) VALUES('p','unrelated',2,3)");
  e.wallet("p",500,"Quiz: AKINO · 10/20",true);
  e.wallet("p",500,"Quiz: AKINO · 12/20",true);
  e.wallet("p",-950,"Spent credits");
  e.wallet("q",2000,"Unrelated grant",true);
  e.wallet("q",100,"Quiz: AKINO · 2/20",true);
  e.wallet("q",300,"Quiz: Arai, Akino · 4/20",true);
  const body=()=>({confirmation:"REMOVE AKINO AND RECLAIM ALL REWARDS",expected:quizRetirementPreview(e).expected});
  const apply=b=>e.mutate(AKINO_RETIREMENT_SCOPE,AKINO_RETIREMENT_ID,b,()=>retireAkinoQuiz(e,b,"fixture-bookmark"));
  return {db,e,make,body,apply};
}

test("AKINO removal recovers exact payouts into negative wallets, preserves all player fields/indexes and other quizzes, and replays once", t => {
  const {e,make,body,apply}=fixture(t);
  const players=e.all("SELECT * FROM players ORDER BY id"),inventory=e.all("SELECT * FROM inventory"),other=e.one("SELECT * FROM quizzes WHERE id='other'");
  const indexes=e.all("SELECT name,sql FROM sqlite_master WHERE tbl_name='players' AND type='index' ORDER BY name");
  const plan=body(),result=apply(plan);
  assert.equal(result.credits,1100);
  assert.equal(result.negativeBalances,1);
  assert.equal(result.signedWalletMigration,true);
  assert.equal(e.player("p").balance,-950);
  assert.equal(e.player("p").earned,0);
  assert.equal(e.player("q").balance,2300);
  assert.deepEqual(e.all("SELECT * FROM players ORDER BY id"),players.map(p=>({...p,balance:p.balance-(p.id==='p'?1000:p.id==='q'?100:0),earned:p.earned-(p.id==='p'?1000:p.id==='q'?100:0)})));
  assert.deepEqual(e.all("SELECT * FROM inventory"),inventory);
  assert.deepEqual(e.one("SELECT * FROM quizzes WHERE id='other'"),other);
  assert.deepEqual(e.all("SELECT name,sql FROM sqlite_master WHERE tbl_name='players' AND type='index' ORDER BY name"),indexes);
  for(const table of ["quiz_songs","quiz_answers","quiz_progress","quiz_runs","quiz_reward_history","profile_title_preferences"]){
    assert.equal(e.one(`SELECT count(*) n FROM ${table} WHERE quiz=?`,AKINO_QUIZ_ID).n,0);
    assert.equal(e.one(`SELECT count(*) n FROM ${table} WHERE quiz='other'`).n,1);
  }
  assert.deepEqual(JSON.parse(e.one("SELECT data FROM profile_title_order WHERE player='p'").data),["quiz:other","award:unchanged"]);
  assert.deepEqual(apply(plan),result);
  assert.equal(e.one("SELECT count(*) n FROM ledger WHERE reason LIKE 'Quiz reward reversal:%'").n,2);
  const restarted=make();
  assert.equal(restarted.player("p").balance,-950);
  assert.equal(restarted.one("PRAGMA integrity_check").integrity_check,"ok");
  assert.throws(()=>restarted.wallet("p",-1,"Spend"),/Not enough/);
  restarted.wallet("p",300,"Daily credits",true);
  assert.equal(restarted.player("p").balance,-650);
  restarted.wallet("p",700,"Sale refund");
  assert.equal(restarted.player("p").balance,50);
  assert.throws(()=>restarted.wallet("p",-51,"Overspend"),/Not enough/);
  restarted.wallet("p",-50,"Affordable spend");
  assert.equal(restarted.player("p").balance,0);
});

test("unreviewed payouts or altered quiz identity and confirmation cannot be retired",t=>{
  const {e,body,apply}=fixture(t),plan=body();
  assert.throws(()=>apply({...plan,confirmation:""}),/Confirm/);
  e.wallet("q",50,"Quiz: AKINO · 3/20",true);
  assert.throws(()=>apply(plan),/changed/);
  e.run("UPDATE quizzes SET name='Other Quiz' WHERE id=?",AKINO_QUIZ_ID);
  assert.throws(()=>quizRetirementPreview(e),/authorized/);
  assert.equal(e.one("SELECT count(*) n FROM receipts WHERE scope=?",AKINO_RETIREMENT_SCOPE).n,0);
  assert.equal(e.one("SELECT count(*) n FROM ledger WHERE reason LIKE 'Quiz reward reversal:%'").n,0);
});

test("a late failure rolls back negative-wallet schema migration, all debits, deletions and receipt together",t=>{
  const {db,e,body,apply}=fixture(t),plan=body();
  const before=e.all("SELECT * FROM players ORDER BY id"),schema=e.one("SELECT sql FROM sqlite_master WHERE name='players'").sql;
  db.exec("CREATE TRIGGER reject_retirement BEFORE DELETE ON quizzes WHEN OLD.id='"+AKINO_QUIZ_ID+"' BEGIN SELECT RAISE(ABORT,'late retirement failure'); END");
  assert.throws(()=>apply(plan),/late retirement failure/);
  assert.deepEqual(e.all("SELECT * FROM players ORDER BY id"),before);
  assert.equal(e.one("SELECT sql FROM sqlite_master WHERE name='players'").sql,schema);
  assert.equal(e.one("SELECT count(*) n FROM quiz_progress WHERE quiz=?",AKINO_QUIZ_ID).n,1);
  assert.equal(e.one("SELECT count(*) n FROM ledger WHERE reason LIKE 'Quiz reward reversal:%'").n,0);
  assert.equal(e.one("SELECT count(*) n FROM receipts WHERE scope=?",AKINO_RETIREMENT_SCOPE).n,0);
});
