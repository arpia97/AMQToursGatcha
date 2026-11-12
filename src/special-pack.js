export const S_AND_UP_RARITIES = ["S", "SS", "SSS", "Ubers", "AG"];

export class SpecialPack {
  constructor(e) {
    this.e = e;
    e.run(
      "CREATE TABLE IF NOT EXISTS special_packs(player TEXT PRIMARY KEY, granted_at INTEGER NOT NULL, cards TEXT NOT NULL, seen INTEGER NOT NULL DEFAULT 0)",
    );
  }

  // Draw 1 card matching rarities, choosing between character (50%) and seiyuu (50%)
  drawCard(allowedRarities, chosen = new Set()) {
    const e = this.e;
    // 50% chance for Seiyuu and 50% chance for Character
    const preferredKind = e.rand(2) === 0 ? "character" : "seiyuu";
    const otherKind = preferredKind === "character" ? "seiyuu" : "character";

    const pickFrom = (kind, avoidChosen) => {
      let pool = e.catalogStore.pool(kind)?.cards || [];
      pool = pool.filter((c) => allowedRarities.includes(c.rarity));
      if (avoidChosen) {
        pool = pool.filter((c) => !chosen.has(c.id));
      }
      if (!pool.length) return null;
      return pool[e.rand(pool.length)];
    };

    // 1. Try preferred kind avoiding cards already chosen in this pack
    let card = pickFrom(preferredKind, true);
    // 2. Try other kind avoiding cards already chosen in this pack
    if (!card) card = pickFrom(otherKind, true);
    // 3. Fallback: allow duplicates in preferred kind
    if (!card) card = pickFrom(preferredKind, false);
    // 4. Fallback: allow duplicates in other kind
    if (!card) card = pickFrom(otherKind, false);

    // 5. Fallback if catalog has no cards matching allowed rarities (e.g. minimal test environments)
    if (!card) {
      let pool = (e.catalogStore.pool(preferredKind)?.cards || []).filter(
        (c) => !chosen.has(c.id),
      );
      if (!pool.length)
        pool = (e.catalogStore.pool(otherKind)?.cards || []).filter(
          (c) => !chosen.has(c.id),
        );
      if (!pool.length)
        pool = [
          ...(e.catalogStore.pool(preferredKind)?.cards || []),
          ...(e.catalogStore.pool(otherKind)?.cards || []),
        ];
      if (pool.length) card = pool[e.rand(pool.length)];
      else throw new Error("No cards available in catalog.");
    }

    chosen.add(card.id);
    return card;
  }

  drawFive() {
    const chosen = new Set();
    // 1 AG card (50% character, 50% seiyuu)
    const agCard = this.drawCard(["AG"], chosen);
    // 4 cards S and up (50% character, 50% seiyuu each)
    const sCards = [];
    for (let i = 0; i < 4; i++) {
      sCards.push(this.drawCard(S_AND_UP_RARITIES, chosen));
    }
    return [agCard, ...sCards];
  }

  ensureGranted(player) {
    if (!player) return null;
    const existing = this.e.one(
      "SELECT * FROM special_packs WHERE player=?",
      player,
    );
    if (existing) return existing;

    const p = this.e.one("SELECT id,account_locked FROM players WHERE id=?", player);
    if (!p || p.account_locked) return null;

    const totalCards =
      (this.e.catalogStore.pool("character")?.cards?.length || 0) +
      (this.e.catalogStore.pool("seiyuu")?.cards?.length || 0);
    if (totalCards < 5) return null;

    const drawn = this.drawFive();
    const pulls = this.e.catalogStore.cards(drawn.map((c) => c.id));
    for (const card of pulls) {
      this.e.addCard(player, card.id);
    }
    const record = {
      player,
      granted_at: this.e.now(),
      cards: JSON.stringify(pulls),
      seen: 0,
    };
    this.e.run(
      "INSERT OR IGNORE INTO special_packs(player, granted_at, cards, seen) VALUES(?,?,?,0)",
      record.player,
      record.granted_at,
      record.cards,
    );
    return record;
  }

  pendingPopup(player) {
    if (!player) return null;
    const row = this.e.one(
      "SELECT * FROM special_packs WHERE player=? AND seen=0",
      player,
    );
    if (!row) return null;
    try {
      const cards = JSON.parse(row.cards);
      return { cards };
    } catch {
      return null;
    }
  }

  markSeen(player) {
    if (!player) return;
    this.e.run("UPDATE special_packs SET seen=1 WHERE player=?", player);
  }
}
