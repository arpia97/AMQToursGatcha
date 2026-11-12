import { participationNames } from "../public/participation.js";
import { tourRewardQuote, tourRewardDefaults } from "../public/tour-rewards.js";
import { fail, text } from "./engine.js";
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
          ". Scan aliases, then review again.",
      );
    const resolved = [...players.values()].sort((a, b) =>
      a.id.localeCompare(b.id),
    );
    return { players: resolved, ...tourRewardDefaults(resolved.length) };
  }
  grant(b) {
    const e = this.e,
      { players } = this.preview(b.text),
      event = text(b.event, 240),
      note = text(b.note?.trim() || "Tour participation", 240);
    if (
      JSON.stringify(players.map((p) => p.id)) !==
      JSON.stringify(b.expectedPlayers)
    )
      fail("The resolved participants changed. Review the batch again.", 409);
    const quote = tourRewardQuote(players, b),
      awards = [], skipped = [];
    for (const row of quote.rows) {
      const p = e.player(row.player);
      if(p.account_locked){skipped.push(row.player);continue;}
      for (const category of ["participation", "counting", "reporting"]) {
        if (!row[category]) continue;
        if (
          e.one(
            "SELECT player FROM tour_events WHERE player=? AND category=? AND event=?",
            row.player,
            category,
            event,
          )
        )
          fail(
            (category === "participation" ? "Participation" : "Staff credits") +
              " already awarded for this tour to " +
              p.name +
              ". No credits were added.",
            409,
          );
        const detail =
          category === "participation"
            ? " · " +
              row.rounds +
              "/" +
              quote.maxRounds +
              " rounds · " +
              quote.tourSize +
              " players" +
              (row.replaces ? " · Sub" : "")
            : " · " + category + " · Flat reward";
        awards.push({
          player: row.player,
          reason: category,
          amount: row[category],
          event,
          note: note.slice(0, 240 - detail.length) + detail,
        });
      }
    }
    for (const award of awards) e.host("grant", award);
    const participation=awards.filter(a=>a.reason==="participation").reduce((n,a)=>n+a.amount,0);
    const staff=awards.filter(a=>a.reason!=="participation").reduce((n,a)=>n+a.amount,0);
    return {
      ...quote,
      participation,staff,total:participation+staff,skipped,
      players: quote.rows.filter(row=>!skipped.includes(row.player)).map((row) => row.player),
      message:
        "Tour rewards awarded: " +
        participation.toLocaleString("en-US") +
        " participation credits and " +
        staff.toLocaleString("en-US") +
        " staff credits; " +
        (participation+staff).toLocaleString("en-US") +
        " credits total." + (skipped.length?" Skipped "+skipped.length+" locked account(s).":""),
    };
  }
}
