import cards from '../public/community-cards.json' with { type: 'json' };
import {communityPortraitUrl} from '../public/community-portrait.js';

const byId = new Map(cards.map(card => [card.id, card]));
export function importedPortrait(card, previous) {
  const bundled = byId.get(card.id);
  return communityPortraitUrl(card.image || (bundled && (previous?.image || bundled.image)) || '');
}

export function syncBundledCards(engine) {
  const rows = engine.all('SELECT id,image FROM catalog WHERE id IN (SELECT value FROM json_each(?))', JSON.stringify([...byId.keys()]));
  if (!rows.length) return false;
  const existing = new Map(rows.map(row => [row.id, row]));
  // Keep the original seed requirement for adding cards to an established catalogue.
  const missing = existing.has('community-ggius-arronchu') ? cards.filter(card => !existing.has(card.id)) : [];
  const repairs = rows.map(row => [row, importedPortrait(row, row)]).filter(([row, image]) => row.image !== image);
  if (missing.length || repairs.length) {
    engine.tx(() => {
      if (missing.length) engine.host('catalog', {cards: missing});
      for (const [row, image] of repairs) {
        engine.run('UPDATE catalog SET image=? WHERE id=? AND image IS ?', image, row.id, row.image);
      }
    });
  }
  return existing.has('community-ggius-arronchu');
}
