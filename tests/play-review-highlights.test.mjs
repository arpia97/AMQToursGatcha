import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {timelineHTML} from '../public/play-review-timeline.js';
import {reviewTimeline} from '../src/play-review-timeline.js';
import {playedTrackLookup} from '../src/play-history.js';
import {ReviewHighlights} from '../src/play-review-highlights.js';

test('host highlights correlate retained events across batches and count distinct scored rounds', () => {
  const db=new DatabaseSync(':memory:');
  try {
    const storage={sql:{exec:(query,...args)=>db.prepare(query).all(...args)},transactionSync:fn=>fn()};
    db.exec('CREATE TABLE review_events(seq INTEGER PRIMARY KEY,at,player,kind,data); CREATE TABLE review_meta(id INTEGER PRIMARY KEY,data,expires)');
    let seq=0;
    function add(player,round,kind,elapsed,data={}) {
      db.prepare('INSERT INTO review_events VALUES(?,?,?,?,?)').run(++seq,round*30000+elapsed,player,kind,JSON.stringify({round,phase:'guess',...data}));
    }
    const answer={answers:{anime:'Example'},accepted:true};
    const score={answers:answer.answers,correct:{anime:true}};
    for (let i=0;i<126;i++) add('',1,'phase',0);
    for (const [player,scenario] of [['a','correct'],['b','wrong'],['c','prefilled'],['d','auto'],['e','reconnect']]) {
      if(scenario==='prefilled') add(player,1,'answer-draft',1000,answer);
      add(player,1,'activity',5000,{event:'focus',visibility:'visible',focused:false,clientAt:3});
      add(player,1,'activity',5100,{event:'visibility',visibility:'hidden',focused:false});
      if(scenario==='reconnect') add(player,1,'disconnected',8000);
      add(player,1,'activity',12000,{event:'focus',visibility:'visible',focused:true});
      add(player,1,'submit',12500,{...answer,elapsedMs:12500});
      add(player,1,'round-result',20000,{...score,correct:{anime:scenario!=='wrong'},autoSubmitted:scenario==='auto'});
    }
    for(let r=2;r<=4;r++){
      add('a',r,'submit',850,{...answer,elapsedMs:850});
      add('a',r,'round-result',20000,score);
    }
    add('f',2,'activity',5000,{event:'visibility',visibility:'hidden',focused:false});
    add('f',2,'activity',10000,{event:'focus',visibility:'visible',focused:true});
    add('f',2,'propose',10500,{accepted:true,field:'anime',answer:'Example',elapsedMs:10500});
    add('f',2,'propose',13000,{accepted:true,field:'anime',answer:'Other',elapsedMs:13000});
    add('f',2,'round-result',20000,score);
    const decoy={song:'Unused theme',field:'anime',anime:'Unused anime'};
    add('b',3,'submit',10000,{...answer,flags:[decoy]});
    add('b',3,'round-result',20000,{...answer,correct:{anime:false},flags:[decoy]});
    const index=new ReviewHighlights(storage);
    assert.equal(index.advance(),true);
    const resumed=new ReviewHighlights(storage);
    assert.equal(resumed.advance(),false);
    assert.equal(resumed.advance(),false);
    assert.equal(resumed.count(),4);
    assert.deepEqual({...resumed.counts()},{total:4,refocus:2,decoy:1,fast:1});
    assert.deepEqual(resumed.songFlags('a'),{1:{refocus:1,decoy:0}});
    assert.deepEqual(resumed.songFlags('b'),{3:{refocus:0,decoy:1}});
    add('b',1,'submit',15000,{...answer,flags:[decoy]});
    resumed.advance();
    assert.deepEqual(resumed.playerFlags(1),{a:{refocus:true,decoy:false},b:{refocus:false,decoy:true}});
    assert.deepEqual(resumed.playerFlags(1,'b'),{b:{refocus:false,decoy:true}});
    add('a',1,'submit',15500,{...answer,flags:[decoy]});
    resumed.advance();
    assert.deepEqual(resumed.playerFlags(1,'a'),{a:{refocus:true,decoy:true}});
    assert.deepEqual(resumed.playerFlags(2,'a'),{});
    const tracks=['a','b','unflagged'].map(player=>({player,segments:[],answers:[]}));
    const rendered=timelineHTML({round:1,rounds:[1],duration:12000,tracks,playerFlags:resumed.playerFlags(1)},new Map(),String);
    assert.match(rendered,/>a<\/strong><span class="review-refocus">Refocus<\/span><span class="review-decoy">Decoy hit/);
    assert.match(rendered,/>b<\/strong><span class="review-decoy">Decoy hit/);
    assert.match(rendered,/<strong>unflagged<\/strong><\/div>/);
    const flags=resumed.songFlags();
    assert.deepEqual(flags[1],{refocus:1,decoy:2});
    const html=timelineHTML({rounds:[1,2,3,4],round:1,flags,duration:null},new Map(),String);
    assert.match(html,/aria-label="Song 1 · Refocus: 1 · Link Match: 2"/);
    assert.match(html,/class="refocus"><\/i><i class="decoy">/);
    assert.match(html,/title="Song 4" aria-pressed="false">4<\/button>/);
    assert.equal(resumed.list('f').rows[0].data.answer,'Example');
    const [fast,focus]=resumed.list('a').rows.filter(row=>row.kind!=='decoy');
    assert.deepEqual(fast.data.rounds,[2,3,4]);
    assert.equal(focus.kind,'return');assert.equal(focus.data.out,35000);assert.equal(focus.data.back,42000);
    assert.equal(focus.data.submitAt,42500);assert.equal(focus.data.answer,'Example');
    assert.equal(resumed.list('b').rows[0].kind,'decoy');

    // Older review flags can recover the scored recording from archived rounds.
    db.exec("CREATE TABLE play_history_rounds(idx INTEGER PRIMARY KEY,data); INSERT INTO review_meta VALUES(6,'{}',0)");
    const track={anime:'Played Anime',song:'Played Song',artist:'Played Artist'};
    db.prepare('INSERT INTO play_history_rounds VALUES(?,?)').run(2,JSON.stringify({...track,results:['private data']}));
    const sql={exec:(query,...args)=>{
      const rows=db.prepare(query).all(...args);
      return Object.assign(rows,{toArray:()=>rows});
    }};
    assert.deepEqual([...playedTrackLookup(sql,undefined,[3,18])],[[3,track]]);
  } finally {db.close();}
});

