import { inboxCount } from "./inbox.js";
import { listSummary } from "./play-anime-list.js";

// A compact, session-scoped header read. No inventory listing or game settlement.
export function playState(e, player) {
  if (!player) return { now: e.now(), me: null, avatar: null, titles: [] };
  const me = e.player(player);
  const item = me.avatar_card
    ? e.one("SELECT level FROM inventory WHERE player=? AND card=?", player, me.avatar_card)
    : null;
  const card = item ? e.catalogStore.cards([me.avatar_card])[0] : null;
  return {
    now: e.now(), me, inboxUnread:inboxCount(e,player), animeList:listSummary(e,player),
    avatar: card ? { ...card, level: item.level } : null,
    titles: e.quiz.titles(player),
  };
}

// Only public avatar presentation crosses into multiplayer actors.
export function playAvatar(e,me) {
  const item=me.avatar_card?e.one('SELECT level FROM inventory WHERE player=? AND card=?',me.id,me.avatar_card):null;
  const card=item?e.catalogStore.cards([me.avatar_card])[0]:null;
  return card?{image:card.image,rarity:card.rarity,level:item.level,crop:me.avatar_crop}:null;
}
