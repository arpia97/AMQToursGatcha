import {songArtistFields} from './play-mode-rules.js';
import {readGuessFields} from './play-lobby-ui.js';
import {validateStudio} from './play-studio-rules.js';
const songArtist={songArtistFields,readGuessFields};
const vocab={"genres":["Action","Adventure","Comedy","Drama","Ecchi","Fantasy","Hentai","Horror","Mahou Shoujo","Mecha","Music","Mystery","Psychological","Romance","Sci-Fi","Slice of Life","Sports","Supernatural","Thriller"],"tags":["4-koma","Achromatic","Achronological Order","Acrobatics","Acting","Adoption","Advertisement","Afterlife","Age Gap","Age Regression","Agender","Agriculture","Airsoft","Alchemy","Aliens","Alternate Universe","American Football","Amnesia","Anachronism","Ancient China","Angels","Animals","Anthology","Anthropomorphism","Anti-Hero","Archery","Aromantic","Arranged Marriage","Artificial Intelligence","Asexual","Assassins","Astronomy","Athletics","Augmented Reality","Autobiographical","Aviation","Badminton","Ballet","Band","Bar","Baseball","Basketball","Battle Royale","Biographical","Bisexual","Blackmail","Board Game","Boarding School","Body Horror","Body Image","Body Swapping","Bowling","Boxing","Boys' Love","Brainwashing","Bullying","Butler","CGI","Calligraphy","Camping","Cannibalism","Card Battle","Cars","Centaur","Cheating","Cheerleading","Chibi","Chimera","Chuunibyou","Circus","Class Struggle","Classic Literature","Classical Music","Clone","Coastal","Cohabitation","College","Coming of Age","Conspiracy","Cosmic Horror","Cosplay","Cowboys","Crafts","Creature Taming","Crime","Criminal Organization","Crossdressing","Crossover","Cult","Cultivation","Curses","Cute Boys Doing Cute Things","Cute Girls Doing Cute Things","Cyberpunk","Cyborg","Cycling","Dancing","Death Game","Delinquents","Demons","Denpa","Desert","Detective","Dinosaurs","Disability","Dissociative Identities","Dragons","Drawing","Drugs","Dullahan","Dungeon","Dystopian","E-Sports","Eco-Horror","Economics","Educational","Elderly Protagonist","Elf","Ensemble Cast","Environmental","Episodic","Ero Guro","Espionage","Estranged Family","Exiled","Exorcism","Fairy","Fairy Tale","Fake Relationship","Family Life","Fashion","Female Harem","Female Protagonist","Femboy","Fencing","Filmmaking","Firefighters","Fishing","Fitness","Flash","Food","Football","Foreign","Found Family","Fugitive","Full CGI","Full Color","Gambling","Gangs","Gekiga","Gender Bending","Ghost","Go","Goblin","Gods","Golf","Gore","Graduation Project","Guns","Gyaru","Handball","Henshin","Heterosexual","Hikikomori","Hip-hop Music","Historical","Homeless","Horticulture","Human Experimentation","Ice Sports","Idol","Incest","Indigenous Cultures","Inn","Inseki","Interspecies","Isekai","Iyashikei","Jazz Music","Josei","Judo","Kabuki","Kaiju","Karuta","Kemonomimi","Kids","Kingdom Management","Konbini","Kuudere","LGBTQ+ Themes","Lacrosse","Language Barrier","Long Strip","Lost Civilization","Love Triangle","Mafia","Magic","Mahjong","Maids","Makeup","Male Harem","Male Protagonist","Manzai","Marriage","Martial Arts","Matchmaking","Matriarchy","Medicine","Medieval","Memory Manipulation","Mermaid","Meta","Metal Music","Middle East","Military","Mixed Gender Harem","Mixed Media","Modeling","Monster Boy","Monster Girl","Mopeds","Motorcycles","Mountaineering","Musical Theater","Mythology","Natural Disaster","Necromancy","Nekomimi","Ninja","No Dialogue","Noir","Non-fiction","Nudity","Nun","Office","Office Lady","Oiran","Ojou-sama","Orphan","Otaku Culture","Outdoor Activities","POV","Pandemic","Parenthood","Parkour","Parody","Philosophy","Photography","Pirates","Poker","Police","Politics","Polyamorous","Post-Apocalyptic","Poverty","Pregnancy","Primarily Adult Cast","Primarily Animal Cast","Primarily Child Cast","Primarily Female Cast","Primarily Male Cast","Primarily Teen Cast","Prison","Prophecy","Proxy Battle","Psychosexual","Puppetry","Rakugo","Real Robot","Rehabilitation","Reincarnation","Religion","Rescue","Restaurant","Revenge","Reverse Isekai","Robots","Rock Music","Rotoscoping","Royal Affairs","Rugby","Rural","Samurai","Satire","School","School Club","Scuba Diving","Seinen","Shapeshifting","Ships","Shogi","Short-Form Chapter","Shoujo","Shounen","Shrine Maiden","Skateboarding","Skeleton","Slapstick","Slavery","Snowscape","Software Development","Space","Space Opera","Spearplay","Steampunk","Stop Motion","Succubus","Suicide","Sumo","Super Power","Super Robot","Superhero","Surfing","Surreal Comedy","Survival","Swimming","Swordplay","Table Tennis","Tanks","Tanned Skin","Teacher","Teens' Love","Tennis","Terrorism","Time Loop","Time Manipulation","Time Skip","Tokusatsu","Tomboy","Torture","Tragedy","Trains","Transgender","Travel","Triads","Tsundere","Twins","Unrequited Love","Urban","Urban Fantasy","VTuber","Vampire","Vertical Video","Veterinarian","Video Games","Vikings","Villainess","Virtual World","Vocal Synth","Volleyball","War","Werewolf","Wilderness","Witch","Work","Wrestling","Writing","Wuxia","Yakuza","Yandere","Youkai","Yuri","Zombie"]};
export function mountStudio(host,{initial,privateRoom=false,readonly=false,user='',submit}){
const root=host.attachShadow({mode:'open'});
root.innerHTML='<link rel="stylesheet" href="'+new URL('./play-studio.css',import.meta.url).href+'"><section id="view"></section>';
const $=id=>root.getElementById(id);
const escapeHtml=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const paths={custom:'M3 7h10m4 0h4M3 17h3m4 0h11M13 4v6M7 14v6',list:'M8 6h13M8 12h13M8 18h13M3 6h.1M3 12h.1M3 18h.1',count:'M4 18h16M6 14v-4m6 4V6m6 8v-6',lives:'M12 21 3.5 12.2C-1 6.3 6.2.8 12 7c5.8-6.2 13-.7 8.5 5.2Z',speed:'m13 2-9 12h7l-1 8L21 9h-8z',create:'M12 4v16M4 12h16',back:'m14 5-7 7 7 7'};
function icon(path){return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="'+path+'"/></svg>'}
const catNames=['Standard','Instrumental','Chanting','Character'], types=['OP','ED','IN'], animeTypes=['TV','Movie','OVA','ONA','Special'], tabs=['Lobby rules','Song filters','Anime filters','Audio & timing'];
const seasonNames=['Winter','Spring','Summer','Fall'];
const koreaNow=new Date(new Date().toLocaleString('en-US',{timeZone:'Asia/Seoul'}));
const currentSeason=koreaNow.getFullYear()*4+Math.floor(koreaNow.getMonth()/3);
function seasonName(n){return seasonNames[n%4]+' '+Math.floor(n/4)}
function fresh(){return {name:'Custom Lobby',format:'Free-for-all',teamSize:2,players:8,songs:20,watchMethod:'Random',cutoff:2,randomSample:true,pool:'Random',unit:'Ratio',mix:[50,25,25],scoring:'Count',guessFields:[...songArtist.songArtistFields],lives:5,guess:20,extra:0,sample:25,speedMode:'Fixed',speed:1,minSpeed:0.8,maxSpeed:1.2,types:types.slice(),categories:Object.fromEntries(types.map(t=>[t,catNames.slice()])),difficultyFrom:0,difficultyTo:100,popFrom:0,popTo:100,dupes:false,rebroadcast:false,dubs:false,from:1924*4,to:currentSeason,animeTypes:animeTypes.slice(),top:'',scoreFrom:0,scoreTo:10,genres:[],tags:[],genreLogic:'OR',tagLogic:'OR'};}
let s={...fresh(),name:'Custom Lobby',...initial},tab=0;
const selectedRoom=!!initial;
let draftPassword='',clearPassword=false;
const oldLock=()=>privateRoom;
const view='edit';
const display=v=>Number.isFinite(+v)?new Intl.NumberFormat('en',{maximumFractionDigits:2}).format(+v):'—';
function quota(total,weights){
 if(!Number.isSafeInteger(total)||total<1||weights.some(x=>x===''||!Number.isFinite(+x)||+x<0))return [0,0,0];
 const sum=weights.reduce((a,x)=>a+Number(x),0);if(!sum)return [0,0,0];
 const values=weights.map(x=>total*Number(x)/sum), out=values.map(Math.floor);
 const order=[0,1,2].sort((a,b)=>(values[b]-out[b])-(values[a]-out[a]));
 const remaining=total-out.reduce((a,b)=>a+b,0);
 for(let i=0;i<remaining;i++)out[order[i]]++;
 return out;
}
function mixture(){return s.pool==='Watched'?[+s.songs,0,0]:s.pool==='Random'?[0,0,+s.songs]:s.unit==='Ratio'?quota(+s.songs,s.mix):s.mix.map(Number)}
const mixNames=['Watched','Unwatched','Random'], colors=['w','u','r'];
const num=(v,lo,hi,integer=false)=>v!==''&&Number.isFinite(+v)&&+v>=lo&&+v<=hi&&(!integer||Number.isSafeInteger(+v));
function validation(){return validateStudio(s)}
function button(label,attrs,cls=''){return '<button type="button" class="'+cls+'" '+attrs+'>'+label+'</button>'}
function field(label,content){return '<label class="field"><span>'+label+'</span>'+content+'</label>'}
function input(key,label,min,max,unit='',step='1',placeholder=''){return field(label,'<span class="control"><input aria-label="'+label+'" data-k="'+key+'" value="'+escapeHtml(s[key])+'" type="number" min="'+min+'" '+(max!==''?'max="'+max+'"':'')+' step="'+step+'" placeholder="'+placeholder+'"><span class="unit">'+unit+'</span></span>')}
function capacity(){return '<div class="field"><span>Max players <small class="limit">1–8</small></span><div class="control steps">'+button('−','data-step="-1" aria-label="Fewer players"','step')+'<input aria-label="Max players" data-k="players" type="number" min="1" max="8" value="'+escapeHtml(s.players)+'">'+button('+','data-step="1" aria-label="More players"','step')+'</div></div>'}
function seg(key,values,small=false){return '<div class="seg '+(small?'small':'')+'" role="group" aria-label="'+key+'">'+values.map(v=>button(v,'data-choice="'+key+'" data-val="'+v+'" aria-pressed="'+(v===s[key])+'"',v===s[key]?'on':'')).join('')+'</div>'}
function section(title,body,action=''){return '<section class="section"><div class="sectionhead"><h3>'+title+'</h3>'+action+'</div>'+body+'</section>'}
const methods={
 'Random':'Standard Watched selection. List influence grows with the square root of list size.',
 'Weighted':"A player's rig chance is proportional to their list size.",
 'Force Weighted':'Each player will be guaranteed rigs proportionate to their list size during the match.',
 'Equal':'Each player have the same chance to draw their rig.',
 'Forced Equal':'Each player will be guaranteed an equal amount of rigs during the match.',
 'Full Random':"The song pool will comprise of all entries from all players' lists with duplicates counting only once.",
 'Unique rigs only':'Exclude anime watched by at least the selected number of players.'
};
function watchedSettings(){
 const options=Object.keys(methods).map(v=>'<option '+(s.watchMethod===v?'selected':'')+'>'+v+'</option>').join('');
 const cutoff=s.watchMethod==='Unique rigs only'?field('Exclude if watched by','<select data-k="cutoff" aria-label="Minimum watchers to exclude">'+Array.from({length:7},(_,i)=>'<option value="'+(i+2)+'" '+(s.cutoff===i+2?'selected':'')+'>'+(i+2)+'+ players</option>').join('')+'</select>'):'';
 return '<div class="watchsettings">'+field('Watched selection','<select data-k="watchMethod" aria-label="Watched selection">'+options+'</select>')+cutoff+'</div><p class="info">'+methods[s.watchMethod]+'</p>';
}
function mixLimit(){return s.unit==='Ratio'?100:Math.max(1,Number(s.songs)||1)}
function bars(){
 return '<div class="railrange mixrail"><i></i>'+['Watched / Unwatched boundary','Unwatched / Random boundary'].map((label,i)=>'<input type="range" data-edge="'+i+'" aria-label="'+label+'" min="0" max="'+mixLimit()+'" step="1">').join('')+'</div><div id="mixcaption" class="mini"></div>';
}
function syncMix(){
 const rail=root.querySelector('.mixrail');if(!rail)return;
 const total=mixLimit(), edges=[Number(s.mix[0]),Number(s.mix[0])+Number(s.mix[1])].map(v=>Math.min(total,Math.max(0,v||0)));
 rail.querySelectorAll('input').forEach((el,i)=>{el.max=total;el.value=edges[i]});
 rail.style.setProperty('--lo',edges[0]*100/total+'%');rail.style.setProperty('--hi',edges[1]*100/total+'%');
 $('mixcaption').textContent=mixture().map((v,i)=>display(v)+' '+mixNames[i].toLowerCase()).join('  ·  ');
}
const fieldNames={anime:'Anime Name',song:'Song Name',artist:'Artist Name'};
function guessFields(config){return config.guessFields??songArtist.songArtistFields}
function scoringRows(config){
 const result=[['Scoring',config.scoring+(config.scoring==='Lives'?' · '+config.lives+' lives':'')]];
 if(config.scoring==='Song/Artist')result.push(['Guess types',guessFields(config).map(key=>fieldNames[key]).join(' · ')]);
 return result;
}
function answerToggles(){
 const chosen=guessFields(s);
 return '<fieldset class="answerchoices"><legend>Guess types</legend>'+songArtist.songArtistFields.map(key=>{
  const selected=chosen.includes(key);
  return '<label><input type="checkbox" name="guessFields" value="'+key+'" '+(selected?'checked ':'')+(selected&&chosen.length===1?'disabled':'')+'>'+fieldNames[key]+'</label>';
 }).join('')+'</fieldset>';
}
function rules(){
 const basic='<div class="inputs setupfields">'+field('Lobby name','<input aria-label="Lobby name" data-k="name" maxlength="55" type="text" value="'+escapeHtml(s.name)+'">')+privacyField()+capacity()+input('songs','Number of songs',1,'','songs')+'</div>';
 const inputs=s.pool==='Mixed'?'<div class="mixfields">'+mixNames.map((name,i)=>field('<span title="'+['On at least one player’s list','On no player’s list','Any eligible anime'][i]+'"><i class="dot '+colors[i]+'"></i>'+name+'</span>','<span class="control"><input type="number" aria-label="'+name+' allocation" min="0" step="'+(s.unit==='Ratio'?'any':'1')+'" data-mix="'+i+'" value="'+escapeHtml(s.mix[i])+'"><span class="unit">'+(s.unit==='Ratio'?'%':'songs')+'</span></span>')).join('')+'</div><div id="mixread">'+bars()+'</div>':'<p class="info">'+(s.pool==='Watched'?'Draw from the players’ combined Watched lists.':'Draw from the full eligible library.')+'</p>';
 const format='<div class="formatline">'+seg('format',['Free-for-all','Teams'])+(s.format==='Teams'?field('Players per team','<select aria-label="Players per team" data-k="teamSize">'+[1,2,3,4,5,6,7,8].map(n=>'<option value="'+n+'" '+(s.teamSize===n?'selected':'')+'>'+n+'</option>').join('')+'</select>'):'')+'</div>';
 const scoring='<div class="scorechoices">'+['Count','Lives','Speed','Song/Artist'].map(v=>button(icon(v==='Song/Artist'?ruleIcons.tracks:paths[v.toLowerCase()])+'<span>'+v+'</span>','data-choice="scoring" data-val="'+v+'" aria-pressed="'+(s.scoring===v)+'"','scoreopt '+(s.scoring===v?'on':''))).join('')+'</div><p class="hint scorehint">'+({'Song/Artist':'Each correct guess type earns 1 point.',Count:'Each correct answer earns 1 point.',Lives:s.format==='Teams'?'Teams share lives. One correct teammate saves the team.':"Deduct your opponent's lives to win.",Speed:'Correct answers earn 2 points immediately, decreasing linearly to 1 at the end of guess time. Extra-time hits earn 1.'}[s.scoring])+'</p>'+(s.scoring==='Lives'?'<div style="max-width:160px;margin-top:10px">'+input('lives','Starting lives',1,'')+'</div>':s.scoring==='Song/Artist'?answerToggles():'');
 return section('Lobby setup',basic+format)+section('Song selection','<div class="line">'+seg('pool',['Random','Watched','Mixed'])+(s.pool==='Mixed'?seg('unit',['Ratio','Songs'],true):'')+'</div>'+inputs+(s.pool!=='Random'?watchedSettings():''))+section('Scoring',scoring);
}
function timing(){
 const windowFields=input('guess','Guess time',1,'','sec')+input('extra','Extra guess time',0,'','sec');
 const rates=s.speedMode==='Fixed'?input('speed','Playback rate',0.01,'','×','any'):input('minSpeed','Minimum rate',0.01,'','×','any')+input('maxSpeed','Maximum rate',0.01,'','×','any');
 return '<div class="settingsgrid audiogrid">'+section('Answer window','<div class="shortfields">'+windowFields+'</div><p class="info">Audio stops during extra guess time.</p>')+
 section('Playback speed',seg('speedMode',['Fixed','Random'],true)+'<div class="shortfields under">'+rates+'</div>')+
 section('Sample point',toggle('randomSample','Random sample point')+(s.randomSample?'':'<div class="sampleline">'+input('sample','Start position',0,100,'%')+'<input id="sample-slider" aria-label="Sample point slider" type="range" min="0" max="100" value="'+s.sample+'"></div>'))+'</div>';
}
function chips(key,options){const arr=key.startsWith('cat:')?s.categories[key.slice(4)]:s[key];return '<div class="chips">'+options.map(v=>button(v,'data-chip="'+key+'" data-val="'+v+'" aria-pressed="'+arr.includes(v)+'" '+(key.startsWith('cat:')&&!s.types.includes(key.slice(4))?'disabled':''),'chip '+(arr.includes(v)?'on':''))).join('')+'</div>'}
function toggle(key,title){return button('<span>'+title+'</span><i class="switch"></i>','data-toggle="'+key+'" role="switch" aria-checked="'+s[key]+'"','toggle '+(s[key]?'on':''))}
function categorySelected(type,cat){return s.types.includes(type)&&s.categories[type].includes(cat)}
function groupState(type,cat){
 const cells=type?catNames.map(name=>categorySelected(type,name)):types.map(row=>categorySelected(row,cat));
 return cells.every(Boolean)?'true':cells.some(Boolean)?'mixed':'false';
}
function groupButton(value,row){
 const state=row?groupState(value,null):groupState(null,value);
 const kind=row?'row':'column';
 return button(escapeHtml(value),'data-group="'+kind+'" data-val="'+value+'" aria-label="Toggle '+value+' '+kind+'" title="Toggle '+value+' '+kind+'" aria-pressed="'+state+'"',row?'typekey':'colkey');
}
function categories(){
 const heads=catNames.map(cat=>'<th scope="col">'+groupButton(cat,false)+'</th>').join('');
 return '<table class="catmatrix"><thead><tr><th scope="col">Type</th>'+heads+'</tr></thead><tbody>'+types.map(type=>'<tr><th scope="row">'+groupButton(type,true)+'</th>'+catNames.map(cat=>'<td><input type="checkbox" data-category="'+type+'" value="'+cat+'" aria-label="'+type+' '+cat+'" '+(categorySelected(type,cat)?'checked':'')+'></td>').join('')+'</tr>').join('')+'</tbody></table>';
}
function changeCategories(rows,columns,checked){
 const previous=Object.fromEntries(types.map(type=>[type,catNames.filter(cat=>categorySelected(type,cat))]));
 for(const type of rows)previous[type]=catNames.filter(cat=>columns.includes(cat)?checked:previous[type].includes(cat));
 s.categories=previous;s.types=types.filter(type=>previous[type].length);
}
function allCategoriesSelected(){return types.every(t=>groupState(t,null)==='true')}
function syncCategoryHeaders(){
 $('toggle-types').textContent=allCategoriesSelected()?'Deselect all':'Select all';
 for(const b of root.querySelectorAll('[data-group]'))b.setAttribute('aria-pressed',b.dataset.group==='row'?groupState(b.dataset.val,null):groupState(null,b.dataset.val));
}
function dual(label,from,to,vintage=false){
 const min=vintage?1924*4:0,max=vintage?currentSeason:100;
 const sides=[[from,'minimum'],[to,'maximum']];
 const typed=vintage?'':'<div class="typedrange">'+sides.map(([key,side])=>'<input type="number" data-k="'+key+'" aria-label="Type '+label.toLowerCase()+' '+side+'" min="0" max="100" value="'+s[key]+'">').join('<span>–</span>')+'</div>';
 return '<div class="dual"><div class="seatslabel">'+(vintage?'':'<b>'+label+'</b>')+typed+'</div><div class="railrange" data-sync="'+from+'" data-upper="'+to+'" style="--lo:'+((s[from]-min)*100/(max-min))+'%;--hi:'+((s[to]-min)*100/(max-min))+'%"><i></i>'+sides.map(([key,side])=>'<input type="range" aria-label="'+label+' '+side+'" data-range="'+key+'" data-from="'+from+'" data-to="'+to+'" min="'+min+'" max="'+max+'" value="'+s[key]+'">').join('')+'</div></div>';
}
function syncRanges(){
 root.querySelectorAll('[data-sync]').forEach(rail=>{
  const thumbs=[...rail.querySelectorAll('input')];
  for(const [i,thumb] of thumbs.entries()){
   thumb.value=s[thumb.dataset.range];rail.style.setProperty(i?'--hi':'--lo',100*(+thumb.value-thumb.min)/(thumb.max-thumb.min)+'%');
  }
 });
}
function songFilters(){return '<div class="settingsgrid songgrid">'+section('AMQ song ranges','<div class="dualpair">'+dual('Difficulty','difficultyFrom','difficultyTo')+'<div class="field"><span>AMQ song popularity</span><small>Unavailable in the current AMQ export</small></div>'+'</div>')+section('Types & categories',categories(),button(allCategoriesSelected()?'Deselect all':'Select all','id="toggle-types"','filterclear'))+section('Modifiers','<div class="mods">'+toggle('dupes','Allow duplicate shows')+toggle('rebroadcast','Allow rebroadcast songs')+toggle('dubs','Allow dub songs')+'</div>')+'</div>'}
function range(label,from,to,max){return '<div class="field"><span>'+label+'</span><span class="rangebox"><input aria-label="'+label+' minimum" data-k="'+from+'" type="number" min="0" max="'+max+'" step="any" value="'+escapeHtml(s[from])+'"><span>–</span><input aria-label="'+label+' maximum" data-k="'+to+'" type="number" min="0" max="'+max+'" step="any" value="'+escapeHtml(s[to])+'"></span></div>'}
function seasonSelect(key,label){let o='';for(let n=currentSeason;n>=1924*4;n--)o+='<option value="'+n+'" '+(n===+s[key]?'selected':'')+'>'+seasonName(n)+'</option>';return field(label,'<select aria-label="'+label+'" data-k="'+key+'">'+o+'</select>')}
function vocabSelect(key,label,logic){return '<div><div class="splithead"><b class="filtersublabel">'+label+'</b>'+seg(logic,['AND','OR'],true)+'</div><div class="filterline"><select aria-label="Add '+label+'" data-add="'+key+'"><option value="">Choose '+label.toLowerCase()+'…</option>'+vocab[key].filter(v=>!s[key].includes(v)).map((v)=>'<option>'+escapeHtml(v)+'</option>').join('')+'</select></div><div class="tags">'+(s[key].length?'<b class="logiclabel">'+s[logic]+'</b>':'')+s[key].map(v=>button(escapeHtml(v)+' ×','data-remove="'+key+'" data-val="'+escapeHtml(v)+'" aria-label="Remove '+escapeHtml(v)+'"','tag')).join('<span class="logic">'+s[logic]+'</span>')+'</div></div>'}
function animeFilters(){return section('Anime type',chips('animeTypes',animeTypes))+section('Vintage','<div class="pair">'+seasonSelect('from','From season')+seasonSelect('to','Through season')+'</div>'+dual('Vintage','from','to',true))+section('Anime rankings','<div class="pair">'+input('top','Most popular shows',1,'','top X','1','No limit')+range('MAL score','scoreFrom','scoreTo',10)+'</div>')+section('Genres & tags','<div class="pair">'+vocabSelect('genres','Genres','genreLogic')+vocabSelect('tags','Tags','tagLogic')+'</div><p class="info">AND requires every selected item. OR accepts any. Both groups apply.</p>')}
function rows(entries){return '<dl class="rows">'+entries.map(([k,v])=>'<div><dt>'+k+'</dt><dd>'+escapeHtml(v)+'</dd></div>').join('')+'</dl>'}
const presetKey='amq-play-studio-presets-'+user;
function readPresets(){
 try{const stored=JSON.parse(localStorage.getItem(presetKey));if(Array.isArray(stored))return stored;if(stored?.pool)return [{id:'legacy',name:stored.name||'Saved settings',settings:stored}]}catch{}
 return [];
}
function choosePreset(saving){
 const dialog=document.createElement('dialog');dialog.className='accessmodal presetmodal';
 const title=saving?'Save settings':'Load settings';dialog.setAttribute('aria-label',title);
 dialog.innerHTML='<div class="pagehead"><h2>'+title+'</h2>'+button('×','aria-label="Close" data-close','quiet')+'</div>'+(saving?
 '<form>'+field('Preset name','<input type="text" maxlength="60" required>')+'<p class="error" role="alert"></p><button class="primary" type="submit">Save preset</button></form>':
 '<div class="presetlist"></div><p class="error" role="alert"></p>');
 function listPresets(){
  const presets=readPresets();
  dialog.querySelector('.presetlist').innerHTML=presets.map(p=>{
   const id=escapeHtml(p.id),name=escapeHtml(p.name);
   return '<div class="presetentry">'+button('<b>'+name+'</b><small>'+escapeHtml(p.settings.pool+' · '+p.settings.songs+' songs · '+p.settings.scoring)+'</small>','data-pick="'+id+'"','presetrow')+button('Delete','data-delete="'+id+'" aria-label="Delete '+name+'"','presetdelete')+'</div>';
  }).join('')||'<p>No saved settings yet.</p>';
 }
 if(!saving)listPresets();
 dialog.addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b)return;
  if(b.hasAttribute('data-close')){dialog.close();return}
  if(b.dataset.delete!==undefined){
   try{const remaining=readPresets().filter(p=>p.id!==b.dataset.delete);localStorage.setItem(presetKey,JSON.stringify(remaining));listPresets();(dialog.querySelector('[data-pick]')||dialog.querySelector('[data-close]')).focus()}catch{dialog.querySelector('[role=alert]').textContent='Unable to delete on this device.'}
   return;
  }
  if(b.dataset.pick!==undefined){const preset=readPresets().find(p=>p.id===b.dataset.pick);if(!preset){listPresets();return}
   s={...fresh(),...structuredClone(preset.settings),name:s.name};dialog.close();render();$('presetmsg').textContent='Loaded '+preset.name+'.'}
 });
 if(saving)dialog.querySelector('form').onsubmit=e=>{e.preventDefault();const input=dialog.querySelector('input'),name=input.value.trim(),entries=readPresets(),err=dialog.querySelector('[role=alert]');if(!name||entries.some(p=>p.name.toLowerCase()===name.toLowerCase())){err.textContent=name?'This name is already used. Choose another.':'Enter a preset name.';input.focus();return}const settings=structuredClone(s);delete settings.name;try{localStorage.setItem(presetKey,JSON.stringify([{name,settings,id:crypto.randomUUID()},...entries]));dialog.close();refresh();$('presetmsg').textContent='Saved '+name+'.'}catch{err.textContent='Unable to save on this device.'}};
 dialog.addEventListener('close',()=>dialog.remove());root.append(dialog);dialog.showModal();dialog.querySelector('input')?.focus();
}
function taxa(config){
 return '<div class="taxlist">'+[['Genres','genres','genreLogic'],['Tags','tags','tagLogic']].map(([title,key,logic])=>{const values=config[key],op=config[logic];return '<div><span>'+title+'</span><button type="button" class="taxhint" aria-label="'+title+' selection" data-tip="'+escapeHtml(values.length?values.join(' '+op+' '):'Any')+'">'+(values.length?values.length+' · '+op:'Any')+'</button></div>'}).join('')+'</div>';
}
const ruleIcons={
 sliders:paths.custom,tracks:'M4 6h11M4 12h9M4 18h7m9-10v8m0-8 3 2m-3 6c-1.5-1-4 0-4 1.5s3.8 1.9 4-.5',clock:'M12 4a8 8 0 1 0 .01 0M12 7v5l3 2',
 pool:'M4 7l8-4 8 4-8 4zM4 12l8 4 8-4M4 17l8 4 8-4',
 audio:'M3 10v4h4l5 4V6l-5 4zM16 9q3 3 0 6m2-9q6 6 0 12',film:'M3 5h18v14H3zM7 5v14M17 5v14M3 9h4m10 0h4M3 15h4m10 0h4'
};
function ruleStats(c){
 return '<div class="rulestats">'+[['tracks','Songs',c.songs,''],['clock','Guess time',c.guess,'s']].map(([glyph,label,value,unit])=>'<div><span>'+icon(ruleIcons[glyph])+label+'</span><strong>'+escapeHtml(value)+'<small>'+unit+'</small></strong></div>').join('')+'</div>';
}
function modeName(c){return c.format==='Teams'?'Teams of '+c.teamSize:c.format}

