import { TOUR_REWARDS } from "../public/site-defaults.js";
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
  grant(b) {
    const e = this.e,
      { players } = this.preview(b.text),
      event = text(b.event, 240),
      note = text(b.note, 240),
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
    for (const p of players)
      e.host("grant", {
        player: p.id,
        amount,
        reason: "participation",
        event,
        note,
      });
    return {
      message: `Participation awarded to ${players.length} players: ${amount.toLocaleString("en-US")} each, ${(amount * players.length).toLocaleString("en-US")} credits total.`,
      players: players.map((p) => p.id),
      total: amount * players.length,
    };
  }
}
