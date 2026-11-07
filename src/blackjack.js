import { fail, integer } from "./engine.js";
import {
  BLACKJACK_TARGET,
  blackjackShoe,
  blackjackTotal,
  blackjackNatural,
  blackjackSettlement,
} from "../public/blackjack-rules.js";
export class Blackjack67 {
  constructor(e, pachinko) {
    this.e = e;
    this.pachinko = pachinko;
  }
  finish(player, data, g) {
    Object.assign(g, blackjackSettlement(g));
    g.status = "complete";
    g.version++;
    g.finishedAt = this.e.now();
    if (g.payout) this.e.wallet(player, g.payout, "67 Blackjack: " + g.result);
    this.pachinko.save(player, data, g, "blackjack67");
  }
  action(player, action, b) {
    const e = this.e,
      data = this.pachinko.read(player),
      old = data.blackjack;
    if (action === "blackjack-start") {
      if (old?.status === "active")
        fail("Finish your current hand first.", 409);
      if (b.previousGame !== (old?.id ?? null))
        fail("Your hand changed. Refresh before starting.", 409);
      const stake = integer(b.stake, 1, 1000000),
        shoe = blackjackShoe(e.rand);
      e.wallet(player, -stake, "67 Blackjack: bet");
      const row = e.one(
        "INSERT INTO gambling_rounds(player,game,stake,payout,net,outcome,at) VALUES(?,'blackjack67',?,0,?,'{}',?) RETURNING id",
        player,
        stake,
        -stake,
        e.now(),
      );
      const g = {
        id: row.id,
        version: 0,
        status: "active",
        stake,
        payout: 0,
        shoe,
        hand: [shoe.pop()],
        dealer: [shoe.pop()],
        startedAt: e.now(),
      };
      g.hand.push(shoe.pop());
      g.dealer.push(shoe.pop());
      data.blackjack = g;
      this.pachinko.save(player, data, g, "blackjack67");
      if (blackjackNatural(g.hand) || blackjackNatural(g.dealer))
        this.finish(player, data, g);
      return {
        message:
          g.status === "active"
            ? "Your cards are dealt. Hit or stand."
            : "Hand settled: " + g.result + ".",
      };
    }
    if (!["blackjack-hit", "blackjack-stand"].includes(action))
      fail("Unknown blackjack action.", 404);
    if (!old || old.status !== "active") fail("Start a new hand first.", 409);
    if (b.game !== old.id || b.version !== old.version)
      fail("Your hand changed. Refresh before playing.", 409);
    if (action === "blackjack-hit") {
      old.hand.push(old.shoe.pop());
      old.version++;
    }
    if (
      action === "blackjack-stand" ||
      blackjackTotal(old.hand).total >= BLACKJACK_TARGET
    )
      this.finish(player, data, old);
    else this.pachinko.save(player, data, old, "blackjack67");
    return {
      message:
        old.status === "complete"
          ? "Hand settled: " + old.result + "."
          : "Card drawn. Hit or stand.",
    };
  }
}
