export const ARENA_FORMAT = '2v2-arena';
export const ARENA_LOBBY_FORMAT = 'lobby-arena';
export function arenaLeaders(standings) {
  const first = standings[0];
  return first ? standings.filter(row => row.points === first.points && row.difference === first.difference) : [];
}

export const arenaPlayerCounts = Object.freeze([4, 8, 12, 16]);

// Matchmaking windows are measured from the arrival of the fourth or eighth eligible player.
export const arenaRules = Object.freeze({
  preferredPlayers: 8,
  maxPlayers: arenaPlayerCounts.at(-1),
  gatherMs: 15000,
  smallFieldWaitMs: 90000,
  songsPerFixture: 20,
  guessSeconds: 20,
  startingRating: 1000,
});
