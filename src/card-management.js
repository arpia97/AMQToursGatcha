import { fail, text } from "./engine.js";
import { batchSaleQuote } from "../public/card-management.js";
export class CardManagement {
  constructor(e) {
    this.e = e;
  }
  action(player, action, b) {
    const e = this.e;
    if (action === "protect-card") {
      const card = text(b.card, 100);
      if (typeof b.protected !== "boolean")
        fail("Choose protect or unprotect.");
      if (
        !e.one(
          "SELECT card FROM inventory WHERE player=? AND card=?",
          player,
          card,
        )
      )
        fail("You do not own that card.", 409);
      e.run(
        "UPDATE inventory SET protected=? WHERE player=? AND card=?",
        b.protected ? 1 : 0,
        player,
        card,
      );
      return {
        message: b.protected
          ? "Card protected. All copies are kept safe from selling, listing and fusion."
          : "Card unprotected.",
      };
    }
    if (action !== "sell-batch") return null;
    const f = b.filters;
    if (
      !f ||
      typeof f.query !== "string" ||
      f.query.length > 100 ||
      typeof f.upgradable !== "boolean" ||
      !["", "main", "supporting"].includes(f.role) ||
      ![
        "",
        "AG",
        "Ubers",
        "SSS",
        "SS",
        "S",
        "A",
        "B",
        "C",
        "D",
        "Pending",
      ].includes(f.rarity)
    )
      fail("Invalid sale filters.");
    const inventory = e.all("SELECT * FROM inventory WHERE player=?", player);
    const cards = new Map(
      e.catalogStore
        .cards(inventory.filter((i) => !i.protected).map((i) => i.card))
        .map((c) => [c.id, c]),
    );
    const quote = batchSaleQuote(inventory, (id) => cards.get(id), f);
    if (!quote.items.length) fail("No unprotected cards match this sale.", 409);
    if (JSON.stringify(quote.items) !== JSON.stringify(b.expectedItems))
      fail(
        "The matching cards, protection, rarity or sale values changed. Review the batch again.",
        409,
      );
    for (const i of quote.items) {
      if (f.mode === "extras")
        e.run(
          "UPDATE inventory SET copies=1 WHERE player=? AND card=?",
          player,
          i.card,
        );
      else {
        e.run(
          "DELETE FROM inventory WHERE player=? AND card=?",
          player,
          i.card,
        );
        e.run(
          "DELETE FROM profile_showcase WHERE player=? AND card=?",
          player,
          i.card,
        );
        e.run(
          "UPDATE players SET avatar_card=NULL WHERE id=? AND avatar_card=?",
          player,
          i.card,
        );
      }
    }
    e.wallet(
      player,
      quote.total,
      "Batch card sale: " + quote.count + " copies",
    );
    return {
      message: `Sold ${quote.count} copies for ${quote.total.toLocaleString("en-US")} credits.`,
      price: quote.total,
      count: quote.count,
    };
  }
}
