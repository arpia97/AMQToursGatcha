// Include held cards until their sale or trade settles. Auction wins count
// from the time bidding ends. Keep each compound query within Workers' limit.
export const ownedCardCopies = `(
  SELECT * FROM (
    SELECT player,card,level,copies,protected,for_trade,acquired_at,position,0 AS available_at,1 AS in_inventory FROM inventory WHERE copies>0
    UNION ALL SELECT seller,card,level,1+extra_copies,0,0,created,NULL,0,0 FROM market_listings WHERE status='open'
    UNION ALL SELECT seller,card,level,1+extra_copies,0,0,starts,NULL,0,0 FROM auctions WHERE seller IS NOT NULL AND paid=0
    UNION ALL SELECT winner,card,level,1+extra_copies,0,0,ends,NULL,ends,0 FROM auctions WHERE winner IS NOT NULL AND claimed=0
    UNION ALL SELECT seller,card,level,1+extra_copies,0,1,created_at,NULL,0,0 FROM trade_listings WHERE status='open'
  ) UNION ALL SELECT o.proposer,COALESCE(c.card,o.card),COALESCE(c.level,o.level),
    1+COALESCE(c.extra_copies,o.extra_copies),0,0,o.created_at,NULL,0,0
    FROM trade_offers o LEFT JOIN trade_offer_cards c ON c.offer=o.id WHERE o.status='open')`;

const hasCopy = (player,card,time) => `EXISTS(SELECT 1 FROM ${ownedCardCopies} h WHERE h.player=${player} AND h.card=${card} AND h.available_at<=${time})`;

export function installFavoriteOwnership(e) {
  if (e.one("SELECT value FROM settings WHERE key='favorite_ownership_v1'")) return;
  e.tx(() => {
    e.run("CREATE TABLE IF NOT EXISTS unowned_favorites_repair(player TEXT NOT NULL,card TEXT NOT NULL,PRIMARY KEY(player,card))");
    e.run(`INSERT INTO unowned_favorites_repair SELECT f.player,f.card FROM card_favorites f WHERE NOT ${hasCopy('f.player','f.card','?')}`,e.now());
    e.run("DELETE FROM card_favorites WHERE (player,card) IN (SELECT player,card FROM unowned_favorites_repair)");
    // A historical repair may remove a card outside the normal sale paths.
    // Clear an invalid favorite before a new acquisition can make it reappear.
    e.run(`CREATE TRIGGER IF NOT EXISTS favorites_reacquire BEFORE INSERT ON inventory
      WHEN EXISTS(SELECT 1 FROM card_favorites f WHERE f.player=NEW.player AND f.card=NEW.card)
      AND NOT ${hasCopy('NEW.player','NEW.card','COALESCE(NULLIF(NEW.acquired_at,0),unixepoch()*1000)')}
      BEGIN DELETE FROM card_favorites WHERE player=NEW.player AND card=NEW.card; END`);
    e.run("INSERT INTO settings VALUES('favorite_ownership_v1',1)");
  });
}

export function activeFavorites(e,player) {
  return e.all(`SELECT f.card FROM card_favorites f WHERE f.player=? AND ${hasCopy('f.player','f.card','?')}`,player,e.now()).map(row=>row.card);
}

export function pruneFavorite(e,player,card) {
  e.run(`DELETE FROM card_favorites WHERE player=? AND card=? AND NOT ${hasCopy('card_favorites.player','card_favorites.card','?')}`,player,card,e.now());
}
