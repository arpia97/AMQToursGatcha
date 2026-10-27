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
        "SELECT p.*,(SELECT count(*) FROM predictions v WHERE v.pickem=p.id) AS votes FROM pickems p WHERE event_id=? ORDER BY round,id",
        event.id,
      ),
      byes: e.all(
        "SELECT team,round FROM pickem_byes WHERE event_id=? ORDER BY round",
        event.id,
      ),
    };
  }
  page(page = 1) {
    const e = this.e;
    integer(page, 1, 10000);
    const rows = e.all(
      `SELECT CASE WHEN p.event_id IS NULL THEN -p.id ELSE p.event_id END AS key,
      COALESCE(ev.name,p.tour) AS name,ev.format,COUNT(*) AS matches,
      COUNT(DISTINCT COALESCE(p.round,1)) AS rounds,SUM(p.settled) AS settled,
      SUM(CASE WHEN p.settled=0 AND p.ends>? THEN 1 ELSE 0 END) AS open,
      MIN(CASE WHEN p.settled=0 AND p.ends>? THEN p.ends END) AS nextEnds,
      MAX(p.id) AS newest FROM pickems p LEFT JOIN pickem_events ev ON ev.id=p.event_id
      GROUP BY CASE WHEN p.event_id IS NULL THEN -p.id ELSE p.event_id END
      ORDER BY newest DESC LIMIT 21 OFFSET ?`,
      e.now(),
      e.now(),
      (page - 1) * 20,
    );
    return { tours: rows.slice(0, 20), page, hasMore: rows.length > 20 };
  }
  detail(key, player) {
    const e = this.e;
    integer(key, -100000000, 100000000);
    if (!key) fail("Choose a pick’em tour.");
    const matches = e.all(
      `SELECT p.*,v.winner AS prediction,v.score_a AS prediction_a,v.score_b AS prediction_b
      FROM pickems p LEFT JOIN predictions v ON v.pickem=p.id AND v.player=?
      WHERE ${key > 0 ? "p.event_id=?" : "p.id=? AND p.event_id IS NULL"} ORDER BY p.round,p.id`,
      player || "",
      Math.abs(key),
    );
    if (!matches.length) fail("Pick’em tour not found.", 404);
    const event =
      key > 0
        ? e.one("SELECT name,format FROM pickem_events WHERE id=?", key)
        : null;
    return {
      key,
      name: event?.name || matches[0].tour,
      format: event?.format || null,
      matches,
      byes:
        key > 0
          ? e.all(
              "SELECT team,round FROM pickem_byes WHERE event_id=? ORDER BY round",
              key,
            )
          : [],
    };
  }
  match(id) {
    const p = this.e.one(
      "SELECT p.*,(SELECT count(*) FROM predictions v WHERE v.pickem=p.id) AS votes FROM pickems p WHERE p.id=?",
      integer(id, 1),
    );
    if (!p) fail("Pick’em not found.", 404);
    return p;
  }
  assertUnchanged(p, expected) {
    const fields = [
      "id",
      "title",
      "tour",
      "team_a",
      "team_b",
      "ends",
      "winner_reward",
      "score_reward",
      "settled",
      "votes",
    ];
    if (!expected || fields.some((k) => p[k] !== expected[k]))
      fail("This pick’em changed. Reload it and review again.", 409);
    if (p.settled)
      fail(
        "Settled pick’ems cannot be edited or deleted because rewards have been paid.",
        409,
      );
  }
  action(action, b) {
    const e = this.e;
    if (action === "pickem-event-edit") {
      const event = e.one(
        "SELECT * FROM pickem_events WHERE id=?",
        integer(b.event, 1),
      );
      if (!event) fail("Pick’em tour not found.", 404);
      if (event.name !== b.expectedName)
        fail("The tour name changed. Reload it and review again.", 409);
      const name = text(b.name, 100);
      e.run("UPDATE pickem_events SET name=? WHERE id=?", name, event.id);
      const prefix = event.name + " · ";
      e.run(
        "UPDATE pickems SET tour=?,title=CASE WHEN instr(title,?)=1 THEN ?||substr(title,length(?)+1) ELSE title END WHERE event_id=?",
        name,
        prefix,
        name + " · ",
        prefix,
        event.id,
      );
      return { message: "Tour name updated." };
    }
    if (action === "pickem-edit" || action === "pickem-delete") {
      const p = this.match(b.pickem);
      this.assertUnchanged(p, b.expected);
      if (action === "pickem-delete") {
        if (b.confirmation !== `DELETE PICKEM ${p.id}`)
          fail("Confirm deletion of this pick’em.");
        e.run("DELETE FROM predictions WHERE pickem=?", p.id);
        e.run("DELETE FROM pickems WHERE id=?", p.id);
        return {
          message:
            "Pick’em deleted. Its predictions were removed; no credits were changed.",
        };
      }
      const title = text(b.title),
        teamA = text(b.teamA, 100),
        teamB = text(b.teamB, 100);
      if (teamA.toLowerCase() === teamB.toLowerCase())
        fail("Choose two different teams.");
      const ends =
        b.ends === p.ends
          ? p.ends
          : integer(b.ends, e.now() + 60000, e.now() + 90 * 86400000);
      const winner = integer(b.winnerReward, 0, 100000),
        score = integer(b.scoreReward, 0, 100000);
      const changedTeams = teamA !== p.team_a || teamB !== p.team_b;
      if (changedTeams && p.votes && b.clearPredictions !== true)
        fail(
          "Changing teams clears existing predictions. Confirm this before saving.",
          409,
        );
      if (changedTeams) e.run("DELETE FROM predictions WHERE pickem=?", p.id);
      e.run(
        "UPDATE pickems SET title=?,team_a=?,team_b=?,ends=?,winner_reward=?,score_reward=? WHERE id=?",
        title,
        teamA,
        teamB,
        ends,
        winner,
        score,
        p.id,
      );
      return { message: "Pick’em updated." };
    }
    if (action === "pickem-event-delete") {
      const event = this.read(b.event);
      if (event.matches.some((p) => p.settled))
        fail(
          "A tour with settled pick’ems cannot be deleted because rewards have been paid.",
          409,
        );
      const ids = event.matches.map((p) => p.id);
      const votes = event.matches.reduce((n, p) => n + p.votes, 0);
      if (
        JSON.stringify(ids) !== JSON.stringify(b.expectedIds) ||
        votes !== b.expectedVotes
      )
        fail("The tour changed. Reload it and review deletion again.", 409);
      if (b.confirmation !== `DELETE TOUR ${event.id}`)
        fail("Confirm deletion of this tour.");
      e.run(
        "DELETE FROM predictions WHERE pickem IN (SELECT id FROM pickems WHERE event_id=?)",
        event.id,
      );
      e.run("DELETE FROM pickems WHERE event_id=?", event.id);
      e.run("DELETE FROM pickem_byes WHERE event_id=?", event.id);
      e.run("DELETE FROM pickem_events WHERE id=?", event.id);
      return { message: "Tour pick’ems deleted. No credits were changed." };
    }
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
