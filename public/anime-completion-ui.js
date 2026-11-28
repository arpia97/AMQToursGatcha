import {RARITIES} from './card-values.js';

function completion(count,total) {
  const fraction=total?Math.min(1,count/total):0;
  const tier=RARITIES[Math.min(RARITIES.length-1,Math.floor(fraction*RARITIES.length))].toLowerCase();
  return {tier,percent:total?Math.floor(count*100/total):0};
}

export function animeTile(row,{title,player,own,pinned,escape:e}){
  if(row.ownershipHidden)return `<article class="anime-collection-summary"><strong>${e(title)}</strong><small aria-label="Collection progress is private">Private</small></article>`;
  const count=(row.owned||0)+(row.songOwned||0);
  const total=row.total+(row.songTotal||0);
  const {tier,percent}=completion(count,total);
  const key=e(row.series_key);
  return `<details class="anime-collection-tile" data-tier="${row.completionUnavailable?'unknown':tier}" data-player="${e(player||'')}" data-series="${key}">
    <summary><strong>${e(title)}</strong><span>${row.completionUnavailable?'—':percent+'%'}</span></summary>
    <div class="anime-collection-body"><div data-anime-items role="status"></div>
    ${own && row.total?`<footer><button class="text-button" data-action="anime-checklist-open" data-series="${key}">Expand</button><button class="text-button" data-action="pin-anime" data-series="${key}" data-pinned="${pinned}">${pinned?'Unpin':'Pin anime'}</button></footer>`:''}</div>
  </details>`;
}

export function installAnimeDetails(api,e){
  document.addEventListener('toggle',async event=>{
    const tile=event.target;
    if(!tile.matches?.('.anime-collection-tile')||!tile.open)return;
    const box=tile.querySelector('[data-anime-items]');
    if(box.dataset.loading)return;
    box.dataset.loading='true';
    box.textContent='Loading collection…';
    try{
      const params=new URLSearchParams({series:tile.dataset.series,player:tile.dataset.player});
      const {characters,songs,characterTotal,songTotal}=await api('anime-progress-details?'+params);
      const current=completion(characters.length+songs.length,characterTotal+songTotal);
      tile.dataset.tier=current.tier;
      tile.querySelector('summary span').textContent=current.percent+'%';
      const group=(heading,rows,total)=>`<section><h4>${heading}<small>${rows.length} / ${total}</small></h4>
        ${rows.length?`<ul>${rows.join('')}</ul>`:'<p>None collected</p>'}</section>`;
      box.innerHTML=group('Characters',characters.map(c=>`<li><span>${e(c.name)}</span><small>Lv. ${c.level}</small></li>`),characterTotal)
        +group('Songs',songs.map(s=>`<li><span>${e(s.title)}</span><small>${e(s.artist)}</small></li>`),songTotal);
    }catch{
      box.textContent='Collection unavailable. Reopen to retry.';
    }finally{delete box.dataset.loading;}
  },true);
}
