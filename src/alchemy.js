import { fail, text } from "./engine.js";
import {
  ALCHEMY_TIERS,
  refinementQuote,
  rollRefinement,
  drawAlchemyCard,
} from "../public/alchemy-rules.js";
import { fusionOutcomesPage } from "../public/fusion-outcomes.js";
export class Alchemy {
  constructor(e) {
    this.e = e;
    e.run(
      "CREATE TABLE IF NOT EXISTS card_alchemy(player TEXT PRIMARY KEY,xp INTEGER NOT NULL DEFAULT 0 CHECK(xp>=0),refinements INTEGER NOT NULL DEFAULT 0,version INTEGER NOT NULL DEFAULT 0)",
    );
    e.run(
      "CREATE TABLE IF NOT EXISTS alchemy_targets(player TEXT NOT NULL,rarity TEXT NOT NULL,card TEXT NOT NULL,PRIMARY KEY(player,rarity))",
    );
  }
  read(player) {
    return (
      this.e.one(
        "SELECT xp,refinements,version FROM card_alchemy WHERE player=?",
        player,
      ) || { xp: 0, refinements: 0, version: 0 }
    );
  }
  state(player) {
    const progress = this.read(player),
      targets = Object.fromEntries(
        this.e
          .all("SELECT rarity,card FROM alchemy_targets WHERE player=?", player)
          .map((t) => [t.rarity, t.card]),
      );
    return {
      ...progress,
      targets,
      tiers: ALCHEMY_TIERS,
      cards: this.e.catalogStore.cards(Object.values(targets)),
      nextLucky: (progress.refinements + 1) % 6 === 0,
      nextRefinement: progress.refinements + 1,
    };
  }
  checkVersion(player, body) {
    const progress = this.read(player);
    if (body.expectedVersion !== progress.version)
      fail(
        "Your alchemy progress changed. Refresh and review this action again.",
        409,
      );
    if (progress.version >= Number.MAX_SAFE_INTEGER)
      fail("Alchemy progress needs maintenance.", 409);
    return progress;
  }
  save(player, progress) {
    this.e.run(
      "INSERT INTO card_alchemy VALUES(?,?,?,?) ON CONFLICT(player) DO UPDATE SET xp=excluded.xp,refinements=excluded.refinements,version=excluded.version",
      player,
      progress.xp,
      progress.refinements,
      progress.version,
    );
  }
  pool(rarity) {
    return ["character", "seiyuu"].flatMap((kind) =>
      this.e.catalogStore.pool(kind).cards.filter((c) => c.rarity === rarity),
    );
  }
  targetsPage(options) {
    return fusionOutcomesPage(
      ["character", "seiyuu"].flatMap(
        (kind) => this.e.catalogStore.pool(kind).cards,
      ),
      options,
    );
  }
  collectionPatch(player, ids) {
    return {
      inventory: [...new Set(ids)].map((card) => {
        const row = this.e.one(
          "SELECT * FROM inventory WHERE player=? AND card=?",
          player,
          card,
        );
        return row ? { ...row } : { card, removed: true };
      }),
      showcase: this.e
        .all(
          "SELECT card FROM profile_showcase WHERE player=? ORDER BY position",
          player,
        )
        .map((r) => r.card),
      me: this.e.player(player),
    };
  }
  target(player, b) {
    const progress = this.checkVersion(player, b),
      rarity = text(b.rarity, 20);
    if (!ALCHEMY_TIERS.some((t) => t.rarity === rarity))
      fail("Choose a valid alchemy tier.");
    if (b.card == null) {
      this.e.run(
        "DELETE FROM alchemy_targets WHERE player=? AND rarity=?",
        player,
        rarity,
      );
    } else {
      const card = this.e.catalogStore.card(text(b.card, 100));
      if (!card || card.active === 0 || card.rarity !== rarity)
        fail(
          "This target is no longer in the selected rarity. Choose another card.",
          409,
        );
      this.e.run(
        "INSERT INTO alchemy_targets VALUES(?,?,?) ON CONFLICT(player,rarity) DO UPDATE SET card=excluded.card",
        player,
        rarity,
        card.id,
      );
    }
    this.save(player, { ...progress, version: progress.version + 1 });
    return {
      alchemyState: this.state(player),
      message: b.card
        ? "Target card saved."
        : "Target cleared. This tier draws randomly.",
    };
  }
  refine(player, b) {
    if (b.confirmed !== true)
      fail("Review and confirm before consuming a card.", 409);
    const progress = this.checkVersion(player, b),
      id = text(b.card, 100),
      item = this.e.one(
        "SELECT * FROM inventory WHERE player=? AND card=?",
        player,
        id,
      ),
      card = this.e.catalogStore.card(id);
    if (!item || !card) fail("This card is no longer in your collection.", 409);
    if (item.protected)
      fail("This card is protected. Unprotect it before refinement.", 409);
    if (!["card", "extra"].includes(b.variant))
      fail("Choose a specific owned copy.");
    const level = b.variant === "extra" ? 1 : item.level;
    if (b.variant === "extra" && item.copies < 2)
      fail("There is no extra copy available.", 409);
    if (b.expectedRarity !== card.rarity || b.expectedLevel !== level)
      fail("The card rarity or level changed. Review it again.", 409);
    const quote = refinementQuote(card.rarity, level, progress.refinements);
    if (progress.xp > Number.MAX_SAFE_INTEGER - quote.baseXP * 5)
      fail("Spend some alchemy XP before refining this card.", 409);
    const outcome = rollRefinement(quote, (n) => this.e.rand(n));
    this.e.economy.take(player, id, b.variant);
    this.save(player, {
      xp: progress.xp + outcome.xp,
      refinements: progress.refinements + 1,
      version: progress.version + 1,
    });
    return {
      message:
        outcome.label + " · +" + outcome.xp.toLocaleString("en-US") + " XP",
      outcome: outcome.outcome,
      label: outcome.label,
      xpGained: outcome.xp,
      multiplier: outcome.multiplier,
      lucky: quote.lucky,
      material: {
        id,
        name: card.name,
        rarity: card.rarity,
        level,
        investment: quote.investment,
      },
      alchemyState: this.state(player),
      collectionPatch: this.collectionPatch(player, [id]),
    };
  }
  draw(player, b) {
    if (b.confirmed !== true)
      fail("Review and confirm the XP cost before drawing.", 409);
    const progress = this.checkVersion(player, b),
      tier = ALCHEMY_TIERS.find((t) => t.rarity === b.rarity);
    if (!tier) fail("Choose a valid alchemy tier.");
    if (progress.xp < tier.cost)
      fail("You do not have enough alchemy XP for this tier.", 409);
    const saved =
      this.e.one(
        "SELECT card FROM alchemy_targets WHERE player=? AND rarity=?",
        player,
        tier.rarity,
      )?.card || null;
    if ((b.targetCard || null) !== saved)
      fail("The target changed. Review the draw again.", 409);
    const pool = this.pool(tier.rarity),
      target = saved ? pool.find((c) => c.id === saved) : null;
    if (saved && !target)
      fail(
        "Your target changed rarity or is unavailable. Choose a new target.",
        409,
      );
    if (!pool.length)
      fail("This tier has no available cards. Your XP was kept.", 409);
    const result = drawAlchemyCard(pool, target, (n) => this.e.rand(n));
    this.e.addCard(player, result.id);
    this.save(player, {
      ...progress,
      xp: progress.xp - tier.cost,
      version: progress.version + 1,
    });
    return {
      message: tier.rarity + " Draw · " + result.name,
      cards: [result],
      level: 1,
      rarity: tier.rarity,
      xpSpent: tier.cost,
      targetHit: !!target && result.id === target.id,
      targetChance: target ? (pool.length === 1 ? 100 : 50) : 0,
      alchemyState: this.state(player),
      collectionPatch: this.collectionPatch(player, [result.id]),
    };
  }
}
