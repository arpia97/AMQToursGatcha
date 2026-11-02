import { TOUR_REWARDS, defaultReward } from "../public/site-defaults.js";
import { participationNames } from "../public/participation.js";
import { fail, integer, text } from "./engine.js";
export class Participation {
  constructor(e) {
    this.e = e;
  }
  preview(raw) {
    const names = participationNames(raw),
      players = new Map(),
      unknown = [];
    for (const name of names) {
      const p = this.e.one(
        "SELECT p.id,COALESCE(p.display_name,p.name) AS name FROM aliases a JOIN players p ON p.id=a.player WHERE a.alias=?",
        name.toLowerCase(),
      );
      if (!p) unknown.push(name);
      else players.set(p.id, p);
    }
    if (unknown.length)
      fail(
        "Unknown AMQ Tours aliases: " +
          unknown.join(", ") +
          ". Sync or import aliases, then review again.",
      );
    return {
      players: [...players.values()].sort((a, b) => a.id.localeCompare(b.id)),
    };
  }
  staff(rows = [], event) {
    if (!Array.isArray(rows) || rows.length > 100)
      fail("Choose at most 100 staff rewards.");
    const grouped = new Map();
    for (const row of rows) {
      if (!["counting", "reporting"].includes(row.reason))
        fail("Choose counting or reporting.");
      const player = text(row.player, 100),
        games = integer(row.games, 1, 2000);
      this.e.player(player);
      const key = player + ":" + row.reason,
        previous = grouped.get(key);
      const total = integer((previous?.games || 0) + games, 1, 2000);
      grouped.set(key, {
        player,
        reason: row.reason,
        games: total,
        amount: defaultReward(row.reason, total),
      });
    }
    const staff = [...grouped.values()];
    for (const row of staff)
      if (
        this.e.one(
          "SELECT player FROM tour_events WHERE player=? AND category=? AND event=?",
          row.player,
          row.reason,
          event,
        )
      )
        fail(
          "Staff credits already awarded for this tour. No rewards were added.",
          409,
        );
    return staff;
  }
  grant(b) {
    const e = this.e,
      { players } = this.preview(b.text),
      event = text(b.event, 240),
      note = text(b.note?.trim() || "Tour participation", 240),
      amount = integer(b.amount ?? TOUR_REWARDS.participation, 1, 1000000);
    if (
      JSON.stringify(players.map((p) => p.id)) !==
      JSON.stringify(b.expectedPlayers)
    )
      fail("The resolved participants changed. Review the batch again.", 409);
    const paid = players.filter((p) =>
      e.one(
        "SELECT player FROM tour_events WHERE player=? AND category='participation' AND event=?",
        p.id,
        event,
      ),
    );
    if (paid.length)
      fail(
        "Participation has already been awarded for this tour to: " +
          paid.map((p) => p.name).join(", ") +
          ". No credits were added.",
        409,
      );
    const staff = this.staff(b.staff, event);
    for (const p of players)
      e.host("grant", {
        player: p.id,
        amount,
        reason: "participation",
        event,
        note,
      });
    for (const s of staff)
      e.host("grant", {
        ...s,
        event,
        note: note + " · " + s.reason + " · " + s.games + " rounds",
      });
    return {
      staff,
      message: `Participation awarded to ${players.length} players: ${amount.toLocaleString("en-US")} each, ${(amount * players.length).toLocaleString("en-US")} credits total. Staff rewards: ${staff.reduce((sum, s) => sum + s.amount, 0).toLocaleString("en-US")} credits.`,
      players: players.map((p) => p.id),
      total:
        amount * players.length + staff.reduce((sum, s) => sum + s.amount, 0),
    };
  }
}
