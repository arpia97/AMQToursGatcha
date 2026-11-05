import { fail, integer } from "./engine.js";

export const CREDIT_WINDOWS = {
  "12h": 12 * 3600000,
  "24h": 24 * 3600000,
  "7d": 7 * 86400000,
  all: null,
};
const rewardCategory =
  "COALESCE(h.category,CASE WHEN l.reason LIKE 'participation: %' THEN 'participation' WHEN l.reason LIKE 'reporting: %' THEN 'reporting' WHEN l.reason LIKE 'counting: %' THEN 'counting' WHEN l.reason LIKE 'other: %' THEN 'other' END)";
const joins =
  " FROM ledger l LEFT JOIN players p ON p.id=l.player LEFT JOIN host_credit_issues h ON h.ledger=l.id LEFT JOIN players a ON a.id=h.actor ";
const columns = `l.*,COALESCE(p.display_name,p.name,l.player) AS player_name,COALESCE(p.is_admin,0) AS player_host,h.actor,COALESCE(a.display_name,a.name,h.actor) AS actor_name,${rewardCategory} AS category,h.event`;

export function creditActivityCSV(rows) {
  const cell = (value) => {
    let str = String(value ?? "");
    if (typeof value !== "number" && /^\s*[=+@-]/.test(str)) str = "'" + str;
    return '"' + str.replaceAll('"', '""') + '"';
  };
  return (
    "\uFEFF" +
    [
      [
        "Time (UTC)",
        "Time (KST)",
        "Player ID",
        "Player",
        "Credits",
        "Reason",
        "Issuing Host ID",
        "Issuing Host",
        "Host Category",
        "Tour / Event",
      ],
      ...rows.map((l) => [
        new Date(l.at).toISOString(),
        new Date(l.at).toLocaleString("en-GB", {
          timeZone: "Asia/Seoul",
          hour12: false,
        }),
        l.player,
        l.player_name,
        l.delta,
        l.reason,
        l.actor || "",
        l.actor === "host-token"
          ? "Host Tool"
          : l.actor_name || (l.category ? "Not recorded" : ""),
        l.category || "",
        l.event || "",
      ]),
    ]
      .map((row) => row.map(cell).join(","))
      .join("\r\n")
  );
}

export class CreditAudit {
  constructor(e) {
    this.e = e;
    this.actor = null;
    e.run(
      "CREATE TABLE IF NOT EXISTS host_credit_issues(ledger INTEGER PRIMARY KEY,actor TEXT,category TEXT NOT NULL,event TEXT)",
    );
    e.run("CREATE INDEX IF NOT EXISTS ledger_time_id ON ledger(at,id)");
  }
  asHost(actor, callback) {
    const previous = this.actor;
    this.actor = actor;
    try {
      return callback();
    } finally {
      this.actor = previous;
    }
  }
  record(category, event = null) {
    this.e.run(
      "INSERT INTO host_credit_issues(ledger,actor,category,event) VALUES(last_insert_rowid(),?,?,?)",
      this.actor,
      category,
      event,
    );
  }
  page(options = {}) {
    const kind = options.kind || "spent",
      scope = options.scope || "all",
      window = options.window || "12h";
    if (
      !["spent", "earned", "host"].includes(kind) ||
      !["all", "hosts"].includes(scope) ||
      !Object.hasOwn(CREDIT_WINDOWS, window)
    )
      fail("Choose valid credit audit filters.");
    const to = integer(
        options.to === undefined ? this.e.now() : Number(options.to),
        0,
        this.e.now(),
      ),
      from =
        CREDIT_WINDOWS[window] === null
          ? 0
          : Math.max(0, to - CREDIT_WINDOWS[window]);
    const where = ["l.at>=?", "l.at<=?"],
      args = [from, to];
    if (scope === "hosts") where.push("p.is_admin=1");
    if (options.player) {
      where.push("l.player=?");
      args.push(String(options.player));
    }
    const filter = " WHERE " + where.join(" AND ");
    const totals = this.e.one(
      `SELECT count(*) AS movements,COALESCE(sum(CASE WHEN l.delta<0 THEN -l.delta ELSE 0 END),0) AS spent,COALESCE(sum(CASE WHEN l.delta>0 THEN l.delta ELSE 0 END),0) AS earned,COALESCE(sum(CASE WHEN l.delta>0 AND ${rewardCategory} IN ('participation','counting','reporting','other') THEN l.delta ELSE 0 END),0) AS host_rewards` +
        joins +
        filter,
      ...args,
    );
    const condition =
      kind === "spent"
        ? "l.delta<0"
        : kind === "earned"
          ? "l.delta>0"
          : `l.delta>0 AND ${rewardCategory} IN ('participation','counting','reporting','other')`;
    const before = options.before ? integer(Number(options.before), 1) : null;
    const rows = this.e.all(
      "SELECT " +
        columns +
        joins +
        filter +
        " AND " +
        condition +
        (before ? " AND l.id<?" : "") +
        " ORDER BY l.id DESC LIMIT 101",
      ...args,
      ...(before ? [before] : []),
    );
    const visible = rows.slice(0, 100);
    return {
      from,
      to,
      kind,
      scope,
      window,
      player: options.player || "",
      totals,
      rows: visible,
      hasMore: rows.length > 100,
      next: visible.at(-1)?.id || null,
    };
  }
  recentCSV() {
    const to = this.e.now(),
      from = Math.max(0, to - CREDIT_WINDOWS["12h"]);
    return creditActivityCSV(
      this.e.all(
        "SELECT " +
          columns +
          joins +
          " WHERE l.at>=? AND l.at<=? ORDER BY l.at DESC,l.id DESC",
        from,
        to,
      ),
    );
  }
}
