import {ARENA_FORMAT} from './play-arena-config.js';

export const PLAY_REVEAL_MS = 3_000;
export const DUEL_FORMAT = '1v1-ranked';
export const duelRules = Object.freeze({songs:20, guessSeconds:20});

export function queueMode(format) {
  if (format === ARENA_FORMAT || format === DUEL_FORMAT) return format;
  return format.startsWith('ngmc-') ? 'ngmc-ranked' : 'song-artist';
}

export const animeOnlyMode = mode => [DUEL_FORMAT, ARENA_FORMAT, 'ngmc-ranked'].includes(mode);
export const soloVersus = format => format === '1v1' || format === DUEL_FORMAT;
