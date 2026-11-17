// A compact, session-scoped header read. No inventory listing or game settlement.
export function playState(e, player) {
  if (!player) return { now: e.now(), me: null, avatar: null, titles: [] };
  const me = e.player(player);
  const item = me.avatar_card
    ? e.one("SELECT level FROM inventory WHERE player=? AND card=?", player, me.avatar_card)
    : null;
  const card = item ? e.catalogStore.cards([me.avatar_card])[0] : null;
  return {
    now: e.now(), me,
    avatar: card ? { ...card, level: item.level } : null,
    titles: e.quiz.titles(player),
  };
}
