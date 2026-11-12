import { fail, text } from "./engine.js";

export function setAccountLock(e,b) {
  const id=text(b.player,100);
  if(id==="368" || typeof b.locked!=="boolean") fail("Choose a non-owner account and lock state.");
  const p=e.player(id);
  if(!!p.account_locked===b.locked) return {message:b.locked?"Account is already locked.":"Account is already unlocked.",player:id,locked:b.locked};
  e.run("UPDATE players SET account_locked=? WHERE id=?",b.locked?1:0,id);
  e.run("UPDATE inventory SET for_trade=CASE WHEN protected=0 AND ?=0 THEN 1 ELSE 0 END WHERE player=?",b.locked?1:0,id);
  if(b.locked) {
    e.run("DELETE FROM sessions WHERE player=?",id);
    e.run("UPDATE players SET invite=NULL,invite_expires=NULL WHERE id=?",id);
    for(const l of e.all("SELECT * FROM trade_listings WHERE seller=? AND status='open'",id)) e.economy.trades.close(l);
    for(const o of e.all("SELECT * FROM trade_offers WHERE proposer=? AND status='open'",id)) e.economy.trades.returnOffer(o,"withdrawn");
    for(const l of e.all("SELECT * FROM market_listings WHERE seller=? AND status='open'",id)) {
      e.economy.acquire(id,l.card,l.level,l.extra_copies);
      e.run("UPDATE market_listings SET status='cancelled' WHERE id=?",l.id);
    }
    for(const a of e.all("SELECT * FROM auctions WHERE seller=? AND paid=0 AND claimed=0",id)) {
      if(a.winner && a.bid) e.wallet(a.winner,a.bid,"Locked seller: auction refund");
      e.economy.acquire(id,a.card,a.level,a.extra_copies);
      e.run("UPDATE auctions SET closed=1,claimed=1,paid=1,winner=NULL,bid=0,ends=MIN(ends,?) WHERE id=?",e.now(),a.id);
    }
    for(const a of e.all("SELECT * FROM auctions WHERE winner=? AND ends>? AND claimed=0",id,e.now())) {
      if(a.bid)e.wallet(id,a.bid,"Locked account: bid refund");
      e.run("UPDATE auctions SET winner=NULL,bid=0 WHERE id=?",a.id);
    }
  }
  // Held assets returned during a lock must not advertise availability either.
  if(b.locked)e.run("UPDATE inventory SET for_trade=0 WHERE player=?",id);
  e.run("INSERT INTO account_lock_log(player,locked,at) VALUES(?,?,?)",id,b.locked?1:0,e.now());
  return {message:b.locked?"Account locked. Credit rewards and economic actions are blocked; open listings closed and holds returned.":"Account unlocked. Access recovery remains separate.",player:id,locked:b.locked};
}
