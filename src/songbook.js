import {noteSongs} from './anime-completion.js';
import {fail,integer,text} from './engine.js';
import {SONG_PACK_PRICE,SONG_PACK_SIZE,DUPLICATE_NOTES,SONG_EXCHANGE_COST} from '../public/song-pack-rules.js';
import {compareSongs,matchesSong,matchesSongFlags,songFilters} from '../public/song-filters.js';

export function installSongbook(e){
  e.run('CREATE TABLE IF NOT EXISTS songbook_featured(player TEXT PRIMARY KEY,owned INTEGER NOT NULL)');
  e.run('CREATE TABLE IF NOT EXISTS songbook_owned (id INTEGER PRIMARY KEY, player TEXT NOT NULL, recording TEXT NOT NULL, acquired INTEGER NOT NULL)');
  e.run('CREATE INDEX IF NOT EXISTS songbook_player ON songbook_owned(player,id DESC)');
  e.run('CREATE TABLE IF NOT EXISTS songbook_alias (player TEXT NOT NULL, alias TEXT NOT NULL, owned INTEGER NOT NULL, PRIMARY KEY(player,alias))');
  e.run('CREATE TABLE IF NOT EXISTS songbook_notes (player TEXT PRIMARY KEY, balance INTEGER NOT NULL CHECK(balance>=0))');
  e.run('CREATE INDEX IF NOT EXISTS songbook_alias_owned ON songbook_alias(player,owned)');
  e.run('CREATE TABLE IF NOT EXISTS songbook_wishlist (player TEXT NOT NULL, alias TEXT NOT NULL, PRIMARY KEY(player,alias))');
  e.run('CREATE INDEX IF NOT EXISTS songbook_owners_by_alias ON songbook_alias(alias,player)');
  e.run('CREATE INDEX IF NOT EXISTS songbook_wishes_by_alias ON songbook_wishlist(alias,player)');
  e.run('CREATE TABLE IF NOT EXISTS songbook_flags (player TEXT NOT NULL, owned INTEGER NOT NULL, favorite INTEGER NOT NULL DEFAULT 0, protected INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(player,owned))');
}
function notes(e,player){
  return e.one('SELECT balance FROM songbook_notes WHERE player=?',player)?.balance||0;
}
function ownership(e,player,aliases){
  return new Map(e.all('SELECT alias,owned FROM songbook_alias WHERE player=? AND alias IN (SELECT value FROM json_each(?))',player,JSON.stringify(aliases)).map(r=>[r.alias,r.owned]));
}
function publicSong({title,artist,anime,difficulty,popularity}){return {title,artist,anime,difficulty:difficulty??null,popularity:popularity??null};}
export function featuredSong(e,player){
  const row=e.one('SELECT recording FROM songbook_featured f JOIN songbook_owned s ON s.id=f.owned AND s.player=f.player WHERE f.player=?',player);
  if(row){const {title,artist,audio,anime}=JSON.parse(row.recording);return {title,artist,audio,anime};}
  return null;
}
const ownedSelect=`SELECT s.id,s.recording,EXISTS(SELECT 1 FROM songbook_featured sf WHERE sf.player=s.player AND sf.owned=s.id) AS showcased,f.favorite,f.protected,EXISTS(
  SELECT 1 FROM songbook_alias a JOIN songbook_wishlist w ON w.player=a.player AND w.alias=a.alias
  WHERE a.player=s.player AND a.owned=s.id) AS wishlist
  FROM songbook_owned s LEFT JOIN songbook_flags f ON f.player=s.player AND f.owned=s.id WHERE s.player=?`;
const ownedRecording=r=>({...JSON.parse(r.recording),id:r.id,owned:true,showcased:!!r.showcased,favorite:!!r.favorite,protected:!!r.protected,wishlist:!!r.wishlist});

export function ownedSongs(e,player,ids){
  return e.all(ownedSelect+' AND s.id IN (SELECT value FROM json_each(?))',player,JSON.stringify(ids)).map(ownedRecording);
}

