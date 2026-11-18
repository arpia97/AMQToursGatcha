// AES-GCM uses a fresh 12-byte IV and adds a 16-byte authentication tag.
export const PLAY_AUDIO_PROTOCOL = 4;
export const PLAY_AUDIO_IV_BYTES = 12;
export const PLAY_AUDIO_OVERHEAD = PLAY_AUDIO_IV_BYTES + 16;
export const playAudioBytes = (mode) => (mode === "ngmc-ranked" ? 832 : 1216) * 1024;

export function audioBase64(bytes) {
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

export function audioBytes(value) {
  return Uint8Array.from(atob(value.replaceAll("-", "+").replaceAll("_", "/")), char => char.charCodeAt(0));
}
