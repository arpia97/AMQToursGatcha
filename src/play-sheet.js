import {bestMasterRecord,fileKey,loadMasterSongAnswers} from './master-song-answers.js';

const source='https://docs.google.com/spreadsheets/d/1jTGhznBd8UzLewk6LNpAdfn5mS7cQ5wS37uqTSxcews/export?format=csv&gid=0&range=';
const PAGE=300;
const norm=s=>String(s??'').normalize('NFKC').toLowerCase().trim().replace(/\s+/g,' ');
export const sheetActor=env=>env.QUIZ_LIBRARY?.getByName('play-master-sheet-v1');

// Google exports a single CSV column. Handle quoted JSON, escaped quotes,
// embedded line breaks and CRLF without retaining the full workbook in memory.
export function csvCells(text){
  const out=[];let cell='',quoted=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(c==='"'){
      if(quoted&&text[i+1]==='"'){cell+='"';i++;}
      else quoted=!quoted;
    }else if(!quoted && (c==='\n'||c==='\r')){
      if(c==='\r'&&text[i+1]==='\n')i++;
      out.push(cell);cell='';
    }else cell+=c;
  }
  if(quoted)throw Error('Incomplete sheet response.');
  if(cell)out.push(cell);
  return out;
}
export function sheetEntry(raw){
  const {songInfo:s,songLinks,amqSongId,annSongId}=JSON.parse(raw), ids=s.siteIds||{};
  const canon=[s.animeNames.romaji,s.animeNames.english].filter(Boolean);
  const unique=new Map();
  for(const t of [...canon,...(s.allAlternativeAnswers??[...(s.altAnimeNames||[]),...(s.altAnimeNamesAnswers||[])])]){
    if(typeof t==='string'&&t.trim()&&!unique.has(norm(t)))unique.set(norm(t),t.trim());
  }
  if(!unique.size)throw Error('An export has no anime titles.');
  const keys=new Set([songLinks?.primary,songLinks?.playedSrc,...(songLinks?.allLinks||[])].map(fileKey).filter(Boolean));
  for(const [prefix,id] of [['a:',amqSongId||s.amqSongId||ids.amqSongId],['n:',annSongId||s.annSongId||ids.annSongId]])if(Number(id)>0)keys.add(prefix+Number(id));
  return {titles:[unique.size-new Set(canon.map(norm)).size,...unique.values()],keys:[...keys],
    meta:[s.songName,s.artist,ids.annId,s.type,[...keys].find(k=>k.startsWith('f:')&&k.endsWith('.mp3'))?.slice(2)||null],
    links:[ids.malId,ids.aniListId],typeNumber:s.typeNumber};
}
// The bundled index carries validated AMQ+/AMQ identity links. Reuse those
// aliases for recordings still present and select the winning current export.
export function compileSheet(seed,batches){
  const owner=new Map(),parent=[],best=[],metadata=[],names=new Map();
  const root=i=>{while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;};
  let total=0;
  const animeLinks=Object.create(null);
  for(const batch of batches)for(const entry of batch){
    total++;
    const [title,artist,ann,type]=entry.meta,keys=entry.keys;
    if(ann && entry.links?.some(Boolean))animeLinks[ann]=entry.links;
    const seedIds=new Set(keys.map(k=>seed.keys[k]).filter(i=>i!==undefined));
    if(!seedIds.size && ann){
      const id=bestMasterRecord(seed,[{title,artist,annId:ann}]);
      if(id!==undefined && (seed.recordings[id]?.[2]===ann || !keys.length && seed.keys['m:\t'+norm(title)+'\t'+norm(artist)]===id))seedIds.add(id);
    }
    for(const id of seedIds)keys.push('seed:'+id);
    if(!keys.length&&ann&&title&&artist)keys.push('local:'+JSON.stringify([ann,norm(title),norm(artist),type,entry.typeNumber]));
    if(!keys.length)continue;
    let id=parent.length;parent.push(id);best.push(entry.titles);metadata.push(entry.meta);
    for(const key of keys){
      if(!owner.has(key)){owner.set(key,id);continue;}
      const a=root(owner.get(key)), b=root(id);
      if(a===b)continue;
      const winner=best[a][0]>best[b][0]||best[a][0]===best[b][0]&&a<b?a:b;
      parent[winner===a?b:a]=winner;id=winner;
    }
    if(title&&artist){
      const suffix='\t'+norm(title)+'\t'+norm(artist);
      for(const key of ['m:'+String(ann??'')+suffix,'m:'+suffix]){
        if(!names.has(key))names.set(key,new Set());
        names.get(key).add(id);
      }
    }
  }
  const records=[],recordings=[],idx=new Map(),keys=Object.create(null);
  for(let i=0;i<parent.length;i++)if(root(i)===i){idx.set(i,records.length);records.push(best[i]);recordings.push(metadata[i]);}
  const index=id=>idx.get(root(id));
  for(const [key,i] of owner)if(!key.startsWith('local:')&&!key.startsWith('seed:'))keys[key]=index(i);
  for(const [key,old] of Object.entries(seed.keys)){
    const id=owner.get('seed:'+old);
    if(id!==undefined)keys[key]??=index(id);
  }
  for(const [key,ids] of names){
    const unique=new Set([...ids].map(index));
    if(unique.size===1){if(!key.startsWith('m:\t') || seed.keys[key]!==undefined)keys[key]??=[...unique][0];}
    else delete keys[key];
  }
  for(const [key,i] of Object.entries(keys))if(!recordings[i][4]&&key.startsWith('f:')&&key.endsWith('.mp3'))recordings[i][4]=key.slice(2);
  return {sourceRows:total,records,recordings,keys,animeLinks,official:seed.official};
}

