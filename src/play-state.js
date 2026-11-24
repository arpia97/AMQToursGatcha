import { inboxSummary } from "./inbox.js";
import { listSummary } from "./play-anime-list.js";

// A compact, session-scoped header read. No inventory listing or game settlement.
export const guestPlayState=now=>({now,me:null,avatar:null,titles:[]});
export function playState(e, player) {
  if (!player) return guestPlayState(e.now());
  const me = e.player(player);
  const item = me.avatar_card
    ? e.one("SELECT level FROM inventory WHERE player=? AND card=?", player, me.avatar_card)
    : null;
  const card = item ? e.catalogStore.cards([me.avatar_card])[0] : null;
  return {
    now: e.now(), me, ...inboxSummary(e,player), animeList:listSummary(e,player),
    avatar: card ? { ...card, level: item.level } : null,
    titles: e.quiz.titles(player),
  };
}

export function playOverviewPlayers(e,onlinePlayers) {
  if(!onlinePlayers.length)return [];
  const status=new Map(onlinePlayers.map(player=>[player.id,player.status]));
  const rows=e.all(`SELECT p.id,COALESCE(p.display_name,p.name) AS name,p.avatar_crop,p.avatar_card,i.level
    FROM json_each(?) active CROSS JOIN players p ON p.id=active.value
    LEFT JOIN inventory i ON i.player=p.id AND i.card=p.avatar_card
    ORDER BY name COLLATE NOCASE,p.id`,JSON.stringify([...status.keys()]));
  const cards=new Map(e.catalogStore.cards(rows.filter(row=>row.level!=null).map(row=>row.avatar_card))
    .map(card=>[card.id,card]));
  return rows.map(({id,name,avatar_card,avatar_crop,level})=>{
    const card=cards.get(avatar_card);
    const avatar=card&&level!=null?{image:card.image,rarity:card.rarity,level,crop:avatar_crop}:null;
    return {id,name,avatar,status:status.get(id)};
  });
}

// Only public avatar presentation crosses into multiplayer actors.
export function playAvatar(e,me) {
  const item=me.avatar_card?e.one('SELECT level FROM inventory WHERE player=? AND card=?',me.id,me.avatar_card):null;
  const card=item?e.catalogStore.cards([me.avatar_card])[0]:null;
  return card?{image:card.image,rarity:card.rarity,level:item.level,crop:me.avatar_crop}:null;
}
