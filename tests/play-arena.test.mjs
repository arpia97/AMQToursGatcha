import test from 'node:test';
import assert from 'node:assert/strict';
import {arenaRules, ARENA_FORMAT} from '../public/play-arena-config.js';
import {arenaBatch, arenaSchedule, arenaSongCount, arenaStandings, recordArenaSong} from '../src/play-arena.js';
import {advanceMatch, makeMatch, matchMove, matchView} from '../src/play-match-rules.js';

test('Arena batches the oldest whole group and schedules every opponent once', () => {
  const queue = Array.from({length: 19}, (_, joined) => ({joined}));
  const batch = (n, t) => arenaBatch(queue.slice(0,n), t);
  assert.equal(batch(3, Infinity).size, 0);
  assert.deepEqual(batch(7,0), {size:0, deadline:3 + arenaRules.smallFieldWaitMs});
  assert.equal(batch(7,Infinity).size, 4);
  assert.deepEqual(batch(13,0), {size:0, deadline:7 + arenaRules.gatherMs});
  assert.equal(batch(13,Infinity).size,12);
  assert.equal(batch(19,0).size,16);
  assert.throws(() => arenaSongCount(10));
  assert.deepEqual([4,8,12,16].map(arenaSongCount),[20,60,100,140]);
  for (const n of [2,4,6,8]) {
    const {rounds} = arenaSchedule(n);
    const opponents = new Set();
    assert.equal(rounds.length,n-1);
    for (const round of rounds) {
      const participants = round.flatMap(({home,away}) => [home,away]);
      assert.equal(participants.length,n);
      assert.equal(new Set(participants).size,n);
      for (const {home,away} of round) opponents.add([home,away].sort().join('-'));
    }
    assert.equal(opponents.size,n*(n-1)/2);
  }
});

test('Arena keeps pairs balanced and fixed, rotates opponents and scores each completed fixture once', () => {
  const roster = Array.from({length:8},(_,i) => ({id:String(i),name:'Player '+i,elo:800+i*60}));
  const songs = Array.from({length:arenaSongCount(8)},(_,i) =>
    ({anime:'Anime '+i,title:'Title',artist:'Artist',answers:{anime:['anime '+i],song:[],artist:[]}}));
  const s = makeMatch('arena',ARENA_FORMAT,roster,songs,0);
  const pairs = s.arena.rounds[0].flatMap(({home,away})=>[home,away]);
  assert.deepEqual(pairs.map(team => s.players.filter(p=>p.team===team).reduce((sum,p)=>sum+p.elo,0)),Array(4).fill(2020));
  const indices = songs.map((_,i)=>i);
  for (const p of s.players) {
    matchMove(s,p.id,{type:'loaded',indices},100);
    matchMove(s,p.id,{type:'ready'},100);
  }
  for (let index=0;index<songs.length;index++) {
    assert.equal(s.phase,'guess');
    assert.equal(s.until-s.startsAt,20_000);
    const now=s.startsAt+10;
    const [first, partner]=s.players.filter(player=>player.team===0);
    const outsider=s.players.find(player=>player.team!==0);
    const propose=(player,answer)=>matchMove(s,player.id,{type:'propose',field:'anime',index,answer},now);
    const vote=(player,choice)=>matchMove(s,player.id,{type:'vote',field:'anime',index,choice},now);
    propose(first, 'Wrong title');
    const original=matchView(s,partner.id,now).arena.ballot.find(option=>option.owner===first.id);
    vote(partner,original.choice);
    propose(first,'Another wrong title');
    assert.equal(partner.arenaVote,undefined);
    propose(partner,'Anime '+index);
    const correct=matchView(s,first.id,now).arena.ballot.find(option=>option.owner===partner.id);
    assert.equal(matchView(s,outsider.id,now).arena.ballot.some(option=>option.choice===correct.choice),false);
    assert.throws(()=>vote(outsider,correct.choice), /your pair/);
    vote(first,correct.choice);
    vote(partner,correct.choice);
    const outsiders=s.players.filter(player=>player.team===outsider.team);
    outsiders.forEach((player,i)=>propose(player,'Guess '+i));
    for (const {owner,choice} of matchView(s,outsider.id,now).arena.ballot) {
      vote(outsiders.find(player=>player.id===owner),choice);
    }
    assert.equal(s.phase,'guess');
    advanceMatch(s,s.until);
    assert.equal(s.phase,'reveal');
    assert.deepEqual(s.history.at(-1).points,[1,0,0,0]);
    const {results}=s.history.at(-1);
    assert.equal(results.find(result=>result.id===first.id).answers.anime,undefined);
    const guesses=results.filter(result=>outsiders.some(player=>player.id===result.id)&&result.answers.anime);
    assert.equal(guesses.length,1);
    assert.equal(guesses[0].correct.anime,false);
    advanceMatch(s,s.until);
  }
  assert.equal(s.phase,'finished');
  const standings=arenaStandings(s.arena);
  assert.deepEqual(standings[0],{team:0,won:3,drawn:0,lost:0,points:9,difference:arenaSongCount(8)});
  assert.ok(standings.slice(1).every(row=>row.lost===1&&row.drawn===2&&row.points===2));
  assert.deepEqual(matchView(s,'0').arena.standings,standings);
});

test('a remaining teammate can play and an abandoned pair forfeits only unfinished fixtures', () => {
  const arena=arenaSchedule(4);
  const players=Array.from({length:8},(_,i)=>({team:i%4,left:i===0}));
  const points=[0,0,0,0];
  for(let i=0;i<arena.songsPerFixture;i++)recordArenaSong(arena,i,points,players);
  assert.ok(arenaStandings(arena).every(row=>row.drawn===1));
  players[4].left=true;
  for(let i=arena.songsPerFixture;i<arena.songsPerFixture*2;i++)recordArenaSong(arena,i,points,players);
  const row=arenaStandings(arena).find(row=>row.team===0);
  assert.deepEqual([row.drawn,row.lost,row.points],[1,1,1]);
});
