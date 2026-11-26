import test from 'node:test';
import assert from 'node:assert/strict';
import {studioLobbySettings,studioTeamAssignments} from '../public/play-studio-rules.js';
import {makeMatch,gradeRound,advanceMatch} from '../src/play-match-rules.js';
import {versusHTML,recapHTML} from '../public/play-round-ui.js';
import {broadcastResults,studioWinnerText} from '../public/play-match-results.js';
import {pointsBoard} from '../public/play-lobby-ui.js';
import {playSongProgressHTML} from '../public/play-song-progress.js';
import {roundSoundCues} from '../public/play-sound-cues.js';
import {spectatorView} from '../src/play-spectator.js';
import {matchView} from '../src/play-match-rules.js';
import {selectStudio,eligibleOccurrence} from '../src/play-studio-selection.js';
const base={
  name:'Evening',format:'Free-for-all',players:8,teamSize:2,songs:4,scoring:'Count',guessFields:['anime'],lives:2,guess:20,extra:5,
  randomSample:false,sample:100,speedMode:'Fixed',speed:1.25,minSpeed:1,maxSpeed:2,pool:'Random',watchMethod:'Random',cutoff:2,
  unit:'Songs',mix:[2,1,1],types:['OP'],categories:{OP:['Standard'],ED:[],IN:[]},dupes:false,rebroadcast:false,dubs:false,
  difficultyFrom:0,difficultyTo:100,popFrom:0,popTo:100,from:7696,to:8100,animeTypes:['TV'],top:'',scoreFrom:0,scoreTo:10,genres:[],tags:[],genreLogic:'OR',tagLogic:'OR'
};
function match(overrides={}, roster){
  const studio={...base,...overrides},lobby=studioLobbySettings(studio);
  const players=roster??Array.from({length:4},(_,i)=>({id:String(i),name:'Player '+i}));
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
  assert.equal(match({format:'Teams',teamSize:3}).teams.length,2);
  assert.throws(()=>match({guessFields:[]}),/scoring/);
});
test('studio teams use the current headcount, balance automatic seats and keep player choices at kickoff',()=>{
  for(let n=1;n<=8;n++)for(let size=1;size<=8;size++){
    const players=Array.from({length:n},(_,i)=>({id:String(i),name:'Player '+i}));
    const m=match({format:'Teams',teamSize:size},players);
    const sizes=m.teams.map((_,i)=>m.players.filter(p=>p.team===i).length);
    assert.equal(sizes.length,Math.ceil(n/size));
    assert.ok(Math.max(...sizes)<=size&&Math.max(...sizes)-Math.min(...sizes)<=1);
  }
  const players=[null,1,1,null,0].map((teamChoice,i)=>({id:String(i),name:'P'+i,teamChoice}));
  const expected=studioTeamAssignments(players,3);
  const m=match({format:'Teams',teamSize:3},players);
  assert.ok(m.players.every(p=>p.team===expected.get(p.id)));
  assert.equal(expected.get('1'),1);assert.equal(expected.get('2'),1);assert.equal(expected.get('4'),0);
  assert.throws(()=>match({format:'Teams',teamSize:9}),/capacity/);
  const single=match({format:'Teams',teamSize:8,scoring:'Lives'});
  grade(single,()=>false);assert.deepEqual(single.teams,[1]);
});

test('one-team ED lobby keeps a teammate hit shared through guessing, reveal and results',()=>{
  const settings={format:'Teams',teamSize:8,types:['ED'],categories:{OP:[],ED:['Standard'],IN:[]}};
  const m=match(settings);
  const [me,friend]=m.players;
  assert.ok(m.players.every(p=>p.team===0));
  assert.ok(eligibleOccurrence(m.lobby.studio,['ED','Standard',false,false,50,null],['TV',8000,8,200,[],[]]));
  assert.ok(!eligibleOccurrence(m.lobby.studio,['OP','Standard',false,false,50,null],['TV',8000,8,200,[],[]]));
  m.phase='guess';friend.answers={anime:'Anime'};friend.locked=true;
  const snapshot=()=>matchView(m,me.id,100);
  const guessing=snapshot();
  assert.match(pointsBoard(guessing,String),/<small>Anime<\/small>/);
  assert.doesNotMatch(pointsBoard(spectatorView(m),String),/<small>Anime<\/small>/);
  grade(m,p=>p.id===friend.id);
  const v=snapshot(),row=v.history[0];
  assert.deepEqual(v.teams,[1]);assert.equal(me.score,0);
  assert.match(versusHTML(v,row,String),/Your Team/);
  assert.match(versusHTML(v,row,String),/data-answer-state="correct"/);
  assert.match(recapHTML(v,String,r=>r.anime),/Team \+1 · You \+0/);
  assert.match(playSongProgressHTML(v,String,r=>r.anime),/class="hit"/);
  assert.deepEqual(roundSoundCues(guessing,v),['correct']);
  assert.equal(studioWinnerText(v,me),'Your team scored 1 point');
  assert.match(broadcastResults({...v,phase:'finished'},String,r=>r.anime,()=>studioWinnerText(v,me)),/Your team/);
  assert.equal(spectatorView(m).lobby.studio.format,'Teams');
});

