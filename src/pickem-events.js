import { PICKEM_WINDOW } from "../public/site-defaults.js";
import { fail, integer, text } from "./engine.js";
import {
  validateTeams,
  roundRobin,
  swissRound,
} from "../public/pickem-formats.js";
export class PickemEvents {
  constructor(e) {
    this.e = e;
    e.run(
      "CREATE TABLE IF NOT EXISTS pickem_events(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,format TEXT NOT NULL,teams TEXT NOT NULL,created INTEGER NOT NULL)",
    );
    const columns = e.all("PRAGMA table_info(pickems)");
    for (const [name, type] of [
      ["event_id", "INTEGER"],
      ["round", "INTEGER"],
    ])
      if (!columns.some((c) => c.name === name))
        e.run(`ALTER TABLE pickems ADD COLUMN ${name} ${type}`);
    e.run(
      "CREATE INDEX IF NOT EXISTS pickem_event_round ON pickems(event_id,round,id)",
    );
    e.run(
      "CREATE TABLE IF NOT EXISTS pickem_byes(event_id INTEGER NOT NULL,round INTEGER NOT NULL,team TEXT NOT NULL,PRIMARY KEY(event_id,round),UNIQUE(event_id,team))",
    );
  }
  publish(event, rounds, deadlines, b, startRound = 1) {
    const e = this.e;
    deadlines ??= rounds.map(() => null);
    if (!Array.isArray(deadlines) || deadlines.length !== rounds.length)
      fail("Set a deadline for each round.");
    const winner = integer(b.winnerReward ?? 500, 0, 100000),
      score = integer(b.scoreReward ?? 500, 0, 100000);
    const ends = deadlines.map((d) =>
      integer(
        d ?? e.now() + PICKEM_WINDOW,
        e.now() + 60000,
        e.now() + 90 * 86400000,
      ),
    );
    if (ends.some((d, i) => i && d < ends[i - 1]))
      fail("Round deadlines must be in chronological order.");
    let count = 0;
    rounds.forEach((pairs, i) =>
      pairs.forEach(([a, c]) => {
        e.run(
          "INSERT INTO pickems(title,tour,team_a,team_b,ends,winner_reward,score_reward,event_id,round) VALUES(?,?,?,?,?,?,?,?,?)",
          `${event.name} · Round ${startRound + i} · ${a} vs ${c}`,
          event.name,
          a,
          c,
          ends[i],
          winner,
          score,
          event.id,
          startRound + i,
        );
        count++;
      }),
    );
    return {
      message: `Published ${count} pick’ems across ${rounds.length} round${rounds.length === 1 ? "" : "s"}.`,
      event: event.id,
    };
  }
  read(id) {
    const e = this.e,
      event = e.one("SELECT * FROM pickem_events WHERE id=?", integer(id, 1));
    if (!event) fail("Pick’em event not found.", 404);
    return {
      ...event,
      teams: JSON.parse(event.teams),
      matches: e.all(
        "SELECT * FROM pickems WHERE event_id=? ORDER BY round,id",
        event.id,
      ),
      byes: e.all(
        "SELECT team,round FROM pickem_byes WHERE event_id=? ORDER BY round",
        event.id,
      ),
    };
  }
  action(action, b) {
    const e = this.e;
    if (action === "pickem-event") {
      const teams = validateTeams(b.format, b.teams),
        name = text(b.name, 100);
      const swiss = b.format === "swiss" ? swissRound(teams) : null;
      const rounds = swiss ? [swiss.pairs] : roundRobin(b.format, teams);
      e.run(
        "INSERT INTO pickem_events(name,format,teams,created) VALUES(?,?,?,?)",
        name,
        b.format,
        JSON.stringify(teams),
        e.now(),
      );
      const event = e.one(
        "SELECT * FROM pickem_events WHERE id=last_insert_rowid()",
      );
      if (swiss?.bye)
        e.run("INSERT INTO pickem_byes VALUES(?,1,?)", event.id, swiss.bye);
      return this.publish(event, rounds, b.deadlines, b);
    }
    if (action !== "pickem-swiss-round") return null;
    const event = e.one(
      "SELECT * FROM pickem_events WHERE id=?",
      integer(b.event, 1),
    );
    if (event?.format !== "swiss") fail("Choose a Swiss event.");
    const matches = e.all(
      "SELECT * FROM pickems WHERE event_id=? ORDER BY round,id",
      event.id,
    );
    const round = Math.max(0, ...matches.map((m) => m.round)) + 1;
    if (b.expectedRound !== round)
      fail("The Swiss event changed. Prepare this round again.", 409);
    const teams = JSON.parse(event.teams);
    if (round > teams.length - (teams.length % 2 ? 0 : 1))
      fail("All possible rematch-free rounds have been played.");
    const { pairs, bye } = swissRound(
      teams,
      matches,
      e.all(
        "SELECT team,round FROM pickem_byes WHERE event_id=? ORDER BY round",
        event.id,
      ),
    );
    if (
      JSON.stringify(pairs) !== JSON.stringify(b.expectedPairs) ||
      (b.expectedBye ?? null) !== (bye ?? null)
    )
      fail("Swiss results or pairings changed. Review this round again.", 409);
    if (bye)
      e.run("INSERT INTO pickem_byes VALUES(?,?,?)", event.id, round, bye);
    return this.publish(event, [pairs], b.deadlines, b, round);
  }
}