test('song timelines use receipt times, carry focus across rounds, and mark accepted answers', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec('CREATE TABLE review_events(seq INTEGER PRIMARY KEY,at,player,kind,data)');
    const sql = {exec(query,...args) {
      const rows = db.prepare(query).all(...args);
      return Object.assign(rows,{toArray:()=>rows});
    }};
    const insert = db.prepare('INSERT INTO review_events(at,player,kind,data) VALUES(?,?,?,?)');
    const add = (at,player,kind,data) => insert.run(at,player,kind,JSON.stringify({round:2,phase:'guess',...data}));
    add(9000,'a','activity',{round:1,event:'snapshot',focused:true,visibility:'visible'});
    add(9500,'','phase',{startsAt:10000,until:30000});
    add(12000,'a','activity',{event:'focus',focused:false,visibility:'visible',clientAt:25});
    add(13900,'a','activity',{event:'focus',focused:true,visibility:'visible',clientAt:26});
    add(14000,'a','submit',{accepted:false,answers:{anime:'Rejected'}});
    add(14200,'a','submit',{accepted:true,answers:{anime:'Official answer',song:''}});
    add(14800,'a','disconnected',{});
    add(15000,'a','round-result',{answers:{anime:'Official answer'}});
    add(15001,'b','round-result',{answers:{anime:'Automatic answer'},autoSubmitted:true});
    const timeline = reviewTimeline(sql,[{id:'a'},{id:'b'}],{round:'2'},32000);
    assert.deepEqual(timeline,{rounds:[2],round:2,duration:5000,tracks:[
      {player:'a',segments:[
        {from:0,to:2000,state:'focused'},{from:2000,to:3900,state:'unfocused'},
        {from:3900,to:4800,state:'focused'},{from:4800,to:5000,state:'unknown'},
      ],answers:[{at:4200,fields:{anime:'Official answer'}}]},
      {player:'b',segments:[{from:0,to:5000,state:'unknown'}],
        answers:[{at:5000,fields:{anime:'Automatic answer'},automatic:true}]},
    ]});
    assert.deepEqual(reviewTimeline(sql,[{id:'a'},{id:'b'}],{player:'b'},32000).tracks,timeline.tracks.slice(1));
  } finally { db.close(); }
});