function detailBlock(title,glyph,content){
 return '<section class="ruleblock"><h3>'+icon(ruleIcons[glyph])+title+'</h3>'+content+'</section>';
}
function inspectRoom(c){
 const old=$('inspect');if(old)old.remove();
 const dialog=document.createElement('dialog');dialog.id='inspect';dialog.setAttribute('aria-label','Lobby settings');
 const basics=[['Format',modeName(c)],['Capacity',c.players+' players'],...scoringRows(c),['Pool',c.pool]];
 if(c.pool==='Mixed')basics.push(['Watched / Unwatched / Random',c.mix.join(' / ')+(c.unit==='Ratio'?' %':' songs')]);
 if(c.pool!=='Random')basics.push(['Watched selection',c.watchMethod+(c.watchMethod==='Unique rigs only'?' · exclude '+c.cutoff+'+ watchers':'')]);
 const audio=[['Guess / extra time',c.guess+'s / '+c.extra+'s'],['Playback',c.speedMode==='Fixed'?c.speed+'×':c.minSpeed+'–'+c.maxSpeed+'×'],['Sample point',c.randomSample?'Random':c.sample+'%']];
 const song=c.types.length?c.types.map(t=>[t,c.categories[t].join(', ')||'None']):[['Song types','None']];
 song.push(['Difficulty / popularity',c.difficultyFrom+'–'+c.difficultyTo+' / '+c.popFrom+'–'+c.popTo],['Modifiers',[c.dupes&&'Duplicate shows',c.rebroadcast&&'Rebroadcasts',c.dubs&&'Dubs'].filter(Boolean).join(', ')||'None']);
 const anime=[['Vintage',seasonName(+c.from)+' – '+seasonName(+c.to)],['Anime types',c.animeTypes.join(', ')],['Most popular shows',c.top?'Top '+c.top:'Any'],['MAL score',c.scoreFrom+'–'+c.scoreTo]];
 dialog.innerHTML='<header class="rulemodalhead"><div><span class="roomlabel">'+escapeHtml(c.name)+'</span><h2>Lobby settings</h2></div>'+button('×','id="close-inspect" aria-label="Close"','closeicon')+'</header><div class="ruledetails">'+detailBlock('Match rules','sliders',ruleStats(c)+rows(basics))+detailBlock('Audio & timing','audio',rows(audio))+detailBlock('Song filters','pool',rows(song))+detailBlock('Anime filters','film',rows(anime)+taxa(c))+'</div>';
 root.append(dialog);dialog.showModal();
}
const isLocked=()=>Boolean(draftPassword||(!clearPassword&&oldLock()));
function accessTag(locked){
 return '<span class="access '+(locked?'locked':'open')+'">'+(locked?icon('M6 10h12v10H6zM8 10V7a4 4 0 0 1 8 0v3'):'<i></i>')+(locked?'Private':'Open')+'</span>';
}
function privacyField(){
 return '<div class="pwline">'+field('Lobby password','<input id="draft-password" type="password" maxlength="128" autocomplete="new-password" placeholder="'+(oldLock()&&!clearPassword?'Keep current password':'Optional')+'">')+(oldLock()&&!clearPassword?button('Remove password','id="remove-lock"','quiet'):'')+'</div>';
}
function summary(){
 const cap=num(s.players,1,8,true)?+s.players:0,err=validation();
 const waves=[13,19,17,23,30,26,39,34,45,52,41,33,46,64,56,71,49,36,50,41,26,28,32,19,12,18,13,7,18,10];
 const main='<div class="summaryhero"><div class="waves" aria-hidden="true">'+waves.map(v=>'<i style="height:'+v+'%"></i>').join('')+'</div><div class="eyebrow">Lobby preview</div><h2>'+escapeHtml(s.name||'Untitled lobby')+'</h2><span class="badge">'+s.pool+' pool</span> '+accessTag(isLocked())+'</div>';
 const stats=rows([['Format',s.format==='Teams'?'Teams of '+s.teamSize:'Free-for-all'],['Songs',s.songs||'—'],...scoringRows(s),['Guess time',s.guess+'s'+(+s.extra?' + '+s.extra+'s':'')],['Playback',s.speedMode==='Fixed'?s.speed+'×':s.minSpeed+'–'+s.maxSpeed+'×'],['Song types',s.types.join(' / ')||'None']]);
 const details=[];
 if(tab===3)details.push(['Sample point',s.randomSample?'Random':s.sample+'%'],['Extra time',s.extra+'s']);
 if(tab===1)details.push(['Difficulty',s.difficultyFrom+'–'+s.difficultyTo],['Popularity',s.popFrom+'–'+s.popTo]);
 if(tab===2)details.push(['Vintage',seasonName(+s.from)+' – '+seasonName(+s.to)],['MAL score',s.scoreFrom+'–'+s.scoreTo]);
 return main+'<div class="summarybody">'+stats+(s.pool!=='Random'?rows([['Watched selection',s.watchMethod+(s.watchMethod==='Unique rigs only'?' · exclude '+s.cutoff+'+':'')]]):'')+(s.genres.length||s.tags.length?taxa(s):'')+(details.length?'<div class="summarydetail">'+rows(details)+'</div>':'')+'<div class="slotbox"><div class="seatslabel"><span>Player slots</span><strong>1 / '+(cap||'—')+'</strong></div><div class="slotbar">'+Array.from({length:cap},()=>'<i></i>').join('')+'</div></div><div class="error" role="status">'+escapeHtml(err)+'</div>'+button(icon(paths.create)+(selectedRoom?'Save changes':'Create lobby'),'id="create" '+(err?'disabled':''),'primary')+'<div class="presetactions">'+button('Save settings','id="savepreset" '+(err?'disabled':''),'quiet')+button('Load settings','id="loadpreset"','quiet')+'</div><p class="asideNote" id="presetmsg" role="status">Settings are saved on this device.</p></div>';
}
function refresh(){if(view!=='edit')return;$('summary').innerHTML=summary();syncMix();syncRanges();if($('sample-slider'))$('sample-slider').value=s.sample;}
function render(){
 {$('view').innerHTML='<div class="layout"><div class="panel"><div class="tabs" role="group" aria-label="Lobby settings sections">'+tabs.map((v,i)=>button(v,'data-tab="'+i+'" aria-pressed="'+(i===tab)+'"','tab '+(i===tab?'on':''))).join('')+'</div><div class="content">'+[rules,songFilters,animeFilters,timing][tab]()+'</div></div><aside class="summary" id="summary" aria-label="Lobby preview"></aside></div>';if($('draft-password'))$('draft-password').value=draftPassword;refresh();}
}
root.addEventListener('input',e=>{const el=e.target;if(el.id==='draft-password'){draftPassword=el.value;refresh();return}if(el.dataset.edge!==undefined){
 const total=mixLimit(), normalized=quota(total,s.mix);
 const first=+el.dataset.edge===0?Math.min(+el.value,normalized[0]+normalized[1]):normalized[0];
 const second=+el.dataset.edge===1?Math.max(+el.value,first):normalized[0]+normalized[1];
 s.mix=[first,second-first,total-second];root.querySelectorAll('[data-mix]').forEach(input=>input.value=s.mix[+input.dataset.mix]);refresh();return;
 }if(el.dataset.range){
 const {range,from,to}=el.dataset;
 const value=range===from?Math.min(+el.value,s[to]):Math.max(+el.value,s[from]);
 s[range]=value;el.value=value;
 const paired=root.querySelector('[data-k="'+range+'"]');if(paired)paired.value=value;refresh();return;
 }if(el.matches('select'))return;if(el.dataset.k)s[el.dataset.k]=el.type==='number'&&el.value!==''?Number(el.value):el.value;else if(el.dataset.mix!==undefined)s.mix[+el.dataset.mix]=el.value===''?'':Number(el.value);else if(el.id==='sample-slider'){s.sample=+el.value;root.querySelector('[data-k="sample"]').value=s.sample}else return;refresh();});
