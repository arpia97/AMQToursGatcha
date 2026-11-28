// AMQ's title dropdown uses contiguous matching, lightweight character
// equivalences, and shortest-title order. Scoring has its own normalization.
const alternatives={
  ou:['ou','ō'],oo:['oo','ō'],o:[...'oōóòöôøφ','ou','oo'],
  u:[...'uūûúùüǖ','uu'],a:[...'aä@âàáạåæā'],c:[...'cč'],
  e:[...'eéêëèæē'],"'":["'",'’'],n:[...'nñ'],2:[...'2²'],i:[...'ií'],
  3:[...'3³'],x:[...'x×'],b:[...'bß'],
};
const separators=new Set('★☆/*=+·♥∽・〜†×♪→␣:;~?,.!@_#∞°-');
const leadingSeparators=[' ',...separators];
const indexed=new WeakMap();

function matches(title,spellings,rest){
  if(!rest.length)return spellings.some(spelling=>title.includes(spelling));
  let positions=new Set();
  for(const spelling of spellings){
    let start=title.indexOf(spelling);
    while(start!==-1){
      positions.add(start+spelling.length);
      start=title.indexOf(spelling,start+1);
    }
  }
  if(!positions.size)return false;
  for(const token of rest){
    const next=new Set();
    for(const pos of positions){
      if(token===' '){
        let end=pos;
        if(title[end]===' ')next.add(++end);
        while(separators.has(title[end])){
          next.add(++end);
          if(title[end]===' ')next.add(end+1);
        }
      }else{
        for(const spelling of alternatives[token]||[token]){
          if(title.startsWith(spelling,pos))next.add(pos+spelling.length);
        }
      }
    }
    if(!next.size)return false;
    positions=next;
  }
  return true;
}

export function amqAnimeOptions(titles,query,limit=25){
  const text=String(query??'').slice(0,120);
  if(!text.trim()||limit<=0)return [];
  let entry=indexed.get(titles);
  if(!entry||entry.count!==titles.length){
    const values=titles.map(value=>{
      const lower=value.toLowerCase();
      return {value,lower,withoutApostrophes:lower.includes("'")?lower.replaceAll("'",''):null};
    })
      .sort((a,b)=>a.value.length-b.value.length||(a.value===b.value?0:a.value<b.value?-1:1));
    entry={count:titles.length,values};
    indexed.set(titles,entry);
  }
  const [first,...rest]=text.toLowerCase().match(/ou|oo|[\s\S]/g);
  const spellings=first===' '?leadingSeparators:(alternatives[first]||[first]),found=[];
  for(const {value,lower,withoutApostrophes} of entry.values){
    if(matches(lower,spellings,rest)||(withoutApostrophes&&matches(withoutApostrophes,spellings,rest)))found.push(value);
    if(found.length===limit)break;
  }
  return found;
}

const preference='amqtours-fuzzy-anime-search';
export function fuzzyAnimeSearch(storage){
  try{return (storage??localStorage).getItem(preference)==='1';}catch{return false;}
}
export function saveFuzzyAnimeSearch(enabled,storage){
  try{(storage??localStorage).setItem(preference,enabled?'1':'0');}catch{}
}
const autolockPreference='amqtours-answer-autolock';
export function answerAutolock(storage){
  try{return (storage??localStorage).getItem(autolockPreference)!=='0';}catch{return true;}
}
export function saveAnswerAutolock(enabled,storage){
  try{(storage??localStorage).setItem(autolockPreference,enabled?'1':'0');}catch{}
}
export function autolockAnswer(value, suggestions, highlighted, enabled){
  return suggestions[highlighted] ?? (enabled ? suggestions[0] : undefined) ?? value;
}

export function answerSearchControls(storage,options){
  return '<div class="answer-search-controls"><label class="fuzzy-anime-search"><input type="checkbox" data-fuzzy-anime'+
    (fuzzyAnimeSearch(storage)?' checked':'')+'> Fuzzy Search</label>'+
    autolockControl(storage,options)+'</div>';
}
export function autolockControl(storage,{showShortcuts=true}={}){
  const help=showShortcuts
    ? 'With Autolock on, Enter picks the highlighted suggestion or the first one. Ctrl+Enter submits what you typed. Autolock also picks a suggestion when time runs out.'
    : 'Autolock uses the highlighted suggestion or the first suggestion when time runs out.';
  return '<label class="fuzzy-anime-search" title="'+help+'"><input type="checkbox" data-answer-autolock'+
    (answerAutolock(storage)?' checked':'')+'> Autolock</label>';
}
