import { audioBase64, audioBytes, PLAY_AUDIO_IV_BYTES, PLAY_AUDIO_OVERHEAD, playAudioBytes } from "../public/play-audio-format.js";
import { QUIZ_SERVERS, quizAudioUrl } from "../public/quiz-audio-cache.js";
import { clipMp3 } from "./play-mp3.js";

const HOST = /^(eu|nae|naw)dist\.animemusicquiz\.com$/;
const MAX_SOURCE_BYTES = 10 * 1024 * 1024;
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

export async function sealPlayAudio(state, secret) {
  const cipher = await ticketKey(secret, "encrypt");
  const expires = state.created + 3 * 3600000;
  await Promise.all(state.audioPool.map(async entry => {
    const source = playAudioSource(entry.audio);
    if (!source) throw Error("Unsupported Play audio source.");
    const key = audioBase64(random(32));
    const position = entry.round === null ? new DataView(random(4).buffer).getUint32(0) / 4294967296 : state.samplePositions[entry.round];
    const iv = random(PLAY_AUDIO_IV_BYTES);
    const data = encoder.encode(JSON.stringify([source, key, position, state.mode, expires]));
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
    const [source, key, position, mode, expires] = JSON.parse(new TextDecoder().decode(raw.slice(2, 2 + length)));
    if (!playAudioSource(source) || !Number.isSafeInteger(expires) || expires <= Date.now() ||
        !["song-artist", "ngmc-ranked"].includes(mode) || !Number.isFinite(position) || position < 0 || position >= 1 ||
        typeof key !== "string" || audioBytes(key).byteLength !== 32) return null;
    return { source, key, position, mode };
  } catch { return null; }
}

async function sourceBytes(response) {
  if (!response.ok || !response.body) {
    await response.body?.cancel();
    throw Error("Audio fetch failed.");
  }
  const length = Number(response.headers.get("Content-Length"));
  const type = response.headers.get("Content-Type")?.split(";")[0];
  if (length > MAX_SOURCE_BYTES || type && !type.startsWith("audio/") &&
      !["application/octet-stream", "binary/octet-stream", "application/mp3"].includes(type)) {
    await response.body.cancel();
    throw Error("Unexpected audio response.");
  }
  // Allocate once for the normal length-bearing MP3 response. The size guard
  // also covers upstreams that omit or misreport their Content-Length.
  const chunks = [];
  const buffer = length > 0 ? new Uint8Array(length) : null;
  const reader = response.body.getReader();
  let size = 0, done = false;
  try {
    while (!done) {
      const result = await reader.read();
      done = result.done;
      if (done) break;
      if (size + result.value.length > (buffer?.length ?? MAX_SOURCE_BYTES)) throw Error("MP3 too large.");
      if (buffer) buffer.set(result.value, size);
      else chunks.push(result.value);
      size += result.value.length;
    }
  } finally {
    if (!done) await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  if (buffer) return buffer.subarray(0, size);
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}

async function encryptClip(ticket, server, fetcher) {
  const sources = new Set([quizAudioUrl(ticket.source, server), ticket.source]);
  const duration = ticket.mode === "ngmc-ranked" ? 20 : 30;
  for (const source of sources) {
    try {
      const mp3 = await sourceBytes(await fetcher(source, { redirect: "manual", signal: AbortSignal.timeout(12000) }));
      const clip = clipMp3(mp3, ticket.position, duration);
      const padded = new Uint8Array(playAudioBytes(ticket.mode));
      if (!clip.length || clip.length > padded.length - 4) continue;
      new DataView(padded.buffer).setUint32(0, clip.length);
      padded.set(clip, 4);
      const iv = random(PLAY_AUDIO_IV_BYTES);
      const key = await crypto.subtle.importKey("raw", audioBytes(ticket.key), "AES-GCM", false, ["encrypt"]);
      const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, padded);
      return combine(iv, encrypted);
    } catch { /* Try the verified original mirror if the preferred one fails. */ }
  }
  return null;
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
  if (!bytes) return unavailable(502);
  if (cache) ctx.waitUntil(cache.put(cacheKey, new Response(bytes, { headers: audioHeaders("public, max-age=900", playAudioBytes(ticket.mode)) })).catch(() => {}));
  return new Response(bytes, { headers: audioHeaders("private, no-store", playAudioBytes(ticket.mode)) });
}

function audioHeaders(cacheControl, payloadBytes) {
  return {
    "Content-Type": "application/octet-stream", "Content-Length": String(payloadBytes + PLAY_AUDIO_OVERHEAD),
    "Cache-Control": cacheControl, "X-Content-Type-Options": "nosniff", "Cross-Origin-Resource-Policy": "same-origin",
  };
}
