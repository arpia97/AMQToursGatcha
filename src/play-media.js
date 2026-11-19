import { audioBase64, audioBytes, PLAY_AUDIO_IV_BYTES, PLAY_AUDIO_OVERHEAD, playAudioBytes, defaultPlayGuessSeconds } from "../public/play-audio-format.js";
import { QUIZ_SERVERS, quizAudioUrl } from "../public/quiz-audio-cache.js";
import { clipMp3, mp3TagLength } from "./play-mp3.js";

const HOST = /^(eu|nae|naw)dist\.animemusicquiz\.com$/;
const encoder = new TextEncoder();
const ticketContext = encoder.encode("amqtours-play-audio-ticket-v1");
const TICKET_BYTES = 256;
const TICKET_LENGTH = Math.ceil((TICKET_BYTES + PLAY_AUDIO_OVERHEAD) * 4 / 3);
const random = size => crypto.getRandomValues(new Uint8Array(size));

export function playAudioSource(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && HOST.test(url.hostname) && !url.port &&
      !url.username && !url.password && !url.search && !url.hash && /^\/[a-z0-9_-]+\.mp3$/i.test(url.pathname)
      ? url.href : null;
  } catch { return null; }
}

async function ticketKey(secret, use) {
  if (typeof secret !== "string" || secret.length < 32) throw Error("Play audio is unavailable.");
  const bytes = await crypto.subtle.digest("SHA-256", encoder.encode("amqtours-play-audio-key-v1\0" + secret));
  return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, [use]);
}

function combine(a, b) {
  const result = new Uint8Array(a.length + b.byteLength);
  result.set(a);
  result.set(new Uint8Array(b), a.length);
  return result;
}

export async function sealPlayAudio(state, secret, issuedAt=state.created) {
  const cipher = await ticketKey(secret, "encrypt");
  const expires = issuedAt + 3 * 3600000;
  await Promise.all(state.audioPool.map(async entry => {
    const source = playAudioSource(entry.audio);
    if (!source) throw Error("Unsupported Play audio source.");
    const key = entry.key ?? audioBase64(random(32));
    const position = entry.round === null ? new DataView(random(4).buffer).getUint32(0) / 4294967296 : state.samplePositions[entry.round];
    const iv = random(PLAY_AUDIO_IV_BYTES);
    entry.rangeSample ??= !entry.key;
    const data = encoder.encode(JSON.stringify([source, key, position, state.mode, expires, entry.rangeSample]));
    if (data.length > TICKET_BYTES - 2) throw Error("Invalid Play audio ticket.");
    const padded = new Uint8Array(TICKET_BYTES);
    new DataView(padded.buffer).setUint16(0, data.length);
    padded.set(data, 2);
    const opaque = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: ticketContext }, cipher, padded);
    entry.ticket = audioBase64(combine(iv, opaque));
    entry.key = key;
  }));
  state.audioSealed = true;
}

async function openTicket(ticket, secret) {
  if (ticket.length !== TICKET_LENGTH || !/^[A-Za-z0-9_-]+$/.test(ticket)) return null;
  try {
    const bytes = audioBytes(ticket);
    if (audioBase64(bytes) !== ticket) return null;
    const cipher = await ticketKey(secret, "decrypt");
    const raw = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes.subarray(0, PLAY_AUDIO_IV_BYTES), additionalData: ticketContext },
      cipher, bytes.subarray(PLAY_AUDIO_IV_BYTES));
    const length = new DataView(raw).getUint16(0);
    const [source, key, position, mode, expires, rangeSample] = JSON.parse(new TextDecoder().decode(raw.slice(2, 2 + length)));
    if (!playAudioSource(source) || !Number.isSafeInteger(expires) || expires <= Date.now() ||
        !["song-artist", "ngmc-ranked", "2v2-arena"].includes(mode) || !Number.isFinite(position) || position < 0 || position >= 1 ||
        typeof key !== "string" || audioBytes(key).byteLength !== 32) return null;
    return { source, key, position, mode, rangeSample };
  } catch { return null; }
}

