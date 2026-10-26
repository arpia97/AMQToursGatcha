import { fail, integer } from "./engine.js";
import {
  dealMahjong,
  replaceMahjong,
  scoreMahjong,
  publicMahjong,
  MAHJONG_START,
  MAHJONG_DISCARD,
  exhaustMahjong,
  declareRiichi,
  MAHJONG_RIICHI,
  kanMahjong,
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
    e.run(
      "CREATE INDEX IF NOT EXISTS mahjong_receipt_hand ON receipts(json_extract(result,'$.mahjong.id')) WHERE json_extract(result,'$.mahjong.id') IS NOT NULL",
    );
    if (
      !e.one(
        "SELECT key FROM catalog_meta WHERE key='mahjong-history-retention'",
      )
    )
      e.tx(() => {
        this.prune();
        e.run(
          "INSERT INTO catalog_meta VALUES('mahjong-history-retention','50')",
        );
      });
  }
  prune(player = null) {
    const e = this.e;
    const old = player
      ? "SELECT id FROM gambling_rounds WHERE player=? AND game='mahjong' ORDER BY id DESC LIMIT -1 OFFSET 50"
      : "SELECT id FROM (SELECT id,row_number() OVER(PARTITION BY player ORDER BY id DESC) AS n FROM gambling_rounds WHERE game='mahjong') WHERE n>50";
    const args = player ? [player] : [];
    // Preserve economic totals and idempotency keys; only hand detail is removed.
    const scopes = player
      ? ["start", "discard", "riichi", "kan", "tsumo", "end"].map(
          (a) => player + ":mahjong-" + a,
        )
      : [];
    e.run(
      `UPDATE receipts SET result='{"message":"This Mahjong action was already applied. Older hand details were archived."}' WHERE ${player ? "scope IN (" + scopes.map(() => "?").join(",") + ") AND " : ""}json_extract(result,'$.mahjong.id') IS NOT NULL AND json_extract(result,'$.mahjong.id') IN (${old})`,
      ...scopes,
      ...args,
    );
    e.run(
      `UPDATE gambling_rounds SET outcome='{"status":"archived"}' WHERE id IN (${old}) AND outcome!='{"status":"archived"}'`,
      ...args,
    );
  }
  read(player) {
    const row = this.e.one(
      "SELECT data FROM mahjong_games WHERE player=?",
      player,
    );
    return row ? JSON.parse(row.data) : null;
  }
  reversalPreview(player, limit = 100) {
    const e = this.e,
      id = e.resolvePlayer(String(player || '').trim());
    integer(limit, 1, 100);
    e.player(id);
    const rounds = e.all(
      "SELECT id,stake,payout FROM gambling_rounds WHERE player=? AND game='mahjong' ORDER BY id DESC LIMIT ?",
      id,
      limit,
    );
    const current = this.read(id);
    const active =
      current?.status === "active"
        ? { id: current.id, version: current.version }
        : null;
    const adjustment = rounds.reduce((sum, r) => sum + r.stake - r.payout, 0);
    return {
      player: id,
      limit,
      count: rounds.length,
      rounds,
      active,
      adjustment,
      balance: e.player(id).balance,
    };
  }
  reverse(body) {
    const e = this.e,
      p = this.reversalPreview(body.player, body.limit);
    if (body.confirmation !== `REVERT MAHJONG ${p.player} ${p.limit}`)
      fail("Exact Mahjong reversal confirmation required.");
    if (!p.count) fail("There are no Mahjong hands to reverse.", 409);
    if (
      JSON.stringify(body.expectedRounds) !== JSON.stringify(p.rounds) ||
      JSON.stringify(body.expectedActive) !== JSON.stringify(p.active)
    )
      fail(
        "The selected Mahjong hands changed. Preview again before reversing.",
        409,
      );
    if (p.balance + p.adjustment < 0)
      fail(
        "This reversal would make the balance negative. No changes applied.",
        409,
      );
    const ids = p.rounds.map((r) => r.id),
      slots = ids.map(() => "?").join(",");
    if (p.adjustment)
      e.wallet(
        p.player,
        p.adjustment,
        `Host reversal: latest ${p.count} Mahjong hands`,
      );
    e.run(
      `UPDATE gambling_rounds SET game='mahjong-reverted' WHERE player=? AND id IN (${slots})`,
      p.player,
      ...ids,
    );
    e.run(
      `UPDATE receipts SET result='{"message":"This Mahjong action was already applied and its hand was later reverted by the host."}' WHERE json_extract(result,'$.mahjong.id') IS NOT NULL AND json_extract(result,'$.mahjong.id') IN (${slots})`,
      ...ids,
    );
    const current = this.read(p.player);
    if (current && ids.includes(current.id))
      e.run("DELETE FROM mahjong_games WHERE player=?", p.player);
    return {
      message: `Reverted ${p.count} Mahjong hands.`,
      player: p.player,
      count: p.count,
      roundIds: ids,
      adjustment: p.adjustment,
      balance: e.player(p.player).balance,
    };
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
          tenpai: detail.tenpai ?? null,
          refund: detail.refund || 0,
          riichi: detail.riichi || 0,
          riichiReturned: detail.riichiReturned || 0,
          uraIndicator: detail.uraIndicator ?? null,
          uraIndicators: detail.uraIndicators || [],
          indicators:
            detail.indicators ||
            (detail.indicator == null ? [] : [detail.indicator]),
          melds: detail.melds || [],
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
    if (game.version === 0) this.prune(player);
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
    if (
      ![
        "mahjong-discard",
        "mahjong-riichi",
        "mahjong-kan",
        "mahjong-tsumo",
        "mahjong-end",
      ].includes(action)
    )
      fail("Unknown Mahjong action.", 404);
    if (!game || game.status !== "active")
      fail("There is no active Mahjong hand.", 409);
    if (body.game !== game.id || body.version !== game.version)
      fail("Your Mahjong hand changed. Refresh before acting.", 409);
    if (action === "mahjong-kan") {
      const next = kanMahjong(game, integer(body.tile, 0, 33));
      if (!next)
        fail(
          "This concealed Kan is not legal, or no dead-wall replacement is available.",
          409,
        );
      if (next.refund)
        e.wallet(player, next.refund, "Mahjong: tenpai entry fee refund");
      return {
        message:
          next.status === "exhausted"
            ? next.tenpai
              ? "Tenpai! Your 1,000-credit hand fee was refunded."
              : "Not tenpai. Start a new hand?"
            : "Kan! Replacement drawn from the dead wall; a new dora indicator is revealed.",
        mahjong: this.save(player, next),
      };
    }
    if (action === "mahjong-discard" || action === "mahjong-riichi") {
      integer(body.index, 0, game.hand.length - 1);
      if (!game.wall.length)
        fail("The wall is empty. Claim tsumo or end this hand.", 409);
      if (game.riichi && body.index !== game.hand.length - 1)
        fail("After Riichi, only the newly drawn tile may be discarded.", 409);
      const declaring = action === "mahjong-riichi";
      const next = declaring
        ? declareRiichi(game, body.index)
        : replaceMahjong(game, body.index);
      if (!next)
        fail(
          "Riichi requires a tenpai-preserving discard, no previous Riichi, and at least four live tiles.",
          409,
        );
      e.wallet(
        player,
        -(MAHJONG_DISCARD + (declaring ? MAHJONG_RIICHI : 0)),
        declaring
          ? "Mahjong: Riichi stake and discard/draw"
          : "Mahjong: discard and draw",
      );
      if (next.refund)
        e.wallet(player, next.refund, "Mahjong: tenpai entry fee refund");
      return {
        message:
          next.status === "exhausted"
            ? next.tenpai
              ? "Tenpai! Your 1,000-credit hand fee was refunded."
              : "Not tenpai. The wall is empty. Start a new hand?"
            : declaring
              ? (next.riichi === 2 ? "Double Riichi" : "Riichi") +
                " declared. Your hand is locked; ippatsu applies to this first draw."
              : "Tile replaced. Three opponents also draw when tiles remain.",
        mahjong: this.save(player, next),
      };
    }
    if (action === "mahjong-tsumo") {
      const score = scoreMahjong(game, { revealUra: true });
      if (!score) fail("This hand does not qualify for tsumo.", 409);
      game.riichiReturned = game.riichi ? game.riichiStake || 0 : 0;
      e.wallet(
        player,
        score.payout + game.riichiReturned,
        "Mahjong: tsumo" +
          (game.riichiReturned ? " and Riichi stake returned" : ""),
      );
      game.status = "won";
      game.payout = score.payout + game.riichiReturned;
      game.result = score;
    } else {
      if (!game.wall.length) {
        exhaustMahjong(game);
        if (game.refund)
          e.wallet(player, game.refund, "Mahjong: tenpai entry fee refund");
      } else game.status = "ended";
    }
    game.version++;
    return {
      message:
        game.status === "won"
          ? "Tsumo! " + game.payout.toLocaleString("en-US") + " credits won."
          : game.status === "exhausted"
            ? game.tenpai
              ? "Tenpai! Your 1,000-credit hand fee was refunded."
              : "Not tenpai. Start a new hand?"
            : "Hand ended. Entry and discard costs are not refunded.",
      mahjong: this.save(player, game),
    };
  }
}
