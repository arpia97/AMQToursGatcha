// Jikan's public instance closed on 2026-10-01. Tenrai is a maintainer-listed
// replacement with the same MAL IDs and Jikan v4 schema. Legacy export names
// and host endpoint paths remain compatible with existing tooling.
export const VOICE_SOURCE = {
  name: "Tenrai",
  baseUrl: "https://api.tenrai.org/v1",
  announcement: "https://github.com/jikan-me/jikan-rest/issues/613",
};
export async function fetchJikan(path, fetcher = fetch) {
  let response;
  try {
    response = await fetcher(VOICE_SOURCE.baseUrl + path, {
      headers: {
        Accept: "application/json",
        "User-Agent":
          "AMQToursGatcha/0.1 (https://github.com/arpia97/AMQToursGatcha)",
      },
      signal: AbortSignal.timeout(20000),
    });
  } catch (err) {
    const timeout = ["TimeoutError", "AbortError"].includes(err.name);
    throw Object.assign(
      new Error(
        timeout
          ? "Tenrai request timed out after 20 seconds."
          : "Could not connect to Tenrai.",
      ),
      {
        status: 502,
        upstreamStatus: 0,
        errorCode: timeout ? "UPSTREAM_TIMEOUT" : "UPSTREAM_NETWORK",
      },
    );
  }
  if (!response.ok) {
    const header = response.headers.get("Retry-After");
    const seconds = Number(header),
      date = Date.parse(header || "");
    const retryMs = header
      ? Number.isFinite(seconds)
        ? seconds * 1000
        : Math.max(0, date - Date.now())
      : 0;
    throw Object.assign(
      new Error(VOICE_SOURCE.name + " returned HTTP " + response.status),
      {
        status: 502,
        upstreamStatus: response.status,
        retryMs: Number.isFinite(retryMs) ? retryMs : 0,
      },
    );
  }
  const reader = response.body.getReader(),
    parts = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 5000000) {
      await reader.cancel();
      throw new Error("Voice source response exceeded import limits.");
    }
    parts.push(value);
  }
  const all = new Uint8Array(size);
  let offset = 0;
  for (const p of parts) {
    all.set(p, offset);
    offset += p.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(all));
}

export function personCard(person, language, series = "Voice actor") {
  if (
    !Number.isSafeInteger(person?.mal_id) ||
    person.mal_id < 1 ||
    typeof person.name !== "string" ||
    !person.name.trim() ||
    person.name.length > 160
  )
    return null;
  if (language !== "Japanese") return null;
  const image = person.images?.jpg?.image_url;
  if (
    typeof image !== "string" ||
    !/^https:\/\/cdn\.myanimelist\.net\//.test(image) ||
    /questionmark|apple-touch-icon|placeholder/i.test(image)
  )
    return null;
  return {
    id: "mal-person-" + person.mal_id,
    kind: "seiyuu",
    name: person.name.trim(),
    series: String(series).slice(0, 180),
    image,
    source: "https://myanimelist.net/people/" + person.mal_id,
  };
}

export function voiceCards(data, title) {
  if (!Array.isArray(data))
    throw new Error("Voice source returned an invalid cast response.");
  const cards = new Map();
  for (const character of data)
    for (const voice of character.voice_actors || []) {
      const c = personCard(voice.person, voice.language, title);
      if (c) cards.set(c.id, c);
    }
  return [...cards.values()];
}
