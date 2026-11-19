export const ARENA_FORMAT = '2v2-arena';
export const ARENA_LOBBY_FORMAT = 'lobby-arena';
export const arenaPlayerCounts = Object.freeze([4, 8, 12, 16]);

// Matchmaking windows are measured from the arrival of the fourth or eighth eligible player.
export const arenaRules = Object.freeze({
  preferredPlayers: 8,
  maxPlayers: arenaPlayerCounts.at(-1),
  gatherMs: 15000,
  smallFieldWaitMs: 90000,
  songsPerFixture: 5,
  guessSeconds: 20,
  startingRating: 1000,
});
