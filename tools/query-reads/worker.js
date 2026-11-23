import { DurableObject } from "cloudflare:workers";
import { Engine } from "../../src/engine.js";

// Synthetic distributions, with sizes taken from aggregate production counts.
function seed(e) {
  function insert(n, columns, select) {
    // Bound individual SQLite statements during fixture creation.
    for (let start = 1; start <= n; start += 10000)
      e.run(`WITH RECURSIVE items(i) AS (VALUES(CAST(? AS INTEGER)) UNION ALL SELECT i+1 FROM items WHERE i<?)
        INSERT INTO ${columns} SELECT ${select} FROM items`, start, Math.min(n, start + 9999));
  }
  insert(601, "players(id,name,earned)", "i,'Player '||i,i");
  insert(1106, "aliases(alias,player)", "'alias-'||i,1+(i-1)%601");
  insert(182, "usernames(username,player,label,at)", "'handle'||i,i,'Handle '||i,1");
  insert(8236, "catalog(id,kind,name)", "'local-'||i,CASE WHEN i<=25 THEN 'character' ELSE 'seiyuu' END,CASE WHEN i%100=0 THEN 'Test Singer ' ELSE 'Card ' END||i");
  // 616 packed character buckets, including matches in multiple buckets. Keep payloads at
  // their real per-bucket scale and exercise both catalog sources in a combined search.
  e.catalogStore.tenrai.initialize();
  for (let bucket = 0; bucket < 616; bucket++) {
    const cards = {};
    for (let slot = 0; slot < (bucket < 495 ? 244 : 243); slot++) {
      const id = "mal-character-" + (bucket * 500 + slot + 1);
      const name = slot === 10 && bucket % 20 === 0 ? "Test Singer " + bucket : "Character " + id;
      cards[id] = {id, kind:"character", role:"main", name};
    }
    e.run("INSERT INTO tenrai_characters VALUES(?,?,?,?,?)",bucket,JSON.stringify(cards),
      Object.keys(cards).length,0,Object.values(cards).map(c=>c.name.toLowerCase()).join(" "));
  }
  const key = "printf('series-%05d',(i*13)%12000)";
  insert(150183, "character_series(card,series_key,romaji,english)", `'card-'||i,${key},${key},''`);
  insert(150183, "character_appearances", `'card-'||i,${key},${key},'',1,'main',100`);
  const second = "printf('series-%05d',(i*13+1)%12000)";
  insert(99191, "character_appearances", `'card-'||i,${second},${second},'',2,'supporting',50`);
  insert(210, "inventory(player,card,copies,level)", "'1','card-'||(i*31),1,1");
  insert(2374, "inventory(player,card,copies,level)", "'2','card-'||(i*31),1,1");
  insert(57052, "inventory(player,card,copies,level)", "3+((i-1)%284),'card-'||i,1,1");
  insert(4, "profile_anime(player,series_key,at)", "'1',printf('series-%05d',(i*31*13)%12000),1");
  insert(1520, "auctions(card,kind,starts,ends,seller,paid)", "'extra-'||i,'character',0,42,1+(i%601),i%10<>0");
  insert(10662, "predictions(pickem,player,winner,score_a,score_b)", "1+(i-1)/601,1+(i-1)%601,'a',1,0");
  insert(18, "pickems(id,title,tour,team_a,team_b,ends,winner_reward,score_reward,settled,result_a,result_b)", "i,'Test','Test','A','B',0,0,0,1,1,0");
}
export class ReadBenchmark extends DurableObject {
  fetch() {
    let reads = 0, writes = 0, pickReads = 0;
    const engine = () => new Engine((sql, ...args) => {
      const cursor = this.ctx.storage.sql.exec(sql, ...args);
      const rows = cursor.toArray();
      reads += cursor.rowsRead;
      writes += cursor.rowsWritten;
      if (sql.includes("FROM predictions v JOIN pickems")) pickReads += cursor.rowsRead;
      return rows;
    }, fn => this.ctx.storage.transactionSync(fn), () => 100000);
    let e = engine();
    seed(e);
    const cases = [];
    const measure = (label, fn) => {
      reads = writes = pickReads = 0;
      const result = fn();
      cases.push({label, reads, writes, pickReads, result});
    };
    // Simulate the first actor startup against an already populated, pre-change schema.
    for (const name of ["aliases_player_alias", "predictions_player_pickem", "auction_seller_open_cards", "character_series_key_card"])
      e.run("DROP INDEX IF EXISTS " + name);
    e.run("CREATE INDEX IF NOT EXISTS character_series_key ON character_series(series_key)");
    measure("first startup on existing data", () => { e = engine(); return "started"; });
    measure("catalog search", () => e.catalogStore.page("seiyuu", "test singer", 1, 40, {sort:"name"}));
    measure("combined catalog search", () => e.catalogStore.page("both", "test singer", 1, 40, {sort:"name"}));
    for (const player of ["1", "2"]) {
      e = engine();
      for (const pass of ["first", "repeat"])
        measure("collection " + player + " " + pass, () => e.economy.anime.page(player));
    }
    measure("player alias search", () => e.profilesPage("alias-1106"));
    measure("player search page 2", () => e.profilesPage("alias", 2));
    measure("profile pick'em", () => e.profile("3").stats);
    return Response.json(cases);
  }
}
export default {fetch(request, env) { return env.GAME.getByName("synthetic").fetch(request); }};
