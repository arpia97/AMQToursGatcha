import {DUPLICATE_NOTES,SONG_EXCHANGE_COST,SONG_PACK_PRICE,SONG_PACK_SIZE} from './song-pack-rules.js';
import {songTile} from './song-tiles.js?v=song-catalogue';

import {quantityInput} from './quantity-input.js';

const packArt = '<span class="song-pack-art" aria-hidden="true"><span class="song-pack-disc"></span><span class="song-pack-sleeve">✦</span></span>';
const volumeControl = '<label class="song-preview-volume">Volume <input type="range" data-song-volume min="0" max="1" step=".05" value=".5"></label>';

export function songPackTile(catalogueHref){
  return `<section class="songbook-tile"><div><h2>Song Pack</h2><p>${SONG_PACK_SIZE} recordings per pack · ${DUPLICATE_NOTES} Note per duplicate</p><div class="song-pack-buttons"><button class="button" data-action="songbook-review">✦ ${SONG_PACK_PRICE} · Open pack</button><a class="button secondary" href="${catalogueHref}">Song Catalogue</a></div></div>${packArt}</section>`;
}
export function songProgress({themes,inserts,linked}){
  if(linked===false)return '<small>This anime has no verified MAL link yet.</small>';
  if(!themes[1]&&!inserts[1])return '<small>No collectible songs are linked to this anime yet.</small>';
  return `<div class="songbook-progress"><strong>Songs · ${themes[0]} / ${themes[1]} OP &amp; ED</strong><progress aria-label="Opening and ending collection" max="${themes[1]||1}" value="${themes[0]}"></progress><small>Inserts · ${inserts[0]} / ${inserts[1]}</small></div>`;
}
export function createSongbookUI({api,modal,escape:e,execute,balance}){
  let current={owned:false,series:'',q:'',page:1}, version='';
  let opening=null;
  const button=(action,label,attrs='')=>`<button class="button secondary" data-action="${action}" ${attrs}>${label}</button>`;
  const badge=(label,kind)=>`<span class="song-badge song-badge--${kind}">${label}</span>`;
  const notes=amount=>`<span class="song-notes"><span aria-hidden="true">♫</span> ${amount} Notes</span>`;
  async function browse(options){
    current={owned:false,series:'',q:'',page:1,...options};
    modal('<div class="songbook-loading" role="status">Loading songbook…</div>',true);
    const target=document.querySelector('#modal .songbook-loading');
    let data;
    try{data=await api('songbook?'+new URLSearchParams({...current,owned:current.owned?'1':'0'}));}
    catch(error){if(target.isConnected)target.textContent=error.message;return;}
    if(!target.isConnected||!target.closest('dialog').open)return;
    version=data.version;
    const tiles=data.rows.map(song=>songTile(song,{
      escape:e,
      badge:song.owned?badge('Owned','owned'):'',
      version:data.version,
    })).join('');
    modal(`<section><header class="songbook-heading"><h2>${current.series?'Anime Songbook':'Songbook'}</h2>${notes(data.notes)}</header>
      <div class="songbook-tools"><div class="songbook-tabs">${button('songbook-open','All Songs',`aria-pressed="${!current.owned&&!current.series}"`)}${button('songbook-owned','My Songs',`aria-pressed="${current.owned}"`)}</div>
      ${current.owned?'':`<form id="songbook-search"><input class="search" name="q" maxlength="120" aria-label="Search songs" placeholder="Song, artist or anime" value="${e(current.q)}"><button class="button secondary">Search</button></form>`}</div>
      ${data.progress?songProgress(data.progress):''}
      ${data.rows.some(song=>song.audio)?volumeControl:''}
      ${tiles?`<ul class="song-tiles">${tiles}</ul>`:'<p class="subtext">No songs to show.</p>'}
      <div class="songbook-pagination">${button('songbook-page','Previous',`data-page="${current.page-1}" ${current.page===1?'disabled':''}`)}<span>Page ${current.page}</span>${button('songbook-page','Next',`data-page="${current.page+1}" ${!data.hasMore?'disabled':''}`)}</div></section>`,true,'songbook-dialog');
  }
  function reveal(result,page=1){
    opening=result;
    const pages=Math.ceil(result.pulls.length/20);
    const tiles=result.pulls.slice((page-1)*20,page*20).map(song=>songTile(song,{
      escape:e,catalogue:true,
      badge:song.duplicate?badge(`Duplicate · +${DUPLICATE_NOTES} Note`,'duplicate'):badge('New','new'),
    })).join('');
    const pack = result.pulls.length > 1;
    const quantity=result.pulls.length/SONG_PACK_SIZE;
    const heading=pack?(quantity>1?`Your ${quantity} Song Packs`:'Your Song Pack'):result.pulls[0].duplicate?'Duplicate Song':'Song Collected';
    modal(`<header class="songbook-heading"><h2>${heading}</h2>${notes(result.notes)}</header>
      <ul class="song-tiles song-tiles--reveal song-tiles--catalogue">${tiles}</ul>
      ${pages>1?`<nav class="songbook-pagination" aria-label="Pack results">
        ${button('songbook-results','← Previous',`data-page="${page-1}" ${page===1?'disabled':''}`)}<span>Page ${page} of ${pages}</span>
        ${button('songbook-results','Next →',`data-page="${page+1}" ${page===pages?'disabled':''}`)}</nav>`:''}
      <div class="songbook-footer">${volumeControl}${pack?button('songbook-review',quantity===1?'Open another pack':`Open ${quantity} more packs`,`data-count="${quantity}" ${balance()<quantity*SONG_PACK_PRICE?'disabled':''}`):''}${button('songbook-owned','My Songs')}</div>`,pack,'songbook-dialog');
  }
  async function click(action,t){
    if(action==='songbook-results'&&opening)return reveal(opening,Number(t.dataset.page));
    if(action==='songbook-open')return browse({series:t.dataset.series||''});
    if(action==='songbook-owned')return browse({owned:true});
    if(action==='songbook-page')return browse({...current,page:Number(t.dataset.page)});
    if(action==='songbook-collection'){
      const {id,index,version,key,title,duplicate,group='owners'}=t.dataset;
      const page=Number(t.dataset.page)||1;
      const identity=index===undefined?{id}:{index,version,key};
      const attrs=Object.entries({...identity,title,duplicate}).map(([k,v])=>`data-${k}="${e(v)}"`).join(' ');
      const switchView=(label,target,p=1,extra='')=>button(action,label,`${attrs} data-group="${target}" data-page="${p}" ${extra}`);
      modal('<p class="song-collection-loading" role="status">Loading collection…</p>');
      const placeholder=document.querySelector('.song-collection-loading');
      let data;
      try{data=await api('songbook?'+new URLSearchParams({view:'collection',...identity,group,page}));}
      catch(err){if(placeholder?.isConnected)placeholder.textContent=err.message;return;}
      if(!placeholder?.isConnected||!placeholder.closest('dialog').open)return;
      const buy=index===undefined?'':button('songbook-choice',`Buy for ${SONG_EXCHANGE_COST} Notes`,attrs+(data.notes<SONG_EXCHANGE_COST?' disabled':''));
      modal(`<header class="songbook-heading"><h2>${e(title)}</h2></header>
        <nav class="songbook-tabs" aria-label="Song collection">${switchView('Owners','owners',1,`aria-pressed="${group==='owners'}"`)}${switchView('Wishlisted','wishlist',1,`aria-pressed="${group==='wishlist'}"`)}</nav>
        <ul class="music-rows">${data.rows.map(row=>`<li>${e(row.name)}</li>`).join('')||`<li>${group==='owners'?'No public owners yet.':'Nobody has wishlisted this song yet.'}</li>`}</ul>
        ${page>1||data.hasMore?`<div class="songbook-pagination">${page>1?switchView('Previous',group,page-1):''} Page ${page} ${data.hasMore?switchView('Next',group,page+1):''}</div>`:''}
        ${buy?`<footer class="songbook-footer">${notes(data.notes)}${buy}</footer>`:''}`);
      return;
    }
    if(action==='songbook-flag'){
      t.disabled=true;
      const {flag,id,index,key,version}=t.dataset;
      const enabled=t.getAttribute('aria-pressed')!=='true';
      try{
        await api('songbook-flag',{flag,enabled,...(id?{id:Number(id)}:{index:Number(index),key,version})});
        for(const song of opening?.pulls||[]){
          if(flag==='showcased'&&enabled)song.showcased=false;
          if(String(song.id)===id)song[flag]=enabled;
        }
        for(const button of document.querySelectorAll('[data-action="songbook-flag"]')){
          if(flag==='showcased'&&enabled&&button.dataset.flag===flag)button.setAttribute('aria-pressed','false');
          if(button.dataset.flag===flag&&(id?button.dataset.id===id:button.dataset.key===key))button.setAttribute('aria-pressed',String(enabled));
        }
        document.dispatchEvent(new CustomEvent('songbook-changed',{detail:{flag}}));
      }finally{t.disabled=false;}
      return;
    }
    if(action==='songbook-review'){
      const max=Math.min(100,Math.max(0,Math.floor(balance()/SONG_PACK_PRICE)));
      const count=Math.min(max,Math.max(1,Number(t.dataset.count)||1));
      modal(`${packArt}<h2>Open Song Packs</h2><p>${SONG_PACK_SIZE} songs per pack · ${DUPLICATE_NOTES} Note per duplicate</p>
        <form id="song-pack-form" data-pack-price="${SONG_PACK_PRICE}">
          ${quantityInput({id:'song-pack-count',name:'count',label:'Packs to Open',min:max?1:0,max,value:count})}
          <div class="form-error" role="alert"></div><button type="submit" class="button full" data-pack-total ${max?'':'disabled'}>${max?'✦ Open for '+(count*SONG_PACK_PRICE).toLocaleString('en-US')+' credits':'Insufficient credits'}</button></form>`,false,'song-pack-confirm');
      return;
    }
    if(action==='songbook-choice'){
      const copy=t.dataset.duplicate==='true'?'You already own this song. Buying it again returns '+DUPLICATE_NOTES+' Note.':'Add this recording to your Songbook.';
      modal(`<h2>${e(t.dataset.title)}</h2><p>${copy}</p><div class="form-error" role="alert"></div>${button('songbook-redeem','Buy for '+SONG_EXCHANGE_COST+' Notes',`data-index="${Number(t.dataset.index)}" data-key="${e(t.dataset.key)}" data-version="${e(t.dataset.version||version)}"`)}`);
      return;
    }
    if(action==='songbook-redeem')
      await execute(action,{version:t.dataset.version||version,index:Number(t.dataset.index),key:t.dataset.key},result=>{
        reveal(result);
        document.dispatchEvent(new Event('songbook-changed'));
      });
  }
  return {click,openPacks:(count,form)=>execute('songbook-pack',{count},result=>{
    reveal(result);
    document.dispatchEvent(new Event('songbook-changed'));
  },form),search:q=>browse({...current,q,page:1})};
}
