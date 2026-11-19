import {DUEL_FORMAT, duelRules} from './play-mode-rules.js';
import {ARENA_FORMAT, arenaRules} from './play-arena-config.js';

export function defaultPlayGuessSeconds(mode) {
  if (mode === DUEL_FORMAT) return duelRules.guessSeconds;
  if (mode === ARENA_FORMAT) return arenaRules.guessSeconds;
  return mode === 'ngmc-ranked' ? 20 : 30;
}

// AES-GCM uses a fresh 12-byte IV and adds a 16-byte authentication tag.
export const PLAY_AUDIO_PROTOCOL = 4;
export const PLAY_AUDIO_IV_BYTES = 12;
export const PLAY_AUDIO_OVERHEAD = PLAY_AUDIO_IV_BYTES + 16;
export const playAudioBytes = (mode) => (defaultPlayGuessSeconds(mode) === 20 ? 832 : 1216) * 1024;

export function audioBase64(bytes) {
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

export function audioBytes(value) {
  return Uint8Array.from(atob(value.replaceAll("-", "+").replaceAll("_", "/")), char => char.charCodeAt(0));
}
