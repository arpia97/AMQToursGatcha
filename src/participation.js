import { participationRoster } from "../public/participation.js";
import { tourRewardQuote, tourRewardDefaults } from "../public/tour-rewards.js";
import { fail, text } from "./engine.js";
export class Participation {
  constructor(e) {
    this.e = e;
  }
  preview(raw) {
    const roster = participationRoster(raw), names = roster.names,
      players = new Map(),
      unknown = [], resolvedNames = new Map();
    for (const name of names) {
      const p = this.e.one(
        "SELECT p.id,COALESCE(p.display_name,p.name) AS name FROM aliases a JOIN players p ON p.id=a.player WHERE a.alias=?",
        name.toLowerCase(),
      );
      if (!p) unknown.push(name);
      else { players.set(p.id, p); resolvedNames.set(name.toLowerCase(),p.id); }
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
    const seen = new Set(), teams=[];
    for(const names of roster.teams){
      const ids=names.map(name=>resolvedNames.get(name.toLowerCase())).filter(id=>{if(seen.has(id))return false;seen.add(id);return true;});
      for(let i=0;i<ids.length;i+=4)teams.push(ids.slice(i,i+4));
    }
    // A flat signup list has no submitted teams; keep its order in groups of four.
    if(roster.teams.every(row=>row.length===1)){
      const ids=teams.flat();teams.length=0;
      for(let i=0;i<ids.length;i+=4)teams.push(ids.slice(i,i+4));
    }
    const groupedTeams=roster.teams.length>1 && roster.teams.every(row=>row.length>1 && row.length<=4);
    return { players: resolved, teams, groupedTeams, ...tourRewardDefaults(resolved.length) };
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
    let hostingPlayer = null;
    if (quote.hosting) {
      const actor = e.creditAudit.actor;
      if (!actor || actor === 'host-token') fail('Sign in with your host account to receive hosting credits.', 403);
      hostingPlayer = e.player(actor);
      if (!hostingPlayer.is_admin) fail('Host access is required for hosting credits.', 403);
      e.assertAccountUnlocked(actor);
      if (e.one("SELECT player FROM tour_events WHERE category='hosting' AND event=?", event))
        fail('Hosting credits were already awarded for this tour. No credits were added.', 409);
    }
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
        const magnitude = quote.multiplier===1 ? "" : " · " + quote.multiplier + "× rewards";
        awards.push({
          player: row.player,
          reason: category,
          amount: row[category],
          event,
          note: note.slice(0, 240 - detail.length - magnitude.length) + detail + magnitude,
        });
      }
    }
    for (const award of awards) e.host("grant", award);
    if (hostingPlayer) {
      e.host('grant', {player:hostingPlayer.id,reason:'other',amount:quote.hosting,event,note:'Tour hosting: '+note.slice(0,220)});
      e.run("INSERT INTO tour_events VALUES(?,'hosting',?)",hostingPlayer.id,event);
    }
    const participation=awards.filter(a=>a.reason==="participation").reduce((n,a)=>n+a.amount,0);
    const staff=awards.filter(a=>a.reason!=="participation").reduce((n,a)=>n+a.amount,0);
    return {
      ...quote,
      participation,staff,total:participation+staff+quote.hosting,skipped,
      hostingPlayer: hostingPlayer?.id || null,
      players: quote.rows.filter(row=>!skipped.includes(row.player)).map((row) => row.player),
      message:
        "Tour rewards awarded: " +
        participation.toLocaleString("en-US") +
        " participation credits and " +
        staff.toLocaleString("en-US") +
        " staff credits; " +
        (quote.hosting ? 'plus '+quote.hosting.toLocaleString('en-US')+' hosting credits; ' : '') +
        (participation+staff+quote.hosting).toLocaleString("en-US") +
        " credits total." + (skipped.length?" Skipped "+skipped.length+" locked account(s).":""),
    };
  }
}
