import { fail, text } from "./engine.js";
import { fusionOutcomesPage } from "../public/fusion-outcomes.js";

export class Fusion {
  constructor(e) {
    this.e = e;
  }
  outcomes(options) {
    const kind = options.kind || "mixed";
    const kinds = kind === "mixed" ? ["character", "seiyuu"] : [kind];
    if (!kinds.every((kind) => ["character", "seiyuu"].includes(kind)))
      fail("Choose a card type.");
    const pool = kinds.flatMap((kind) => this.e.catalogStore.pool(kind).cards);
    const candidates = options.query
      ? this.e.catalogStore.searchPool(
          kind === "mixed" ? "both" : kind,
          options.query,
        ).cards
      : pool;
    const result = fusionOutcomesPage(
      candidates,
      options,
      (c) => c.searchText || c.name,
    );
    return {
      ...result,
      eligibleTotal: pool.filter((c) => c.rarity === options.rarity).length,
      cards: this.e.catalogStore.cards(result.cards.map((c) => c.id)),
    };
  }
  reversalPreview(player, key) {
    player = text(player, 100);
    key = text(key, 100);
    const source = this.e.one(
      "SELECT * FROM receipts WHERE scope=? AND key=?",
      player + ":fusion",
      key,
    );
    if (!source) fail("Fusion receipt was not found.", 404);
    const latest = this.e.one(
      "SELECT key FROM receipts WHERE scope=? ORDER BY at DESC LIMIT 1",
      player + ":fusion",
    );
    if (latest.key !== key)
      fail("Only the latest fusion can use this focused restoration.", 409);
    const result = JSON.parse(source.result),
      materials = result.materials;
    if (
      !Array.isArray(materials) ||
      !materials.length ||
      materials.length > 5 ||
      materials.some((m) => m.level !== 1) ||
      new Set(materials.map((m) => m.card)).size !== materials.length ||
      result.cards?.length !== 1
    )
      fail("This fusion needs a separate reviewed restoration plan.", 409);
    const resultId = result.cards[0].id,
      owned = this.e.one(
        "SELECT * FROM inventory WHERE player=? AND card=?",
        player,
        resultId,
      );
    if (
      !owned ||
      owned.protected ||
      owned.copies !== 1 ||
      owned.level !== 1 ||
      owned.acquired_at !== source.at ||
      materials.some(
        (m) =>
          m.card === resultId ||
          this.e.one(
            "SELECT card FROM inventory WHERE player=? AND card=?",
            player,
            m.card,
          ),
      )
    )
      fail(
        "Fusion cards changed after the recorded outcome. Review the inventory before restoring.",
        409,
      );
    const allowed = new Set([
      "showcase",
      "protect-card",
      "notice-seen",
      "predict",
      "profile",
      "pin-anime",
      "daily",
    ]);
    const later = this.e.all(
      "SELECT scope FROM receipts WHERE scope>=? AND scope<? AND at>?",
      player + ":",
      player + ":\uffff",
      source.at,
    );
    if (later.some((r) => !allowed.has(r.scope.slice(player.length + 1))))
      fail(
        "Later gameplay needs review before this fusion can be restored.",
        409,
      );
    const prior = this.e.all(
      "SELECT at,result FROM receipts WHERE scope>=? AND scope<? AND at<? ORDER BY at DESC",
      player + ":",
      player + ":\uffff",
      source.at,
    );
    const acquired = new Map();
    for (const receipt of prior) {
      const output = JSON.parse(receipt.result);
      for (const c of output.cards || [])
        if (!acquired.has(c.id)) acquired.set(c.id, receipt.at);
    }
    return {
      player,
      sourceKey: key,
      sourceAt: source.at,
      removed: { id: resultId, name: result.cards[0].name },
      restored: materials.map((m) => ({
        ...m,
        acquiredAt: acquired.get(m.card) || source.at,
      })),
      walletDelta: 0,
    };
  }
  reverse(player, key) {
    const plan = this.reversalPreview(player, key);
    this.e.economy.take(player, plan.removed.id, "card");
    for (const m of plan.restored) {
      this.e.addCard(player, m.card);
      this.e.run(
        "UPDATE inventory SET acquired_at=? WHERE player=? AND card=?",
        m.acquiredAt,
        player,
        m.card,
      );
    }
    return {
      ...plan,
      appliedAt: this.e.now(),
      message:
        "Fusion reversed. Materials restored and the result removed; credits unchanged.",
    };
  }
}
