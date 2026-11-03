import {
  ALCHEMY_TIERS,
  refinementQuote,
  rollRefinement,
  drawAlchemyCard,
} from "./alchemy-rules.js";
import { fusionOutcomesPage } from "./fusion-outcomes.js";
export function demoAlchemy(d, path, b, { take, add }) {
  if (path !== "alchemy" && !path.startsWith("alchemy-")) return;
  const s = d.s,
    progress = (s.alchemy ||= {
      xp: 0,
      refinements: 0,
      version: 0,
      targets: {},
    });
  const state = () => ({
    ...progress,
    tiers: ALCHEMY_TIERS,
    cards: d.cards.filter((c) =>
      Object.values(progress.targets).includes(c.id),
    ),
    nextLucky: (progress.refinements + 1) % 6 === 0,
    nextRefinement: progress.refinements + 1,
  });
  const patch = (id) => ({
    inventory: [
      s.inventory.find((i) => i.card === id) || { card: id, removed: true },
    ],
    me: s.me,
    showcase: s.showcase || [],
  });
  if (path === "alchemy") return { alchemyState: state() };
  if (path.startsWith("alchemy-targets?")) {
    const p = new URLSearchParams(path.split("?")[1]);
    return fusionOutcomesPage(d.cards, {
      rarity: p.get("rarity"),
      kind: p.get("kind") || "mixed",
      query: p.get("q") || "",
      page: Number(p.get("page") || 1),
    });
  }
  if (b.expectedVersion !== progress.version)
    throw Error("Alchemy progress changed. Review again.");
  if (path === "alchemy-target") {
    const c = b.card
      ? d.cards.find((c) => c.id === b.card && c.rarity === b.rarity)
      : null;
    if (b.card && !c) throw Error("Choose a matching target.");
    if (c) progress.targets[b.rarity] = c.id;
    else delete progress.targets[b.rarity];
    progress.version++;
    return { alchemyState: state(), message: "Target updated." };
  }
  if (!b.confirmed) throw Error("Confirm this alchemy action.");
  if (path === "alchemy-feed") {
    const c = d.cards.find((c) => c.id === b.card),
      item = s.inventory.find((i) => i.card === b.card);
    if (!c || !item) throw Error("Choose an owned card.");
    const level = b.variant === "extra" ? 1 : item.level;
    if (c.rarity !== b.expectedRarity || level !== b.expectedLevel)
      throw Error("Material changed.");
    const quote = refinementQuote(c.rarity, level, progress.refinements),
      o = rollRefinement(quote, (n) => Math.floor(Math.random() * n));
    take(c.id, b.variant);
    progress.xp += o.xp;
    progress.refinements++;
    progress.version++;
    return {
      alchemyState: state(),
      collectionPatch: patch(c.id),
      message: o.label + " · +" + o.xp + " XP",
      outcome: o.outcome,
      label: o.label,
      xpGained: o.xp,
      multiplier: o.multiplier,
      lucky: quote.lucky,
      material: {
        id: c.id,
        name: c.name,
        rarity: c.rarity,
        level,
        investment: quote.investment,
      },
    };
  }
  if (path === "alchemy-draw") {
    const tier = ALCHEMY_TIERS.find((t) => t.rarity === b.rarity),
      pool = d.cards.filter((c) => c.rarity === b.rarity),
      targetId = progress.targets[b.rarity] || null;
    if (!tier || progress.xp < tier.cost) throw Error("Not enough XP.");
    if ((b.targetCard || null) !== targetId) throw Error("Target changed.");
    const target = targetId ? pool.find((c) => c.id === targetId) : null;
    if (targetId && !target) throw Error("Target rarity changed.");
    const c = drawAlchemyCard(pool, target, (n) =>
      Math.floor(Math.random() * n),
    );
    add(c.id);
    progress.xp -= tier.cost;
    progress.version++;
    return {
      alchemyState: state(),
      collectionPatch: patch(c.id),
      message: tier.rarity + " Draw · " + c.name,
      cards: [c],
      rarity: tier.rarity,
      xpSpent: tier.cost,
      targetHit: !!target && c.id === target.id,
    };
  }
}
