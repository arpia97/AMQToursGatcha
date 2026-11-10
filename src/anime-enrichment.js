import { characterCards, animeTitles } from "./jikan.js";

// A separate checkpoint enriches existing identities without rewinding discovery.
export class AnimeEnrichment {
  constructor(e) {
    this.e = e;
    e.run(
      "CREATE TABLE IF NOT EXISTS anime_appearance_scans(anime INTEGER PRIMARY KEY,at INTEGER NOT NULL)",
    );
  }
  path(s) {
    const a = s.appearances;
    return a.queue[0]
      ? "/anime/" + a.queue[0].id + "/characters"
      : a.priority[0]
        ? "/anime/" + a.priority[0]
        : "/anime?order_by=mal_id&sort=asc&limit=25&page=" + a.page;
  }
  apply(s, response, missing = false) {
    const a = s.appearances,
      title = a.queue[0];
    if (title) {
      if (missing) a.skippedTitles++;
      else {
        const cards = characterCards(response?.data, title);
        s.importedCharacters =
          (s.importedCharacters || 0) +
          this.e.catalogStore.tenrai.upsert(cards);
        this.e.run(
          "INSERT OR REPLACE INTO anime_appearance_scans VALUES(?,?)",
          title.id,
          this.e.now(),
        );
      }
      a.scannedTitles++;
      a.queue.shift();
      if (!a.queue.length && !title.priority) this.advance(a);
    } else if (a.priority[0]) {
      const id = a.priority[0];
      if (missing) a.skippedTitles++;
      else {
        const t = response?.data;
        if (t?.mal_id !== id || !animeTitles(t).series)
          throw Error("Invalid appearance title.");
        a.queue = [{ ...this.title(t), priority: true }];
      }
      a.priority.shift();
    } else {
      if (
        !Array.isArray(response?.data) ||
        response.data.length > 25 ||
        typeof response.pagination?.has_next_page !== "boolean"
      )
        throw Error("Invalid appearance pagination.");
      a.queue = response.data
        .map((t) => this.title(t))
        .filter(
          (t) =>
            t.id &&
            !this.e.one(
              "SELECT anime FROM anime_appearance_scans WHERE anime=?",
              t.id,
            ),
        );
      a.hasMore = response.pagination.has_next_page;
      if (Number.isSafeInteger(response.pagination.items?.total))
        a.totalTitles = response.pagination.items.total;
      if (!a.queue.length) this.advance(a);
    }
    a.requests++;
    a.updatedAt = this.e.now();
  }
  title(t) {
    return {
      id: Number.isSafeInteger(t.mal_id) && t.mal_id > 0 ? t.mal_id : null,
      title: animeTitles(t).series,
      title_english: animeTitles(t).series_english,
      members: t.members,
    };
  }
  advance(a) {
    if (a.hasMore) a.page++;
    else {
      a.status = "completed";
      a.completedAt = this.e.now();
    }
  }
}
