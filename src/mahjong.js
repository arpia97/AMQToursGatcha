import { fail, integer } from "./engine.js";
import {
  dealMahjong,
  replaceMahjong,
  scoreMahjong,
  publicMahjong,
  MAHJONG_START,
  MAHJONG_DISCARD,
} from "../public/mahjong-rules.js";

export class Mahjong {
  constructor(e) {
    this.e = e;
    e.run(
      "CREATE TABLE IF NOT EXISTS mahjong_games(player TEXT PRIMARY KEY, data TEXT NOT NULL)",
    );
  }
  read(player) {
    const row = this.e.one(
      "SELECT data FROM mahjong_games WHERE player=?",
      player,
    );
    return row ? JSON.parse(row.data) : null;
  }
  state(player) {
    return player ? publicMahjong(this.read(player)) : null;
  }
  save(player, game) {
    this.e.run(
      "INSERT INTO mahjong_games(player,data) VALUES(?,?) ON CONFLICT(player) DO UPDATE SET data=excluded.data",
      player,
      JSON.stringify(game),
    );
    this.e.run(
      "UPDATE gambling_rounds SET stake=?,payout=?,net=?,outcome=? WHERE id=? AND player=?",
      game.cost,
      game.payout,
      game.payout - game.cost,
      JSON.stringify({
        status: game.status,
        seat: game.seat,
        discards: game.discards.length,
        result: game.result,
      }),
      game.id,
      player,
    );
    return publicMahjong(game);
  }
  action(player, action, body) {
    if (!action.startsWith("mahjong-")) return null;
    const e = this.e,
      game = this.read(player);
    if (action === "mahjong-start") {
      if (game?.status === "active")
        fail("Finish or end your current hand first.", 409);
      if (body.previousGame !== (game?.id ?? null))
        fail("Your Mahjong hand changed. Refresh before starting.", 409);
      e.wallet(player, -MAHJONG_START, "Mahjong: start hand");
      const next = dealMahjong(e.rand);
      const row = e.one(
        "INSERT INTO gambling_rounds(player,game,stake,payout,net,outcome,at) VALUES(?,'mahjong',?,0,?,'{}',?) RETURNING id",
        player,
        MAHJONG_START,
        -MAHJONG_START,
        e.now(),
      );
      next.id = row.id;
      return {
        message: "Your Mahjong hand is ready.",
        mahjong: this.save(player, next),
      };
    }
    if (!["mahjong-discard", "mahjong-tsumo", "mahjong-end"].includes(action))
      fail("Unknown Mahjong action.", 404);
    if (!game || game.status !== "active")
      fail("There is no active Mahjong hand.", 409);
    if (body.game !== game.id || body.version !== game.version)
      fail("Your Mahjong hand changed. Refresh before acting.", 409);
    if (action === "mahjong-discard") {
      integer(body.index, 0, 13);
      if (!game.wall.length)
        fail("The wall is empty. Claim tsumo or end this hand.", 409);
      e.wallet(player, -MAHJONG_DISCARD, "Mahjong: discard and draw");
      return {
        message: "Tile replaced.",
        mahjong: this.save(player, replaceMahjong(game, body.index)),
      };
    }
    if (action === "mahjong-tsumo") {
      const score = scoreMahjong(game);
      if (!score) fail("This hand does not qualify for tsumo.", 409);
      e.wallet(player, score.payout, "Mahjong: tsumo");
      game.status = "won";
      game.payout = score.payout;
      game.result = score;
    } else {
      game.status = "ended";
    }
    game.version++;
    return {
      message:
        game.status === "won"
          ? "Tsumo! " + game.payout.toLocaleString("en-US") + " credits won."
          : "Hand ended. Entry and discard costs are not refunded.",
      mahjong: this.save(player, game),
    };
  }
}
