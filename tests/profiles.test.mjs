import { ENHANCEMENT_REVISION } from "../public/card-values.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { Engine } from "../src/engine.js";
function fixture() {
  const db = new DatabaseSync(":memory:");
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
    () => Date.UTC(2026, 9, 24),
    () => 0,
  );
  const host = (a, b) => e.tx(() => e.host(a, b)),
    act = (a, b) => e.tx(() => e.action("001", a, b));
  host("players", {
    players: [
      { id: "001", name: "Original", aliases: ["amqalias"] },
      { id: "002", name: "Other", aliases: ["reservedalias"] },
    ],
  });
  return { e, host, act };
}
test("username changes are searchable through all old names and AMQ aliases", () => {
  const f = fixture();
  f.act("profile", { username: "New Name" });
  f.act("profile", { username: "Newest" });
  for (const q of ["amqalias", "original", "new name", "newest", "001"])
    assert.equal(f.e.searchProfiles(q)[0].id, "001");
  assert.equal(f.e.player("001").name, "Newest");
  assert.deepEqual(f.e.profile("001").usernames, ["New Name", "Newest"]);
});
test("players cannot adopt another player’s alias or historical username", () => {
  const f = fixture();
  assert.throws(
    () => f.act("profile", { username: "RESERVEDALIAS" }),
    /reserved/,
  );
  f.act("profile", { username: "Historical" });
  f.act("profile", { username: "Current" });
  assert.throws(
    () =>
      f.e.tx(() => f.e.action("002", "profile", { username: "historical" })),
    /reserved/,
  );
  assert.throws(
    () => f.host("players", { players: [{ id: "002", name: "historical" }] }),
    /conflicts/,
  );
});
test("avatars must be owned; displayed avatar enhancement follows inventory level", () => {
  const f = fixture();
  assert.throws(() => f.act("profile", { avatar: "card-a" }), /inventory/);
  f.e.addCard("001", "card-a", 6);
  f.act("profile", { avatar: "card-a" });
  f.act("enhance", {
    card: "card-a",
    expectedLevel: 1,
    enhancementRevision: ENHANCEMENT_REVISION,
  });
  f.act("enhance", {
    card: "card-a",
    expectedLevel: 2,
    enhancementRevision: ENHANCEMENT_REVISION,
  });
  const p = f.e.profile("001");
  assert.equal(p.avatar_card, "card-a");
  assert.equal(p.inventory[0].level, 3);
  assert.equal(f.e.searchProfiles("001")[0].avatar_level, 3);
});
test("activity counts distinct tour IDs per category, independent of credit amount", () => {
  const f = fixture();
  for (const reason of ["participation", "reporting", "counting"])
    for (let i = 0; i < 2; i++)
      f.host("grant", {
        player: "001",
        reason,
        amount: 100,
        note: "Task " + i,
        event: "tour42",
      });
  f.host("grant", {
    player: "001",
    reason: "participation",
    amount: 5,
    note: "tour43",
    event: "tour43",
  });
  const stats = f.e.profile("001").stats;
  assert.equal(stats.participation, 2);
  assert.equal(stats.reporting, 1);
  assert.equal(stats.counting, 1);
  assert.deepEqual({ ...stats.pickems }, { total: 0, correct: 0 });
});
test("normal packs use uniform card odds for both characters and seiyuus", () => {
  const f = fixture();
  f.e.run("UPDATE settings SET value=80 WHERE key='main_weight'");
  for (const kind of ["character", "seiyuu"])
    f.host("catalog", {
      cards: Array.from({ length: 5 }, (_, i) => ({
        id: kind + i,
        kind,
        name: "Card " + i,
        role: i === 0 ? "main" : "supporting",
      })),
    });
  f.host("grant", {
    player: "001",
    reason: "other",
    amount: 10000,
    note: "test",
  });
  let total;
  f.e.rand = (n) => {
    total = n;
    return 79;
  };
  f.act("pack", { kind: "character" });
  assert.equal(total, 500);
  f.e.rand = (n) => {
    total = n;
    return 100;
  };
  const pulls = f.act("pack", { kind: "character" });
  assert.ok(pulls.cards.every((c) => c.id === "character1"));
  f.act("pack", { kind: "seiyuu" });
  assert.equal(total, 500);
});
test("reset-player requires exact confirmation and clears only that player’s gameplay", () => {
  const f = fixture();
  f.host("grant", {
    player: "001",
    reason: "participation",
    amount: 100,
    note: "42",
  });
  f.host("grant", {
    player: "002",
    reason: "counting",
    amount: 200,
    note: "42",
  });
  f.e.addCard("001", "card-a");
  f.act("profile", { username: "Identity", avatar: "card-a" });
  assert.throws(
    () => f.host("reset-player", { player: "001", confirmation: "wrong" }),
    /Type RESET PLAYER/,
  );
  assert.equal(f.e.player("001").balance, 100);
  f.host("reset-player", { player: "001", confirmation: "RESET PLAYER 001" });
  assert.equal(f.e.player("001").balance, 5000);
  assert.equal(f.e.player("001").name, "Identity");
  assert.equal(f.e.profile("001").inventory.length, 0);
  assert.equal(f.e.profile("001").stats.participation, 0);
  assert.equal(f.e.player("002").balance, 200);
});
test("reset-all gameplay retains identity; full reset deletes registry while protecting catalog", () => {
  const f = fixture();
  f.host("catalog", { cards: [{ id: "c", kind: "character", name: "Card" }] });
  f.host("grant", {
    player: "001",
    reason: "other",
    amount: 100,
    note: "test",
  });
  assert.throws(
    () =>
      f.host("reset-all", {
        confirmation: "DELETE EVERYTHING",
        deleteRegistry: false,
      }),
    /confirmation/,
  );
  f.host("reset-all", {
    confirmation: "RESET ALL GAME DATA",
    deleteRegistry: false,
  });
  assert.equal(f.e.player("001").balance, 5000);
  assert.equal(f.e.all("SELECT * FROM catalog").length, 1);
  f.host("reset-all", {
    confirmation: "DELETE EVERYTHING",
    deleteRegistry: true,
  });
  assert.equal(f.e.all("SELECT * FROM players").length, 0);
  assert.equal(f.e.all("SELECT * FROM catalog").length, 1);
  assert.equal(f.e.all("SELECT * FROM aliases").length, 0);
});

