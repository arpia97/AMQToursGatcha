import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {Engine} from '../src/engine.js';
import {backfillAnimeTitles,decorateProgress,settleAnimeTitles} from '../src/anime-completion.js';
import {animeTile} from '../public/anime-completion-ui.js';
import {SongbookCatalog} from '../src/songbook-catalog.js';
import {songbookRequest} from '../src/songbook.js';
import {musicAction,musicRead} from '../src/music.js';
import {SONG_PACK_PRICE,SONG_EXCHANGE_COST} from '../public/song-pack-rules.js';

function fixture(){
  const db=new DatabaseSync(':memory:');
  const e=new Engine((sql,...params)=>db.prepare(sql).all(...params),fn=>{
    db.exec('BEGIN');
    try{const result=fn();db.exec('COMMIT');return result;}catch(error){db.exec('ROLLBACK');throw error;}
  });
  e.host('players',{players:[{id:'p',name:'Player'}]});
  e.run("UPDATE players SET balance=2000 WHERE id='p'");
  for(const [mal,key] of [[22,'alpha'],[33,'beta']])
    e.run("INSERT INTO character_appearances VALUES(?,?,?,?,?,?,?)",'card'+mal,key,key,'',mal,'main',1);
  const audio=n=>'https://naedist.animemusicquiz.com/'+n+'.mp3';
  const data={version:'one',linkedAnime:new Map([[2,{myanimelist:22}],[3,{myanimelist:33}]]),
    animeLabels:new Map([[2,'Alpha'],[3,'Beta']]),preferred:[
      {amqTitle:'Theme',amqArtist:'Singer',amqId:111,titles:['Alpha']},
      {amqTitle:'Insert',amqArtist:'Singer',amqId:222,titles:['Alpha']}],
    ngmcRows:[{annId:2,amqSongId:1,type:'OP1'},{annId:3,amqSongId:1,type:'ED'},{annId:2,amqSongId:2,type:'IN'}],
    sources:[audio(1),audio(2)],alternates:[[],[]],groups:[[15,16],[17]]};
  const catalog=new SongbookCatalog(data);
  const library=async req=>catalog.request(req,()=>0);
  const call=(path,body=null,key=null,source=library)=>songbookRequest(e,'p',path.split('?')[0],new URL('https://local/'+path),!!body,body,key,source,()=>{});
  return {e,call,data};
}
test('three independent draws use one wallet receipt and duplicate Notes, even on retries',async()=>{
  const {call,e}=fixture();
  const [first,repeat]=await Promise.all([call('songbook-pack',{},'one'),call('songbook-pack',{},'one')]);
  assert.deepEqual(first,repeat);
  assert.deepEqual(first.pulls.map(s=>s.duplicate),[false,true,true]);
  assert.equal(first.notes,2);
  assert.equal(e.player('p').balance,2000-SONG_PACK_PRICE);
  assert.deepEqual(await call('songbook-pack',{},'one',()=>{throw Error('offline');}),first);
  assert.equal((await call('songbook?owned=1')).rows.length,1);
  e.run("UPDATE players SET balance=0 WHERE id='p'");
  await assert.rejects(call('songbook-pack',{},'two'),/credits/);
  assert.equal((await call('songbook?owned=1')).notes,2);
});
test('shared MAL appearances advance both anime, inserts are tracked, and Notes redeem exactly the selected missing song',async()=>{
  const {call,e}=fixture();
  const missing=(await call('songbook?q=Insert')).rows[0];
  assert.equal(missing.audio,undefined);
  assert.equal(missing.aliases,undefined);
  const pick={index:missing.index,key:missing.key,version:'one'};
  await assert.rejects(call('songbook-redeem',pick,'no-notes'),/more Notes/);
  await call('songbook-pack',{},'one');
  assert.deepEqual((await call('songbook?series=alpha')).progress,{linked:true,themes:[1,1],inserts:[0,1]});
  assert.deepEqual((await call('songbook?series=beta')).progress,{linked:true,themes:[1,1],inserts:[0,0]});
  assert.equal((await call('songbook?series=unknown')).rows.length,0);
  e.run("UPDATE songbook_notes SET balance=? WHERE player='p'",SONG_EXCHANGE_COST*2);
  await assert.rejects(call('songbook-redeem',{...pick,index:0},'wrong'),/selection changed/);
  await assert.rejects(call('songbook-redeem',{...pick,version:'stale'},'old'),/library changed/);
  const result=await call('songbook-redeem',pick,'choice');
  assert.equal(result.notes,SONG_EXCHANGE_COST);
  assert.equal(result.pulls[0].title,'Insert');
  assert.deepEqual(await call('songbook-redeem',pick,'choice'),result);
  const duplicate=await call('songbook-redeem',pick,'twice');
  assert.equal(duplicate.notes,1);
  assert.equal(duplicate.pulls[0].duplicate,true);
  assert.equal(duplicate.pulls[0].id,result.pulls[0].id);
  assert.deepEqual(await call('songbook-redeem',pick,'twice'),duplicate);
  await assert.rejects(call('songbook-redeem',pick,'third'),/more Notes/);
  assert.deepEqual((await call('songbook?series=alpha')).progress.inserts,[1,1]);
  assert.equal((await call('songbook?owned=1')).notes,1);
});
test('song flags apply to exact filtered catalogue results and carry over to owned songs and playlists',async()=>{
  const {call,e}=fixture();
  const inserted=(await call('songbook?type=IN')).rows[0];
  const choice={index:inserted.index,key:inserted.key,version:'one'};
  await call('songbook-flag',{...choice,flag:'wishlist',enabled:true},'wish');
  await assert.rejects(call('songbook-flag',{...choice,flag:'favorite',enabled:true},'unowned-star'),/song you own/);
  assert.deepEqual((await call('songbook?wishlist=1&ownership=missing')).rows.map(s=>s.title),['Insert']);
  assert.deepEqual((await call('songbook?wishlist=1&q=ins&exact=1')).rows,[]);
  await call('songbook-pack',{},'pack');
  e.run("UPDATE songbook_notes SET balance=? WHERE player='p'",SONG_EXCHANGE_COST);
  const {pulls:[{id,wishlist}]}=await call('songbook-redeem',choice,'buy');
  assert.equal(wishlist,true);
  await call('songbook-flag',{id,flag:'favorite',enabled:true},'star');
  await call('songbook-flag',{id,flag:'protected',enabled:true},'shield');
  assert.deepEqual((await call('songbook?owned=1&order=title')).rows.map(s=>s.title),['Insert','Theme']);
  assert.deepEqual((await call('songbook?favorite=1&protected=1&ownership=owned')).rows.map(s=>s.id),[id]);
  assert.deepEqual((await call('songbook?owned=1&hideProtected=1')).rows.map(s=>s.title),['Theme']);
  const list=e.tx(()=>musicAction(e,'p',{op:'create-list',name:'Test',track:id}));
  const [song]=musicRead(e,'p',new URLSearchParams({view:'playlist',id:list.id})).tracks;
  assert.equal(song.protected,true);
  assert.equal(song.favorite,true);
  assert.equal(song.wishlist,true);
  await call('songbook-flag',{id,flag:'wishlist',enabled:false},'unwish');
  assert.deepEqual((await call('songbook?wishlist=1')).rows,[]);
});
test('library reordering and replacement audio preserve acquired song identity',async()=>{
  const {call,data}=fixture();
  await call('songbook-pack',{},'first');
  for(const key of ['preferred','sources','alternates','groups'])data[key].reverse();
  for(const r of data.ngmcRows)r.amqSongId=3-r.amqSongId;
  data.sources[1]='https://eudist.animemusicquiz.com/replaced.mp3';
  data.version='two';
  const updated=new SongbookCatalog(data);
  const rows=(await call('songbook',null,null,async req=>updated.request(req))).rows;
  assert.ok(rows.find(r=>r.title==='Theme').owned);
  assert.equal(rows.find(r=>r.title==='Insert').owned,false);
});

