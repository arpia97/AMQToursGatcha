export const TENRAI_BASE_URL = "https://api.tenrai.org/v1";

const portraitPaths = {
  character: /^https:\/\/cdn\.myanimelist\.net\/images\/characters\/\d+\/\d+\.(?:jpe?g|webp|png)$/i,
  seiyuu: /^https:\/\/cdn\.myanimelist\.net\/images\/voiceactors\/\d+\/\d+\.(?:jpe?g|webp|png)$/i,
};

export function isSourcePortrait(kind, url) {
  return typeof url === "string" && portraitPaths[kind]?.test(url);
}

export function sourcePortrait(kind, images) {
  return [images?.jpg?.image_url, images?.webp?.image_url].find(
    url => isSourcePortrait(kind, url),
  );
}

// Coalesce failed copies of the same card. Healthy portraits never need a lookup.
const lookups = new Map();
export function replacementPortrait(cardId) {
  const match = /^mal-(character|person)-([1-9]\d{0,8})$/.exec(cardId);
  if (!match) return;
  const cached = lookups.get(cardId);
  if (cached && cached.expires > Date.now()) return cached.result;
  const character = match[1] === "character";
  const entry = { expires: Date.now() + 60000 };
  entry.result = (async () => {
    try {
      const response = await fetch(
        TENRAI_BASE_URL + "/" + (character ? "characters" : "people") + "/" + match[2],
        { credentials: "omit", referrerPolicy: "no-referrer", signal: AbortSignal.timeout(8000) },
      );
      if (!response.ok) return;
      const { data } = await response.json();
      if (data?.mal_id !== Number(match[2])) return;
      const url = sourcePortrait(character ? "character" : "seiyuu", data.images);
      if (url) entry.expires = Date.now() + 3600000;
      return url;
    } catch {
      return;
    }
  })();
  if (lookups.size >= 512) lookups.delete(lookups.keys().next().value);
  lookups.set(cardId, entry);
  return entry.result;
}
