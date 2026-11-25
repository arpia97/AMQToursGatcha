import {emojiChoices,renderChatText} from './play-chat-emojis.js';

function tokenAtCaret(input){
  const caret=input.selectionStart;
  if(caret!==input.selectionEnd)return null;
  const match=/(?:^|[\s([{]|:[a-z0-9_]+:)(:([a-z0-9_]*))$/i.exec(input.value.slice(0,caret));
  if(!match)return null;
  const tail=/^[a-z0-9_]*:?/i.exec(input.value.slice(caret))[0];
  return {start:caret-match[1].length,end:caret+tail.length,query:match[2].toLowerCase()};
}

export function attachEmojiSuggestions({input,panel,menu,list,signal}){
  let choices=[],selected=0,lastQuery=null,composing=false;
  function close(){
    menu.hidden=true;
    input.setAttribute('aria-expanded','false');
    input.removeAttribute('aria-activedescendant');
    lastQuery=null;
  }
  function highlight(index){
    list.children[selected]?.setAttribute('aria-selected','false');
    selected=index;
    const row=list.children[index];
    row.setAttribute('aria-selected','true');
    input.setAttribute('aria-activedescendant',row.id);
    if(row.offsetTop<list.scrollTop)list.scrollTop=row.offsetTop;
    else if(row.offsetTop+row.offsetHeight>list.scrollTop+list.clientHeight)list.scrollTop=row.offsetTop+row.offsetHeight-list.clientHeight;
  }
  function size(){
    const space=input.getBoundingClientRect().top-panel.getBoundingClientRect().top-40;
    menu.style.maxHeight=Math.max(52,Math.min(184,space))+'px';
  }
  function update(){
    if(composing || input.getRootNode().activeElement!==input)return close();
    const token=tokenAtCaret(input);
    if(!token)return close();
    const {query}=token;
    if(lastQuery===query)return;
    lastQuery=query;
    const prefix=[],contains=[];
    for(const name of emojiChoices){
      const key=name.slice(1,-1).toLowerCase();
      if(key===query)prefix.unshift(name);
      else if(key.startsWith(query))prefix.push(name);
      else if(key.includes(query))contains.push(name);
    }
    choices=prefix.concat(contains);
    menu.hidden=!choices.length;
    input.setAttribute('aria-expanded',String(!menu.hidden));
    if(!choices.length)input.removeAttribute('aria-activedescendant');
    else{
      size();
      list.replaceChildren(...choices.map((name,i)=>{
        const row=document.createElement('div'),art=document.createElement('span'),label=document.createElement('span');
        row.id='chat-emoji-option-'+i;
        row.dataset.index=i;
        row.setAttribute('role','option');
        row.setAttribute('aria-selected','false');
        art.className='emoji-art';
        art.setAttribute('aria-hidden','true');
        renderChatText(art,name,true);
        label.textContent=name;
        row.append(art,label);
        return row;
      }));
      list.scrollTop=0;
      highlight(0);
    }
  }
  function choose(index){
    const token=tokenAtCaret(input),name=choices[index];
    if(!token||!name)return close();
    const length=input.value.length-(token.end-token.start)+name.length;
    if(length>input.maxLength){close();return;}
    const space=token.end===input.value.length && length<input.maxLength?' ':'';
    input.setRangeText(name+space,token.start,token.end,'end');
    close();
    input.focus({preventScroll:true});
    input.dispatchEvent(new Event('input',{bubbles:true}));
  }
  input.addEventListener('input',()=>update(),{signal});
  input.addEventListener('click',()=>update(),{signal});
  input.addEventListener('keyup',e=>{if(['Home','End','ArrowLeft','ArrowRight'].includes(e.key))update();},{signal});
  input.addEventListener('compositionstart',()=>{composing=true;close();},{signal});
  input.addEventListener('compositionend',()=>{composing=false;update();},{signal});
  input.addEventListener('blur',close,{signal});
  input.addEventListener('keydown',e=>{
    if(menu.hidden||e.isComposing||composing||e.ctrlKey||e.altKey||e.metaKey||e.shiftKey)return;
    if(!['ArrowDown','ArrowUp','Enter','Tab','Escape'].includes(e.key))return;
    e.preventDefault();e.stopPropagation();
    if(e.key==='Escape')close();
    else if(e.key==='Enter'||e.key==='Tab')choose(selected);
    else highlight((selected+choices.length+(e.key==='ArrowDown'?1:-1))%choices.length);
  },{signal});
  list.addEventListener('pointerdown',e=>{if(e.button===0)e.preventDefault();},{signal});
  list.addEventListener('click',e=>{const row=e.target.closest('[data-index]');if(row)choose(Number(row.dataset.index));},{signal});
  const observer=new ResizeObserver(()=>{if(!menu.hidden)size();});
  observer.observe(panel);
  signal.addEventListener('abort',()=>observer.disconnect(),{once:true});
}
