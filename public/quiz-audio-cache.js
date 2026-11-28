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
            // These are validated MP3 sources. Generic/legacy MIME headers
            // must not become an unsupported blob source in Firefox.
            const mp3 = blob.type === "audio/mpeg" ? blob : new Blob([blob], { type: "audio/mpeg" });
            files.set(url, { url: createUrl(mp3), bytes: blob.size });
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

// Keep only the sliding audio window for this quiz. Foreground playback streams
// independently, even if a mirror rejects cross-origin background downloads.
export function createRollingQuizAudio(makeCache=createQuizAudioCache) {
  const entries=new Map();
  let owner=null, active=0, queue=[];
  function discard(source,entry){
    entries.delete(source);
    entry.controller.abort();
    entry.cache.clear();
  }
  function pump(){
    while(active<2 && queue.length){
      const entry=queue.shift();
      if(entry.controller.signal.aborted)continue;
      active++;
      const timeout=setTimeout(()=>entry.controller.abort(),15000);
      entry.pending=entry.cache.prepare([entry.source],entry.server,{signal:entry.controller.signal})
        .catch(()=>{}).finally(()=>{
          clearTimeout(timeout);
          active--;
          entry.pending=null;
          if(entry.controller.signal.aborted)entry.cache.clear();
          pump();
        });
    }
  }
  function clear(){
    queue=[];
    for(const [source,entry] of entries)discard(source,entry);
    owner=null;
  }
  return {
    clear,
    url(source,server){return entries.get(source)?.cache.url(source,server);},
    pending(source){return entries.get(source)?.pending;},
    update(runId,server,sources){
      const key=runId+' '+server;
      if(key!==owner){clear();owner=key;}
      const keep=new Set(sources);
      for(const [source,entry] of entries)if(!keep.has(source))discard(source,entry);
      for(const source of sources.slice(1)){
        if(!source||entries.has(source))continue;
        const entry={source,server,cache:makeCache(),controller:new AbortController()};
        entries.set(source,entry);
        queue.push(entry);
      }
      pump();
    },
  };
}
