export const SONG_FILTER_DEFAULTS = Object.freeze({
  q:'',type:'',order:'',ownership:'',exact:false,wishlist:false,favorite:false,protected:false,hideProtected:false,
});

export function songFilters(params){
  return {
    ...SONG_FILTER_DEFAULTS,
    q:(params.get('q')||'').trim().slice(0,120),
    type:['OP','ED','IN'].includes(params.get('type'))?params.get('type'):'',
    order:['title','artist','anime','difficulty','popularity'].includes(params.get('order'))?params.get('order'):'',
    ownership:['owned','missing'].includes(params.get('ownership'))?params.get('ownership'):'',
    ...Object.fromEntries(['exact','wishlist','favorite','protected','hideProtected'].map(key=>[key,params.get(key)==='1'])),
  };
}

export function songSortValue(song, field){
  if(field==='anime')return song.anime?.[0]?.name || '';
  return song[field];
}
export function compareSongValues(a,b){
  if(a==null||b==null)return Number(a==null)-Number(b==null);
  return typeof a==='number'?a-b:a.localeCompare(b);
}
export function compareSongs(a,b,field){
  return compareSongValues(songSortValue(a,field),songSortValue(b,field));
}
export function matchesSong(song, filters){
  const needle=filters.q.toLowerCase();
  if(needle && ![song.title,song.artist,...(song.anime||[]).map(a=>a.name)].some(value=>{
    const label=String(value||'').toLowerCase();
    return filters.exact?label===needle:label.includes(needle);
  }))return false;
  return !filters.type || song.anime?.some(a=>a.types.includes(filters.type));
}

export function matchesSongFlags(song, filters){
  return (!filters.wishlist||song.wishlist) && (!filters.favorite||song.favorite) &&
    (!filters.protected||song.protected) && (!filters.hideProtected||!song.protected) &&
    (!filters.ownership || song.owned===(filters.ownership==='owned'));
}

export function songFilterParams(filters){
  return new URLSearchParams(Object.entries(filters).filter(([,value])=>value).map(([key,value])=>[key,value===true?'1':value]));
}

export function songFilterBar(filters, {escape, expanded, defaultOrder, catalogue=false}){
  const field=(key,label,values)=>`<label class="card-filter-field">${label}<select name="${key}">${values.map(([value,name])=>`<option value="${value}" ${filters[key]===value?'selected':''}>${name}</option>`).join('')}</select></label>`;
  const check=(key,label)=>`<label><input type="checkbox" name="${key}" value="1" ${filters[key]?'checked':''}>${label}</label>`;
  return `<form class="collection-toolbar-main song-filter-bar" data-song-filters data-filter-scope="songs">
    ${field('type','Song Type',[['','All songs'],['OP','Openings'],['ED','Endings'],['IN','Inserts']])}
    <input class="search" name="q" type="search" maxlength="120" aria-label="Search songs" placeholder="Search song, artist or anime…" value="${escape(filters.q)}">
    ${field('order','Sort By',[['',defaultOrder],['title','Song title'],['artist','Artist'],['anime','Anime title'],['difficulty','AMQ difficulty · low to high'],['popularity','MAL popularity · most popular']])}
    <button type="submit" class="card-filter-toggle">Search</button>
    <button type="button" class="card-filter-toggle" data-music="filters" aria-expanded="${expanded}" aria-controls="song-filter-options">Filters</button>
    <div class="card-filter-options" id="song-filter-options" ${expanded?'':'hidden'}>
      <div class="card-filter-checks">${check('exact','Strict (exact title match)')}${check('wishlist','Wishlist Only')}${check('favorite','Favorites Only')}${check('protected','Protected Only')}${check('hideProtected','Hide Protected')}</div>
      ${catalogue?field('ownership','Ownership',[['','All songs'],['owned','Owned only'],['missing','Exclude owned']]):''}
      <button type="button" class="text-button" data-music="clear-filters">Clear Filters</button>
    </div>
  </form>`;
}
