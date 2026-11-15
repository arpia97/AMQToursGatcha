import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { Engine } from "../src/engine.js";
function fixture(t) {
  const db = new DatabaseSync(":memory:");
  t.after(() => db.close());
  const e = new Engine(
    (s, ...a) => db.prepare(s).all(...a),
    (fn) => {
      db.exec("BEGIN");
      try {
        const r = fn();
        db.exec("COMMIT");
        return r;
      } catch (err) {
        db.exec("ROLLBACK");
        throw err;
      }
    },
  );
  e.host("players", {
    players: [
      { id: "p", name: "Player" },
      { id: "q", name: "Other" },
    ],
  });
  return e;
}
import { alchemyCompensation } from "../src/alchemy-compensation.js";
import {
  autoRefinementPlan,
  refinementQueue,
  refinementQuote,
} from "../public/alchemy-rules.js";
test("1.5x Alchemy history compensation includes actual lucky/batch XP already spent, skips new XP, and pays once", (t) => {
  const e = fixture(t);
  const put = (id, result, at) =>
    e.run(
      "INSERT INTO receipts VALUES(?,?,?,?,?)",
      "p:alchemy-feed",
      id,
      "{}",
      JSON.stringify(result),
      at,
    );
  put("old", { xpGained: 10 }, 1);
  put(
    "batch",
    { refinements: [{ xpGained: 40 }, { xpGained: 100 }], xpGained: 140 },
    2,
  );
  put("new", { xpGained: 15, xpRevision: 2 }, 3);
  e.economy.alchemy.save("p", { xp: 5, refinements: 4, version: 8 });
  const before = e.player("p");
  let preview = alchemyCompensation(e);
  assert.equal(preview.totalBonus, 75);
  assert.equal(preview.rows[0].originalXP, 150);
  assert.equal(e.economy.alchemy.read("p").xp, 5);
  const applied = e.tx(() => alchemyCompensation(e, true));
  assert.equal(applied.totalBonus, 75);
  assert.equal(e.economy.alchemy.read("p").xp, 80);
  assert.equal(e.economy.alchemy.read("p").version, 9);
  assert.deepEqual(e.player("p"), before);
  assert.equal(e.tx(() => alchemyCompensation(e, true)).alreadyApplied, true);
  assert.equal(e.economy.alchemy.read("p").xp, 80);
});
test("history compensation rejects incomplete evidence atomically and does not compensate a previous reset lifecycle", (t) => {
  const e = fixture(t);
  e.run(
    "INSERT INTO receipts VALUES(?,?,?,?,?)",
    "p:alchemy-feed",
    "old",
    "{}",
    JSON.stringify({ xpGained: 100 }),
    1,
  );
  e.run(
    "INSERT INTO receipts VALUES(?,?,?,?,?)",
    "p:alchemy-feed",
    "new",
    "{}",
    JSON.stringify({ xpGained: 15, xpRevision: 2 }),
    2,
  );
  e.economy.alchemy.save("p", { xp: 10, refinements: 3, version: 0 });
  assert.throws(() => e.tx(() => alchemyCompensation(e, true)), {
    status: 409,
  });
  assert.equal(e.economy.alchemy.read("p").xp, 10);
  e.economy.alchemy.save("p", { xp: 10, refinements: 1, version: 0 });
  assert.equal(alchemyCompensation(e).totalBonus, 0);
});
test("Auto Refine uses low normal/high lucky rarities, max rarity and invested XP, never protected cards", () => {
  const cards = {
    d: { id: "d", rarity: "D" },
    s: { id: "s", rarity: "S" },
    a: { id: "a", rarity: "AG" },
    p: { id: "p", rarity: "AG" },
  };
  const inventory = [
    { card: "d", level: 1, copies: 20 },
    { card: "s", level: 6, copies: 2 },
    { card: "a", level: 1, copies: 1 },
    { card: "p", level: 6, copies: 3, protected: 1 },
  ];
  const by = (id) => cards[id];
  const plan = autoRefinementPlan(inventory, by, 12, "AG", 0),
    q = refinementQueue(plan, inventory, by);
  assert.equal(q[5].id, "a");
  assert.equal(q[11].id, "s");
  assert.equal(q[11].level, 6);
  assert.ok(
    q.filter((c, i) => ![5, 11].includes(i)).every((c) => c.id === "d"),
  );
  assert.ok(plan.every((c) => c.card !== "p"));
  assert.ok(
    autoRefinementPlan(inventory, by, 10, "B").every((c) => c.card === "d"),
  );
  assert.throws(
    () => autoRefinementPlan(inventory, by, 100, "AG"),
    /Not enough/,
  );
  assert.equal(refinementQuote("D").baseXP, 15);
  assert.equal(refinementQuote("AG").baseXP, 3840);
});


