import {MAX_CARD_LEVEL} from './card-values.js';
let generation=0;
export function portraitPanel(view,e,newImage){
  const owned=view.pictures.filter(p=>p.owned).length;
  const remaining=view.pictures.length-owned;
  const maxed=view.level>=MAX_CARD_LEVEL;
  const status=!view.level?'Collect this card to equip artwork.':!remaining?'All available artwork collected.':!maxed?'Reach MAX to unlock more artwork.':view.balance<view.price?'More credits needed.':'';
  const images=view.pictures.map((p,i)=>{
    const label=p.selected?'Equipped':p.owned?'Use image':'Locked';
    return `<div class="portrait-tile"><button type="button" class="portrait-option" data-id="${e(view.card)}" data-image="${e(p.url)}" data-action="portrait-equip" ${p.owned&&!p.selected?'':'disabled'} aria-label="${label} · Image ${i+1}" aria-pressed="${p.selected}">
      <img src="${e(p.url)}" loading="lazy" referrerpolicy="no-referrer" alt=""><span><b>${i===0?'Original':'Image '+(i+1)}</b><small>${p.url===newImage?'New · ':''}${label}</small></span></button>${p.owned?`<button type="button" class="button secondary" data-action="set-avatar" data-id="${e(view.card)}" data-image="${e(p.url)}" aria-label="Use image ${i+1} as profile picture">Profile Pic</button>`:''}</div>`;
  }).join('');
  return `<section class="portrait-gallery"><header><span class="eyebrow">Card artwork</span><h2>${e(view.name)}</h2><p>${e(view.rarity||'Pending')} · ${maxed?'MAX':view.level?'Lv. '+view.level:'Unowned'}</p></header>
    <div class="portrait-heading"><h3>Image gallery</h3><span>${owned} / ${view.pictures.length} owned</span></div>
    <div class="portrait-grid">${images||'<p>No images available.</p>'}</div>
    <footer><span role="status">${status||remaining+' remaining'}</span>${maxed&&remaining?`<button type="button" class="button mint" data-action="portrait-roll" data-id="${e(view.card)}" data-price="${view.price}" data-owned="${owned}" ${view.balance<view.price?'disabled':''}>Roll new image · ✦ ${view.price.toLocaleString()}</button>`:''}</footer></section>`;
}
export async function portraitControls(action,t,{api,modal,escape,refresh}){
  const id=t.dataset.id;
  const serial=++generation;
  let unlocked;
  const open=action==='portrait-gallery';
  if(open)modal('<p role="status">Loading artwork…</p>',true,'portrait-dialog');
  const dialog=document.querySelector('#modal'),origin=document.querySelector('#modal-body').firstElementChild;
  const current=()=>serial===generation&&dialog.open&&origin.isConnected;
  if(!open){
    const body=action==='portrait-roll'?{card:id,action:'roll',price:Number(t.dataset.price),owned:Number(t.dataset.owned)}:{card:id,action:'equip',image:t.dataset.image};
    t.disabled=true;
    try{
      const result=await api('card-gallery',body,t.dataset.request||=(crypto.randomUUID()));
      unlocked=result.unlocked;
      await refresh();
    }finally{if(current())t.disabled=false;}
  }
  try{
    const view=await api('card-gallery?card='+encodeURIComponent(id));
    if(current())modal(portraitPanel(view,escape,unlocked),true,'portrait-dialog');
  }catch(error){
    if(current())modal(`<p role="alert">${escape(error.message)}</p><button class="button secondary" data-action="portrait-gallery" data-id="${escape(id)}">Retry</button>`,true,'portrait-dialog');
    throw error;
  }
}
