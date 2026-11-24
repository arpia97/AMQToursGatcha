import {answerAutolock,autolockAnswer} from './amq-anime-search.js?v=autolock-shortcut-help';
import {answerFieldsHTML,artistChipsHTML} from './play-team-ui.js?v=event-chips';

const fields=['song','artist'];
export function createEventAnswers({root,escape,submit,onState}) {
  let worker, ready=false, error='', sequence=0;
  const pending=new Map(), results=new Map(), draft={song:'',artist:''};
  let artists=[];
  const inputFor=f=>root()?.querySelector('#sa-'+f);
  function reset() {
    for(const r of results.values())clearTimeout(r.timer);
    for(const done of pending.values())done([]);
    pending.clear();results.clear();draft.song=draft.artist='';artists=[];
  }
  function close() {worker?.terminate();worker=null;ready=false;error='';reset();}
  function load(event) {
    close();
    const failed=()=>{close();error='Could not load the Play answer lists.';onState();};
    try {
      worker=new Worker(new URL('./play-answer-worker.js?v=event-extras',import.meta.url),{type:'module'});
      worker.onerror=failed;
      worker.onmessage=({data})=>{
        if(data.type==='ready'){ready=true;onState();}
        if(data.type==='error')failed();
        if(data.type==='results'){pending.get(data.id)?.(data.items);pending.delete(data.id);}
      };
      worker.postMessage({type:'load',extra:{artist:event.artists,song:event.titles}});
    }catch{failed();}
  }
  function hide(input) {
    if(!input)return;
    input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');
    root().querySelector('#sa-options-'+input.dataset.saField)?.replaceChildren();
  }
  function paint(f,r) {
    const input=inputFor(f);
    if(!input || input!==document.activeElement || r!==results.get(f))return;
    const box=root().querySelector('#sa-options-'+f);
    box.innerHTML=r.items.map((v,i)=>'<button type="button" role="option" tabindex="-1" id="event-opt-'+f+'-'+i+'" aria-selected="'+(i===r.highlight)+'" data-event-option="'+i+'">'+escape(v)+'</button>').join('');
    input.setAttribute('aria-expanded',String(!!r.items.length));
    if(r.highlight>=0)input.setAttribute('aria-activedescendant','event-opt-'+f+'-'+r.highlight);
    box.classList.toggle('above',input.getBoundingClientRect().bottom>innerHeight-260);
  }
  function search(input) {
    const f=input.dataset.saField,value=input.value;
    const previous=results.get(f);
    if(previous?.send){clearTimeout(previous.timer);pending.get(previous.id)?.([]);pending.delete(previous.id);}
    draft[f]=value;hide(input);results.delete(f);
    if(!value.trim()||!ready)return;
    const id=++sequence;
    const r={id,items:[],highlight:-1,query:value};
    results.set(f,r);
    r.wait=new Promise(resolve=>pending.set(id,resolve)).then(items=>{
      if(results.get(f)!==r)return;
      r.items=items;r.highlight=items.length&&answerAutolock()?0:-1;paint(f,r);
    });
    r.send=()=>{
      clearTimeout(r.timer);r.send=null;
      if(results.get(f)!==r){pending.get(id)?.([]);pending.delete(id);return;}
      worker?.postMessage({type:'search',kind:f,query:value,id});
    };
    r.timer=setTimeout(r.send,70);
  }
  const chips=()=>{
    const box=root()?.querySelector('.sa-artist-list');
    if(box){box.dataset.answerState='pending';box.innerHTML=artistChipsHTML(artists,true,escape);}
  };
  function add(name) {
    name=name.trim();
    if(!name)return;
    if(!artists.some(a=>a.toLowerCase()===name.toLowerCase()) && artists.length<50)artists.push(name);
    const input=inputFor('artist');draft.artist=input.value='';results.delete('artist');
    hide(input);chips();input.focus({preventScroll:true});
  }
  function pick(f,value) {
    if(f==='artist'){add(value);return;}
    const input=inputFor(f);draft[f]=input.value=value;results.delete(f);hide(input);input.focus();
  }
  function bind(node) {
    node.addEventListener('input',({target})=>{if(target.dataset.saField)search(target);});
    node.addEventListener('focusin',({target})=>{
      const f=target.dataset.saField,r=results.get(f);
      if(r && r.query===target.value)paint(f,r);
    });
    node.addEventListener('focusout',({target})=>{if(target.dataset.saField)hide(target);});
    node.addEventListener('pointerdown',e=>{
      if(e.button===0 && e.target.closest('[data-event-option],[data-sa-submit]'))e.preventDefault();
    });
    node.addEventListener('click',e=>{
      const btn=e.target.closest('button');
      if(!btn)return;
      const f=btn.closest('.sa-answer-row')?.querySelector('input')?.dataset.saField;
      if(btn.hasAttribute('data-event-option'))pick(f,results.get(f).items[Number(btn.dataset.eventOption)]);
      if(btn.dataset.saSubmit==='artist')add(draft.artist);
      if(btn.hasAttribute('data-sa-remove-artist')){artists.splice(Number(btn.dataset.saRemoveArtist),1);chips();inputFor('artist')?.focus();}
    });
    node.addEventListener('keydown',async e=>{
      const input=e.target,f=input.dataset.saField;
      if(!f||e.isComposing)return;
      const r=results.get(f);
      if(e.key==='Tab' && !(e.ctrlKey||e.altKey||e.metaKey)){
        if(e.shiftKey&&f===fields[0])return;
        e.preventDefault();inputFor(f==='song'?'artist':'song').focus();return;
      }
      if(e.key==='Escape'){results.delete(f);hide(input);return;}
      if(r?.items.length && ['ArrowUp','ArrowDown'].includes(e.key)){
        e.preventDefault();
        r.highlight=r.highlight<0?(e.key==='ArrowDown'?0:r.items.length-1):(r.highlight+(e.key==='ArrowDown'?1:-1)+r.items.length)%r.items.length;
        paint(f,r);node.querySelector('[aria-selected=true][data-event-option]')?.scrollIntoView({block:'nearest'});return;
      }
      if(e.key!=='Enter')return;
      e.preventDefault();if(e.repeat)return;
      if(e.ctrlKey){results.delete(f);hide(input);if(f==='artist')add(input.value);else submit();return;}
      if(r){r.send?.();await r.wait;if(r!==results.get(f)||input!==document.activeElement||!input.isConnected)return;}
      const choice=r?.items[r.highlight] ?? (answerAutolock()?r?.items[0]:undefined);
      if(choice!==undefined)pick(f,choice);
      else if(f==='artist')add(input.value);
      else inputFor('artist').focus();
    });
  }
  async function answers(timeout) {
    const values={...draft}, picked=artists.slice();
    if(timeout)await Promise.all(fields.map(async f=>{
      const r=results.get(f);
      if(r && r.query===values[f]){r.send?.();await r.wait;values[f]=autolockAnswer(values[f],r.items,r.highlight,answerAutolock());}
    }));
    const last=values.artist.trim();
    if(last && !picked.some(a=>a.toLowerCase()===last.toLowerCase()))picked.push(last);
    return {song:values.song.trim(),artists:picked};
  }
  return {load,close,reset,bind,answers,ready:()=>ready,error:()=>error,fieldsHTML:()=>answerFieldsHTML(fields,false)};
}
