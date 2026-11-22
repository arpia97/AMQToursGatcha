// Anime dropdown rules adapted from Juvian's AMQ Autocomplete Improvement 1.41 (MIT).
import {cleanAnimeTitle, animeSymbols} from './anime-search-characters.js';
import {similarTitles} from './anime-search-typos.js';

const banks = new WeakMap();
const compare = (a, b) => a === b ? 0 : a < b ? -1 : 1;

function indexFor(titles) {
  let bank = banks.get(titles);
  if (bank?.length === titles.length) return bank;
  const rows = [];
  const byKey = new Map();
  const seen = new Set();
  const ordered = [...new Set(titles)].filter(title => title.trim())
    .sort((a, b) => a.length - b.length || compare(a, b));
  for (const [order, title] of ordered.entries()) {
    const key = cleanAnimeTitle(title);
    const symbols = animeSymbols(title);
    const row = {title, key, symbols, words: key.split(' '), order};
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(row);
    const identity = JSON.stringify([key, symbols]);
    if (!seen.has(identity)) rows.push(row);
    seen.add(identity);
  }
  bank = {length: titles.length, rows, byKey,
    alphabetical: rows.slice().sort((a, b) => compare(a.key, b.key))};
  banks.set(titles, bank);
  return bank;
}

function includesSymbols(symbols, requested) {
  if (!requested) return true;
  let i = 0;
  for (let j = 0; j < symbols.length; j++) if (symbols[j] === requested[i]) i++;
  return i === requested.length;
}

// Each query fragment needs its own title word, even when fragments overlap.
function distinctWords(words, fragments) {
  if (fragments.length > words.length) return false;
  const assigned = new Map();
  function assign(fragment, visited) {
    for (let i = 0; i < words.length; i++) {
      if (visited.has(i) || !words[i].includes(fragments[fragment])) continue;
      visited.add(i);
      if (!assigned.has(i) || assign(assigned.get(i), visited)) {
        assigned.set(i, fragment);
        return true;
      }
    }
    return false;
  }
  return fragments.every((_, i) => assign(i, new Set()));
}

// Match o/ou/oo and u/uu without backtracking through long repeated vowels.
function containsPhrase(title, query) {
  if (title.includes(query)) return true;
  if (!/[ou]/.test(query)) return false;
  let ends = new Set();
  for (let i = 0; i < title.length; i++) if (title[i] === query[0]) ends.add(i);
  for (const ch of query) {
    const next = new Set();
    for (const i of ends) {
      if (title[i] !== ch) continue;
      next.add(i + 1);
      if ((ch === 'o' && (title[i + 1] === 'o' || title[i + 1] === 'u'))
        || (ch === 'u' && title[i + 1] === 'u')) next.add(i + 2);
    }
    if (!next.size) return false;
    ends = next;
  }
  return ends.size > 0;
}

export function quizAnswerOptions(titles, query, limit = 20) {
  const raw = String(query ?? '').trim().slice(0, 120);
  if (!raw || limit <= 0) return [];
  const bank = indexFor(titles);
  const key = cleanAnimeTitle(raw);
  const symbols = animeSymbols(raw);
  const fragments = key.split(' ').filter(Boolean);
  const found = [];
  const prefix = new Set();
  if (key) {
    // In 1.41 the prefix pass fills the dropdown from the alphabetized index.
    let lo = 0, hi = bank.alphabetical.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (bank.alphabetical[mid].key < key) lo = mid + 1;
      else hi = mid;
    }
    for (let i = lo; i < bank.alphabetical.length; i++) {
      const row = bank.alphabetical[i];
      if (!row.key.startsWith(key)) break;
      if (!includesSymbols(row.symbols, symbols)) continue;
      prefix.add(row);
      if (prefix.size >= limit) break;
    }
    found.push(...[...prefix].sort((a, b) => a.order - b.order));
  }
  const partial = [];
  for (const row of bank.rows) {
    if (found.length >= limit) break;
    if (prefix.has(row) || !includesSymbols(row.symbols, symbols)) continue;
    if (!key) {
      if (symbols) found.push(row);
      continue;
    }
    if (!fragments.every(word => row.key.includes(word))) continue;
    if (fragments.length > 1 && !distinctWords(row.words, fragments)) continue;
    if (containsPhrase(row.key, key)) found.push(row);
    else if (fragments.length > 1 && partial.length < limit) partial.push(row);
  }
  found.push(...partial.slice(0, limit - found.length));
  if (!found.length && key) {
    for (const match of similarTitles(bank, key)) {
      for (const row of bank.byKey.get(match)) {
        found.push(row);
        if (found.length >= limit) break;
      }
      if (found.length >= limit) break;
    }
    // 1.41 displays shortlisted typo matches in the original catalog order.
    found.sort((a, b) => a.order - b.order);
  }
  return found.map(row => row.title);
}
