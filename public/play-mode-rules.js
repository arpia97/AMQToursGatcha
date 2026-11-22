import {ARENA_FORMAT, ARENA_LOBBY_FORMAT, arenaRules} from './play-arena-config.js';

export const PLAY_REVEAL_MS = 3_000;
export const NGMC_COUNTER_SIGNUP_MS = 40_000;
export const ngmcCounterDeadline = match => match.autoCountAt ?? match.counterDeadline;
export function ngmcCounterSignupOpen(match, player) {
  return match?.mode === 'ngmc-ranked' && match.phase === 'loading' && player && !player.left &&
    !match.counters[player.team] && !match.autoCounting?.[player.team];
}
export function ngmcCanTakeOverCounting(match, player) {
  return match?.mode === 'ngmc-ranked' && !['finished','cancelled'].includes(match.phase) &&
    player && !player.left && !match.counters[player.team] && !!match.autoCounting?.[player.team];
}
export const comparePlayTier=(a,b)=>(b.elo??-Infinity)-(a.elo??-Infinity)||String(a.id).localeCompare(String(b.id));

export const DUEL_FORMAT = '1v1-ranked';
export const DUEL_LOBBY_FORMAT = 'lobby-duel';
export const isDuelFormat = format => format === DUEL_FORMAT || format === DUEL_LOBBY_FORMAT;
export const duelRules = Object.freeze({songs:20, guessSeconds:20});
export const ONE_TEAM_MODE = 'one-team';
export const ONE_TEAM_FORMAT = 'one-team-survival';
export const oneTeamRules = Object.freeze({minPlayers:3,maxPlayers:8,songs:100,lives:5,guessSeconds:20,waitMs:20_000});
export const usesTeamBallot = format => format === 'lobby-team' || format === ONE_TEAM_FORMAT;

export function queueMode(format) {
  if (isDuelFormat(format)) return DUEL_FORMAT;
  if (format === ARENA_FORMAT) return ARENA_FORMAT;
  if (format.startsWith('lobby-')) return lobbyGameMode(format);
  if (format===ONE_TEAM_FORMAT||format==='1-team') return ONE_TEAM_MODE;
  return format.startsWith('ngmc-') ? 'ngmc-ranked' : 'song-artist';
}

export function lobbyGameMode(format) {
  if (format === ARENA_LOBBY_FORMAT) return ARENA_FORMAT;
  if (format === DUEL_LOBBY_FORMAT) return DUEL_FORMAT;
  if (format === 'lobby-team' || format === ONE_TEAM_FORMAT) return ONE_TEAM_MODE;
  return format === 'lobby-ngmc' ? 'ngmc-ranked' : 'song-artist';
}

export function lobbyCapacity(format) {
  if (format === DUEL_LOBBY_FORMAT) return 2;
  return format === ARENA_LOBBY_FORMAT ? arenaRules.maxPlayers : 8;
}

export const animeOnlyMode = mode => [DUEL_FORMAT, ARENA_FORMAT, 'ngmc-ranked',ONE_TEAM_MODE].includes(mode);
export const songArtistFields = Object.freeze(['anime','song','artist']);
export const isSongArtistLobby = format => format === 'lobby-team' || format === 'lobby-ffa';
export function matchGuessFields(match) {
  if (isSongArtistLobby(match.format)) return match.lobby?.guessFields ?? songArtistFields;
  return animeOnlyMode(match.mode) || isDuelFormat(match.format) || match.format === ONE_TEAM_FORMAT ? ['anime'] : songArtistFields;
}
export const soloVersus = format => format === '1v1' || isDuelFormat(format);
