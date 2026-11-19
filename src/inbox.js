import { fail, integer } from "./engine.js";
import { NOTICE_TYPES, NOTICE_GROUPS, noticeGroup } from "../public/notification-types.js";

// Source-row triggers also cover host refreshes and publish paths. Deliver within
// the originating transaction so retries or a rollback cannot leave orphan alerts.
export function installInbox(e) {
  if (e.one("SELECT value FROM settings WHERE key='inbox_schema_v1'")) return;
  e.tx(() => {
    if (!e.all("PRAGMA table_info(player_notices)").some(c=>c.name==="inbox_read")) {
      e.run("ALTER TABLE player_notices ADD COLUMN inbox_read INTEGER NOT NULL DEFAULT 0");
      e.run("UPDATE player_notices SET inbox_read=1 WHERE seen=1");
    }
    e.run("CREATE INDEX IF NOT EXISTS inbox_history ON player_notices(player,id DESC)");
    e.run("CREATE INDEX IF NOT EXISTS inbox_unread ON player_notices(player,inbox_read,id DESC)");
    e.run("CREATE INDEX IF NOT EXISTS inbox_registered ON players(id) WHERE password IS NOT NULL");
    e.run("CREATE INDEX IF NOT EXISTS inbox_shop_start ON weekly_shop(starts)");
    const registered="p.password IS NOT NULL";
    const wishes="JOIN card_wishlist w ON w.player=p.id AND w.card=NEW.card";
    function trigger(name, event, when, kind, key, time, {join="", audience=registered, card="''", amount="0", meta="'{}'"}={}) {
      e.run(`CREATE TRIGGER IF NOT EXISTS inbox_${name} AFTER ${event} WHEN ${when} BEGIN
        INSERT INTO player_notices(player,event_key,kind,card,level,credits,created,metadata,seen)
        SELECT p.id,'inbox:${kind}:'||(${key})||':'||p.id,'${kind}',${card},1,${amount},${time},${meta},1
        FROM players p ${join} WHERE ${audience}
        AND COALESCE(json_extract(p.notice_preferences,'$."${kind}"'),1)=1
        ON CONFLICT(event_key) DO NOTHING; END`);
    }
    trigger("credit","INSERT ON ledger","NEW.reward=1","credit-reward","NEW.id","NEW.at",{audience:"p.id=NEW.player",amount:"NEW.delta",meta:"json_object('reason',NEW.reason)"});
    trigger("friend","INSERT ON player_friends","1","friend-add","NEW.player||':'||NEW.created","NEW.created",{
      audience:"p.id=NEW.friend",meta:"json_object('byId',NEW.player,'byName',(SELECT COALESCE(display_name,name) FROM players WHERE id=NEW.player))"});
    trigger("community","INSERT ON auctions","NEW.seller IS NULL","community-auction","NEW.id","NEW.starts",{card:"NEW.card"});
    for(const [table,kind,time] of [["trade_listings","wish-trade","created_at"],["market_listings","wish-shop","created"],["auctions","wish-auction","starts"],["weekly_shop","wish-shop","starts"]]){
      const shop=table==="weekly_shop";
      trigger(table,"INSERT ON "+table,"1",kind,"'"+table+":'||NEW.id","NEW."+time,{
        join:wishes,audience:shop?"1":"p.id IS NOT NEW.seller",card:"NEW.card",
        amount:table==="market_listings"||shop?"NEW.price":"0",
        meta:shop?"json_object('venue','Community shop')":"json_object('seller',(SELECT COALESCE(display_name,name) FROM players WHERE id=NEW.seller))"});
    }
    trigger("flash","INSERT ON weekly_shop","NEW.ends-NEW.starts=10800000 AND NOT EXISTS(SELECT 1 FROM weekly_shop s WHERE s.starts=NEW.starts AND s.id<>NEW.id)",
      "flash-open","NEW.starts","NEW.starts",{meta:"json_object('ends',NEW.ends)"});
    for(const [suffix,event,when] of [["create","INSERT","NEW.published=1"],["publish","UPDATE OF published","OLD.published=0 AND NEW.published=1"]]){
      trigger("quiz_"+suffix,event+" ON quizzes",when,"quiz-new","NEW.id||':'||NEW.updated","NEW.updated",{
        meta:"json_object('quiz',NEW.id,'quizName',NEW.name,'hasCover',length(NEW.cover)>0,'version',NEW.updated)"});
    }
    trigger("pickem","INSERT ON pickems","NEW.event_id IS NULL OR NOT EXISTS(SELECT 1 FROM pickems m WHERE m.event_id=NEW.event_id AND m.id<>NEW.id)",
      "pickem-new","NEW.id","COALESCE((SELECT created FROM pickem_events WHERE id=NEW.event_id),unixepoch()*1000)",
      {meta:"json_object('title',NEW.tour,'pickem',NEW.id,'reward',NEW.winner_reward)"});
    e.run("INSERT INTO settings VALUES('inbox_schema_v1',1)");
  });
}
export function saveNoticePreferences(e,player,prefs) {
  if(!prefs || typeof prefs!=="object" || Array.isArray(prefs)) fail("Choose valid notification settings.");
  for(const [kind,value] of Object.entries(prefs))
    if(!Object.hasOwn(NOTICE_TYPES,kind)||typeof value!=="boolean")fail("Choose valid notification settings.");
  e.run("UPDATE players SET notice_preferences=json_patch(notice_preferences,?) WHERE id=?",JSON.stringify(prefs),player);
}
export function inboxCount(e,player){
  return player?e.one("SELECT count(*) AS n FROM player_notices WHERE player=? AND inbox_read=0",player).n:0;
}
export function inboxPage(e,player,params){
  const group=params.get("group")||"", before=integer(Number(params.get("before")||0),0,Number.MAX_SAFE_INTEGER);
  if(group && !Object.hasOwn(NOTICE_GROUPS,group))fail("Unknown notification category.");
  const kinds=Object.keys(NOTICE_TYPES).concat(["market-sale","auction-sale","outbid","auction-buyout"]).filter(k=>noticeGroup(k)===group);
  const rows=e.all("SELECT id,kind,card,credits,created,inbox_read,metadata FROM player_notices WHERE player=?"+
    (before?" AND id<?":"")+(params.get("unread")==="1"?" AND inbox_read=0":"")+
    (group?" AND kind IN (SELECT value FROM json_each(?))":"")+" ORDER BY id DESC LIMIT 41",player,...(before?[before]:[]),...(group?[JSON.stringify(kinds)]:[]));
  const items=rows.slice(0,40).map(r=>({...r,metadata:JSON.parse(r.metadata)}));
  return {player,latest:e.one("SELECT max(id) AS id FROM player_notices WHERE player=?",player).id,items,more:rows.length>40,unread:inboxCount(e,player),cards:e.catalogStore.cards([...new Set(items.map(r=>r.card).filter(Boolean))])};
}
export function readInbox(e,player,b){
  const id=integer(b.id,1,Number.MAX_SAFE_INTEGER);
  e.run("UPDATE player_notices SET inbox_read=1,seen=1 WHERE player=? AND inbox_read=0 AND id"+(b.all===true?"<=?":"=?"),player,id);
  return {unread:inboxCount(e,player)};
}