import { BOP_COMPENSATION_ID, savedBopCompensation, bopCompensationPlan, bopCompensationSource, applyBopCompensation } from "../src/bop-compensation.js";
function legacyBopDraw(e,player,key,{cost=400,target="target",drawn="other",hit=false,version=1,result={},body={}}={}) {
  e.run("INSERT INTO receipts VALUES(?,?,?,?,?)",player+":alchemy-draw",key,
    JSON.stringify({confirmed:true,targetCard:target,expectedVersion:version-1,...body}),
    JSON.stringify({xpSpent:cost,targetHit:hit,cards:[{id:drawn}],alchemyState:{version,refinements:0},...result}),1);
}
const applyBop = (e,plan=bopCompensationPlan(e)) => e.tx(()=>applyBopCompensation(e,plan,bopCompensationSource(plan),"test-source-digest","test-bookmark"));
test("historical bop compensation uses spent XP from missed saved targets, pays once, and preserves live XP/currency earned after preview",t=>{
  const e=fixture(t);
  e.economy.alchemy.save("p",{xp:7,refinements:0,version:10});
  e.economy.alchemy.saveBopXP("p",3);
  legacyBopDraw(e,"p","miss",{cost:12800});
  legacyBopDraw(e,"p","miss-two",{cost:50,version:2});
  const plan=bopCompensationPlan(e);
  assert.equal(plan.totalBopXP,1285);
  assert.equal(plan.counts.eligibleMisses,2);
  assert.equal(e.economy.alchemy.bopXP("p"),3);
  const wallet=e.player("p");
  e.economy.alchemy.save("p",{xp:22,refinements:1,version:11});
  e.economy.alchemy.saveBopXP("p",8);
  const result=applyBop(e,plan);
  assert.equal(result.rows[0].priorBopXP,8);
  assert.equal(e.economy.alchemy.bopXP("p"),1293);
  assert.deepEqual({...e.economy.alchemy.read("p")},{xp:22,refinements:1,version:12});
  assert.deepEqual(e.player("p"),wallet);
  assert.equal(result.id,BOP_COMPENSATION_ID);
  assert.equal(applyBop(e,plan).alreadyApplied,true);
  assert.equal(e.economy.alchemy.bopXP("p"),1293);
});
test("historical bop compensation excludes reset/reverted history, hits, untargeted and already-paid draws",t=>{
  const e=fixture(t);
  e.economy.alchemy.save("p",{xp:0,refinements:0,version:10});
  legacyBopDraw(e,"p","before-reset");
  e.run("INSERT INTO receipts VALUES(?,?,?,?,?)","host:host/reset-player","reset-p",JSON.stringify({player:"p"}),"{}",1);
  legacyBopDraw(e,"p","after-reset",{cost:50});
  legacyBopDraw(e,"p","hit",{drawn:"target",hit:true});
  legacyBopDraw(e,"p","random",{target:null});
  legacyBopDraw(e,"p","reverted",{result:{reverted:true}});
  legacyBopDraw(e,"p","new-paid",{result:{bopXPGained:40}});
  legacyBopDraw(e,"p","bop",{body:{currency:"bop"},cost:0});
  const plan=bopCompensationPlan(e);
  assert.equal(plan.totalBopXP,5);
  for(const key of ["reset","hits","untargeted","reverted","alreadyCredited","guaranteed"])
    assert.equal(plan.counts[key],1,key);
  assert.deepEqual(plan.warnings,[]);
  applyBop(e,plan);
  assert.equal(e.economy.alchemy.bopXP("p"),5);
});
test("historical bop compensation rejects changed or ambiguous evidence and overflow without paying anyone",t=>{
  const e=fixture(t);
  e.economy.alchemy.save("p",{xp:0,refinements:0,version:10});
  legacyBopDraw(e,"p","first");
  const plan=bopCompensationPlan(e);
  legacyBopDraw(e,"p","second",{version:2});
  assert.throws(()=>applyBop(e,plan),/evidence changed/);
  assert.equal(e.economy.alchemy.bopXP("p"),0);
  legacyBopDraw(e,"p","contradiction",{drawn:"target"});
  assert.throws(()=>applyBop(e),/needs review/);
  e.run("DELETE FROM receipts WHERE key='contradiction'");
  e.economy.alchemy.saveBopXP("p",Number.MAX_SAFE_INTEGER);
  assert.throws(()=>applyBop(e),/needs review/);
  assert.equal(e.economy.alchemy.bopXP("p"),Number.MAX_SAFE_INTEGER);
  assert.equal(savedBopCompensation(e),null);
});
test("a late historical bop compensation failure rolls back every balance/version and its one-time marker",t=>{
  const e=fixture(t);
  for(const player of ["p","q"]) {
    e.economy.alchemy.save(player,{xp:13,refinements:0,version:10});
    legacyBopDraw(e,player,"miss-"+player);
  }
  const run=e.run.bind(e);
  e.run=(sql,...args)=>{if(sql.startsWith("INSERT INTO alchemy_compensations"))throw Error("Simulated marker write failure");return run(sql,...args);};
  assert.throws(()=>applyBop(e),/Simulated marker/);
  for(const player of ["p","q"]) {
    assert.equal(e.economy.alchemy.bopXP(player),0);
    assert.equal(e.economy.alchemy.read(player).version,10);
  }
  assert.equal(savedBopCompensation(e),null);
  e.run=run;
  assert.equal(applyBop(e).totalBopXP,80);
});
