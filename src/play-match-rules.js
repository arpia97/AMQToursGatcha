import {defaultPlayGuessSeconds} from '../public/play-audio-format.js';
import {ARENA_FORMAT, arenaRules} from '../public/play-arena-config.js';
import {arenaSongCount, pairPlayers, arenaSchedule, arenaStandings, recordArenaSong, arenaVoteAction, arenaBallotView, selectArenaTitles} from './play-arena.js';
import {activeRankedGame,RECONNECT_MS,songRatingPools} from '../public/ngmc-leave-policy.js';
import {proposeOrVote,ballotsComplete,selectWinners,returnVote,checkReturn} from './play-lobby-votes.js';
import { playerAudioReady, playbackView } from './play-integrity.js';
import { balanceNgmc,ngmcGuesses,gradeNgmc,eligibleNgmc,finishNgmcCount } from './ngmc-rules.js';
import { titleMatches, artistMatches, submittedArtists } from './play-artists.js';
import {saveDraft,applyTimeoutDrafts} from './play-drafts.js';
export const PLAY_FORMATS=Object.freeze({[ARENA_FORMAT]:{size:arenaRules.preferredPlayers},'ngmc-3v3':{size:6,teams:2},'ngmc-ranked':{size:8,teams:2},'1v1':{size:2,teams:2},'3v3':{size:6,teams:2},'1-team':{size:3,teams:1}});
export const FIELDS=['anime','song','artist'];
function skipMajority(state){
  if(!['1-team','lobby-team'].includes(state.format))return 0;
  return Math.floor(state.players.filter(p=>!p.left).length/2)+1;
}
export const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
export function makeMatch(id,format,players,songs,now=Date.now(),lobby=null) {
  const ngmc=['ngmc-ranked','ngmc-3v3','lobby-ngmc'].includes(format);
  const custom=lobby&&(['lobby-team','lobby-ffa'].includes(format)||format==='lobby-ngmc'&&[6,8].includes(players.length))&&players.length>=1&&players.length<=8;
  const arena=format===ARENA_FORMAT;
  const rules=arena?{size:players.length,teams:players.length/2}:custom?{size:players.length,teams:ngmc?2:format==='lobby-ffa'?players.length:1}:PLAY_FORMATS[format];
  if(!rules||players.length!==rules.size||new Set(players.map(p=>p.id)).size!==rules.size||songs.length!==(arena?arenaSongCount(players.length):custom?lobby.songs:ngmc?35:20))fail('Invalid match setup.');

  let roster=[...players];
  for(let i=roster.length-1;i>0;i--){const x=new Uint32Array(1);crypto.getRandomValues(x);const j=x[0]%(i+1);[roster[i],roster[j]]=[roster[j],roster[i]];}
  if(ngmc)roster=balanceNgmc(roster);
  if(arena)roster=pairPlayers(roster);
  const samples=new Uint32Array(songs.length);crypto.getRandomValues(samples);
  return {id,format,...(custom?{lobby}:{readyDeadline:now+90000}),samplePositions:Array.from(samples,n=>n/4294967296),teamFields:['3v3','1-team'].includes(format),...(arena?{arena:arenaSchedule(rules.teams)}:{}),mode:arena?ARENA_FORMAT:ngmc?'ngmc-ranked':'song-artist',...(ngmc?{counters:[null,null],counterDeadline:now+120000}:{}),songs,index:0,phase:'loading',until:now+180000,created:now,teams:Array(rules.teams).fill(ngmc?5:0),history:[],players:roster.map((p,i)=>({id:p.id,name:p.name,avatar:p.avatar||null,team:ngmc||arena?p.team:i%rules.teams,...(arena?{elo:p.elo}:{}),...(ngmc?{elo:p.elo,guessRate:p.guessRate,initialGuesses:p.guessRate===null?3:ngmcGuesses(p.guessRate),guesses:p.guessRate===null?3:ngmcGuesses(p.guessRate)}:{}),score:0,loaded:[],acceptedReady:!!custom,ready:false,left:false,answers:{},locked:false}))};
}
export function gradeRound(state,now) {
  if(state.phase!=='guess')return;
  if (state.arena) selectArenaTitles(state);
  else if (state.format==='lobby-team') selectWinners(state);
  else applyTimeoutDrafts(state);
  if(state.mode==='ngmc-ranked'){gradeNgmc(state,now);return;}
  const song=state.songs[state.index],teamHits=state.teams.map(()=>new Set());
  const scoringFields=state.arena?['anime']:FIELDS;
  const results=state.players.map(player=>{
    const correct=Object.fromEntries(scoringFields.map(field=>[field,!player.left&&(field==='artist'?song.answers.artist.some(expected=>artistMatches(expected,player.artists??player.answers.artist,song.artistRules)):titleMatches(song.answers[field],player.answers[field])) ]));
    const earned=Object.values(correct).filter(Boolean).length;
    player.score+=earned;
    for(const field of FIELDS)if(correct[field])teamHits[player.team].add(field);
    return {id:player.id,answers:{...player.answers},correct,earned,autoSubmitted:!!player.autoSubmitted};
  });
  for(let i=0;i<teamHits.length;i++)state.teams[i]+=teamHits[i].size;
  if(state.arena)recordArenaSong(state.arena,state.index,teamHits.map(h=>h.size),state.players);
  state.history.push({index:state.index,anime:song.anime,song:song.title,artist:song.artist,artistMembers:song.artistMembers||[song.artist],results,points:teamHits.map(h=>h.size)});
  state.phase='reveal';state.until=now+5000;
}
export function advanceMatch(state,now=Date.now()) {
  if(['finished','cancelled'].includes(state.phase))return;
  const ngmc=state.mode==='ngmc-ranked';
  for(const p of state.players){
    if(!p.left && p.disconnectedAt!=null && now>=p.disconnectedAt+RECONNECT_MS && (state.arena || activeRankedGame(state,now))){
      p.left=true;if(!state.arena)p.rankedLeftAt=p.disconnectedAt+RECONNECT_MS;delete p.disconnectedAt;
    }
  }
  const active=state.players.filter(p=>!p.left);
  if(state.arena && state.phase==='loading' && active.length!==state.players.length){
    state.phase='cancelled';state.reason='A player left before the Arena tournament started.';
    state.until=now+86400000;return;
  }
  if(state.phase==='loading'&&state.readyDeadline<=now){
    const missing=active.filter(p=>!p.acceptedReady&&!p.ready);
    if(missing.length){
      for(const p of missing){
        p.left=true;
        if(state.format==='ngmc-ranked'||Object.hasOwn(songRatingPools,state.format))p.rankedLeftAt=state.readyDeadline;
      }
      state.phase='cancelled';state.readyForfeit=true;state.reason='Match cancelled. '+missing.map(p=>p.name).join(', ')+' did not ready up in time.';
      state.until=now+86400000;return;
    }
  }
  if(checkReturn(state,now))return;
  if(ngmc&&state.history.length&&state.teams.some((_,team)=>!active.some(p=>p.team===team))){if(state.phase==='counting')finishNgmcCount(state,Infinity);for(let team=0;team<2;team++)if(!active.some(p=>p.team===team))state.teams[team]=0;state.phase='finished';state.reason='A team left the match.';state.until=now+86400000;return;}
  if(!active.length){state.phase='cancelled';state.reason='All players left the match.';state.until=now+86400000;return;}
  if(state.phase==='loading'||state.phase==='buffering') {
    if((!ngmc||state.counters.every(Boolean)||now>=state.counterDeadline)&&active.every(p=>playerAudioReady(state,p))) {
      state.phase='guess';state.startsAt=now;
      if(state.index===0)for(const p of active)if(p.disconnectedAt!=null)p.disconnectedAt=state.startsAt;
      state.until=state.lobby?.seconds===0?8.64e15:state.startsAt+(state.lobby?.seconds??defaultPlayGuessSeconds(state.mode))*1000;
    } else if(now>=state.until){
      if(state.arena && active.some(p=>p.disconnectedAt!=null)){
        state.until=Math.max(now+1,...active.filter(p=>p.disconnectedAt!=null).map(p=>p.disconnectedAt+RECONNECT_MS));
        return;
      }
      state.phase='cancelled';state.reason='Not all players could load the audio in time.';state.until=now+86400000;}
  } else if(state.phase==='guess'){
    const needed=skipMajority(state);
    const skipped=needed>0&&active.filter(p=>p.skip).length>=needed;
    const answered=state.format==='lobby-team'?ballotsComplete(state):active.every(p=>p.locked);
    if(now>=state.until||!state.arena&&now>=state.startsAt&&(skipped||answered))gradeRound(state,now);
  }
  else if(state.phase==='counting')finishNgmcCount(state,now);
  else if(state.phase==='reveal'&&now>=state.until) {
    if(state.index===state.songs.length-1||ngmc&&state.teams.includes(0)){state.phase='finished';state.until=now+86400000;return;}
    state.index++;state.phase='buffering';state.until=now+90000;
    delete state.ballot;
    for(const p of state.players){delete p.votes;delete p.arenaTitle;delete p.arenaVote;delete p.draft;delete p.autoSubmitted;delete p.skip;p.answers={};delete p.artists;p.locked=false;delete p.lockedElapsedMs;p.field=null;p.reactions={};}
    advanceMatch(state,now);
  }
}
export function matchMove(state,id,message,now=Date.now()) {
  const player=state.players.find(p=>p.id===id);if(!player)fail('You are not in this match.',403);
  advanceMatch(state,now);
  if(message.type==='leave'){
    if(player.left||['finished','cancelled'].includes(state.phase))return;
    if(activeRankedGame(state,now))player.rankedLeftAt=now;
    player.left=true;delete player.disconnectedAt;advanceMatch(state,now);return;
  }
  if(state.readyForfeit)return;
  if(message.type==='accept-ready'&&state.phase==='loading'&&!player.left){player.acceptedReady=true;return;}
  if(player.left)fail('You left this match.',409);
  if(state.lobby&&['return-request','return-vote'].includes(message.type)){
    returnVote(state,player,message);checkReturn(state,now);return;
  }
  if (state.arena && !['loaded','ready'].includes(message.type)) {
    if (!['propose','vote'].includes(message.type) || message.field !== 'anime' ||
        state.phase !== 'guess' || message.index !== state.index || now < state.startsAt || now >= state.until)
      fail('This song is no longer accepting titles or votes.',409);
    arenaVoteAction(state,player,message);
    return;
  }
  if(state.format==='lobby-team'&&!['loaded','ready','skip'].includes(message.type)){
    if(!['propose','vote','withdraw'].includes(message.type)||state.phase!=='guess'||state.index!==message.index||now<state.startsAt||now>=state.until)fail('Voting is unavailable.',409);
    proposeOrVote(state,player,message);advanceMatch(state,now);return;
  }
  if(message.type==='volunteer'&&state.mode==='ngmc-ranked'){
    if(state.phase!=='loading'||now>=state.counterDeadline)fail('The counter signup period has ended.',409);
    if(state.counters[player.team]&&state.counters[player.team]!==id)fail('Your team already has a counter.',409);
    state.counters[player.team]=id;
  } else if(message.type==='count'&&state.mode==='ngmc-ranked'){
    if(state.phase!=='counting'||message.index!==state.index||state.counters[player.team]!==id)fail('Only your team counter can choose during counting.',403);
    if(state.counts[player.team]!==null)return;
    if(!eligibleNgmc(state,player.team).some(p=>p.id===message.player))fail('Choose a correct teammate with guesses remaining.');
    state.counts[player.team]=message.player;finishNgmcCount(state,now);
  } else if(message.type==='loaded') {
    const slots=state.audioSealed?state.audioPool.length:state.songs.length;
    if(!Array.isArray(message.indices)||message.indices.length>slots||message.indices.some(i=>!Number.isInteger(i)||i<0||i>=slots))fail('Invalid download progress.');
    player.loaded=[...new Set([...player.loaded,...message.indices])];
  } else if(message.type==='ready'){player.acceptedReady=true;player.ready=true;}
  else if(message.type==='draft'){
    if(state.phase!=='guess'||message.index!==state.index||now<state.startsAt||now>=state.until)fail('This song is no longer accepting answers.',409);
    saveDraft(state,player,message,now);
  } else if(message.type==='skip'){
    if(!skipMajority(state)||state.phase!=='guess'||message.index!==state.index||now<state.startsAt||now>=state.until)fail('Skip voting is unavailable.',409);
    if(typeof message.vote!=='boolean')fail('Choose a valid skip vote.');
    player.skip=message.vote;
  } else if(message.type==='unlock') {
    if(state.phase!=='guess'||message.index!==state.index||now<state.startsAt||now>=state.until)fail('This song is no longer accepting changes.',409);
    delete player.draft;player.locked=false;delete player.lockedElapsedMs;
    if(state.teamFields&&player.field){
      const field=player.field;player.field=null;player.answers={};delete player.artists;
      for(const teammate of state.players)if(teammate.team===player.team&&teammate.reactions)delete teammate.reactions[field];
    }
  } else if(message.type==='artists') {
    if(state.arena||state.mode==='ngmc-ranked'||state.teamFields||state.phase!=='guess'||message.index!==state.index||now<state.startsAt||now>=state.until)fail('Artist entries cannot be changed now.',409);
    player.artists=submittedArtists(message.artists);player.answers.artist=player.artists.join(', ');
    if(player.draft){player.draft.artists=player.artists;player.draft.answers.artist='';}
  } else if(message.type==='reaction') {
    if(state.format!=='1-team'||!state.teamFields||message.index!==state.index||!['guess','reveal'].includes(state.phase)||!FIELDS.includes(message.field)||!['O','X','△','?'].includes(message.value))fail('Choose a valid answer reaction.',409);
    if(!state.players.some(p=>p.team===player.team&&p.id!==id&&p.field===message.field))fail('React to a teammate’s submitted answer.');
    player.reactions||={};
    if(player.reactions[message.field]===message.value)delete player.reactions[message.field];else player.reactions[message.field]=message.value;
  } else if(message.type==='answer') {
    if(state.phase!=='guess'||message.index!==state.index||now<state.startsAt||now>=state.until)fail('This song is no longer accepting answers.',409);
    if(state.teamFields){
      const field=message.field;
      const artists=field==='artist'&&message.artists!==undefined?submittedArtists(message.artists):null;
      if(!FIELDS.includes(field)||artists===null&&(typeof message.answer!=='string'||!message.answer.trim()||message.answer.length>300)||artists&&!artists.length&&!player.field)fail('Submit one answer within 300 characters.');
      if(player.field&&player.field!==field)fail('You already claimed another field for this song.',409);
      if(state.players.some(p=>p.team===player.team&&p.id!==id&&p.field===field))fail('A teammate already claimed this field.',409);
      delete player.draft;player.field=field;player.answers={[field]:artists?artists.join(', '):message.answer.trim()};if(field==='artist')player.artists=artists||[message.answer.trim()];
      return;
    }
    if(player.locked&&message.lock!==true)return;
    const fields=state.arena||state.mode==='ngmc-ranked'?['anime']:FIELDS;
    for(const field of fields){if(typeof message.answers?.[field]!=='string'||message.answers[field].length>(field==='artist'&&(player.artists||message.artists)?3500:300))fail('Keep each answer within 300 characters.');}
    if(!state.arena&&state.mode!=='ngmc-ranked'&&message.artists!==undefined){const artists=submittedArtists(message.artists);if(message.answers.artist!==artists.join(', '))fail('Artist list does not match the answer.');player.artists=artists;}
    else if(player.artists&&message.answers.artist!==player.artists.join(', '))delete player.artists;
    const answers=Object.fromEntries(fields.map(field=>[field,message.answers[field].trim()]));
    if(player.locked&&fields.every(field=>player.answers[field]===answers[field]))return;
    delete player.draft;player.answers=answers;
    if(message.lock===true){player.locked=true;player.lockedElapsedMs=Math.max(0,now-state.startsAt);}
  } else fail('Unknown match action.');
  advanceMatch(state,now);
}
export function matchView(state,id,now=Date.now()) {
  const me=state.players.find(p=>p.id===id);if(!me)fail('You are not in this match.',403);
  return {id:state.id,mode:state.mode||'song-artist',pool:state.pool||state.lobby?.pool||'random',total:state.songs.length,preload:state.mode==='ngmc-ranked'?12:10,counters:state.counters,counterDeadline:state.counterDeadline,readyDeadline:state.readyDeadline,counts:state.counts,ratings:state.ratings,format:state.format,phase:state.phase,index:state.index,now,startsAt:state.startsAt||null,until:state.until,reason:state.reason,
    ...playbackView(state,me,now),skipRequired:skipMajority(state),skipVotes:['1-team','lobby-team'].includes(state.format)?state.players.filter(p=>!p.left&&p.skip).map(p=>p.id):undefined,
    ...(state.arena?{arena:{...state.arena,standings:arenaStandings(state.arena),ballot:arenaBallotView(state,me)}}:{}),lobby:state.lobby,returnPoll:state.returnPoll,ballot:state.ballot,myVotes:me.votes,
    voteCounts:state.ballot?Object.fromEntries(FIELDS.flatMap(f=>state.ballot[f].map(o=>[o.id,state.players.filter(p=>!p.left&&p.votes?.[f]===o.id).length]))):undefined,
    myDraft:me.draft,teams:state.teams,me:id,history:state.history,teamFields:!!state.teamFields,
    songList:['finished','cancelled'].includes(state.phase)?state.songs.map((s,index)=>({index,anime:s.anime,song:s.title,artist:s.artist,artistMembers:s.artistMembers||[s.artist]})):state.history.map(({index,anime,song,artist,artistMembers})=>({index,anime,song,artist,artistMembers})),
    players:state.players.map(p=>({id:p.id,name:p.name,avatar:p.avatar||null,audioReady:playerAudioReady(state,p),team:p.team,score:p.score,elo:p.elo,guessRate:p.guessRate,guesses:p.guesses,initialGuesses:p.initialGuesses,loaded:p.loaded.length,ready:p.ready,left:p.left,acceptedReady:p.acceptedReady||p.ready,locked:p.locked,lockedElapsedMs:p.lockedElapsedMs,submittedFields:state.teamFields?(p.field?[p.field]:[]):p.locked?(state.arena||state.mode==='ngmc-ranked'?['anime']:FIELDS):[],...((state.arena||state.mode==='ngmc-ranked'?p.id===me.id:p.team===me.team)?{answers:p.answers,artists:p.artists,field:p.field||null,reactions:p.reactions||{}}:{})}))};
}
