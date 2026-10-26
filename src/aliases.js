import { fail } from "./engine.js";
export const ALIAS_SHEET =
  "https://docs.google.com/spreadsheets/d/1ihfqssregh74curDyvRE0GAFihQfovUAHpYDrtOIrOA/gviz/tq?tqx=out:csv&gid=1903970832";
export function parseCSV(raw) {
  const rows = [];
  let row = [],
    cell = "",
    quoted = false;
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (c === '"') {
      if (quoted && raw[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && raw[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (quoted) fail("Alias sheet CSV has an unfinished quoted field.");
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}
export function sheetPlayers(raw) {
  const rows = parseCSV(raw.replace(/^\uFEFF/, "")),
    header = rows.shift()?.map((x) => x.trim().toLowerCase());
  const nameCol = header?.indexOf("player name"),
    idCol = header?.indexOf("player id");
  if (nameCol < 0 || idCol < 0 || nameCol === undefined)
    fail("Expected Player Name and Player ID columns.");
  const players = new Map(),
    owners = new Map();
  for (const row of rows) {
    const name = String(row[nameCol] || "").trim(),
      id = String(row[idCol] || "")
        .trim()
        .replace(/^(\d+)\.0+$/, "$1");
    if (!name && !id) continue;
    if (!name || !/^\d+$/.test(id) || name.length > 100 || id.length > 100)
      fail("Invalid player name/ID in alias sheet.");
    const key = name.toLowerCase();
    if (owners.has(key) && owners.get(key) !== id)
      fail("The sheet assigns one alias to multiple player IDs: " + name);
    owners.set(key, id);
    if (!players.has(id)) players.set(id, { id, name, aliases: [] });
    if (!players.get(id).aliases.some((a) => a.toLowerCase() === key))
      players.get(id).aliases.push(name);
  }
  if (!players.size || players.size > 5000)
    fail("Alias sheet must contain 1–5,000 players.");
  return [...players.values()];
}
export class AliasSync {
  constructor(e, get = fetch) {
    this.e = e;
    // Workers' native fetch rejects a class instance as its receiver.
    this.get = (...args) => get(...args);
    if (!e.one("SELECT key FROM catalog_meta WHERE key='alias-sync'"))
      this.save({ enabled: true, nextAt: e.now() + 1000, status: "pending" });
  }
  read() {
    const r = this.e.one(
      "SELECT value FROM catalog_meta WHERE key='alias-sync'",
    );
    return r
      ? JSON.parse(r.value)
      : { enabled: true, nextAt: this.e.now() + 1000, status: "pending" };
  }
  save(s) {
    this.e.run(
      "INSERT OR REPLACE INTO catalog_meta VALUES('alias-sync',?)",
      JSON.stringify(s),
    );
  }
  status() {
    const { lease, ...s } = this.read();
    return s;
  }
  nextAlarm() {
    const s = this.read();
    return s.enabled
      ? Math.max(this.e.now() + 1000, s.nextAt || 0, s.lease || 0)
      : null;
  }
  tx(fn) {
    return this.e.track("aliases", () => this.e.tx(fn));
  }
  async step(force = false) {
    const claimed = this.tx(() => {
      const s = this.read(),
        now = this.e.now();
      if (s.lease > now || (!force && s.nextAt > now)) return null;
      s.lease = now + 60000;
      s.status = "syncing";
      this.save(s);
      return s;
    });
    if (!claimed) return this.status();
    let players, error;
    try {
      const r = await this.get(ALIAS_SHEET, {
        signal: AbortSignal.timeout(20000),
        headers: { Accept: "text/csv" },
      });
      if (!r.ok) throw new Error("Google Sheets returned HTTP " + r.status);
      const reader = r.body.getReader();
      let size = 0;
      const chunks = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 1000000) {
          await reader.cancel();
          throw new Error("Alias sheet exceeds the 1 MB limit.");
        }
        chunks.push(value);
      }
      const all = new Uint8Array(size);
      let offset = 0;
      for (const c of chunks) {
        all.set(c, offset);
        offset += c.length;
      }
      players = sheetPlayers(new TextDecoder().decode(all));
    } catch (err) {
      error = err;
    }
    const s = this.read();
    s.lease = 0;
    try {
      if (error) throw error;
      const result = this.tx(() => this.import(players));
      Object.assign(s, {
        status: "synced",
        lastAt: this.e.now(),
        nextAt: this.e.now() + 6 * 3600000,
        error: null,
        players: players.length,
        aliases: players.reduce((n, p) => n + p.aliases.length, 0),
        migrated: result,
      });
    } catch (err) {
      Object.assign(s, {
        status: "retrying",
        error: String(err.message).slice(0, 300),
        nextAt: this.e.now() + 15 * 60000,
      });
    }
    this.save(s);
    return this.status();
  }
  import(players) {
    const migrated = [];
    for (const p of players) {
      const owners = new Set(
        p.aliases
          .map(
            (a) =>
              this.e.one(
                "SELECT player FROM aliases WHERE alias=?",
                a.toLowerCase(),
              )?.player,
          )
          .filter((id) => id && id !== p.id),
      );
      for (const old of owners) {
        if (
          /^\d+$/.test(old) ||
          !p.aliases.some((a) => a.toLowerCase() === old.toLowerCase()) ||
          this.e.one("SELECT id FROM players WHERE id=?", p.id)
        )
          fail(
            "Identity conflict for Tours ID " +
              p.id +
              ". Resolve it before syncing.",
          );
        this.renamePlayer(old, p.id);
        migrated.push({ from: old, to: p.id });
      }
    }
    this.e.host("players", { players, reserveIds: false });
    return migrated;
  }
  renamePlayer(old, id) {
    for (const table of [
      "aliases",
      "usernames",
      "tour_events",
      "sessions",
      "inventory",
      "ledger",
      "predictions",
      "gambling_rounds",
      "mahjong_games",
      "gem_games",
      "profile_showcase",
      "profile_anime",
    ])
      this.e.run(`UPDATE ${table} SET player=? WHERE player=?`, id, old);
    this.e.run("UPDATE auctions SET winner=? WHERE winner=?", id, old);
    this.e.run("UPDATE auctions SET seller=? WHERE seller=?", id, old);
    this.e.run("UPDATE market_listings SET seller=? WHERE seller=?", id, old);
    this.e.run("UPDATE market_listings SET buyer=? WHERE buyer=?", id, old);
    this.e.run("UPDATE weekly_shop SET buyer=? WHERE buyer=?", id, old);
    this.e.run(
      "UPDATE receipts SET scope=?||substr(scope,length(?)+1) WHERE substr(scope,1,length(?)+1)=?||':'",
      id,
      old,
      old,
      old,
    );
    this.e.run("UPDATE players SET id=? WHERE id=?", id, old);
  }
}
