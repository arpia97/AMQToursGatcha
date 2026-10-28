import { fail } from "./engine.js";
import {
  RACE_COUNTDOWN,
  RACE_DURATION,
  RACE_MODEL,
  makeRaceField,
  quoteHorseCart,
  drawRaceOrder,
  horsePayout,
} from "../public/horse-rules.js";

export class HorseRacing {
  constructor(e) {
    this.e = e;
    e.run(
      "CREATE TABLE IF NOT EXISTS horse_games(player TEXT PRIMARY KEY,data TEXT NOT NULL)",
    );
  }
  read(player) {
    const row = this.e.one(
      "SELECT data FROM horse_games WHERE player=?",
      player,
    );
    return row ? JSON.parse(row.data) : null;
  }
  view(player) {
    const g = this.read(player);
    if (!g) return null;
    // Betting is already locked when the animation plan is exposed. Payouts stay
    // private until server-clock settlement; client animation never awards credits.
    const { payout, ticketResults, ...out } = g;
    return g.status === "complete"
      ? { ...out, payout, tickets: ticketResults }
      : out;
  }
  save(player, g) {
    this.e.run(
      "INSERT INTO horse_games VALUES(?,?) ON CONFLICT(player) DO UPDATE SET data=excluded.data",
      player,
      JSON.stringify(g),
    );
    this.e.run(
      "UPDATE gambling_rounds SET stake=?,payout=?,net=?,outcome=? WHERE id=? AND player=?",
      g.stake,
      g.status === "complete" ? g.payout : 0,
      (g.status === "complete" ? g.payout : 0) - g.stake,
      JSON.stringify(g),
      g.id,
      player,
    );
  }
  settleDue(player) {
    const g = this.read(player);
    if (!g || g.status !== "running" || this.e.now() < g.endsAt) return false;
    if (g.payout)
      this.e.wallet(player, g.payout, "Horse racing: winning tickets");
    g.status = "complete";
    g.version++;
    this.save(player, g);
    return true;
  }
  action(player, action, b) {
    if (!action.startsWith("horse-")) return null;
    const e = this.e;
    this.settleDue(player);
    let g = this.read(player);
    if (action === "horse-prepare") {
      if (g && g.status !== "complete")
        fail(
          "Your current race is already prepared. Finish it before drawing another field.",
          409,
        );
      if (b.previousRace !== (g?.id ?? null))
        fail("Your race changed. Refresh before preparing another.", 409);
      const field = makeRaceField(e.rand);
      const id = e.one(
        "INSERT INTO gambling_rounds(player,game,stake,payout,net,outcome,at) VALUES(?,'horse-racing',0,0,0,'{}',?) RETURNING id",
        player,
        e.now(),
      ).id;
      g = {
        id,
        version: 0,
        model: RACE_MODEL,
        status: "betting",
        field,
        tickets: [],
        stake: 0,
        createdAt: e.now(),
      };
      this.save(player, g);
      e.run(
        "UPDATE gambling_rounds SET outcome='{}' WHERE player=? AND game='horse-racing' AND outcome!='{}' AND id NOT IN (SELECT id FROM gambling_rounds WHERE player=? AND game='horse-racing' ORDER BY id DESC LIMIT 50)",
        player,
        player,
      );
      return {
        message: "The runners are ready. Odds are locked for this field.",
        horseRace: this.view(player),
      };
    }
    if (action !== "horse-start") fail("Unknown racing action.", 404);
    if (
      !g ||
      g.status !== "betting" ||
      b.race !== g.id ||
      b.version !== g.version
    )
      fail(
        "This race changed or betting has closed. Refresh before buying tickets.",
        409,
      );
    const quote = quoteHorseCart(g.field, b.tickets);
    e.wallet(player, -quote.stake, "Horse racing: tickets");
    const order = drawRaceOrder(g.field, e.rand),
      result = horsePayout(quote.tickets, order, g.field);
    g = {
      ...g,
      status: "running",
      version: g.version + 1,
      stake: quote.stake,
      tickets: quote.tickets,
      order,
      animationSeed: e.rand(100000000),
      startsAt: e.now() + RACE_COUNTDOWN,
      endsAt: e.now() + RACE_COUNTDOWN + RACE_DURATION,
      payout: result.payout,
      ticketResults: result.tickets,
    };
    this.save(player, g);
    return {
      message: "Tickets purchased. The gates are opening!",
      horseRace: this.view(player),
    };
  }
}
