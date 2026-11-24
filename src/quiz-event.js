import {artistKey, artistMatches, titleMatches} from './play-artists.js';

const validId = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/;
const audioUrl = /^https:\/\/files\.catbox\.moe\/[a-z0-9]{6}\.(mp3|flac)$/;
const label = s => typeof s === 'string' && s.trim().length > 0 && s.length <= 600;
const labels = a => Array.isArray(a) && a.length <= 150 && a.every(label);
const fail = (message, status = 400) => { throw Object.assign(Error(message), {status}); };
function eventKey(id) {
  if (!validId.test(id)) fail('Event link is invalid or expired.', 404);
  return 'private-quiz-event:' + id;
}
export async function registerEvent(storage, {id, name, songs}) {
  const key = eventKey(id);
  if (!label(name) || !Array.isArray(songs) || !songs.length || songs.length > 150 ||
      JSON.stringify(songs).length > 96000) fail('Choose a valid event name and song pool.');
  for (const s of songs) {
    if (!s || !label(s.title) || !label(s.artist) || !audioUrl.test(s.url) ||
        !labels(s.titles) || !labels(s.suggestions) || !labels(s.rule?.names) ||
        !Array.isArray(s.rule.members) || !s.rule.members.every(labels)) fail('Invalid event song.');
  }
  if (new Set(songs.map(s => s.url)).size !== songs.length) fail('Duplicate event audio.');
  const revision = crypto.randomUUID();
  await storage.put(key, {name, songs, revision});
  return {id, count:songs.length};
}
async function getEvent(storage, id) {
  const data = await storage.get(eventKey(id));
  if (!data) fail('Event link is invalid or expired.', 404);
  return data;
}
export async function eventAction(storage, {id, action, revision, index, song, artists}) {
  const event = await getEvent(storage,id);
  if (action === 'info') {
    const options = values => [...new Set(values)].sort((a,b) => a.localeCompare(b));
    return {name:event.name, count:event.songs.length, revision:event.revision,
      titles:options(event.songs.map(s => s.title)), artists:options(event.songs.flatMap(s => [s.artist,...s.suggestions]))};
  }
  if (revision !== event.revision) fail('This event has been updated. Reopen the shared link.',409);
  if (action !== 'answer' || !Number.isInteger(index) || !event.songs[index] ||
      typeof song !== 'string' || song.length > 600 || !labels(artists)) fail('Invalid event answer.');
  const s = event.songs[index];
  return {title:s.title, artist:s.artist, songCorrect:titleMatches([s.title,...s.titles],song),
    artistCorrect:artistMatches(s.artist,artists,{[artistKey(s.artist)]:s.rule})};
}
export async function eventAudio(storage, url, request, fetchAudio = fetch) {
  const event = await getEvent(storage,url.searchParams.get('event'));
  if (url.searchParams.get('v') !== event.revision) fail('Event changed.',409);
  const index = url.searchParams.get('song');
  const song = /^\d+$/.test(index) && event.songs[Number(index)];
  if (!song) fail('Song unavailable.',404);
  const range = request.headers.get('Range');
  const response = await fetchAudio(song.url,{redirect:'error',headers:range ? {Range:range} : {}});
  if (!response.ok) fail('The event audio is unavailable.',response.status===404 ? 404 : 502);
  const headers = new Headers({'Content-Type':song.url.endsWith('.flac')?'audio/flac':'audio/mpeg',
    'Cache-Control':'private, max-age=3600', 'X-Content-Type-Options':'nosniff'});
  for (const name of ['Content-Length','Content-Range','Accept-Ranges']) {
    if (response.headers.has(name)) headers.set(name,response.headers.get(name));
  }
  return new Response(response.body,{status:response.status,headers});
}

