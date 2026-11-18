import { audioBytes, PLAY_AUDIO_IV_BYTES, PLAY_AUDIO_OVERHEAD, playAudioBytes } from "./play-audio-format.js";

export function createSealedAudioCache(apiBase, mode) {
  const files = new Map();
  const expected = playAudioBytes(mode) + PLAY_AUDIO_OVERHEAD;
  const cacheKey = (ticket, server) => server + ":" + ticket;
  return {
    has(ticket, server) { return files.has(cacheKey(ticket, server)); },
    clear() { files.clear(); },
    discard(ticket, server) { files.delete(cacheKey(ticket, server)); },
    async prepare(tickets, server, { signal, onProgress }) {
      let cursor = 0, failed;
      const download = async () => {
        while (cursor < tickets.length && !failed) {
          signal.throwIfAborted();
          const ticket = tickets[cursor++], key = cacheKey(ticket, server);
          if (files.has(key)) continue;
          const url = new URL("play-audio/" + ticket, apiBase);
          url.searchParams.set("server", server);
          try {
            const response = await fetch(url, { signal, credentials: "omit", referrerPolicy: "no-referrer", redirect: "error" });
            const length = response.headers.get("Content-Length");
            if (!response.ok || length !== null && Number(length) !== expected) {
              const proof = response.headers.get("X-Play-Audio-Failure");
              await response.body?.cancel();
              throw Object.assign(Error("Encrypted audio could not load."), {ticket,proof});
            }
            const bytes = new Uint8Array(await response.arrayBuffer());
            signal.throwIfAborted();
            if (bytes.byteLength !== expected) throw Error("Incomplete encrypted audio.");
            files.set(key, bytes);
            onProgress();
          } catch (error) { if (!failed || error.proof) failed = error; }
        }
      };
      await Promise.all([download(), download()]);
      if (failed) throw failed;
    },
    async decrypt(ticket, server, material) {
      const bytes = files.get(cacheKey(ticket, server));
      if (!bytes) return null;
      const key = await crypto.subtle.importKey("raw", audioBytes(material), "AES-GCM", false, ["decrypt"]);
      const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes.subarray(0, PLAY_AUDIO_IV_BYTES) }, key,
        bytes.subarray(PLAY_AUDIO_IV_BYTES));
      const length = new DataView(plain).getUint32(0);
      if (!length || length > plain.byteLength - 4) throw Error("Invalid encrypted clip.");
      return new Blob([new Uint8Array(plain, 4, length)], { type: "audio/mpeg" });
    },
  };
}

// A short silent WAV unlocks the same Audio element without revealing a clip.
export function silentPlayAudio() {
  const samples = 800, rate = 8000;
  const bytes = new Uint8Array(44 + samples * 2);
  const view = new DataView(bytes.buffer);
  const tag = (offset, value) => bytes.set(new TextEncoder().encode(value), offset);
  tag(0, "RIFF"); view.setUint32(4, bytes.length - 8, true); tag(8, "WAVEfmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true);
  view.setUint16(34, 16, true); tag(36, "data"); view.setUint32(40, samples * 2, true);
  return new Blob([bytes], { type: "audio/wav" });
}