root.addEventListener('change',e=>{const el=e.target;if(el.name==='guessFields'){s.guessFields=songArtist.readGuessFields(el.closest('fieldset'),true);refresh()}else if(el.dataset.category){changeCategories([el.dataset.category],[el.value],el.checked);syncCategoryHeaders();refresh()}else if(el.dataset.add&&el.value){s[el.dataset.add].push(el.value);render()}else if(el.tagName==='SELECT'&&el.dataset.k){const k=el.dataset.k;s[k]=k==='watchMethod'?el.value:+el.value;if(k==='teamSize'||k==='watchMethod')render();else refresh()}});
root.addEventListener('click',async e=>{const b=e.target.closest('button');if(!b||b.disabled)return;const d=b.dataset;
 if(b.id==='remove-lock'){draftPassword='';clearPassword=true}
 else if(d.tab!==undefined){tab=+d.tab}
 else if(d.step){s.players=Math.min(8,Math.max(1,(+s.players||1)+Number(d.step)))}
 else if(d.choice){if(d.choice==='unit'&&s.unit!==d.val)s.mix=quota(d.val==='Ratio'?100:+s.songs,s.mix);s[d.choice]=d.val}
 else if(b.id==='savepreset'){if(!validation())choosePreset(true);return}
 else if(b.id==='loadpreset'){choosePreset(false);return}
 else if(b.id==='close-inspect'){b.closest('dialog').close();return}
 else if(d.group){
  const row=d.group==='row';changeCategories(row?[d.val]:types,row?catNames:[d.val],b.getAttribute('aria-pressed')!=='true');
  root.querySelectorAll('[data-category]').forEach(cell=>cell.checked=categorySelected(cell.dataset.category,cell.value));syncCategoryHeaders();refresh();return;
 }
 else if(b.id==='toggle-types'){changeCategories(types,catNames,!allCategoriesSelected())}
 else if(d.toggle)s[d.toggle]=!s[d.toggle];
 else if(d.chip||d.remove){const key=d.chip||d.remove;const a=key.startsWith('cat:')?s.categories[key.slice(4)]:s[key],i=a.indexOf(d.val);if(i>=0)a.splice(i,1);else a.push(d.val)}
 else if(b.id==='create'){
   if(validation())return;
   submit(structuredClone(s),clearPassword?'':draftPassword||undefined);
   return;
 }
 else return;
 render();
});
function showTip(b){
 root.querySelector('.tipbubble')?.remove();
 const tip=document.createElement('span');tip.className='tipbubble';tip.id='taxonomy-tip';tip.setAttribute('role','tooltip');tip.textContent=b.dataset.tip;
 (b.closest('dialog')||root).append(tip);b.setAttribute('aria-describedby',tip.id);
 const r=b.getBoundingClientRect(),box=tip.getBoundingClientRect();
 tip.style.left=Math.max(8,Math.min(innerWidth-box.width-8,r.right-box.width))+'px';tip.style.top=(r.bottom+box.height+8<=innerHeight?r.bottom+5:r.top-box.height-5)+'px';
}
for(const event of ['pointerover','focusin','click'])root.addEventListener(event,e=>{const b=e.target.closest('[data-tip]');if(b)showTip(b);else if(event==='click')root.querySelector('.tipbubble')?.remove()});
for(const event of ['pointerout','focusout'])root.addEventListener(event,e=>{const b=e.target.closest('[data-tip]');if(b){root.querySelector('.tipbubble')?.remove();b.removeAttribute('aria-describedby')}});
if(readonly){inspectRoom(s);root.querySelector('dialog').addEventListener('close',()=>host.remove())}else render();
}
