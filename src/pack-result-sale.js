import { fail, text } from "./engine.js";
import { instantSalePrice } from "../public/card-values.js";

export function installPackResultSales(e) {
  e.run(`CREATE TABLE IF NOT EXISTS pack_result_items(
    player TEXT NOT NULL, card TEXT NOT NULL, opening TEXT NOT NULL,
    slot TEXT NOT NULL, remaining INTEGER NOT NULL, restores TEXT NOT NULL,
    PRIMARY KEY(player,slot,card))`);
  // Consuming a copy in another tab also consumes its eligibility for Sell All.
  e.run(`CREATE TRIGGER IF NOT EXISTS pack_result_spent AFTER UPDATE OF copies ON inventory
    WHEN NEW.copies < OLD.copies BEGIN
    UPDATE pack_result_items SET remaining=MAX(0,remaining-(OLD.copies-NEW.copies))
    WHERE player=OLD.player AND card=OLD.card AND remaining>0; END`);
  e.run(`CREATE TRIGGER IF NOT EXISTS pack_result_removed AFTER DELETE ON inventory BEGIN
    UPDATE pack_result_items SET remaining=0 WHERE player=OLD.player AND card=OLD.card AND remaining>0; END`);
}

export function rememberPackResult(e, player, cards, slot = "pack") {
  const opening = crypto.randomUUID();
  const rows = new Map();
  for (const card of cards) {
    const row = rows.get(card.id) || {card:card.id, remaining:0, restores:[]};
    if (card.autoSold) row.restores.push(card.autoSoldId);
    else row.remaining++;
    rows.set(card.id, row);
  }
  e.run("DELETE FROM pack_result_items WHERE player=? AND slot=?", player, slot);
  const values = [...rows.values()];
  for (let i = 0; i < values.length; i += 100) {
    e.run(`INSERT INTO pack_result_items(player,card,opening,slot,remaining,restores)
      SELECT ?,value->>'card',?,?,value->>'remaining',value->'restores' FROM json_each(?)`,
      player, opening, slot, JSON.stringify(values.slice(i,i+100)));
  }
  return opening;
}

export function sellPackResult(e, player, body) {
  const opening = text(body.opening, 100);
  const rows = e.all(`SELECT p.card,p.remaining,i.copies,i.level,i.protected FROM pack_result_items p
    LEFT JOIN inventory i ON i.player=p.player AND i.card=p.card
    WHERE p.player=? AND p.opening=?`, player, opening);
  if (!rows.length) fail("This pack result has expired or was already sold.", 409);
  const sold = {};
  let count = 0, price = 0;
  for (const row of rows) {
    if (!row.copies || row.protected || !row.remaining) continue;
    const quantity = Math.min(row.remaining, row.copies - Number(row.level > 1));
    const card = e.catalogStore.card(row.card);
    if (!quantity || !card) continue;
    if (quantity === row.copies) {
      // Leave the last copy to the standard sale path for avatar, showcase and favorites cleanup.
      if (quantity > 1) e.run("UPDATE inventory SET copies=1 WHERE player=? AND card=?", player, row.card);
      e.economy.take(player, row.card, "card");
    } else {
      e.run("UPDATE inventory SET copies=copies-? WHERE player=? AND card=?", quantity, player, row.card);
    }
    sold[row.card] = quantity;
    count += quantity;
    price += quantity * instantSalePrice(card, 1);
  }
  if (!count) fail("There are no unprotected pack copies available to sell.", 409);
  e.wallet(player, price, "Pack result sale: " + count + " copies");
  return {sold, count, price, balance:e.player(player).balance,
    message:`Sold ${count} pack ${count === 1 ? "card" : "cards"} for ${price.toLocaleString("en-US")} credits.`};
}
