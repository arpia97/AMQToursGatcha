import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {Engine} from "../src/engine.js";
import {AliasSync} from "../src/aliases.js";
import {friendButton} from "../public/friends-ui.js";

function fixture(t) {
  const db=new DatabaseSync(':memory:');t.after(()=>db.close());
  const e=new Engine((s,...a)=>db.prepare(s).all(...a),fn=>{db.exec('BEGIN');try{const r=fn();db.exec('COMMIT');return r;}catch(error){db.exec('ROLLBACK');throw error;}},()=>100000,()=>0);
  e.host('players',{players:['a','b','c','d'].map(id=>({id,name:id.toUpperCase()}))});
  e.host('catalog',{cards:[{id:'card',name:'Card',kind:'character',series:'Anime'}]});
  const act=(p,a,b,key=crypto.randomUUID())=>e.mutate(p+':'+a,key,b,()=>e.action(p,a,b));
  return {e,act};
}
test('directed friends persist, count followers, distinguish mutual adds and migrate both edges without touching gameplay',t=>{
  const {e,act}=fixture(t),before=e.player('a');
  const add={player:'b',added:true};act('a','friend-set',add,'once');act('a','friend-set',add,'once');
  assert.deepEqual(e.profile('b','a').friendship,{added:true,mutual:false,followers:1});
  assert.deepEqual(e.profile('b','c').friendship,{added:false,mutual:false,followers:1});
  act('b','friend-set',{player:'a',added:true});
  assert.equal(e.profile('b','a').friendship.mutual,true);
  assert.equal(e.profilesPage('',1,'a').profiles.find(p=>p.id==='b').friendship.added,true);
  assert.deepEqual(e.friends.page('a').rows.map(p=>p.id),['b']);
  assert.deepEqual(e.friends.page('a','incoming').rows.map(p=>p.id),['b']);
  e.tx(()=>new AliasSync(e).renamePlayer('b','200'));
  assert.equal(e.profile('200','a').friendship.mutual,true);
  assert.equal(e.profile('a','200').friendship.mutual,true);
  act('a','friend-set',{player:'200',added:false});
  assert.equal(e.profile('200','a').friendship.followers,0);
  assert.equal(e.profile('a','200').friendship.mutual,false);
  assert.deepEqual(e.player('a'),before);
  assert.throws(()=>act('a','friend-set',{player:'a',added:true}),/yourself/);
  assert.throws(()=>act('a','friend-set',{player:'missing',added:true}),/Unknown/);
  assert.throws(()=>act('a','friend-set',{player:'c',added:1}),/whether/);
  assert.throws(()=>e.friends.page(null),e=>e.status===401);
  const escape=s=>String(s).replaceAll('<','&lt;').replaceAll('"','&quot;');
  const p={id:'200',name:'<Bad>',friendship:{added:true,mutual:true,followers:3}};
  assert.match(friendButton(p,'a',escape),/is-mutual/);assert.doesNotMatch(friendButton(p,'a',escape),/<Bad>/);
});
test('friends filters apply before ranking, leaderboard and listing pagination and never expose private ownership',t=>{
  const {e,act}=fixture(t);act('a','friend-set',{player:'b',added:true});act('c','friend-set',{player:'a',added:true});
  for(const [id,earned]of [['a',10],['b',20],['c',100]])e.run('UPDATE players SET earned=? WHERE id=?',earned,id);
  assert.deepEqual(e.economy.rankings('earned',1,'a',true).rows.map(r=>r.id),['b','a']);
  const songs=Array.from({length:20},(_,i)=>({audio:'https://example.com/'+i+'.mp3',answers:['Anime']}));
  e.quiz.save({id:'q',name:'Quiz',songs,published:true});
  for(const [id,best]of [['a',10],['b',15],['c',20]])e.run('INSERT INTO quiz_progress(player,quiz,best,at,best_at) VALUES(?,?,?,?,?)',id,'q',best,1,1);
  assert.deepEqual(e.quiz.leaderboard('q','a',1,true).rows.map(r=>r.id),['b','a']);
  assert.equal(e.quiz.leaderboard('q','a',1,true).me.rank,2);
  for(const id of ['b','c']){
    e.addCard(id,'card',4);
    act(id,'list-card',{card:'card',venue:'shop',price:100});
    act(id,'trade-list',{card:'card',variant:'extra',expectedLevel:1});
    act(id,'list-card',{card:'card',venue:'auction',price:100,hours:1});
    act(id,'wishlist',{card:'card',wanted:true});
  }
  for(const venue of ['shop','auction'])assert.deepEqual(e.economy.market(venue,'both',1,{friendsOnly:true},'a').items.map(r=>r.seller),['b']);
  assert.deepEqual(e.economy.trades.page('a',{friendsOnly:true}).items.map(r=>r.seller),['b']);
  assert.deepEqual(e.economy.wishlist.collectors('card','owned',1,'a',true).rows.map(r=>r.id),['b']);
  assert.deepEqual(e.economy.wishlist.collectors('card','wanted',1,'a',true).rows.map(r=>r.id),['b']);
  e.run("UPDATE players SET private_collection=1 WHERE id='b'");
  assert.equal(e.economy.wishlist.collectors('card','owned',1,'a',true).counts.owned,0);
  assert.equal(e.economy.wishlist.collectors('card','wanted',1,'a',true).counts.wanted,1);
  for(const call of [()=>e.economy.rankings('earned',1,null,true),()=>e.quiz.leaderboard('q',null,1,true),()=>e.economy.market('shop','both',1,{friendsOnly:true}),()=>e.economy.trades.page(null,{friendsOnly:true}),()=>e.economy.wishlist.collectors('card','owned',1,null,true)])assert.throws(call,e=>e.status===401);
});
test('friend quiz alerts are opt-in, directional, deduplicated and only cross a saved personal best',t=>{
  const {e,act}=fixture(t),q={id:'q',name:'Quiz'};
  act('a','friend-set',{player:'b',added:true});
  e.run("INSERT INTO quizzes(id,name,cover,title,published,source,updated) VALUES('q','Quiz','','',1,'test',1)");
  e.run("INSERT INTO quiz_progress(player,quiz,best,at,best_at,best_duration_ms) VALUES('a','q',10,1,1,60000)");
  const old={best:9,best_duration_ms:50000},next={best:11,best_duration_ms:50000};
  e.friends.notifyQuiz('b',q,old,next,'off');assert.equal(e.economy.notices.pending('a').length,0);
  act('a','profile',{notifyFriendsQuiz:true});
  e.friends.notifyQuiz('b',q,old,next,'cross');e.friends.notifyQuiz('b',q,old,next,'cross');
  assert.equal(e.economy.notices.pending('a').length,1);
  e.friends.notifyQuiz('b',q,next,{best:12,best_duration_ms:40000},'already-ahead');
  assert.equal(e.economy.notices.pending('a').length,1);
  e.friends.notifyQuiz('b',q,old,{best:10,best_duration_ms:55000},'speed');
  assert.equal(e.economy.notices.pending('a').length,2);
  e.friends.notifyQuiz('b',q,old,next,'leader','a');assert.equal(e.economy.notices.pending('a').length,2);
  act('a','friend-set',{player:'b',added:false});e.friends.notifyQuiz('b',q,old,next,'removed');assert.equal(e.economy.notices.pending('a').length,2);
  act('a','profile',{notifyFriendsQuiz:false});assert.equal(e.economy.notices.pending('a').length,0);
});
