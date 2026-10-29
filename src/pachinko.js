import { fail, integer } from "./engine.js";
import {
  ROULETTE_DURATION,
  ROULETTE_POCKETS,
  ROULETTE_RETURNS,
  CLIMB_ENTRY,
  CLIMB_CHOICES,
  CLIMB_OPTIONS,
  climbOffers,
  climbHeight,
  climbPayout,
  climbInMetres,
  climbDistance,
} from "../public/pachinko-rules.js";

export class Pachinko {
  constructor(e) {
    this.e = e;
    e.run(
      "CREATE TABLE IF NOT EXISTS pachinko_games(player TEXT PRIMARY KEY,data TEXT NOT NULL)",
    );
    e.run(
      "CREATE INDEX IF NOT EXISTS gambling_player_game ON gambling_rounds(player,game,id)",
    );
  }
  read(player) {
    const row =
      player &&
      this.e.one("SELECT data FROM pachinko_games WHERE player=?", player);
    const data = row ? JSON.parse(row.data) : { roulette: null, climb: null };
    data.climb = climbInMetres(data.climb);
    return data;
  }
  view(player) {
    return this.read(player);
  }
  save(player, data, game, kind) {
    const e = this.e;
    e.run(
      "INSERT INTO pachinko_games VALUES(?,?) ON CONFLICT(player) DO UPDATE SET data=excluded.data",
      player,
      JSON.stringify(data),
    );
    e.run(
      "UPDATE gambling_rounds SET payout=?,net=?,outcome=? WHERE player=? AND id=?",
      game.payout,
      game.payout - game.stake,
      JSON.stringify(game),
      player,
      game.id,
    );
    // Financial totals remain permanent; detailed old game payloads are bounded.
    if (game.version === 0)
      e.run(
        "UPDATE gambling_rounds SET outcome='{}' WHERE player=? AND game=? AND outcome!='{}' AND id NOT IN (SELECT id FROM gambling_rounds WHERE player=? AND game=? ORDER BY id DESC LIMIT 50)",
        player,
        kind,
        player,
        kind,
      );
  }
  settle(player, data) {
    const g = data.roulette,
      e = this.e;
    if (!g || g.status !== "spinning" || g.endsAt > e.now()) return false;
    g.status = "complete";
    g.version++;
    g.colour = ROULETTE_POCKETS[g.pocket];
    g.payout = g.colour === g.choice ? g.stake * ROULETTE_RETURNS[g.choice] : 0;
    if (g.payout) e.wallet(player, g.payout, "Roulette: " + g.colour + " win");
    this.save(player, data, g, "roulette");
    return true;
  }
  settleDue(player) {
    if (player) this.settle(player, this.read(player));
  }
  action(player, action, b) {
    if (!action.startsWith("roulette-") && !action.startsWith("climb-"))
      return null;
    const e = this.e,
      data = this.read(player);
    this.settle(player, data);
    const kind = action.startsWith("roulette-") ? "roulette" : "climb",
      old = data[kind];
    if (action === "roulette-start" || action === "climb-start") {
      if (old && !["complete"].includes(old.status))
        fail("Finish your current game first.", 409);
      if (b.previousGame !== (old?.id ?? null))
        fail("Your game changed. Refresh before starting.", 409);
      const stake =
        kind === "roulette" ? integer(b.stake, 1, 1000000) : CLIMB_ENTRY;
      if (kind === "roulette" && !Object.hasOwn(ROULETTE_RETURNS, b.choice))
        fail("Choose red, black or green.");
      e.wallet(
        player,
        -stake,
        kind === "roulette"
          ? "Roulette: " + b.choice + " bet"
          : "Mountain climbing: entry",
      );
      const row = e.one(
        "INSERT INTO gambling_rounds(player,game,stake,payout,net,outcome,at) VALUES(?,?,?,0,?,'{}',?) RETURNING id",
        player,
        kind,
        stake,
        -stake,
        e.now(),
      );
      const game = {
        id: row.id,
        version: 0,
        stake,
        payout: 0,
        startedAt: e.now(),
      };
      if (kind === "roulette")
        Object.assign(game, {
          status: "spinning",
          choice: b.choice,
          pocket: e.rand(37),
          endsAt: e.now() + ROULETTE_DURATION,
        });
      else
        Object.assign(game, {
          status: "active",
          height: 0,
          distanceUnit: "m",
          offers: climbOffers(e.rand),
          moves: [],
          last: null,
        });
      data[kind] = game;
      this.save(player, data, game, kind);
      return {
        message:
          kind === "roulette"
            ? "Your bet is locked. The wheel is spinning."
            : "Your climb has begun. Choose your first route.",
      };
    }
    if (action !== "climb-choose") fail("Unknown game action.", 404);
    const g = data.climb;
    if (!g || g.status !== "active") fail("Start a climb first.", 409);
    if (b.game !== g.id || b.version !== g.version)
      fail("Your climb changed. Refresh before choosing.", 409);
    const id = integer(b.option, 0, CLIMB_OPTIONS.length - 1);
    if (!g.offers.includes(id))
      fail("Choose one of your three available routes.", 409);
    const option = CLIMB_OPTIONS[id],
      delta = option.min + e.rand(option.max - option.min + 1),
      from = g.height;
    g.height = climbHeight(from, delta);
    g.last = { option: id, delta, from, to: g.height, at: e.now() };
    g.moves.push(g.last);
    g.version++;
    if (g.moves.length === CLIMB_CHOICES) {
      g.status = "complete";
      g.offers = [];
      g.payout = climbPayout(g.height);
      if (g.payout)
        e.wallet(
          player,
          g.payout,
          "Mountain climbing: final height " + climbDistance(g.height),
        );
    } else g.offers = climbOffers(e.rand);
    this.save(player, data, g, "climb");
    return {
      message:
        g.status === "complete"
          ? "Climb complete. " +
            g.payout.toLocaleString("en-US") +
            " credits paid."
          : "Your next three routes are ready.",
    };
  }
}