export async function fillSongMetrics(e,player,songs,library){
  const missing=songs.filter(s=>!Object.hasOwn(s,'difficulty')||!Object.hasOwn(s,'popularity'));
  for(let start=0;start<missing.length;start+=250){
    const batch=missing.slice(start,start+250);
    const {metrics}=await library({action:'metrics',series:batch.map(s=>s.audio)});
    if(!Array.isArray(metrics)||metrics.length!==batch.length)fail('Song metadata is unavailable.',503);
    e.tx(()=>batch.forEach((s,i)=>{
      const {difficulty,popularity}=metrics[i];
      Object.assign(s,{difficulty,popularity});
      e.run("UPDATE songbook_owned SET recording=json_set(recording,'$.difficulty',?,'$.popularity',?) WHERE id=? AND player=?",difficulty,popularity,s.id,player);
    }));
  }
}
function setFlag(e,player,body,aliases){
  e.assertAccountUnlocked(player);
  const {flag,enabled}=body;
  if(flag==='showcased'&&typeof enabled==='boolean'){
    const id=integer(body.id,1);
    if(!e.one('SELECT id FROM songbook_owned WHERE id=? AND player=?',id,player))fail('Choose a song you own.',404);
    if(enabled)e.run('INSERT OR REPLACE INTO songbook_featured VALUES(?,?)',player,id);
    else e.run('DELETE FROM songbook_featured WHERE player=? AND owned=?',player,id);
    return {flag,enabled};
  }
  if(!['wishlist','favorite','protected'].includes(flag)||typeof enabled!=='boolean')fail('Choose a valid song preference.');
  if(body.id!=null){
    const id=integer(body.id,1);
    if(!e.one('SELECT 1 FROM songbook_owned WHERE player=? AND id=?',player,id))fail('Choose a song you own.',404);
    if(flag!=='wishlist'){
      e.run(`INSERT INTO songbook_flags(player,owned,${flag}) VALUES(?,?,?) ON CONFLICT(player,owned) DO UPDATE SET ${flag}=excluded.${flag}`,player,id,Number(enabled));
      return {flag,enabled};
    }
    aliases=e.all('SELECT alias FROM songbook_alias WHERE player=? AND owned=?',player,id).map(row=>row.alias);
  }
  if(flag!=='wishlist'||!aliases?.length)fail('Choose a song from the Catalogue.');
  const encoded=JSON.stringify(aliases);
  if(enabled)e.run('INSERT OR IGNORE INTO songbook_wishlist SELECT ?,value FROM json_each(?)',player,encoded);
  else e.run('DELETE FROM songbook_wishlist WHERE player=? AND alias IN (SELECT value FROM json_each(?))',player,encoded);
  return {flag,enabled};
}
async function selectionKey(song){
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(song.aliases[0]));
  return Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
}

export function acquireSongs(e,player,songs,exchange,count=1){
  e.assertAccountUnlocked(player);
  if(songs.length!==(exchange?1:SONG_PACK_SIZE*count)||songs.some(s=>!s.aliases?.length||!s.audio||!s.anime?.length))
    fail('The song library is unavailable.',503);
  if(exchange && notes(e,player)<SONG_EXCHANGE_COST)fail('You need more Notes to choose a song.');
  if(!exchange)e.wallet(player,-SONG_PACK_PRICE*count,'Song Pack');
  const pulls=[];
  let change=exchange?-SONG_EXCHANGE_COST:0;
  for(const song of songs){
    let id=ownership(e,player,song.aliases).values().next().value;
    const duplicate=!!id;
    if(duplicate)change+=DUPLICATE_NOTES;
    else{
      const row=e.one('INSERT INTO songbook_owned(player,recording,acquired) VALUES(?,?,?) RETURNING id',player,JSON.stringify({...publicSong(song),audio:song.audio}),e.now());
      id=row.id;
    }
    e.run('INSERT OR IGNORE INTO songbook_alias(player,alias,owned) SELECT ?,value,? FROM json_each(?)',player,id,JSON.stringify(song.aliases));
    const recording=ownedSongs(e,player,[id])[0];
    pulls.push({...recording,...publicSong(song),audio:song.audio,duplicate});
  }
  noteSongs(e,player,pulls.filter(song=>!song.duplicate));
  const balance=notes(e,player)+change;
  e.run('INSERT OR REPLACE INTO songbook_notes VALUES(?,?)',player,balance);
  return {pulls,notes:balance};
}

