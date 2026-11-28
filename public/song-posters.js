// Keep the recording's primary anime first when it belongs to several shows.
export function posterIds(song) {
  const ids = song?.anime?.map(entry => entry.mal) ?? song?.posterIds ?? [];
  return [...new Set(ids.map(Number).filter(id => Number.isSafeInteger(id) && id > 0))];
}

export function songPoster(song) {
  return '<song-poster aria-hidden="true" data-mal="' + posterIds(song).join(',') + '"></song-poster>';
}

const indexes = new Map();
function indexFor(id) {
  const shard = Math.floor(id / 4096);
  if (!indexes.has(shard)) {
    const path = new URL('./song-posters/' + shard + '.json', import.meta.url);
    indexes.set(shard, fetch(path).then(response => {
      if (response.ok) return response.json();
      if (response.status === 404) return {};
      throw new Error('Poster index unavailable');
    }).catch(() => {
      indexes.delete(shard);
      return {};
    }));
  }
  return indexes.get(shard);
}

if (globalThis.customElements && !customElements.get('song-poster')) {
  customElements.define('song-poster', class extends HTMLElement {
    static observedAttributes = ['data-mal'];
    generation = 0;
    connectedCallback() { this.refresh(); }
    disconnectedCallback() { this.generation++; }
    attributeChangedCallback() { if (this.isConnected) this.refresh(); }

    async refresh() {
      const generation = ++this.generation;
      this.removeAttribute('data-ready');
      this.replaceChildren();
      const ids = posterIds({posterIds: (this.dataset.mal || '').split(',')});
      for (const id of ids) {
        const index = await indexFor(id);
        if (this.generation !== generation) return;
        if (!/^\d+\/\d+$/.test(index[id])) continue;
        const img = new Image();
        img.alt = '';
        img.loading = 'lazy';
        img.decoding = 'async';
        img.referrerPolicy = 'no-referrer';
        const loaded = new Promise(resolve => {
          img.onload = () => resolve(true);
          img.onerror = () => resolve(false);
        });
        this.replaceChildren(img);
        img.src = 'https://cdn.myanimelist.net/images/anime/' + index[id] + '.jpg';
        const ok = await loaded;
        if (this.generation !== generation) return;
        if (ok) {
          this.setAttribute('data-ready', '');
          return;
        }
        img.remove();
      }
    }
  });
}
