import {attachEmojiSuggestions} from './play-emoji-suggestions.js';
import {emojiLibrary,smallEmoji} from './play-personal-emojis.js';
import {emojiChoices, isChatShortcode, renderChatText} from './play-chat-emojis.js';

const markup = `<aside class="chat" id="panel" aria-label="Match chat">
<header class="bar">
  <button type="button" class="drag" id="drag" title="Drag to move. Use the arrow keys to reposition."><svg class="grip" viewBox="0 0 10 16" aria-hidden="true"><path d="M2 3h.1M7 3h.1M2 8h.1M7 8h.1M2 13h.1M7 13h.1" stroke-width="2.5"/></svg>Match chat</button>
  <button type="button" class="resize" id="resize" aria-label="Resize match chat" title="Drag or use the arrow keys to resize"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10V4h6m4 16h6v-6M4 4l6 6m4 4 6 6"/></svg></button>
  <button type="button" class="icon" id="minimize" aria-label="Minimize match chat" title="Minimize"><svg viewBox="0 0 24 24"><path d="M5 13h14"/></svg></button>
</header>
<div id="content" class="content"><div class="stage"><div id="log" class="log" role="log" aria-label="Match messages" aria-live="polite"></div><div class="fx" id="fx" aria-hidden="true"></div></div>
<div class="controls"><div class="shortcuts" id="quick"><button class="edit" id="edit"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="m14 5 5 5M4 20l5-1L21 7l-5-5L4 14z"/></svg>Edit</button></div>
<div class="chat-entry"><div class="emoji-menu" id="emojiMenu" hidden><div class="emoji-menu-head"><strong>Emoji</strong><span><kbd>↑</kbd><kbd>↓</kbd> browse <kbd>Enter</kbd> select</span></div><div id="emojiList" role="listbox" aria-label="Emoji suggestions"></div></div><form id="compose" class="compose"><input id="text" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="emojiList" aria-label="Message the match" maxlength="220" placeholder="Message the match…" autocomplete="off"><button aria-label="Send message" title="Send message" disabled><svg aria-hidden="true" viewBox="0 0 24 24"><path d="m3 10 17-7-6 18-3-8zM11 13l9-10"/></svg></button></form></div></div></div>
<section class="editor" id="editor" hidden><h2>Emoji shortcuts</h2><p>Choose a slot, then choose an emoji or enter :name:.</p><div class="slots" id="slots" aria-label="Shortcut slots"></div><input class="emoji-search" id="emojiSearch" type="search" aria-label="Find an emoji" placeholder="Find an emoji…" autocomplete="off"><div class="palette" id="palette" aria-label="Emoji choices"></div><form class="custom" id="custom"><input id="customEmoji" aria-label="Emoji for selected slot" placeholder="Emoji or :name:" autocomplete="off"><button class="assign">Save shortcut</button></form><details id="uploads" hidden><summary>My uploads <span id="uploadCount"></span></summary><form id="uploadEmoji"><label>Name <input name="name" required maxlength="32" pattern="[A-Za-z0-9_]+" placeholder="emoji_name"></label><input type="file" name="file" accept="image/png,image/jpeg,image/webp" required><button>Upload</button></form><div id="uploadList"></div></details><div id="error" class="error" role="status"></div><button class="edit" id="back">Back to chat</button></section></aside>
<button class="open" id="open" hidden><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M20 12a7 7 0 0 1-7 7H9l-5 3v-5a7.4 7.4 0 0 1-2-5V9a6 6 0 0 1 6-6h6a6 6 0 0 1 6 6z"/><path d="M7 9h8M7 13h5"/></svg>Match chat</button>`;
const baseEmoji = ['🔥','🌋','❓'];
const segmenter = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter(undefined,{granularity:'grapheme'}) : null;
function validEmoji(text) {
  if (typeof text === 'string' && isChatShortcode(text)) return true;
  return typeof text === 'string' && text.length <= 48 && /(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|\u20e3)/u.test(text)
    && (segmenter ? Array.from(segmenter.segment(text)).length === 1 : Array.from(text.replace(/[\uFE0E\uFE0F]/g,'')).length === 1);
}

