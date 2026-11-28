// Freeze song ownership when the last character or a new song is acquired.
// A later sale cannot revoke an earned award or combine two incomplete sets.
export function installAnimeCompletion(e) {
  e.run('CREATE TABLE IF NOT EXISTS anime_completion_titles(player TEXT NOT NULL,series_key TEXT NOT NULL,title TEXT NOT NULL,PRIMARY KEY(player,series_key))');
  e.run('CREATE TABLE IF NOT EXISTS anime_completion_pending(player TEXT NOT NULL,series_key TEXT NOT NULL,title TEXT NOT NULL,characters INTEGER NOT NULL,snapshot TEXT NOT NULL,UNIQUE(player,series_key,snapshot))');
  e.run('CREATE INDEX IF NOT EXISTS appearances_mal_key ON character_appearances(anime_id,series_key)');
  e.run('CREATE TABLE IF NOT EXISTS songbook_series(player TEXT NOT NULL,mal INTEGER NOT NULL,name TEXT NOT NULL,PRIMARY KEY(player,mal))');
  if (!e.one("SELECT 1 FROM catalog_meta WHERE key='songbook-series-v1'")) e.tx(()=>{
    e.run("INSERT OR IGNORE INTO songbook_series SELECT s.player,json_extract(a.value,'$.mal'),json_extract(a.value,'$.name') FROM songbook_owned s,json_each(s.recording,'$.anime') a WHERE json_extract(a.value,'$.mal')>0 AND json_extract(a.value,'$.name') IS NOT NULL");
    e.run("INSERT INTO catalog_meta VALUES('songbook-series-v1','1')");
    e.run("INSERT OR IGNORE INTO catalog_meta VALUES('anime-title-backfill','')");
  });
}

function keysForSong(e,anime) {
  const links=e.all('SELECT DISTINCT series_key FROM character_appearances WHERE anime_id=?',anime.mal);
  return links.length?links.map(row=>row.series_key):[anime.name.trim().toLowerCase()];
}

export function songSeries(e,player) {
  const keys=new Map();
  const rows=e.all(`SELECT DISTINCT s.name,a.series_key FROM songbook_series s
    LEFT JOIN character_appearances a ON a.anime_id=s.mal WHERE s.player=?`,player);
  for(const row of rows)keys.set(row.series_key||row.name.trim().toLowerCase(),row.name);
  for(const row of e.all('SELECT series_key,title FROM anime_completion_titles WHERE player=?',player))keys.set(row.series_key,row.title);
  return keys;
}

function noteCandidate(e,player,key,title,progress) {
  if(progress && progress.total!==progress.owned)return;
  if(e.one('SELECT 1 FROM anime_completion_titles WHERE player=? AND series_key=?',player,key))return;
  const snapshot=e.all(`SELECT a.alias FROM songbook_alias a JOIN songbook_owned s ON s.id=a.owned AND s.player=a.player
    WHERE a.player=? AND EXISTS(SELECT 1 FROM json_each(s.recording,'$.anime') link
      WHERE json_extract(link.value,'$.mal') IN (SELECT anime_id FROM character_appearances WHERE series_key=? AND anime_id>0)
      OR lower(trim(json_extract(link.value,'$.name')))=?)
    ORDER BY a.alias`,player,key,key).map(r=>r.alias);
  e.run('INSERT OR IGNORE INTO anime_completion_pending VALUES(?,?,?,?,?)',player,key,title,progress?.total||0,JSON.stringify(snapshot));
}

export function noteCharacter(e,player,card) {
  const keys=e.all('SELECT series_key FROM character_appearances WHERE card=? UNION SELECT series_key FROM character_series WHERE card=?',card,card);
  for(const {series_key:key} of keys){
    const progress=e.economy.anime.progress(player,key);
    if(progress)noteCandidate(e,player,key,progress.series_romaji||progress.series_english,progress);
  }
}

export function noteSongs(e,player,songs) {
  const keys=new Map();
  for(const song of songs)for(const anime of song.anime){
    e.run('INSERT OR IGNORE INTO songbook_series VALUES(?,?,?)',player,anime.mal,anime.name);
    for(const key of keysForSong(e,anime))keys.set(key,anime.name);
  }
  for(const [key,name] of keys){
    const progress=e.economy.anime.progress(player,key);
    noteCandidate(e,player,key,progress?.series_romaji||name,progress);
  }
}

