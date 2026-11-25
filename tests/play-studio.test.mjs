import test from 'node:test';
import assert from 'node:assert/strict';
import {studioLobbySettings} from '../public/play-studio-rules.js';
import {makeMatch,gradeRound,advanceMatch} from '../src/play-match-rules.js';
import {selectStudio,eligibleOccurrence} from '../src/play-studio-selection.js';
const base={
  name:'Evening',format:'Free-for-all',players:8,teamSize:2,songs:4,scoring:'Count',guessFields:['anime'],lives:2,guess:20,extra:5,
  randomSample:false,sample:100,speedMode:'Fixed',speed:1.25,minSpeed:1,maxSpeed:2,pool:'Random',watchMethod:'Random',cutoff:2,
  unit:'Songs',mix:[2,1,1],types:['OP'],categories:{OP:['Standard'],ED:[],IN:[]},dupes:false,rebroadcast:false,dubs:false,
  difficultyFrom:0,difficultyTo:100,popFrom:0,popTo:100,from:7696,to:8100,animeTypes:['TV'],top:'',scoreFrom:0,scoreTo:10,genres:[],tags:[],genreLogic:'OR',tagLogic:'OR'
};
function match(overrides={}){
  const studio={...base,...overrides},lobby=studioLobbySettings(studio);
  const players=Array.from({length:4},(_,i)=>({id:String(i),name:'Player '+i}));
  const song={anime:'Anime',answers:{anime:['Anime']}};
  return makeMatch('match','lobby-ffa',players,Array(studio.songs).fill(song),0,lobby);
}
function grade(m,hit){
  m.phase='guess';m.startsAt=10;m.until=25010;
  m.players.forEach((p,i)=>{p.answers={anime:hit(p,i)?'Anime':'Unknown'};p.locked=true;p.lockedElapsedMs=10000;});
  gradeRound(m,15000);
}
test('studio settings create a real custom match with synchronized timing and selected fields',()=>{
  const m=match({scoring:'Song/Artist',guessFields:['song','artist']});
  assert.equal(m.lobby.seconds,25);assert.deepEqual(m.lobby.guessFields,['song','artist']);
  assert.deepEqual(m.playbackRates,[1.25,1.25,1.25,1.25]);assert.equal(m.clipSeconds,25);
  assert.ok(m.samplePositions.every(v=>v>0.999&&v<1));
  assert.throws(()=>match({format:'Teams',teamSize:3}),/complete/);
  assert.throws(()=>match({guessFields:[]}),/scoring/);
});
test('team lives survive equal hits and misses; only a losing side loses one life',()=>{
  const m=match({format:'Teams',scoring:'Lives',lives:2});
  grade(m,()=>true);assert.deepEqual(m.teams,[2,2]);
  grade(m,()=>false);assert.deepEqual(m.teams,[2,2]);
  grade(m,p=>p.team===1);assert.deepEqual(m.teams,[1,2]);
  grade(m,p=>p.team===1);advanceMatch(m,m.until);assert.equal(m.phase,'finished');
  assert.deepEqual(m.teams,[0,2]);
});
test('FFA elimination stops further points; speed scores use the locked answer time',()=>{
  const m=match({scoring:'Lives',lives:1});
  grade(m,p=>p.team!==0);grade(m,p=>p.team===0);assert.equal(m.players.find(p=>p.team===0).score,0);
  const speed=match({scoring:'Speed'});grade(speed,()=>true);assert.deepEqual(speed.teams,[1.5,1.5,1.5,1.5]);
});
test('filters combine across media type, categories, MAL, tags, and modifiers',()=>{
  const s={...base,scoreFrom:7,genres:['Drama','Comedy'],genreLogic:'AND',tags:['Magic'],difficultyFrom:20};
  const song=['OP','Standard',false,false,50,null],anime=['TV',8000,8.4,200,['Comedy','Drama'],['Magic']];
  assert.ok(eligibleOccurrence(s,song,anime));
  for(const changes of [{top:10},{scoreFrom:9},{tags:['Idol']},{difficultyTo:30},{animeTypes:['OVA']},{genres:['Action']},{from:8001}])assert.equal(eligibleOccurrence({...s,...changes},song,anime),false);
  assert.equal(eligibleOccurrence(s,['ED',...song.slice(1)],anime),false);
  assert.equal(eligibleOccurrence(s,['OP','Standard',true,true,50,null],anime),false);
});
test('Mixed draws enforce exact bucket sizes, owner quotas, and unique playable recordings',async()=>{
  const ids=[1,2,3,4,5,6,7,8],data={groups:ids.map(i=>[i]),sources:ids.map(i=>'https://example.com/'+i+'.mp3'),ngmcRows:[],extras:new Map(),preferred:[],occurrenceAnime:new Map(ids.map(i=>[i,i])),linkedAnime:new Map(ids.map(i=>[i,{anilist:i}]))};
  const meta={songs:{},anime:{}};
  for(const i of ids){meta.songs[i]=['OP','Standard',false,false,20,null];meta.anime[i]=['TV',8000,8,100,[],[]];}
  const lists=[{player:'a',provider:'anilist',ids:[1,2,3]},{player:'b',provider:'anilist',ids:[3,4,5]}];
  const picks=await selectStudio(data,meta,{...base,pool:'Mixed',watchMethod:'Forced Equal'},lists,async(_,url)=>url);
  assert.equal(new Set(picks.map(p=>p.url)).size,4);
  assert.deepEqual(picks.filter(p=>p.bucket.owner).map(p=>p.bucket.owner).sort(),['a','b']);
  assert.ok(picks.find(p=>p.bucket.kind==='unwatched').anime>5);
  await assert.rejects(selectStudio(data,meta,{...base,types:['ED']},[],async(_,url)=>url),/fit these filters/);
});

test('custom Watched picks types evenly, including repeat shows and filtered replacement draws',async t=>{
  let state=329;
  t.mock.method(Math,'random',()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/2**32;});
  const types=['OP','ED','ED','ED','ED','IN'];
  const ids=types.map((_,i)=>i+1);
  const data={groups:ids.map(i=>[i]),sources:ids.map(i=>i+'.mp3'),ngmcRows:[],extras:new Map(),preferred:[],
    occurrenceAnime:new Map(ids.map(i=>[i,1])),linkedAnime:new Map([[1,{anilist:10}]])};
  const meta={songs:Object.fromEntries(ids.map((id,i)=>[id,[types[i],'Standard',false,false,20,null]])),
    anime:{1:['TV',8000,8,100,[],[]]}};
  const lists=[{player:'a',provider:'anilist',ids:[10]}];
  const rules={...base,pool:'Watched',types:['OP','ED'],categories:{...base.categories,ED:['Standard']}};
  for(const dupes of [false,true]){
    let withOpening=0;
    for(let i=0;i<1200;i++){
      const picks=await selectStudio(data,meta,{...rules,dupes,songs:dupes?2:1},lists,async(_,url)=>url);
      assert.equal(new Set(picks.map(p=>p.group)).size,picks.length);
      assert.ok(picks.every(p=>p.label==='OP'||p.label==='ED'));
      if(picks.some(p=>p.label==='OP'))withOpening++;
    }
    const expected=dupes?.75:.5;
    assert.ok(Math.abs(withOpening/1200-expected)<.05, String(withOpening));
  }
  const replacement=await selectStudio(data,meta,rules,lists,async(_,url)=>url,
    {exclude:['1.mp3'],replacement:{kind:'watched'}});
  assert.equal(replacement[0].label,'ED');
});
