import {fail,integer} from './engine.js';
import {noteSongs} from './anime-completion.js';
import {DUPLICATE_NOTES} from '../public/song-pack-rules.js';

// Each listing locks one owned recording. The ordinary market holds the credits
// and determines when a withdrawal, purchase or auction claim can release it.
export function installSongMarket(e){
  e.run('CREATE TABLE IF NOT EXISTS song_listed(token TEXT PRIMARY KEY,owned INTEGER NOT NULL UNIQUE,seller TEXT NOT NULL)');
}
export function lockSongListing(e,player,value){
  const id=integer(value,1);
  const row=e.one('SELECT s.id,f.protected FROM songbook_owned s LEFT JOIN songbook_flags f ON f.player=s.player AND f.owned=s.id WHERE s.id=? AND s.player=?',id,player);
  if(!row)fail('Choose a song you own.',404);
  if(row.protected)fail('Unprotect the song before listing it.');
  if(e.one('SELECT 1 FROM song_listed WHERE owned=?',id))fail('This song is already listed.',409);
  const token='song-listing:'+crypto.randomUUID();
  e.run('INSERT INTO song_listed VALUES(?,?,?)',token,id,player);
  return token;
}
export function listedSongName(e,token){
  return e.one("SELECT json_extract(s.recording,'$.title') AS title FROM song_listed l JOIN songbook_owned s ON s.id=l.owned WHERE l.token=?",token)?.title;
}
export function checkSongBuyer(e,player,token){
  if(e.one(`SELECT 1 FROM song_listed l JOIN songbook_alias seller ON seller.player=l.seller AND seller.owned=l.owned
    JOIN songbook_alias buyer ON buyer.player=? AND buyer.alias=seller.alias WHERE l.token=? LIMIT 1`,player,token))
    fail('You already own this song.',409);
}
export function releaseSongListing(e,player,token){
  const row=e.one('SELECT l.owned,l.seller,s.recording FROM song_listed l JOIN songbook_owned s ON s.id=l.owned AND s.player=l.seller WHERE l.token=?',token);
  if(!row)fail('This song listing has already been settled.',409);
  e.run('DELETE FROM song_listed WHERE token=?',token);
  if(player===row.seller)return;
  const args=[row.seller,row.owned];
  const aliases=e.all('SELECT alias FROM songbook_alias WHERE player=? AND owned=?',...args).map(r=>r.alias);
  const encoded=JSON.stringify(aliases);
  const duplicate=e.one('SELECT owned FROM songbook_alias WHERE player=? AND alias IN (SELECT value FROM json_each(?)) LIMIT 1',player,encoded);
  for(const list of e.all('SELECT id,tracks FROM music_lists WHERE player=? AND EXISTS(SELECT 1 FROM json_each(tracks) WHERE value=?)',...args))
    e.run('UPDATE music_lists SET tracks=?,rev=rev+1 WHERE id=?',JSON.stringify(JSON.parse(list.tracks).filter(id=>id!==row.owned)),list.id);
  for(const table of ['songbook_flags','songbook_featured','songbook_alias'])
    e.run('DELETE FROM '+table+' WHERE player=? AND owned=?',...args);
  if(duplicate){
    e.run('DELETE FROM songbook_owned WHERE id=?',row.owned);
    e.run('INSERT INTO songbook_notes VALUES(?,?) ON CONFLICT(player) DO UPDATE SET balance=balance+excluded.balance',player,DUPLICATE_NOTES);
  }else e.run('UPDATE songbook_owned SET player=?,acquired=? WHERE id=?',player,e.now(),row.owned);
  e.run('INSERT OR IGNORE INTO songbook_alias SELECT ?,value,? FROM json_each(?)',player,duplicate?.owned??row.owned,encoded);
  noteSongs(e,player,[JSON.parse(row.recording)]);
}
export function songListingPage(e,player,section,page){
  integer(page,1,100000);
  const shop=['market','listings'].includes(section);
  if(!shop&&!['auction','mine','claims','community'].includes(section))fail('Unknown song market.');
  if(section==='community')return {rows:[],page,hasMore:false};
  const table=shop?'market_listings':'auctions';
  const where=shop?"m.status='open'":section==='claims'?'m.ends<=? AND m.claimed=0 AND m.winner=?':'m.ends>? AND m.closed=0';
  const args=shop?[]:section==='claims'?[e.now(),player]:[e.now()];
  const mine=['listings','mine'].includes(section);
  if(mine)args.push(player);
  const columns=shop?'m.price':'m.bid,m.reserve,m.winner,m.ends';
  const rows=e.all(`SELECT m.id AS listing,m.seller,${columns},coalesce(p.display_name,p.name) AS sellerName,s.recording
    FROM ${table} m JOIN song_listed l ON l.token=m.card JOIN songbook_owned s ON s.id=l.owned JOIN players p ON p.id=m.seller
    WHERE m.kind='song' AND ${where} ${mine?' AND m.seller=?':''} ORDER BY m.id DESC LIMIT 21 OFFSET ?`,
    ...args,(page-1)*20);
  return {rows:rows.slice(0,20).map(({recording,...item})=>{
    const {title,artist,anime}=JSON.parse(recording);
    return {...item,title,artist,anime};
  }),page,hasMore:rows.length>20};
}
