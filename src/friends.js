import { fail, integer, text } from "./engine.js";

// Directed adds: A adding B is enough to use B in A's friends filters.
export class Friends {
  constructor(e) {
    this.e = e;
    e.run("CREATE TABLE IF NOT EXISTS player_friends(player TEXT NOT NULL,friend TEXT NOT NULL,created INTEGER NOT NULL,PRIMARY KEY(player,friend),CHECK(player!=friend))");
    e.run("CREATE INDEX IF NOT EXISTS friends_incoming ON player_friends(friend,player)");
  }
  filter(column, viewer, enabled, includeSelf = false) {
    if (!enabled) return { sql: "", args: [] };
    if (!viewer) fail("Sign in to filter by friends.", 401);
    return {
      sql: " AND (" + (includeSelf ? column + "=? OR " : "") +
        "EXISTS(SELECT 1 FROM player_friends f WHERE f.player=? AND f.friend=" + column + "))",
      args: includeSelf ? [viewer, viewer] : [viewer],
    };
  }
  decorate(rows, viewer) {
    if (!rows.length) return rows;
    const ids = JSON.stringify(rows.map(p => p.id));
    const counts = new Map(this.e.all("SELECT friend,count(*) AS n FROM player_friends WHERE friend IN (SELECT value FROM json_each(?)) GROUP BY friend", ids).map(r => [r.friend,r.n]));
    const edges = viewer ? this.e.all("SELECT player,friend FROM player_friends WHERE (player=? AND friend IN (SELECT value FROM json_each(?))) OR (friend=? AND player IN (SELECT value FROM json_each(?)))", viewer, ids, viewer, ids) : [];
    const added = new Set(edges.filter(r => r.player === viewer).map(r => r.friend));
    const incoming = new Set(edges.filter(r => r.friend === viewer).map(r => r.player));
    return rows.map(p => ({ ...p, friendship: { added: added.has(p.id), mutual: added.has(p.id) && incoming.has(p.id), followers: counts.get(p.id) || 0 } }));
  }
  set(player, b) {
    const friend = this.e.resolvePlayer(text(b.player, 100));
    this.e.player(friend);
    if (friend === player) fail("You cannot add yourself.");
    if (typeof b.added !== "boolean") fail("Choose whether to add this friend.");
    if (b.added) this.e.run("INSERT OR IGNORE INTO player_friends VALUES(?,?,?)", player, friend, this.e.now());
    else this.e.run("DELETE FROM player_friends WHERE player=? AND friend=?", player, friend);
    return { player: friend, friendship: this.decorate([{id:friend}], player)[0].friendship };
  }
  page(player, view = "added", page = 1) {
    if (!player) fail("Sign in to view your friends.", 401);
    integer(page, 1, 10000);
    if (!["added","incoming"].includes(view)) fail("Choose a friends list.");
    const outgoing = view === "added", field = outgoing ? "friend" : "player";
    const rows = this.e.all(`SELECT p.id,COALESCE(p.display_name,p.name) AS name,p.avatar_card,p.avatar_crop,(SELECT level FROM inventory i WHERE i.player=p.id AND i.card=p.avatar_card) AS avatar_level FROM player_friends f JOIN players p ON p.id=f.${field} WHERE f.${outgoing ? "player" : "friend"}=? ORDER BY name COLLATE NOCASE,p.id LIMIT 26 OFFSET ?`, player, (page-1)*25);
    return { view, page, hasMore: rows.length>25, rows:this.decorate(rows.slice(0,25),player), cards:this.e.catalogStore.cards(rows.slice(0,25).map(r=>r.avatar_card).filter(Boolean)) };
  }
  notifyQuiz(player, quiz, previous, current, run, excluded = null) {
    const beats = (a,b) => a && (a.best>b.best || (a.best===b.best && (a.best_duration_ms ?? Number.MAX_SAFE_INTEGER)<(b.best_duration_ms ?? Number.MAX_SAFE_INTEGER)));
    const recipients = this.e.all("SELECT p.id,q.best,q.best_duration_ms FROM player_friends f JOIN players p ON p.id=f.player JOIN quiz_progress q ON q.player=p.id AND q.quiz=? WHERE f.friend=? AND p.notify_friends_quiz=1 AND p.account_locked=0", quiz.id, player);
    const byName = this.e.player(player).name;
    for (const recipient of recipients) {
      if (recipient.id === excluded || !beats(current,recipient) || beats(previous,recipient)) continue;
      this.e.economy.notices.add(recipient.id, `quiz-friend-beaten:${quiz.id}:${run}:${recipient.id}`, "quiz-friend-beaten", "", 1, 0, {
        quiz:quiz.id,quizName:quiz.name,byId:player,byName,score:current.best,durationMs:current.best_duration_ms,
        previousScore:recipient.best,previousDurationMs:recipient.best_duration_ms,
      });
    }
  }
}