test("rankings return equipped card portraits and their current enhancement level", () => {
  const f = fixture();
  f.host("catalog", {
    cards: [
      {
        id: "card-a",
        name: "Card A",
        kind: "character",
        image: "https://example.com/a.jpg",
      },
    ],
  });
  f.e.addCard("001", "card-a", 1);
  f.e.run("UPDATE inventory SET level=6 WHERE player='001' AND card='card-a'");
  f.act("profile", { avatar: "card-a" });
  f.e.wallet("001", 100, "Quiz: Example · 2/20", true);
  const ranks = f.e.economy.rankings("earned"),
    p = ranks.rows.find((p) => p.id === "001");
  assert.equal(p.avatar_card, "card-a");
  assert.equal(p.avatar_level, 6);
  assert.ok(ranks.cards.some((c) => c.id === "card-a"));
});

test('portrait repricing refunds only the difference per successful roll once to its payer',async()=>{
  const {refundPortraitOverpayments}=await import('../src/card-gallery.js');
  const {e}=fixture();
  e.run("DELETE FROM settings WHERE key IN ('portrait-roll-pricing-v2','portrait-roll-pricing-v3')");
  const before=e.player('001');
  for(const [key,price,owned] of [['first',800,1],['second',1600,2],['cheap',400,1]]){
    e.mutate('001:card-gallery',key,{action:'roll',card:'old',price,owned},()=>({unlocked:'image'+key}));
  }
  refundPortraitOverpayments(e);refundPortraitOverpayments(e);
  assert.equal(e.player('001').balance-before.balance,1150);
  assert.equal(e.player('001').earned,before.earned);
});
test('new portrait refunds subtract earlier refunds and skip cheap rolls',async()=>{
  const {refundPortraitOverpayments}=await import('../src/card-gallery.js');
  const {e}=fixture();
  e.run("DELETE FROM settings WHERE key='portrait-roll-pricing-v3'");
  e.run("INSERT OR REPLACE INTO settings VALUES('portrait-roll-pricing-v2',?)",e.now()+100);
  const before=e.player('001').balance;
  for(const [key,price,owned] of [['first',800,1],['second',1600,2],['third',400,3],['fourth',2000,4]])
    e.mutate('001:card-gallery',key,{action:'roll',price,owned},()=>({unlocked:'image'}));
  refundPortraitOverpayments(e);refundPortraitOverpayments(e);
  assert.equal(e.player('001').balance-before,1000);
});
test('a gallery can be indexed before opening, rolls one new portrait for the progressive price and isolates equipment per owner',async()=>{
  const {changePortrait,indexGallery,queueGalleries,galleryCounts,galleryView}=await import('../src/card-gallery.js');
  const {e}=fixture(),id='mal-character-1',base='https://cdn.myanimelist.net/images/characters/10/';
  e.run('INSERT INTO catalog(id,kind,name,image) VALUES(?,?,?,?)',id,'character','Test entry',base+'1.jpg');
  const card=e.catalogStore.card(id);
  queueGalleries(e,[id]);
  assert.equal(galleryCounts(e,[card])[0].alternatives,null);
  let requests=0;
  await indexGallery(e,async path=>{
    requests++;assert.equal(path,'/characters/1/pictures');
    return {data:[1,2,2].map(n=>({jpg:{image_url:base+n+'.jpg'}}))};
  });
  assert.equal(requests,1);assert.equal(galleryCounts(e,[card])[0].alternatives,1);
  for(const player of ['001','002'])e.addCard(player,id);
  const initial=galleryView(e,'001',card);
  assert.equal(initial.price,500);
  const input={card:id,action:'roll',owned:1,price:initial.price};
  const roll=key=>e.mutate('001:gallery',key,input,()=>changePortrait(e,'001',input));
  assert.throws(()=>roll('too-soon'),/Max the card/);
  e.run("UPDATE inventory SET level=6 WHERE player='001' AND card=?",id);
  e.run("UPDATE players SET balance=0 WHERE id='001'");
  assert.throws(()=>roll('poor'),/credit/i);
  e.run("UPDATE players SET balance=5000 WHERE id='001'");
  assert.equal(roll('paid').unlocked,base+'2.jpg');
  assert.equal(roll('paid').unlocked,base+'2.jpg');
  assert.equal(galleryView(e,'001',card).price,750);
  assert.throws(()=>roll('extra'),/Every available/);
  assert.equal(e.player('001').balance,5000-initial.price);
  const equip={card:id,action:'equip',image:base+'2.jpg'};
  assert.throws(()=>changePortrait(e,'002',equip),/unlocked/);
  const crop={x:.4,y:.3,zoom:2,image:equip.image};
  assert.throws(()=>e.tx(()=>e.action('002','profile',{avatar:id,crop})),/unlocked/);
  e.tx(()=>e.action('001','profile',{avatar:id,crop}));
  const {playAvatar,playOverviewPlayers}=await import('../src/play-state.js');
  assert.equal(playAvatar(e,e.player('001')).image,equip.image);
  assert.equal(playOverviewPlayers(e,[{id:'001'}])[0].avatar.image,equip.image);
  changePortrait(e,'001',equip);
  assert.equal(e.state('001').inventory.find(c=>c.card===id).portrait,equip.image);
  assert.equal(galleryView(e,'002',card).pictures[0].selected,true);
  changePortrait(e,'001',{...equip,image:card.image});
  assert.equal(galleryView(e,'001',card).pictures[0].selected,true);
  assert.equal(playAvatar(e,e.player('001')).image,equip.image);
  e.run("DELETE FROM player_portraits WHERE player='001' AND card=?",id);
  assert.equal(playAvatar(e,e.player('001')).image,card.image);
});
