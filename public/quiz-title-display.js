// Display metadata only: never use translated labels to grade an answer.
const key = (title) => String(title || "").normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");

export function quizTitleRows(master) {
  return Object.values(master.animeMap || {}).map((anime) => {
    const english = anime.mainNames?.EN || "";
    const romaji = anime.mainNames?.JA || "";
    const aliases = [...new Set((anime.names || []).map((n) => n.name))]
      .filter((name) => name && name !== english && name !== romaji);
    return [english, romaji, aliases];
  });
}

export function createQuizTitleDisplay(rows) {
  const names = new Map();
  const add = (title, pair) => {
    const id = key(title);
    if (!id) return;
    const old = names.get(id);
    // A shared alias can name different anime. Keep the original in that case.
    const same = old?.[0] === pair[0] && old?.[1] === pair[1];
    names.set(id, old === undefined || same ? pair : null);
  };
  for (const [english, romaji, aliases = []] of rows) {
    const pair = [english, romaji];
    for (const title of [english, romaji, ...aliases]) add(title, pair);
  }
  return (song, mode = "romaji") => {
    const original = song.anime || song.answer || song.answers?.[0] || "";
    const pair = names.get(key(original));
    const english = song.animeENName || pair?.[0];
    const romaji = song.animeJPName || pair?.[1];
    return mode === "english"
      ? english || romaji || original
      : romaji || english || original;
  };
}

let display = createQuizTitleDisplay([]);
let loading;
export const quizAnimeTitle = (song, mode) => display(song, mode);
export function loadQuizTitleDisplay() {
  // One static, browser-cached download on entering Quiz; no per-song API work.
  return loading ||= fetch(new URL("./quiz-anime-titles.json", import.meta.url), {
    signal: AbortSignal.timeout(8000),
  })
    .then((response) => {
      if (!response.ok) throw Error("Anime display names are unavailable.");
      return response.json();
    })
    .then((rows) => { display = createQuizTitleDisplay(rows); })
    .catch(() => { loading = null; });
}