export async function songbookRequest(e,player,path,url,post,body,key,library,checkSession){
  e.assertAccountUnlocked(player);
  if(path==='songbook'&&!post){
    const page=integer(Number(url.searchParams.get('page')||1),1,100000);
    if(url.searchParams.get('view')==='collection'){
      const params=url.searchParams;
      let aliases;
      if(params.has('index')){
        const result=await library({action:'redeem',index:integer(Number(params.get('index')),0,1000000),version:text(params.get('version'),1000)});
        const song=result.songs[0];
        if(await selectionKey(song)!==params.get('key'))fail('This selection changed. Choose your song again.',409);
        checkSession();
        aliases=song.aliases;
      }else{
        aliases=e.all('SELECT alias FROM songbook_alias WHERE player=? AND owned=?',player,integer(Number(params.get('id')),1)).map(row=>row.alias);
        if(!aliases.length)fail('Choose a song you own.',404);
      }
      const wanted=params.get('group')==='wishlist';
      const rows=e.all(`SELECT p.id,COALESCE(p.display_name,p.name) AS name FROM
        (SELECT DISTINCT player FROM ${wanted?'songbook_wishlist':'songbook_alias'} WHERE alias IN (SELECT value FROM json_each(?))) a
        JOIN players p ON p.id=a.player ${wanted?'':'WHERE COALESCE(p.private_collection,0)=0'}
        ORDER BY name COLLATE NOCASE,p.id LIMIT 26 OFFSET ?`,JSON.stringify(aliases),(page-1)*25);
      return {rows:rows.slice(0,25),hasMore:rows.length>25,notes:notes(e,player)};
    }
    const filters=songFilters(url.searchParams);
    const series=url.searchParams.get('series');
    if(url.searchParams.get('owned')==='1'){
      const filtered=Object.values(filters).some(Boolean);
      const offset=(page-1)*20;
      let rows=filtered?e.all(ownedSelect+' ORDER BY s.id DESC',player).map(ownedRecording)
        :e.all(ownedSelect+' ORDER BY s.id DESC LIMIT 21 OFFSET ?',player,offset).map(ownedRecording);
      if(filtered){
        rows=rows.filter(song=>matchesSong(song,filters)&&matchesSongFlags(song,filters));
        if(['difficulty','popularity'].includes(filters.order))await fillSongMetrics(e,player,rows,library);
        if(filters.order)rows.sort((a,b)=>compareSongs(a,b,filters.order)||b.id-a.id);
        rows=rows.slice(offset,offset+21);
      }
      return {rows:rows.slice(0,20),page,hasMore:rows.length>20,notes:notes(e,player)};
    }
    const malIds=series?e.all('SELECT DISTINCT anime_id FROM character_appearances WHERE series_key=? AND anime_id>0',text(series,1000)).map(r=>r.anime_id):[];
    const flags=filters.ownership||filters.favorite||filters.protected||filters.hideProtected
      ?e.all('SELECT a.alias,coalesce(f.favorite,0)+2*coalesce(f.protected,0) AS mask FROM songbook_alias a LEFT JOIN songbook_flags f ON f.player=a.player AND f.owned=a.owned WHERE a.player=?',player)
        .map(row=>[row.alias,row.mask]):[];
    const wishlistFilter=filters.wishlist?e.all('SELECT alias FROM songbook_wishlist WHERE player=?',player).map(r=>r.alias):[];
    const result=series&&!malIds.length?{rows:[],progress:[],total:0}:await library({action:'browse',filters,page,malIds,flags,wishlist:wishlistFilter});
    const keys=[...new Set([...result.rows,...result.progress].flatMap(s=>s.aliases))];
    const aliases=ownership(e,player,keys);
    const wishlist=new Set(e.all('SELECT alias FROM songbook_wishlist WHERE player=? AND alias IN (SELECT value FROM json_each(?))',player,JSON.stringify(keys)).map(row=>row.alias));
    const ownedDetails=new Map(ownedSongs(e,player,[...new Set(aliases.values())]).map(row=>[row.id,row]));
    const owned=s=>s.aliases.some(a=>aliases.has(a));
    const themes=result.progress.filter(s=>s.theme),inserts=result.progress.filter(s=>!s.theme);
    const rows=await Promise.all(result.rows.map(async song=>{
      const id=aliases.get(song.aliases.find(alias=>aliases.has(alias)));
      return {...ownedDetails.get(id),...publicSong(song),index:song.index,key:await selectionKey(song),owned:!!id,
        wishlist:song.aliases.some(alias=>wishlist.has(alias)),...(id?{audio:song.audio}:{})};
    }));
    return {rows,
      progress:series?{linked:malIds.length>0,themes:[themes.filter(owned).length,themes.length],inserts:[inserts.filter(owned).length,inserts.length]}:null,
      version:result.version,page,hasMore:page*20<result.total,notes:notes(e,player)};
  }
  if(!post||!['songbook-pack','songbook-redeem','songbook-flag'].includes(path))fail('Unknown songbook action.',404);
  const exchange=path==='songbook-redeem',scope=player+':'+path;
  const preference=path==='songbook-flag';
  text(key,100);
  const saved=e.one('SELECT input,result FROM receipts WHERE scope=? AND key=?',scope,key);
  if(saved){
    if(saved.input!==JSON.stringify(body))fail('This request ID was used for a different action.',409);
    return JSON.parse(saved.result);
  }
  if(preference&&body.id!=null)return e.mutate(scope,key,body,()=>setFlag(e,player,body));
  if(preference&&body.flag!=='wishlist')fail('Choose a song you own.');
  const count=exchange||preference?1:integer(body.count===undefined?1:body.count,1,100);
  const request=exchange||preference?{action:'redeem',index:integer(body.index,0,1000000),version:text(body.version,1000)}:{action:'pack',count};
  const result=await library(request);
  if((exchange||preference)&&await selectionKey(result.songs[0])!==body.key)fail('This selection changed. Choose your song again.',409);
  checkSession();
  if(preference)return e.mutate(scope,key,body,()=>setFlag(e,player,body,result.songs[0].aliases));
  return e.mutate(scope,key,body,()=>acquireSongs(e,player,result.songs,exchange,count));
}