// Some valid AMQ MP3s contain a full-length track or large ID3 artwork.
// Read bounded byte windows even when a mirror ignores the Range header.
async function audioRange(source, start, length, fetcher) {
  const response = await fetcher(source, {
    headers: { Range: `bytes=${start}-${start + length - 1}` },
    redirect: "manual", signal: AbortSignal.timeout(12000),
  });
  const partial = response.status === 206;
  const range = /^bytes (\d+)-(\d+)\/(\d+)$/i.exec(response.headers.get("Content-Range") || "");
  const type = response.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase();
  if ((!partial && response.status !== 200) || !response.body ||
      (partial && (!range || Number(range[1]) !== start)) ||
      (type && !type.startsWith("audio/") && !["application/octet-stream","binary/octet-stream","application/mp3"].includes(type))) {
    await response.body?.cancel();
    throw Error("Unavailable MP3 range.");
  }
  const total = Number(partial ? range[3] : response.headers.get("Content-Length")) || null;
  const buffer = new Uint8Array(total === null ? length : Math.max(0, Math.min(length, total - start)));
  const reader = response.body.getReader();
  let skip = partial ? 0 : start, size = 0, done = false;
  try {
    while (size < buffer.length) {
      const chunk = await reader.read();
      if (chunk.done) { done = true; break; }
      const discarded = Math.min(skip, chunk.value.length);
      skip -= discarded;
      const slice = chunk.value.subarray(discarded, discarded + buffer.length - size);
      buffer.set(slice, size);
      size += slice.length;
    }
  } finally {
    if (!done) await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  return {bytes: buffer.subarray(0, size), total};
}

async function audioHead(source, fetcher) {
  const head = await audioRange(source, 0, 8192, fetcher);
  const start = mp3TagLength(head.bytes);
  if (start && head.bytes.length - start < 4096) {
    return {...await audioRange(source, start, 8192, fetcher), start};
  }
  return {...head, bytes: head.bytes.subarray(start), start};
}

// Validate real MPEG frames when selecting a recording. HEAD can succeed for
// an empty, corrupt, or differently encoded file on every mirror.
export async function playableMirror(source, fetcher) {
  if (!playAudioSource(source)) return null;
  for (const url of new Set([source, ...QUIZ_SERVERS.map(region => quizAudioUrl(source, region))])) {
    try {
      const head = await audioHead(url, fetcher);
      if (clipMp3(head.bytes, 0, 0.04).length) return url;
    } catch { /* Check the next mirror. */ }
  }
  return null;
}

async function encryptClip(ticket, server, fetcher) {
  const sources = new Set([quizAudioUrl(ticket.source, server), ticket.source, ...QUIZ_SERVERS.map(region => quizAudioUrl(ticket.source, region))]);
  const duration = defaultPlayGuessSeconds(ticket.mode);
  const payloadSize = playAudioBytes(ticket.mode);
  for (const source of sources) {
    try {
      const {bytes: head, start, total} = await audioHead(source, fetcher);
      const available = total === null ? null : total - start;
      // Room for the highest supported bitrate and for finding a frame boundary.
      const legacySmall = !ticket.rangeSample && total !== null && total <= 10 * 1024 * 1024;
      const window = legacySmall ? available : payloadSize + 8192;
      const offset = available === null ? 0 : Math.floor(Math.max(0, available - window) * ticket.position);
      const bytes = available !== null && head.length >= available ? head :
        (await audioRange(source, start + offset, window, fetcher)).bytes;
      const clip = clipMp3(bytes, available === null || available <= window ? ticket.position : 0, duration);
      if (!clip.length || clip.length > payloadSize - 4) continue;
      const padded = new Uint8Array(payloadSize);
      new DataView(padded.buffer).setUint32(0, clip.length);
      padded.set(clip, 4);
      const iv = random(PLAY_AUDIO_IV_BYTES);
      const key = await crypto.subtle.importKey("raw", audioBytes(ticket.key), "AES-GCM", false, ["encrypt"]);
      const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, padded);
      return combine(iv, encrypted);
    } catch { /* Try the next AMQ mirror for this same MP3. */ }
  }
  return null;
}

async function failureKey(secret, usage) {
  return crypto.subtle.importKey("raw", encoder.encode(secret), {name:"HMAC",hash:"SHA-256"}, false, [usage]);
}
export async function verifiedClipFailure(secret, clipKey, proof) {
  if (typeof proof !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(proof)) return false;
  return crypto.subtle.verify("HMAC", await failureKey(secret,"verify"), audioBytes(proof), encoder.encode("play-audio-unavailable-v1:" + clipKey));
}

export async function playAudioResponse(request, env, ctx, fetcher = (...args) => globalThis.fetch(...args)) {
  const url = new URL(request.url);
  const server = url.searchParams.get("server") || "EU";
  const opaque = url.pathname.slice("/api/play-audio/".length);
  const unavailable = status => new Response(null, { status, headers: { "Cache-Control": "no-store" } });
  if (request.method !== "GET" || !QUIZ_SERVERS.includes(server)) return unavailable(404);
  const ticket = await openTicket(opaque, env.HOST_TOKEN);
  if (!ticket) return unavailable(404);
  const cache = globalThis.caches?.default;
  const cacheKey = new Request(url.origin + url.pathname + "?server=" + server);
  const cached = await cache?.match(cacheKey).catch(() => null);
  if (cached) {
    return new Response(cached.body, { headers: audioHeaders("private, no-store", playAudioBytes(ticket.mode)) });
  }
  const bytes = await encryptClip(ticket, server, fetcher);
  if (!bytes) {
    const signature = await crypto.subtle.sign("HMAC", await failureKey(env.HOST_TOKEN,"sign"), encoder.encode("play-audio-unavailable-v1:" + ticket.key));
    return new Response(null,{status:502,headers:{"Cache-Control":"no-store","X-Play-Audio-Failure":audioBase64(new Uint8Array(signature))}});
  }
  if (cache) ctx.waitUntil(cache.put(cacheKey, new Response(bytes, { headers: audioHeaders("public, max-age=900", playAudioBytes(ticket.mode)) })).catch(() => {}));
  return new Response(bytes, { headers: audioHeaders("private, no-store", playAudioBytes(ticket.mode)) });
}

function audioHeaders(cacheControl, payloadBytes) {
  return {
    "Content-Type": "application/octet-stream", "Content-Length": String(payloadBytes + PLAY_AUDIO_OVERHEAD),
    "Cache-Control": cacheControl, "X-Content-Type-Options": "nosniff", "Cross-Origin-Resource-Policy": "same-origin",
  };
}
