import { fail, text } from "./engine.js";
import { fusionQuote } from "../public/fusion-rules.js";
import {
  fusionOutcomesPage,
  fusionTarget,
  drawFusionResult,
} from "../public/fusion-outcomes.js";

export class Fusion {
  constructor(e) {
    this.e = e;
  }
  outcomes(options) {
    const kinds =
      options.kind === "mixed" ? ["character", "seiyuu"] : [options.kind];
    if (!kinds.every((kind) => ["character", "seiyuu"].includes(kind)))
      fail("Choose a card type.");
    return fusionOutcomesPage(
      kinds.flatMap((kind) => this.e.catalogStore.pool(kind).cards),
      options,
    );
  }
  prepare(player, board) {
    if (!Array.isArray(board) || board.length < 1 || board.length > 5)
      fail("Choose between one and five fusion cards.");
    const groups = new Map(),
      materials = [];
    for (const entry of board) {
      if (!entry || typeof entry !== "object") fail("Invalid fusion material.");
      const id = text(entry.card, 100),
        variant = entry.variant;
      if (!["extra", "card"].includes(variant))
        fail("Choose a specific owned copy.");
      if (!groups.has(id)) {
        const item = this.e.one(
            "SELECT * FROM inventory WHERE player=? AND card=?",
            player,
            id,
          ),
          card = this.e.catalogStore.card(id);
        if (!item || !card)
          fail("A selected card is no longer in your collection.", 409);
        if (item.protected)
          fail(
            "A selected card is protected. Unprotect it before fusion.",
            409,
          );
        groups.set(id, { item, card, extra: 0, base: 0 });
      }
      const group = groups.get(id),
        level = variant === "extra" ? 1 : group.item.level;
      if (
        entry.expectedRarity !== (group.card.rarity || "Pending") ||
        entry.expectedLevel !== level
      )
        fail(
          "A material’s rarity or level changed. Review the fusion board again.",
          409,
        );
      group[variant === "extra" ? "extra" : "base"]++;
      if (group.base > 1 || group.extra > group.item.copies - 1)
        fail("The same copy cannot be used twice.", 409);
      materials.push({
        card: id,
        name: group.card.name,
        rarity: group.card.rarity,
        kind: group.card.kind,
        variant,
        level,
      });
    }
    return { groups, materials, odds: fusionQuote(materials) };
  }
  fuse(player, b) {
    const { groups, materials, odds } = this.prepare(player, b.cards),
      pools = {};
    for (const key of [
      "baseline",
      "upgraded",
      "stay",
      "upgrade",
      "break",
      "count",
    ])
      if (b.expectedOdds?.[key] !== odds[key])
        fail(
          "The fusion odds changed. Review the board before trying again.",
          409,
        );
    const needed = [odds.baseline, ...(odds.upgrade ? [odds.upgraded] : [])];
    const kinds = [...new Set(materials.map((m) => m.kind))];
    for (const kind of kinds)
      for (const card of this.e.catalogStore.pool(kind).cards)
        if (needed.includes(card.rarity))
          (pools[card.rarity] ||= []).push(card);
    for (const r of needed)
      if (!pools[r]?.length)
        fail(
          "No " +
            r +
            " result cards are available yet. Your materials were kept.",
          409,
        );
    if (b.targetCard && !odds.upgrade)
      fail("Add at least two materials before choosing an upgrade target.");
    const target = fusionTarget(pools[odds.upgraded], b.targetCard);
    const roll = this.e.rand(10000),
      outcome =
        roll < odds.stay
          ? "stay"
          : roll < odds.stay + odds.upgrade
            ? "upgrade"
            : "break";
    const grade =
      outcome === "stay"
        ? odds.baseline
        : outcome === "upgrade"
          ? odds.upgraded
          : null;
    const result = grade
      ? drawFusionResult(
          pools[grade],
          outcome === "upgrade" ? target : null,
          (n) => this.e.rand(n),
        )
      : null;
    // Consume extras before the base so selecting every physical copy is valid.
    for (const [id, g] of groups) {
      for (let i = 0; i < g.extra; i++)
        this.e.economy.take(player, id, "extra");
      if (g.base) this.e.economy.take(player, id, "card");
    }
    if (result) this.e.addCard(player, result.id);
    return {
      message: result
        ? (outcome === "upgrade"
            ? "Fusion upgraded to "
            : "Fusion stayed at ") +
          grade +
          ". Your replacement card is Lv. 1."
        : "Fusion broke. The selected materials were consumed.",
      outcome,
      odds,
      materials,
      roll,
      targetCard: target?.id || null,
      targetHit: !!target && outcome === "upgrade" && result?.id === target.id,
      cards: result ? [result] : [],
    };
  }
}