test('song collection lists distinct public owners and wishlist players for the selected recording',async()=>{
  const {call,e}=fixture();
  const {pulls:[song]}=await call('songbook-pack',{},'pack');
  const choice=(await call('songbook?q=Theme')).rows[0];
  const ref=new URLSearchParams({index:choice.index,key:choice.key,version:'one'});
  const lookup='songbook?view=collection&';
  await call('songbook-flag',{id:song.id,flag:'wishlist',enabled:true},'wish');
  assert.deepEqual((await call(lookup+ref)).rows.map(r=>[r.id,r.name]),[['p','Player']]);
  e.run("UPDATE players SET private_collection=1 WHERE id='p'");
  assert.deepEqual((await call(lookup+'id='+song.id)).rows,[]);
  assert.deepEqual((await call(lookup+ref+'&group=wishlist')).rows.map(r=>[r.id,r.name]),[['p','Player']]);
  await assert.rejects(call(lookup+'id=999'),/song you own/);
  ref.set('key','outdated');
  await assert.rejects(call(lookup+ref),/selection changed/);
});

test('anime completion requires every character and distinct song, including inserts, and survives later loss',async()=>{
  const {e,data,call}=fixture();
  const catalog=new SongbookCatalog(data),library=input=>catalog.request(input);
  const anime=e.economy.anime;
  const status=async()=>{
    const row=anime.progress('p','alpha');
    await decorateProgress(e,'p',[row],library);
    return [row.owned,row.total,row.songOwned,row.songTotal];
  };
  const titles=()=>e.quiz.titles('p').filter(t=>t.category==='anime-collection');
  e.addCard('p','card22');
  await call('songbook-pack',{},'pack');
  assert.deepEqual(await status(),[1,1,1,2]);
  e.run("DELETE FROM inventory WHERE player='p' AND card='card22'");
  e.run("UPDATE songbook_notes SET balance=10 WHERE player='p'");
  const song=(await call('songbook?q=Insert')).rows[0];
  await call('songbook-redeem',{index:song.index,key:song.key,version:'one'},'insert');
  await settleAnimeTitles(e,library);
  assert.deepEqual(await status(),[0,1,2,2]);
  assert.deepEqual(titles(),[]);
  const insert=e.one("SELECT id FROM songbook_owned WHERE player='p' AND json_extract(recording,'$.title')='Insert'").id;
  const aliases=e.all('SELECT alias FROM songbook_alias WHERE owned=?',insert);
  e.run('DELETE FROM songbook_alias WHERE owned=?',insert);
  e.addCard('p','card22');
  assert.deepEqual(await status(),[1,1,1,2]);
  await settleAnimeTitles(e,library);
  assert.deepEqual(titles(),[]);
  for(const {alias} of aliases)e.run('INSERT INTO songbook_alias VALUES(?,?,?)','p',alias,insert);
  e.run("DELETE FROM inventory WHERE player='p' AND card='card22'");
  e.addCard('p','card22');
  // Both holdings disappear before the asynchronous verification runs.
  e.run("DELETE FROM inventory WHERE player='p' AND card='card22'");
  e.run('DELETE FROM songbook_owned WHERE id=?',insert);
  await assert.rejects(settleAnimeTitles(e,async()=>{throw Error('offline')}),/offline/);
  await settleAnimeTitles(e,library);await settleAnimeTitles(e,library);
  assert.deepEqual(await status(),[0,1,1,2]);
  assert.deepEqual(titles().map(t=>t.title),['alpha']);
  e.quiz.equipTitles('p',{quizzes:[],awards:[]});
  assert.equal(titles().length,0);
  assert.equal(e.quiz.titleOptions('p').find(t=>t.category==='anime-collection').equipped,false);
});
test('completion tiles have nine equally spaced rarity bands and only display 100% at full ownership',()=>{
  const options={title:'Alpha',player:'p',own:true,escape:String};
  for(const [i,tier] of ['d','c','b','a','s','ss','sss','ubers','ag'].entries())
    assert.ok(animeTile({owned:i,total:9,series_key:'alpha'},options).includes('data-tier="'+tier+'"'));
  assert.ok(animeTile({owned:999,total:1000},options).includes('99%'));
  assert.ok(animeTile({owned:0,total:0,songOwned:1,songTotal:1},options).includes('100%'));
});

