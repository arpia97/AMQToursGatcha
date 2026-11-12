// Backfill once, not on every restart: later manual opt-outs must survive.
export function migrateTradeDefaults(e) {
  return e.tx(()=>{
    if((e.one("SELECT value FROM settings WHERE key='automatic_trade_defaults_revision'")?.value||0)>=1)return false;
    e.run("UPDATE inventory SET for_trade=CASE WHEN protected=0 AND player IN (SELECT id FROM players WHERE account_locked=0) THEN 1 ELSE 0 END WHERE for_trade!=CASE WHEN protected=0 AND player IN (SELECT id FROM players WHERE account_locked=0) THEN 1 ELSE 0 END");
    e.run("INSERT INTO settings(key,value) VALUES('automatic_trade_defaults_revision',1) ON CONFLICT(key) DO UPDATE SET value=1");
    return true;
  });
}
