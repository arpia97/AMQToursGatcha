// Apply only the authenticated game snapshot. Shared catalogue/inventory data
// stays in place instead of being downloaded again after every paid move.
export function applyGameState(state, update) {
  if (!state?.me || update?.me?.id !== state.me.id) return null;
  if (update.now < (state.gameUpdatedAt ?? state.now)) return state;
  for (const kind of ["mahjong", "gem", "horseRace"]) {
    const old = state[kind],
      next = update[kind];
    if (
      old &&
      next &&
      (old.id > next.id || (old.id === next.id && old.version > next.version))
    )
      return state;
  }
  return {
    ...state,
    gameUpdatedAt: update.now,
    me: update.me,
    mahjong: update.mahjong,
    gem: update.gem,
    horseRace: update.horseRace,
    ledger: update.ledger,
    auctionWins: update.auctionWins,
  };
}
