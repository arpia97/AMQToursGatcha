import {songPoster} from './song-posters.js';
import {songSellButton} from './song-tiles.js?v=song-sell';
import {minimumBid} from './community-market-rules.js';

export const itemKinds=[['character','Characters'],['seiyuu','Seiyuus'],['both','Both'],['song','Song']];
export function songPanel(section,owner='',escape=String){
  return `<section data-song-panel="${escape(section)}" data-owner="${escape(owner)}" aria-label="Songs"></section>`;
}
export function mountSongPanel(root,{api,modal,execute,escape:e,me}){
  const section=root.dataset.songPanel,owner=root.dataset.owner;
  const profile=['collection','favorites','wishlist'].includes(section);
  const selling=section==='sell',shop=['listings','market'].includes(section);
  if(!me&&!profile){root.innerHTML='<p class="notice">Sign in to browse song listings.</p>';return;}
  let page=1,query='',version=0,items=[];
  root.innerHTML=(profile||selling?'<label class="song-category-search"><input class="search" type="search" placeholder="Search song, artist or anime…" aria-label="Search songs"></label>':'')+'<div data-song-page aria-live="polite"></div>';
  const results=root.querySelector('[data-song-page]');
  function action(op,label,index){
    return `<button class="button secondary" type="button" data-song-op="${op}" data-index="${index}">${label}</button>`;
  }
  function row(s,index){
    let controls='';
    if(selling)controls=s.protected?'Protected':s.listed?'Listed':action('list','List song',index)+songSellButton(s,e);
    else if(!profile){
      const name=e(s.sellerName);
      controls=`<small>${name} · ${Number(shop?s.price:s.bid||s.reserve).toLocaleString()} credits</small>`;
      if(section==='claims')controls+=action('claim','Claim song',index);
      else if(s.seller===me){if(!s.winner)controls+=action('withdraw','Withdraw',index);}
      else controls+=shop?action('buy','Buy',index):action('bid','Bid',index);
      if(!shop&&s.ends)controls+=`<small>${e(new Date(s.ends).toLocaleString())}</small>`;
    }
    return `<li>${songPoster(s)}<div><strong>${e(s.title)}</strong><small>${e(s.artist)} · ${e(s.anime?.[0]?.name||'')}</small></div><div class="song-row-controls">${controls}</div></li>`;
  }
  async function draw(){
    const seq=++version;
    const params=new URLSearchParams({page,q:query});
    let path;
    if(profile){params.set('id',owner);params.set('kind','song');params.set('view',section);path='player-cards';}
    else if(selling){params.set('owned','1');path='songbook';}
    else {params.set('section',section);path='song-market';}
    try{
      const data=await api(path+'?'+params);
      if(!root.isConnected||seq!==version)return;
      items=data.rows||[];
      results.innerHTML=data.hidden?'<p class="notice">This collection is private.</p>':
        '<ul class="song-category-list">'+items.map(row).join('')+'</ul>'+
        (items.length?'':'<p class="notice">No matching songs.</p>')+
        (page>1||data.hasMore?`<div class="toolbar"><button class="button" data-page="-1" ${page===1?'disabled':''}>Previous</button><span>Page ${page}</span><button class="button" data-page="1" ${data.hasMore?'':'disabled'}>Next</button></div>`:'');
    }catch(err){if(root.isConnected&&seq===version)results.textContent=err.message;}
  }
  let timer;
  root.oninput=event=>{query=event.target.value;page=1;++version;clearTimeout(timer);timer=setTimeout(draw,160);};
  root.onclick=event=>{
    const button=event.target.closest('button');
    if(!button)return;
    if(button.dataset.page){page+=Number(button.dataset.page);void draw();return;}
    const s=items[Number(button.dataset.index)],op=button.dataset.songOp;
    if(!s||!op)return;
    const listing=s.listing;
    const form=(title,fields,submit,commit)=>{
      modal(`<h2>${title}</h2><p>${e(s.title)} · ${e(s.artist)}</p><form class="stack" data-song-transaction>${fields}<div class="form-error" role="alert"></div><button class="button mint" type="submit">${submit}</button></form>`);
      const el=document.querySelector('[data-song-transaction]');
      el.onsubmit=event=>{event.preventDefault();event.stopPropagation();commit(new FormData(el),el);};
    };
    if(op==='list'){
      form('List song','<label>Venue<select name="venue"><option value="shop">Marketplace</option><option value="auction">Auction</option></select></label><label>Price in credits<input type="number" min="1" max="1000000" name="price" required></label><label hidden>Duration in hours<input type="number" name="hours" min="1" max="168" value="24"></label>','List song',(f,el)=>execute('list-card',{song:s.id,venue:f.get('venue'),price:Number(f.get('price')),hours:Number(f.get('hours'))},null,el));
      const el=document.querySelector('[data-song-transaction]');
      el.elements.venue.onchange=()=>{el.elements.hours.parentElement.hidden=el.elements.venue.value!=='auction';};
    }else if(op==='bid'){
      const min=minimumBid(s);
      form('Bid on song',`<label>Bid in credits<input type="number" min="${min}" value="${min}" required name="amount"></label>`,'Place bid',(f,el)=>execute('bid',{auction:listing,amount:Number(f.get('amount'))},null,el));
    }else if(op==='buy')form('Buy song',`<p>${s.price} credits</p>`,'Buy song',(_,el)=>execute('buy-listing',{listing},null,el));
    else if(op==='claim')void execute('claim',{auction:listing});
    else if(op==='withdraw')void execute('cancel-listing',{listing,venue:shop?'shop':'auction'});
  };
  void draw();
}
