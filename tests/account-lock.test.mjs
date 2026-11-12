import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { Engine } from "../src/engine.js";

test("persistent locks block actions/rewards, preserve assets and return unrelated escrow and bids exactly once",t=>{
  const db=new DatabaseSync(":memory:");t.after(()=>db.close());
  const e=new Engine((s,...a)=>db.prepare(s).all(...a).map(r=>({...r})),fn=>{
    db.exec("BEGIN");try{const v=fn();db.exec("COMMIT");return v;}catch(err){db.exec("ROLLBACK");throw err;}
  },()=>1000);
  e.host("players",{players:["locked","buyer","offerer"].map(id=>({id,name:id}))});
  e.host("catalog",{cards:["one","two","three","four"].map(id=>({id,kind:"character",name:id,series:"Test"}))});
  for(const id of ["locked","buyer","offerer"])e.wallet(id,1000,"Original legitimate reward",true);
  e.wallet("locked",-100,"Auction bid held");e.wallet("buyer",-100,"Auction bid held");
  e.run("INSERT INTO trade_listings(id,seller,card,level,created_at,updated_at) VALUES(1,'locked','one',3,1,1)");
  e.run("INSERT INTO trade_offers(id,listing,proposer,card,level,created_at,updated_at) VALUES(1,1,'offerer','two',2,1,1)");
  e.run("INSERT INTO market_listings(seller,card,kind,level,price,created) VALUES('locked','three','character',4,400,1)");
  e.run("INSERT INTO auctions(card,kind,starts,ends,seller,level,bid,winner) VALUES('four','character',1,10000,'locked',2,100,'buyer')");
  e.run("INSERT INTO auctions(card,kind,starts,ends,seller,level,bid,winner) VALUES('one','character',1,10000,'buyer',1,100,'locked')");
  const lock=()=>e.mutate("host:account-lock","lock-once",{player:"locked",locked:true},()=>e.host("account-lock",{player:"locked",locked:true}));
  assert.deepEqual(lock(),lock());
  assert.equal(e.player("locked").balance,1000);assert.equal(e.player("buyer").balance,1000);
  for(const [card,level] of [["one",3],["three",4],["four",2]])assert.equal(e.one("SELECT level FROM inventory WHERE player='locked' AND card=?",card).level,level);
  assert.equal(e.one("SELECT level FROM inventory WHERE player='offerer' AND card='two'").level,2);
  for(const action of ["daily","pack","trade-list","buy-listing","list-card","alchemy-feed","quiz-ready","quiz-answer","predict","roulette-start"])
    assert.throws(()=>e.action("locked",action,{}),err=>err.status===403);
  assert.throws(()=>e.host("grant",{player:"locked",amount:100,reason:"other"}),err=>err.status===403);
  e.tx(()=>{e.wallet("locked",100,"Settled pick’em",true);e.wallet("buyer",100,"Settled pick’em",true);});
  assert.equal(e.player("locked").balance,1000);assert.equal(e.player("locked").earned,1000);
  assert.equal(e.player("buyer").balance,1100);
  assert.throws(()=>e.host("account-lock",{player:"368",locked:true}));
  e.host("account-lock",{player:"locked",locked:false});
  e.wallet("locked",100,"New legitimate reward",true);assert.equal(e.player("locked").balance,1100);
  assert.equal(e.one("SELECT count(*) n FROM account_lock_log").n,2);
});