test('existing complete collections get a title during backfill without opening the board',async()=>{
  const {e,call,data}=fixture(),catalog=new SongbookCatalog(data);
  await call('songbook-pack',{},'pack');
  e.addCard('p','card33');
  e.run('DELETE FROM anime_completion_pending');
  e.economy.anime.save({phase:'done'});
  backfillAnimeTitles(e);
  await settleAnimeTitles(e,input=>catalog.request(input));
  assert.deepEqual(e.quiz.titles('p').map(t=>t.title),['beta']);
  assert.ok(!e.one("SELECT 1 FROM catalog_meta WHERE key='anime-title-backfill'"));
});

test('one owned song can be showcased publicly and the catalogue sorts using actual AMQ difficulty and MAL rank',async()=>{
  const {call,e,data}=fixture();
  const catalog=new SongbookCatalog(data,{anime:{2:[null,null,null,500],3:[null,null,null,10]},songs:{15:[null,null,null,null,60],17:[null,null,null,null,0]}});
  const source=async req=>catalog.request(req,()=>0);
  const difficulties=await call('songbook?order=difficulty',null,null,source);
  assert.deepEqual(difficulties.rows.map(s=>s.difficulty),[0,60]);
  assert.deepEqual((await call('songbook?order=popularity',null,null,source)).rows.map(s=>s.popularity),[10,500]);
  await call('songbook-pack',{},'acquire',source);
  const owned=(await call('songbook?owned=1')).rows[0];
  await assert.rejects(call('songbook-flag',{flag:'showcased',enabled:true,id:owned.id+1},'unowned'),/own/);
  await call('songbook-flag',{flag:'showcased',enabled:true,id:owned.id},'feature');
  assert.equal(e.profile('p').featuredSong.title,owned.title);
  assert.equal((await call('songbook?owned=1')).rows[0].showcased,true);
  await call('songbook-flag',{flag:'showcased',enabled:false,id:owned.id},'clear');
  assert.equal(e.profile('p').featuredSong,null);
});

test('bulk song packs validate quantity and charge and reveal all draws once',async()=>{
  const {e,call}=fixture();
  const buy=(count,key)=>call('songbook-pack',{count},key);
  for(const count of [0,1.5,101])await assert.rejects(buy(count,'bad'));
  await assert.rejects(buy(5,'too-expensive'),/credits/);
  const opened=await buy(4,'bulk');
  assert.equal(opened.pulls.length,12);
  assert.equal(opened.notes,11);
  assert.equal(e.player('p').balance,0);
  assert.deepEqual(await buy(4,'bulk'),opened);
  await assert.rejects(buy(1,'bulk'),/different action/);
});