test('custom reveal groups each side once and hides opponent guesses until reveal',()=>{
  const m=match({format:'Teams',teamSize:2},Array.from({length:5},(_,i)=>({id:String(i),name:'P'+i,teamChoice:Math.floor(i/2)})));
  const me=m.players.find(p=>p.team===2),opponent=m.players.find(p=>p.team===0);
  m.phase='guess';opponent.locked=true;opponent.answers={anime:'Opponent guess'};
  assert.doesNotMatch(pointsBoard(matchView(m,me.id),String),/Opponent guess/);
  grade(m,p=>p.team===0);
  const v=matchView(m,me.id),html=versusHTML(v,v.history[0],String);
  assert.equal((html.match(/class="sa-side-heading"/g)||[]).length,3);
  assert.match(playSongProgressHTML(v,String,r=>r.anime),/class="miss"/);
  assert.equal(studioWinnerText(v,me),'Your team lost');
  const ffa=match();grade(ffa,()=>true);
  const fv=matchView(ffa,ffa.players[0].id);
  assert.match(versusHTML(fv,fv.history[0],String),/>You</);
  assert.doesNotMatch(versusHTML(fv,fv.history[0],String),/>Your Team</);
});

test('ED-only team roster survives the queue to match websocket handoff',async t=>{
  const {playRuntimeFixture}=await import('./play-runtime-fixture.mjs');
  const {PLAY_AUDIO_PROTOCOL}=await import('../public/play-audio-format.js');
  const runtime=await playRuntimeFixture({endingSongs:true});
  const sockets=[];
  t.after(async()=>{for(const ws of sockets)ws.close();await runtime.dispose();});
  const baseURL='http://game';
  const connect=async(cookie,id='')=>{
    const response=await runtime.dispatchFetch(baseURL+'/api/play-connect?protocol='+PLAY_AUDIO_PROTOCOL+'&match='+id,
      {headers:{Upgrade:'websocket',Origin:baseURL,Cookie:cookie}});
    assert.equal(response.status,101);
    const ws=response.webSocket,messages=[];
    ws.addEventListener('message',e=>messages.push(JSON.parse(e.data)));
    ws.accept();sockets.push(ws);
    return {send:data=>ws.send(JSON.stringify(data)),async wait(predicate){
      for(let i=0;i<300;i++){
        const error=messages.find(m=>m.type==='error');if(error)throw Error(error.message);
        const msg=messages.find(predicate);if(msg)return msg;
        await new Promise(resolve=>setTimeout(resolve,20));
      }
      throw Error('Timed out waiting for lobby or match state');
    }};
  };
  const cookies=await Promise.all([1,2,3].map(async id=>(await (await runtime.dispatchFetch(baseURL+'/api/__test-session?id='+id)).json()).cookie));
  const queues=await Promise.all(cookies.map(cookie=>connect(cookie)));
  const host=queues[0];
  host.send({type:'lobby-create',format:'lobby-ffa',studio:{...base,format:'Teams',teamSize:8,types:['ED'],categories:{OP:[],ED:['Standard'],IN:[]}}});
  const {code}=await host.wait(m=>m.type==='lobby');
  for(const guest of queues.slice(1)){
    guest.send({type:'lobby-join',code});
    await guest.wait(m=>m.type==='lobby');
    guest.send({type:'lobby-ready',ready:true});
  }
  const lobby=await host.wait(m=>m.type==='lobby'&&m.players.length===3&&m.players.every(p=>p.id===m.host||p.ready));
  const assignments=Object.fromEntries(lobby.players.map(p=>[p.id,p.team]));
  assert.deepEqual(Object.values(assignments),[0,0,0]);
  host.send({type:'lobby-start'});
  const {match:id}=await host.wait(m=>m.type==='matched');
  for(const cookie of cookies){
    const room=await connect(cookie,id);
    const {state}=await room.wait(m=>m.type==='state');
    assert.deepEqual(Object.fromEntries(state.players.map(p=>[p.id,p.team])),assignments);
    assert.deepEqual(state.teams,[0]);
    assert.deepEqual(state.lobby.studio.types,['ED']);
  }
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

test('all custom pool slots pick types evenly, including repeat shows and filtered replacement draws',async t=>{
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
  for(const kind of ['watched','unwatched','random']){
    const poolLists=kind==='unwatched'?[]:lists;
    const poolRules=kind==='watched'?rules:{...rules,pool:'Mixed'};
    for(const dupes of [false,true]){
      const songs=dupes?2:1;
      const mix=[kind==='watched'?songs:0,kind==='unwatched'?songs:0,kind==='random'?songs:0];
      let withOpening=0;
      for(let i=0;i<1200;i++){
        const picks=await selectStudio(data,meta,{...poolRules,dupes,songs,mix},poolLists,async(_,url)=>url);
        assert.equal(new Set(picks.map(p=>p.group)).size,picks.length);
        assert.ok(picks.every(p=>p.bucket.kind===kind&&(p.label==='OP'||p.label==='ED')));
        if(picks.some(p=>p.label==='OP'))withOpening++;
      }
      assert.ok(Math.abs(withOpening/1200-(dupes?.75:.5))<.05, kind+': '+withOpening);
      const replacement=await selectStudio(data,meta,{...poolRules,dupes},poolLists,async(_,url)=>url,
        {exclude:['1.mp3'],replacement:{kind}});
      assert.equal(replacement[0].label,'ED');
    }
  }
});
