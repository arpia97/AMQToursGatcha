export const QUIZ_SERVERS = ["EU", "NAE", "NAW"];
export function quizAudioUrl(value, server = "EU") {
  const url = new URL(value);
  if (!QUIZ_SERVERS.includes(server)) throw Error("Choose a quiz server.");
  if (/^(eu|nae|naw)dist\.animemusicquiz\.com$/i.test(url.hostname))
    url.hostname = server.toLowerCase() + "dist.animemusicquiz.com";
  return url.href;
}
// Blob URLs and downloaded bytes live only in this page, never Cache Storage,
// IndexedDB or a service worker. Closing/reloading the page releases the cache.
export function createQuizAudioCache({
  fetcher = globalThis.fetch,
  createUrl = (b) => URL.createObjectURL(b),
  revokeUrl = (u) => URL.revokeObjectURL(u),
} = {}) {
  const files = new Map();
  return {
    url(source, server) {
      return files.get(quizAudioUrl(source, server))?.url || null;
    },
    clear() {
      for (const f of files.values()) revokeUrl(f.url);
      files.clear();
    },
    async prepare(sources, server, { signal, onProgress = () => {} } = {}) {
      const urls = [...new Set(sources.map((s) => quizAudioUrl(s, server)))];
      let cursor = 0,
        loaded = urls.filter((u) => files.has(u)).length,
        bytes = urls.reduce((sum, u) => sum + (files.get(u)?.bytes || 0), 0),
        failed = null;
      const progress = () => onProgress({ loaded, total: urls.length, bytes });
      progress();
      const work = async () => {
        while (cursor < urls.length && !failed) {
          signal?.throwIfAborted();
          const url = urls[cursor++];
          if (files.has(url)) continue;
          try {
            const response = await fetcher(url, {
              signal,
              credentials: "omit",
              referrerPolicy: "no-referrer",
              cache: "no-store",
            });
            if (!response.ok)
              throw Error("Audio download failed (" + response.status + ").");
            const blob = await response.blob();
            signal?.throwIfAborted();
            if (
              !blob.size ||
              (!blob.type.startsWith("audio/") &&
                !blob.type.startsWith("application/octet-stream") &&
                blob.type)
            )
              throw Error("The server did not return a playable MP3.");
            files.set(url, { url: createUrl(blob), bytes: blob.size });
            loaded++;
            bytes += blob.size;
            progress();
          } catch (error) {
            failed = error;
          }
        }
      };
      await Promise.all([work(), work()]);
      if (failed) throw failed;
      signal?.throwIfAborted();
      return { loaded, total: urls.length, bytes };
    },
  };
}