export function openMatchChat(match, sendText, {label='Match chat',showSelfName=false,donator=false,minimized=false,onToggle}={}) {
  const host=document.createElement('div');
  host.className='play-match-chat';
  const shadow=host.attachShadow({mode:'open'});
  const sheet=document.createElement('link');
  sheet.rel='stylesheet';
  sheet.href=new URL('./play-match-chat.css',import.meta.url).href;
  shadow.innerHTML=markup;
  shadow.prepend(sheet);
  document.body.append(host);
  const by=id=>shadow.getElementById(id);
  const panel=by('panel'),log=by('log'),fx=by('fx'),input=by('text'),emojiInput=by('customEmoji');
  if(label!=='Match chat'){
    by('drag').lastChild.textContent=label;
    by('open').lastChild.textContent=label;
    panel.setAttribute('aria-label',label);
  }
  const players=new Map(match.players.map(p=>[p.id,p]));
  let personal=new Map();
  const libraries=new Map();
  function libraryFor(id){
    const cached=libraries.get(id);
    if(cached && cached.until>Date.now())return cached.result;
    const result=emojiLibrary(id);
    libraries.set(id,{until:Date.now()+15000,result});
    return result;
  }
  const key='amqtours-play-chat-emojis:'+match.me;
  const defaults=donator?[...baseEmoji,'🎵','✨','👏']:baseEmoji;
  let savedSlots=[];
  let slots=defaults.slice(),selected=0,drag=null,resizing=null;
  try {
    const saved=JSON.parse(localStorage.getItem(key));
    if(Array.isArray(saved))savedSlots=saved.slice(0,6);
    if(Array.isArray(saved))slots=defaults.map((fallback,i)=>(validEmoji(saved[i]) || (typeof saved[i]==='string' && /^:[a-z0-9_]{1,32}:$/i.test(saved[i])))?saved[i]:fallback);
  } catch {}
  const events=new AbortController();
  function button(value,cls,label,fn) {
    const b=document.createElement('button');
    b.type='button';b.className=cls;renderChatText(b,value,cls==='pick',personal);b.title=label;b.setAttribute('aria-label',label);
    b.addEventListener('click',fn);
    return b;
  }
  function shortcuts() {
    const buttons=slots.map(s=>button(s,'quick','Send '+s,()=>sendText(s)));
    by('quick').replaceChildren(...buttons,by('edit'));
  }
  function burst(s,library) {
    if(panel.hidden||by('content').hidden||matchMedia('(prefers-reduced-motion:reduce)').matches)return;
    const random=(a,b)=>a+(b-a)*Math.random();
    for(let i=0;i<9;i++){
      const el=document.createElement('span');
      el.className='particle';renderChatText(el,s,false,library);
      for(const [prop,value] of Object.entries({'--x':random(77,94)+'%','--duration':random(1300,1950)+'ms','--delay':i*90+'ms',
        '--drift':random(-23,7)+'px','--lift':-random(90,165)+'px','--angle':random(-24,23)+'deg'}))el.style.setProperty(prop,value);
      el.style.fontSize=random(14,27)+'px';
      el.onanimationend=()=>el.remove();fx.append(el);
    }
    while(fx.children.length>36)fx.firstChild.remove();
  }
  function receive(row,animate=true) {
    // A socket can deliver live rows while the history request is in flight.
    const lines=Array.from(log.children);
    if(lines.some(line=>Number(line.dataset.seq)===row.seq))return;
    const next=lines.find(line=>Number(line.dataset.seq)>row.seq);
    const system=row.player==='',spectating=row.player.startsWith('play-spectators:');
    const id=spectating?row.player.slice('play-spectators:'.length):row.player;
    const player=players.get(id),mine=!system&&id===match.me;
    const follow=mine||log.scrollTop+log.clientHeight>=log.scrollHeight-10;
    const line=document.createElement('div'),time=document.createElement('time'),message=document.createElement('div');
    const body=document.createElement('span');
    line.className='line '+(system?'system':spectating?'spectator':mine?'mine':player?.team!==players.get(match.me)?.team?'away':'');
    time.textContent=new Date(row.at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',hour12:false});
    message.className='message';if(system)body.textContent=row.body;else renderChatText(body,row.body);
    if(!system){
      const name=document.createElement('b');
      name.textContent=mine&&!showSelfName?'You':row.name||player?.name||'Player';
      message.append(name);
      if(spectating){
        const role=document.createElement('small');
        role.className='chat-role';role.textContent='Spectator';message.append(role);
      }
      const tokens=row.body.match(/:[a-z0-9_]{1,32}:/gi)||[];
      if(tokens.some(t=>!isChatShortcode(t))){
        libraryFor(id).then(({items})=>{
          if(!line.isConnected)return;
          renderChatText(body,row.body,false,items);
          if(items.has(row.body.toLowerCase())){body.className='emoji';if(animate)burst(row.body,items);}
        }).catch(()=>{});
      }else if(validEmoji(row.body)){body.className='emoji';if(animate)burst(row.body);}

    }
    message.append(body);line.append(time,message);line.dataset.seq=row.seq;log.insertBefore(line,next||null);
    while(log.children.length>80)log.firstChild.remove();
    if(follow)log.scrollTop=log.scrollHeight;
  }
  const suggestions=attachEmojiSuggestions({
    input, panel, menu:by('emojiMenu'), list:by('emojiList'), signal:events.signal,
    getPersonal:()=>personal,
    loadPersonal:async()=>{if(match.me)personal=(await libraryFor(match.me)).items;}
  });
  input.oninput=()=>by('compose').querySelector('button').disabled=!input.value.trim();
  let sending=false;
  by('compose').onsubmit=async e=>{
    e.preventDefault();
    const draft=input.value;
    if(!draft.trim()||sending)return;
    sending=true;
    try{if(await sendText(draft.trim())&&input.value===draft){input.value='';input.oninput();}}
    finally{sending=false;}
    input.focus();
  };
  function paintPalette() {
    by('error').textContent='';
    const query=by('emojiSearch').value.trim().toLowerCase().replaceAll(':','');
    const choices=[...personal.keys(),...emojiChoices].filter(s=>s.toLowerCase().includes(query));
    by('palette').replaceChildren(...choices.map(s=>{
      const b=button(s,'pick',s,()=>{emojiInput.value=s;markChoice();emojiInput.focus();});
      b.dataset.emoji=s;
      return b;
    }));
    markChoice();
  }
  function markChoice(){
    by('error').textContent='';
    for(const b of by('palette').children)b.setAttribute('aria-pressed',b.dataset.emoji.toLowerCase()===emojiInput.value.trim().toLowerCase());
  }
  function paintEditor() {
    by('slots').replaceChildren(...slots.map((s,i)=>{
      const b=button(s,'slot','Slot '+(i+1)+', '+s,()=>{selected=i;paintEditor();by('slots').children[i].focus();});
      b.setAttribute('aria-pressed',i===selected);
      return b;
    }));
    emojiInput.value=slots[selected];paintPalette();
  }
  function applyLibrary(data){
    personal=data.items;
    suggestions.refresh();
    by('uploads').hidden=!data.manage;
    by('uploadCount').textContent=personal.size+'/10';
    by('uploadList').replaceChildren(...Array.from(personal.values(),item=>{
      const remove=button('Remove :'+item.name+':','edit','Remove :'+item.name+':',()=>saveLibrary({remove:item.id}));
      return remove;
    }));
    shortcuts();paintPalette();
  }
  async function saveLibrary(body){
    try {
      const data=await emojiLibrary(match.me,body);
      libraries.set(match.me,{until:Date.now()+15000,result:Promise.resolve(data)});
      applyLibrary(data);by('uploadEmoji').reset();
    }catch(error){by('error').textContent=error.message;}
  }
  by('uploadEmoji').onsubmit=async event=>{
    event.preventDefault();
    const form=event.currentTarget, fields=new FormData(form);
    const submit=form.querySelector('button');
    submit.disabled=true;
    try{await saveLibrary({name:fields.get('name'),image:await smallEmoji(fields.get('file'))});}
    catch(error){by('error').textContent=error.message;}
    finally{submit.disabled=false;}
  };
  by('edit').onclick=()=>{
    if(match.me)libraryFor(match.me).then(applyLibrary).catch(()=>{});
    by('emojiSearch').value='';by('content').hidden=true;by('editor').hidden=false;paintEditor();by('slots').children[selected].focus();clamp();
  };
  emojiInput.oninput=markChoice;
  by('emojiSearch').oninput=paintPalette;
  function back(){
    by('editor').hidden=true;by('content').hidden=false;shortcuts();by('edit').focus();log.scrollTop=log.scrollHeight;clamp();
  }
  by('back').onclick=back;
  by('custom').onsubmit=e=>{
    e.preventDefault();
    const s=emojiInput.value.trim();
    if(!validEmoji(s)&&!personal.has(s.toLowerCase())){by('error').textContent='Choose one emoji for this slot.';return;}
    slots[selected]=s;
    try{localStorage.setItem(key,JSON.stringify([...slots,...savedSlots.slice(slots.length)]));}catch{}
    back();
  };
  by('minimize').onclick=()=>{panel.hidden=true;by('open').hidden=false;by('open').focus();onToggle?.(false);};
  by('open').onclick=()=>{panel.hidden=false;by('open').hidden=true;clamp();log.scrollTop=log.scrollHeight;by('drag').focus();onToggle?.(true);};
  function place(x,y) {
    const r=panel.getBoundingClientRect();
    panel.style.right=panel.style.bottom='auto';
    panel.style.left=Math.max(6,Math.min(innerWidth-r.width-6,x))+'px';
    panel.style.top=Math.max(6,Math.min(innerHeight-r.height-6,y))+'px';
  }
  function clamp(){if(!panel.hidden&&panel.style.left){const r=panel.getBoundingClientRect();place(r.x,r.y);}}
  by('drag').onpointerdown=e=>{
    if(e.button!==0)return;
    const r=panel.getBoundingClientRect();drag={x:e.clientX-r.x,y:e.clientY-r.y};e.currentTarget.setPointerCapture(e.pointerId);
  };
  by('drag').onpointermove=e=>{if(drag)place(e.clientX-drag.x,e.clientY-drag.y);};
  by('drag').onlostpointercapture=()=>{drag=null;};
  by('drag').onkeydown=e=>{
    const v={ArrowLeft:[-12,0],ArrowRight:[12,0],ArrowUp:[0,-12],ArrowDown:[0,12]}[e.key];
    if(v){e.preventDefault();const r=panel.getBoundingClientRect();place(r.x+v[0],r.y+v[1]);}
  };
  function resize(bounds,width,height) {
    const right=bounds.right,bottom=bounds.bottom;
    const limitWidth=Math.max(1,right-6),limitHeight=Math.max(1,bottom-6);
    const follow=log.scrollTop+log.clientHeight>=log.scrollHeight-10;
    width=Math.min(limitWidth,Math.max(Math.min(260,limitWidth),width));
    height=Math.min(limitHeight,Math.max(Math.min(230,limitHeight),height));
    panel.classList.add('is-resized');
    panel.style.width=width+'px';
    panel.style.height=height+'px';
    place(right-width,bottom-height);
    if(follow)log.scrollTop=log.scrollHeight;
  }
  const handle=by('resize');
  handle.onpointerdown=e=>{
    if(e.button!==0)return;
    resizing={bounds:panel.getBoundingClientRect(),x:e.clientX,y:e.clientY};
    handle.setPointerCapture(e.pointerId);
  };
  handle.onpointermove=e=>{
    if(!resizing)return;
    const {bounds,x,y}=resizing;
    resize(bounds,bounds.width+x-e.clientX,bounds.height+y-e.clientY);
  };
  handle.onlostpointercapture=()=>{resizing=null;};
  handle.onkeydown=e=>{
    const step={ArrowLeft:[16,0],ArrowRight:[-16,0],ArrowUp:[0,16],ArrowDown:[0,-16]}[e.key];
    if(!step)return;
    e.preventDefault();
    const bounds=panel.getBoundingClientRect();
    resize(bounds,bounds.width+step[0],bounds.height+step[1]);
  };
  window.addEventListener('resize',clamp,{signal:events.signal});
  if(minimized){panel.hidden=true;by('open').hidden=false;}
  if(label==='Party chat'){
    input.placeholder='Message the party…';input.setAttribute('aria-label','Message the party');
    log.setAttribute('aria-label','Party messages');
  }
  shortcuts();
  return {matchId:match.id,isOpen:()=>!panel.hidden,receive,updatePlayers(roster){for(const p of roster)players.set(p.id,p);},close(){events.abort();host.remove();}};
}
