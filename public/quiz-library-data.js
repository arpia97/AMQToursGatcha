import {resolveQuizAudio} from './quiz-rules.js';
export const LIBRARY_BUCKET_SIZE=512;
export const libraryBucket=id=>Math.floor(Number(id)/LIBRARY_BUCKET_SIZE);
export const libraryId=v=>Number.isSafeInteger(Number(v))&&Number(v)>0?Number(v):null;
export const libraryTitles=values=>[...new Set(values.flat().filter(s=>typeof s==='string'&&s.trim()&&s.length<=300).map(s=>s.trim()))];
export function compactLibrarySong(row,working=[]){
  const annSongId=libraryId(row?.annSongId);if(!annSongId)return null;
  const title=String(row.songName||row.title||'').trim().slice(0,200);
  if(!title)return null;
  return {annSongId,amqSongId:libraryId(row.amqSongId),annId:libraryId(row.annId),title,artist:String(row.songArtist||row.artist||'').slice(0,200),audio:resolveQuizAudio(row.audio),titles:libraryTitles([working,row.titles||[],row.animeAltName||[],row.animeENName,row.animeJPName]),type:String(row.songType||row.type||'').slice(0,80),difficulty:Number.isFinite(row.songDifficulty??row.difficulty)?(row.songDifficulty??row.difficulty):null,linkedIds:row.linked_ids||row.linkedIds||{}};
}
export function libraryQuery(rows){
  const ann=new Set(),amq=new Set();
  for(const row of rows){for(const v of [row.annSongId,row.songInfo?.annSongId,row.songInfo?.siteIds?.annSongId,...(row.sourceIds?.annSongIds||[])])if(libraryId(v))ann.add(Number(v));for(const v of [row.amqSongId,row.songInfo?.amqSongId,...(row.sourceIds?.amqSongIds||[])])if(libraryId(v))amq.add(Number(v));}
  return {annSongIds:[...ann],amqSongIds:[...amq]};
}
