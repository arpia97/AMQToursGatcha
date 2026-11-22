// The FuzzySet 0.0.8 fallback used by AMQ Autocomplete Improvement searches
// trigrams, then bigrams, and reranks up to 50 candidates by edit distance.
function gramCounts(text, size) {
  const padded = ('-' + text.replace(/[^a-z0-9, ]/g, '') + '-').padEnd(size, '-');
  const counts = new Map();
  for (let i = 0; i <= padded.length - size; i++) {
    const gram = padded.slice(i, i + size);
    counts.set(gram, (counts.get(gram) || 0) + 1);
  }
  return counts;
}

function gramIndex(keys, size) {
  const postings = new Map();
  const norms = [];
  for (const [i, key] of keys.entries()) {
    let norm = 0;
    for (const [gram, count] of gramCounts(key, size)) {
      if (!postings.has(gram)) postings.set(gram, []);
      postings.get(gram).push(i, count);
      norm += count * count;
    }
    norms.push(Math.sqrt(norm));
  }
  return {postings, norms};
}

function similarity(a, b) {
  const row = Array.from({length: b.length + 1}, (_, i) => i);
  for (let i = 0; i < a.length; i++) {
    let diagonal = row[0];
    row[0] = i + 1;
    for (let j = 0; j < b.length; j++) {
      const above = row[j + 1];
      row[j + 1] = Math.min(above + 1, row[j] + 1, diagonal + Number(a[i] !== b[j]));
      diagonal = above;
    }
  }
  return 1 - row[b.length] / Math.max(a.length, b.length);
}

export function similarTitles(bank, query) {
  if (bank.byKey.has(query)) return [query];
  bank.keys ??= [...bank.byKey.keys()];
  bank.grams ??= new Map();
  for (const size of [3, 2]) {
    if (!bank.grams.has(size)) bank.grams.set(size, gramIndex(bank.keys, size));
    const {postings, norms} = bank.grams.get(size);
    const scores = new Map();
    for (const [gram, count] of gramCounts(query, size)) {
      const entries = postings.get(gram);
      if (!entries) continue;
      for (let j = 0; j < entries.length; j += 2) {
        const i = entries[j];
        scores.set(i, (scores.get(i) || 0) + count * entries[j + 1]);
      }
    }
    const matches = [...scores].map(([i, score]) => ({i, score: score / norms[i]}))
      .sort((a, b) => b.score - a.score || a.i - b.i).slice(0, 50)
      .map(({i}) => ({key: bank.keys[i], score: similarity(query, bank.keys[i])}))
      .filter(match => match.score >= 0.33).sort((a, b) => b.score - a.score);
    if (matches.length) return matches.map(match => match.key);
  }
  return [];
}
