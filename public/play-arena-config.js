export const ARENA_FORMAT = '2v2-arena';

// Matchmaking windows are measured from the arrival of the fourth or eighth eligible player.
export const arenaRules = Object.freeze({
  preferredPlayers: 8,
  maxPlayers: 16,
  gatherMs: 15000,
  smallFieldWaitMs: 90000,
  songsPerFixture: 5,
  guessSeconds: 20,
  startingRating: 1000,
});

export function queueMode(format) {
  if (format === ARENA_FORMAT) return ARENA_FORMAT;
  return format.startsWith('ngmc-') ? 'ngmc-ranked' : 'song-artist';
}
