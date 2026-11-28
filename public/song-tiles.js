import {SONG_EXCHANGE_COST} from './song-pack-rules.js';
import {songPoster} from './song-posters.js';
import {cardActionIcon} from './card-quick-actions.js';

export function songQuickActions(song,escape,version=''){
  if(!song.id&&!version)return '';
  const identity=song.id?`data-id="${song.id}"`:`data-index="${song.index}" data-key="${escape(song.key)}" data-version="${escape(version)}"`;
  const button=(flag,label,icon)=>`<button type="button" class="card-quick-button" data-action="songbook-flag" data-flag="${flag}" ${identity}
    aria-pressed="${!!song[flag]}" aria-label="${label} ${escape(song.title)}" title="${label}">${cardActionIcon(icon)}</button>`;
  return `<div class="song-quick-actions card-quick-actions" role="group" aria-label="Song preferences">
    ${button('wishlist','Wishlist','wishlist')}
    ${song.id?button('protected','Protect','protect')+button('favorite','Favorite','favorite')+button('showcased','Showcase on profile','showcase'):''}
  </div>`;
}

export function songCollectionButton(song,escape,version=''){
  const lookup = version ? `data-index="${song.index}" data-key="${escape(song.key)}" data-version="${escape(version)}"` : `data-id="${song.id}"`;
  return `<button type="button" class="button secondary song-buy" data-action="songbook-collection" ${lookup} data-title="${escape(song.title)}" data-duplicate="${!!song.owned}">Collection</button>`;
}

export function songAddButton(song,escape,addToList){
  const target = addToList===undefined
    ? `data-action="music-pick" data-track="${song.id}"`
    : `data-music="add-direct" data-id="${song.id}" ${addToList?'disabled':''}`;
  return `<button type="button" class="song-add" ${target}
    title="${addToList?'Already in playlist':'Add to playlist'}" aria-label="${addToList?'Already in playlist':`Add ${escape(song.title)} to playlist`}">${addToList?'✓':'＋'}</button>`;
}

export function songTile(song, {escape, badge = '', dock = false, catalogue = false, exchange = false, notes = 0, version = ''}){
  const anime = song.anime || [];
  const types = [...new Set(anime.flatMap(entry => entry.types || []))];
  const theme = types[0] === 'ED' ? 'ending' : types[0] === 'IN' ? 'insert' : 'opening';
  const title = escape(song.title);
  const series = anime.map(entry => entry.name).join(' · ');
  const playback = dock && song.id
    ? `<button type="button" class="song-dock-play" data-music="single" data-id="${song.id}"><span aria-hidden="true">▶</span> Play</button>`
    : song.audio ? `<div class="song-preview">
        <audio preload="none" src="${escape(song.audio)}"></audio>
        <button type="button" class="song-play" data-song-preview aria-label="Play ${title}" data-title="${title}"><span aria-hidden="true"></span></button>
        <input type="range" data-song-seek min="0" max="1" value="0" step="0.1" aria-label="Playback position for ${title}" disabled>
        <output aria-hidden="true">0:00</output>
      </div>` : '';
  const tags = `<span class="song-tile-type">${escape(types.join(' / '))}</span>${badge}`;
  return `<li class="song-tile song-tile--${theme}">
    <div class="song-tile-cover"><span class="song-art-placeholder" aria-hidden="true">♪</span>${songPoster(song)}${catalogue ? '' : tags}</div>
    <div class="song-tile-info">
      ${catalogue ? `<div class="song-tile-tags">${tags}</div>` : ''}
      <h3>${title}</h3><p>${escape(song.artist)}</p>
      ${series ? `<span class="song-tile-series" title="${escape(series)}">${escape(anime[0].name)}${anime.length > 1 ? ` +${anime.length - 1}` : ''}</span>` : ''}
    </div>
    ${song.id||playback||exchange?`<div class="song-tile-actions">${playback}
      ${exchange?`<button type="button" class="button secondary" data-action="songbook-choice" ${notes<SONG_EXCHANGE_COST?'disabled title="More Notes needed"':''} data-title="${title}" data-index="${song.index}" data-key="${escape(song.key)}" data-version="${escape(version)}" data-duplicate="${!!song.owned}">Choose · ${SONG_EXCHANGE_COST} Notes</button>`:''}
      ${song.id ? songAddButton(song,escape) : ''}
    </div>`:''}
    <div class="song-tile-options">${songQuickActions(song,escape,version)}${songCollectionButton(song,escape,version)}</div>
  </li>`;
}

export function featuredSongPanel(song,own,e){
  if(!song&&!own)return '';
  return `<section class="profile-featured featured-song"><div><span class="eyebrow">Featured song</span>${song?`<h2>${e(song.title)}</h2><span class="subtext">${e(song.artist)} · ${e(song.anime?.[0]?.name||'')}</span>`:''}</div>
    ${song?`<audio controls preload="none" src="${e(song.audio)}" aria-label="Play ${e(song.title)}"></audio>`:''}
    ${own?`<button class="text-button" data-action="songbook-owned">${song?'Change song':'Choose a song'}</button>`:''}</section>`;
}
export function installSongPreviews(toast){
  const dialog = document.getElementById('modal');
  let active;
  let volume = 0.5;
  function stop(){
    active?.pause();
    active = undefined;
  }
  function paint(audio){
    const root = audio.parentElement;
    if(!root)return;
    const button = root.querySelector('[data-song-preview]');
    const slider = root.querySelector('[data-song-seek]');
    const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0;
    root.closest('.song-tile').classList.toggle('is-listening', !audio.paused);
    button.setAttribute('aria-label', (audio.paused ? 'Play ' : 'Pause ') + button.dataset.title);
    slider.disabled = !duration;
    slider.max = duration || 1;
    slider.value = audio.currentTime;
    slider.style.setProperty('--played', (duration ? audio.currentTime / duration * 100 : 0) + '%');
    const elapsed = Math.floor(audio.currentTime || 0);
    root.querySelector('output').textContent = Math.floor(elapsed / 60) + ':' + String(elapsed % 60).padStart(2, '0');
  }
  dialog.addEventListener('click', async event => {
    const button = event.target.closest('[data-song-preview]');
    if(!button)return;
    const audio = button.parentElement.querySelector('audio');
    const shouldPlay = audio.paused;
    stop();
    if(!shouldPlay)return;
    active = audio;
    audio.volume = volume;
    try{
      if(audio.error)audio.load();
      await audio.play();
    }catch(error){
      if(active === audio && error.name !== 'AbortError'){
        stop();
        toast('Audio unavailable for this recording.',true);
      }
    }
  });
  for(const name of ['play','pause','loadedmetadata','timeupdate','ended','error']){
    dialog.addEventListener(name, event => {
      if(event.target.matches?.('.song-preview audio'))paint(event.target);
    }, true);
  }
  dialog.addEventListener('input', event => {
    const input = event.target;
    if(input.matches('[data-song-seek]'))input.parentElement.querySelector('audio').currentTime = Number(input.value);
    if(input.matches('[data-song-volume]')){
      volume = Number(input.value);
      if(active)active.volume = volume;
    }
  });
  new MutationObserver(() => {
    if(active && !active.isConnected)stop();
    const control = dialog.querySelector('[data-song-volume]');
    if(control)control.value = volume;
  }).observe(document.getElementById('modal-body'), {childList:true});
  dialog.addEventListener('close', () => { if(!dialog.open)stop(); });
  document.addEventListener('music-playback-start', stop);
  window.addEventListener('storage', event => { if(event.key === 'amqtours-gameplay-audio')stop(); });
}
