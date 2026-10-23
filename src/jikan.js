// Only the public Jikan JSON API is accessed. No MAL HTML pages are crawled.
export async function fetchJikan(path, fetcher = fetch) {
  const response = await fetcher("https://api.jikan.moe/v4" + path, {
    headers: {
      Accept: "application/json",
      "User-Agent":
        "AMQToursGatcha/0.1 (https://github.com/arpia97/AMQToursGatcha)",
    },
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) {
    const header = response.headers.get("Retry-After");
    const seconds = Number(header),
      date = Date.parse(header || "");
    const retryMs = header
      ? Number.isFinite(seconds)
        ? seconds * 1000
        : Math.max(0, date - Date.now())
      : 0;
    throw Object.assign(new Error("Jikan returned HTTP " + response.status), {
      status: 502,
      upstreamStatus: response.status,
      retryMs: Number.isFinite(retryMs) ? retryMs : 0,
    });
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
      throw new Error("Jikan response exceeded import limits.");
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
    throw new Error("Jikan returned an invalid cast response.");
  const cards = new Map();
  for (const character of data)
    for (const voice of character.voice_actors || []) {
      const c = personCard(voice.person, voice.language, title);
      if (c) cards.set(c.id, c);
    }
  return [...cards.values()];
}
