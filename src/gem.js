import { fail } from "./engine.js";
import {
  GEM_CLICK_PRICE,
  gemCounts,
  gemValue,
  nextFacetChance,
} from "../public/gem-rules.js";
export class GemFaceting {
  constructor(e) {
    this.e = e;
    e.run(
      "CREATE TABLE IF NOT EXISTS gem_games(player TEXT PRIMARY KEY,data TEXT NOT NULL)",
    );
  }
  read(player) {
    const row = this.e.one("SELECT data FROM gem_games WHERE player=?", player);
    return row ? JSON.parse(row.data) : null;
  }
  save(player, g) {
    this.e.run(
      "INSERT INTO gem_games VALUES(?,?) ON CONFLICT(player) DO UPDATE SET data=excluded.data",
      player,
      JSON.stringify(g),
    );
    this.e.run(
      "UPDATE gambling_rounds SET stake=?,payout=?,net=?,outcome=? WHERE id=? AND player=?",
      g.cost,
      g.payout,
      g.payout - g.cost,
      JSON.stringify(g),
      g.id,
      player,
    );
    return g;
  }
  action(player, action, b) {
    if (!action.startsWith("gem-")) return null;
    const e = this.e,
      g = this.read(player);
    if (action === "gem-start") {
      if (g?.status === "active")
        fail("Finish your current gem before starting another.", 409);
      if (b.previousGame !== (g?.id ?? null))
        fail("Your gem changed. Refresh before starting.", 409);
      const row = e.one(
        "INSERT INTO gambling_rounds(player,game,stake,payout,net,outcome,at) VALUES(?,'faceting',0,0,0,'{}',?) RETURNING id",
        player,
        e.now(),
      );
      return {
        message: "Your uncut gem is ready. Each facet costs 50 credits.",
        gem: this.save(player, {
          id: row.id,
          version: 0,
          good: [],
          bad: [],
          chance: 75,
          cost: 0,
          payout: 0,
          status: "active",
          last: null,
        }),
      };
    }
    if (action !== "gem-facet") fail("Unknown faceting action.", 404);
    if (!g || g.status !== "active") fail("Start a gem first.", 409);
    if (b.game !== g.id || b.version !== g.version)
      fail("Your gem changed. Refresh before faceting.", 409);
    if (!["good", "bad"].includes(b.row) || g[b.row].length >= 10)
      fail("Choose a row with an empty node.");
    e.wallet(
      player,
      -GEM_CLICK_PRICE,
      "Gem faceting: " + (b.row === "good" ? "Brilliance" : "Fractures"),
    );
    const success = e.rand(100) < g.chance;
    g.last = { row: b.row, success, chance: g.chance };
    g[b.row].push(success);
    g.chance = nextFacetChance(g.chance, success);
    g.cost += GEM_CLICK_PRICE;
    g.version++;
    if (g.good.length === 10 && g.bad.length === 10) {
      const counts = gemCounts(g);
      g.payout = gemValue(counts.good, counts.bad);
      g.status = "complete";
      if (g.payout) e.wallet(player, g.payout, "Gem faceting: completed gem");
    }
    return {
      message:
        g.status === "complete"
          ? "Gem complete. " +
            g.payout.toLocaleString("en-US") +
            " credits paid."
          : success
            ? b.row === "good"
              ? "Brilliance gained."
              : "A fracture formed."
            : "Facet failed. The next chance is shown on your gem.",
      gem: this.save(player, g),
    };
  }
}
