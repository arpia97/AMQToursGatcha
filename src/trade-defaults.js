// Correct the accidental auto-label backfill once. Filter eligibility is now
// independent of the manual Trade marker; never replay economic corrections.
export function migrateTradeDefaults(e) {
  return e.tx(()=>{
    const revision=e.one("SELECT value FROM settings WHERE key='automatic_trade_defaults_revision'")?.value||0;
    if(revision>=2)return false;
    if(revision===1) {
      const latest=new Map();
      // Exact scope lookups use the receipt primary-key index for each player.
      // Avoid scanning unrelated quiz/pack receipts inside the shared actor.
      for(const r of e.all("SELECT p.id AS player,r.input,r.result,r.at FROM players p CROSS JOIN receipts r WHERE r.scope=p.id||':trade-card' ORDER BY r.at,r.rowid")) {
        try {
          const b=JSON.parse(r.input),result=JSON.parse(r.result);
          const marked=typeof b.forTrade==='boolean'?b.forTrade:b.for_trade;
          if(result?.reverted || typeof b.card!=='string' || typeof marked!=='boolean')continue;
          latest.set(JSON.stringify([r.player,b.card]),{player:r.player,card:b.card,marked,at:r.at});
        } catch { /* Ignore malformed historical metadata, never invent a label. */ }
      }
      e.run("UPDATE inventory SET for_trade=0 WHERE for_trade!=0");
      for(const r of latest.values())if(r.marked)
        e.run("UPDATE inventory SET for_trade=1 WHERE player=? AND card=? AND acquired_at<=?",r.player,r.card,r.at);
    }
    e.run("INSERT INTO settings(key,value) VALUES('automatic_trade_defaults_revision',2) ON CONFLICT(key) DO UPDATE SET value=2");
    return true;
  });
}
