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
    e.run(
      "CREATE INDEX IF NOT EXISTS gambling_history ON gambling_rounds(player,game,id)",
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
  history(player, page = 1) {
    integer(page, 1, 10000);
    const current = this.read(player);
    const rows = this.e.all(
      "SELECT id,stake,payout,at,outcome FROM gambling_rounds WHERE player=? AND game='mahjong' AND json_extract(outcome,'$.status') IN ('won','ended','exhausted') ORDER BY id DESC LIMIT 11 OFFSET ?",
      player,
      (page - 1) * 10,
    );
    return {
      page,
      hasMore: rows.length > 10,
      items: rows.slice(0, 10).map((row) => {
        const detail =
          current?.id === row.id
            ? publicMahjong(current)
            : JSON.parse(row.outcome);
        return {
          id: row.id,
          at: row.at,
          cost: row.stake,
          payout: row.payout,
          net: row.payout - row.stake,
          status: detail.status,
          seat: detail.seat,
          indicator: detail.indicator,
          hand: Array.isArray(detail.hand) ? detail.hand : [],
          discards: Array.isArray(detail.discards) ? detail.discards : [],
          discardCount: Array.isArray(detail.discards)
            ? detail.discards.length
            : detail.discards || 0,
          result: detail.result || null,
        };
      }),
    };
  }
  save(player, game) {
    const visible = publicMahjong(game);
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
      JSON.stringify(visible),
      game.id,
      player,
    );
    return visible;
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
      // Preserve the last hand from releases that stored only a summary.
      if (game) this.save(player, game);
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
