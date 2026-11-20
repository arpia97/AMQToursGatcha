import {ARENA_FORMAT, ARENA_LOBBY_FORMAT, arenaRules} from './play-arena-config.js';

export const PLAY_REVEAL_MS = 3_000;
export const comparePlayTier=(a,b)=>(b.elo??-Infinity)-(a.elo??-Infinity)||String(a.id).localeCompare(String(b.id));

export const DUEL_FORMAT = '1v1-ranked';
export const DUEL_LOBBY_FORMAT = 'lobby-duel';
export const isDuelFormat = format => format === DUEL_FORMAT || format === DUEL_LOBBY_FORMAT;
export const duelRules = Object.freeze({songs:20, guessSeconds:20});

export function queueMode(format) {
  if (isDuelFormat(format)) return DUEL_FORMAT;
  if (format === ARENA_FORMAT) return ARENA_FORMAT;
  return format.startsWith('ngmc-') ? 'ngmc-ranked' : 'song-artist';
}

export function lobbyGameMode(format) {
  if (format === ARENA_LOBBY_FORMAT) return ARENA_FORMAT;
  if (format === DUEL_LOBBY_FORMAT) return DUEL_FORMAT;
  return format === 'lobby-ngmc' ? 'ngmc-ranked' : 'song-artist';
}

export function lobbyCapacity(format) {
  if (format === DUEL_LOBBY_FORMAT) return 2;
  return format === ARENA_LOBBY_FORMAT ? arenaRules.maxPlayers : 8;
}

export const animeOnlyMode = mode => [DUEL_FORMAT, ARENA_FORMAT, 'ngmc-ranked'].includes(mode);
export const soloVersus = format => format === '1v1' || isDuelFormat(format);