async function pageText(start){
  const response=await fetch(source+'AF'+start+':AF'+(start+PAGE-1),{signal:AbortSignal.timeout(45000)});
  if(!response.ok)throw Error('Google Sheets returned HTTP '+response.status+'.');
  const reader=response.body.getReader(),decoder=new TextDecoder();let size=0,text='';
  for(;;){const {done,value}=await reader.read();if(done)break;
    size+=value.length;if(size>8_000_000){await reader.cancel();throw Error('Sheet page is too large.');}
    text+=decoder.decode(value,{stream:true});
  }
  return text+decoder.decode();
}
export class SheetRefresh {
  constructor(ctx,assets){
    this.ctx=ctx;this.assets=assets;this.sql=ctx.storage.sql;
    this.sql.exec('CREATE TABLE IF NOT EXISTS sheet_state(id INTEGER PRIMARY KEY,data TEXT)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS sheet_pages(id INTEGER PRIMARY KEY,data TEXT)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS sheet_active(id INTEGER PRIMARY KEY,data BLOB)');
  }
  status(){const [row]=this.sql.exec('SELECT data FROM sheet_state WHERE id=1');return row?JSON.parse(row.data):{status:'idle',rows:0};}
  save(job){this.sql.exec('INSERT OR REPLACE INTO sheet_state VALUES(1,?)',JSON.stringify(job));}
  async start(){
    const job=this.status();
    if(job.status!=='running'){
      Object.assign(job,{status:'running',started:Date.now(),next:2,rows:0,error:'',attempts:0});
      this.ctx.storage.transactionSync(()=>{this.sql.exec('DELETE FROM sheet_pages');this.save(job);});
    }
    if(await this.ctx.storage.getAlarm()===null || job.next===2)await this.ctx.storage.setAlarm(Date.now()+1000);return job;
  }
  async step(){
    const job=this.status();if(job.status!=='running')return;
    if(job.attempts>=3){this.save({...job,status:'failed',error:job.error||'Refresh interrupted. Retry to resume with a fresh export.'});return;}
    job.attempts++;this.save(job);
    // A watchdog resumes this same offset after eviction or a deadline.
    await this.ctx.storage.setAlarm(Date.now()+90000);
    try{
      const cells=csvCells(await pageText(job.next)),page=cells.filter(c=>c.trim()).map(sheetEntry);
      if(cells.length>PAGE)throw Error('Google Sheets ignored the requested row range.');
      if(cells.length===PAGE){
        this.ctx.storage.transactionSync(()=>{
          this.sql.exec('INSERT OR REPLACE INTO sheet_pages VALUES(?,?)',job.next,JSON.stringify(page));
          job.next+=PAGE;job.rows+=page.length;job.attempts=0;this.save(job);
        });
        await this.ctx.storage.setAlarm(Date.now()+1000);return;
      }
      const seed=await loadMasterSongAnswers(this.assets);
      const sql=this.sql;
      function* batches(){for(const row of sql.exec('SELECT data FROM sheet_pages ORDER BY id'))yield JSON.parse(row.data);yield page;}
      const data=compileSheet(seed,batches());
      if(!data.records.length || data.sourceRows<0.9*(job.activeRows||seed.sourceRows) || data.records.length<0.9*(job.activeRecords||seed.records.length))throw Error('The export is substantially smaller than the active library. Check the sheet before retrying.');
      const bytes=new TextEncoder().encode(JSON.stringify(data));
      const hash=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));
      const version='sheet-'+Array.from(hash.slice(0,12),b=>b.toString(16).padStart(2,'0')).join('');
      this.ctx.storage.transactionSync(()=>{
        if(version!==job.version){
          sql.exec('DELETE FROM sheet_active');
          for(let i=0;i<bytes.length;i+=512000)sql.exec('INSERT INTO sheet_active VALUES(?,?)',i,bytes.subarray(i,i+512000));
        }
        sql.exec('DELETE FROM sheet_pages');
        this.save({...job,status:'current',rows:data.sourceRows,activeRows:data.sourceRows,activeRecords:data.records.length,version,completed:Date.now(),error:'',attempts:0});
      });
    }catch(error){
      job.error=String(error.message).slice(0,250);
      if(job.attempts>=3)job.status='failed';
      this.save(job);
      if(job.status==='running')await this.ctx.storage.setAlarm(Date.now()+job.attempts*60000);
    }
  }
  snapshot(previous){
    const {version}=this.status();if(!version||previous===version)return null;
    const decoder=new TextDecoder();let text='';
    for(const row of this.sql.exec('SELECT data FROM sheet_active ORDER BY id'))text+=decoder.decode(row.data,{stream:true});
    return {...JSON.parse(text+decoder.decode()),version};
  }
}
export function currentSheet(env){
  let snapshot=null,next=0,pending;
  return async()=>{
    if(snapshot&&Date.now()<next)return snapshot;
    if(!pending)pending=(async()=>{
      let update;
      try{update=await sheetActor(env)?.sheetSnapshot(snapshot?.version);}
      catch(error){console.warn("Master sheet snapshot unavailable",error.name);}
      snapshot=update||snapshot||await loadMasterSongAnswers(env.ASSETS);
      next=Date.now()+60000;return snapshot;
    })().finally(()=>{pending=null;});
    return pending;
  };
}