export async function collectionRecordings(e,player,keys,library) {
  if(!keys.length)return new Map();
  const links=e.all('SELECT DISTINCT series_key,anime_id FROM character_appearances WHERE series_key IN (SELECT value FROM json_each(?)) AND anime_id>0',JSON.stringify(keys));
  const ids=new Map(keys.map(key=>[key,[]]));
  for(const row of links)ids.get(row.series_key).push(row.anime_id);
  for(const row of e.all('SELECT mal,name FROM songbook_series WHERE player=?',player)){
    const list=ids.get(row.name.trim().toLowerCase());
    if(list && !list.includes(row.mal))list.push(row.mal);
  }
  const result=await library({action:'collection-series',series:keys.map(key=>({key,ids:ids.get(key)}))});
  if(!Array.isArray(result?.series)||result.series.length!==keys.length)throw Error('Song collection data is unavailable.');
  const aliasKeys=new Set(result.series.flatMap(([,songs])=>songs.flatMap(s=>s.aliases)));
  const owned=new Map(e.all('SELECT a.alias,a.owned FROM songbook_alias a JOIN songbook_owned s ON s.player=a.player AND s.id=a.owned WHERE a.player=? AND a.alias IN (SELECT value FROM json_each(?))',player,JSON.stringify([...aliasKeys])).map(r=>[r.alias,r.owned]));
  if(new Set(result.series.map(([key])=>key)).size!==keys.length || result.series.some(([key,songs])=>!ids.has(key)||!Array.isArray(songs)))
    throw Error('Incomplete collection data.');
  return new Map(result.series.map(([key,songs])=>[key,songs.map(({aliases,title,artist})=>{
    const matches=aliases.map(a=>owned.get(a)).filter(Boolean);
    return {title,artist,aliases,ownedId:matches.length?Math.min(...matches):0};
  })]));
}

function award(e,player,key,title) {
  e.run('INSERT OR IGNORE INTO anime_completion_titles VALUES(?,?,?)',player,key,title);
}

export async function decorateProgress(e,player,rows,library) {
  const keys=[...new Set(rows.filter(r=>!r.ownershipHidden).map(r=>r.series_key))];
  const recordings=await collectionRecordings(e,player,keys,library);
  for(const row of rows){
    const songs=recordings.get(row.series_key);
    if(!songs||row.ownershipHidden)continue;
    row.songTotal=songs.length;
    row.songOwned=songs.filter(s=>s.ownedId).length;
    if(row.songOwned===row.songTotal && row.owned===row.total && row.total+row.songTotal>0){
      const current=e.economy.anime.progress(player,row.series_key);
      if(!current || current.owned===current.total)award(e,player,row.series_key,row.series_romaji||row.series_english);
    }
  }
}

// Existing accounts earn their titles even if they never open the collection tab.
export function backfillAnimeTitles(e){
  const state=e.one("SELECT value FROM catalog_meta WHERE key='anime-title-backfill'");
  if(!state || e.economy.anime.read().phase!=='done')return;
  const players=e.all('SELECT id FROM players WHERE id>? ORDER BY id LIMIT 4',state.value);
  e.tx(()=>{
    for(const {id} of players){
      for(const row of e.economy.anime.tracked(id)){
        if(row.owned===row.total)noteCandidate(e,id,row.series_key,row.series_romaji||row.series_english,row);
      }
    }
    if(players.length<4)e.run("DELETE FROM catalog_meta WHERE key='anime-title-backfill'");
    else e.run("UPDATE catalog_meta SET value=? WHERE key='anime-title-backfill'",players.at(-1).id);
  });
}

// Process a bounded batch. If the library is unavailable, pending rows survive.
export async function settleAnimeTitles(e,library,owner) {
  const batch=owner?e.all('SELECT rowid,* FROM anime_completion_pending WHERE player=? ORDER BY rowid LIMIT 24',owner)
    :e.all('SELECT rowid,* FROM anime_completion_pending ORDER BY rowid LIMIT 24');
  for(const player of new Set(batch.map(r=>r.player))){
    const rows=batch.filter(r=>r.player===player);
    const recordings=await collectionRecordings(e,player,[...new Set(rows.map(r=>r.series_key))],library);
    e.tx(()=>{
      for(const row of rows){
        const songs=recordings.get(row.series_key);
        if(!songs)throw Error('Incomplete collection data.');
        const snapshot=new Set(JSON.parse(row.snapshot));
        if((row.characters||songs.length) && songs.every(s=>s.aliases.some(alias=>snapshot.has(alias))))
          award(e,player,row.series_key,row.title);
        e.run('DELETE FROM anime_completion_pending WHERE rowid=? AND player=? AND series_key=? AND snapshot=?',row.rowid,player,row.series_key,row.snapshot);
      }
    });
  }
}
