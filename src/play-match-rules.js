import {NGMC_COUNTER_SIGNUP_MS, ngmcCounterDeadline, matchGuessFields, songArtistFields, animeOnlyMode, DUEL_FORMAT, duelRules, DUEL_LOBBY_FORMAT, ONE_TEAM_MODE, ONE_TEAM_FORMAT, oneTeamRules, PLAY_REVEAL_MS, queueMode, usesTeamBallot} from '../public/play-mode-rules.js';
import {defaultPlayGuessSeconds} from '../public/play-audio-format.js';
import {ARENA_FORMAT, arenaRules} from '../public/play-arena-config.js';
import {arenaSongCount, pairPlayers, arenaSchedule, arenaStandings, recordArenaSong, arenaVoteAction, arenaBallotView, arenaVotesComplete, selectArenaTitles} from './play-arena.js';
import {activeRankedGame,RECONNECT_MS,songRatingPools} from '../public/ngmc-leave-policy.js';
import {proposeOrVote,ballotStatus,catalogAnswer,selectWinners,rematchView,returnVote,checkReturn,voteToAbort,checkAbort} from './play-lobby-votes.js';
import { audioWindow, playerAudioReady, playbackView } from './play-integrity.js';
import { balanceNgmc,ngmcGuesses,gradeNgmc,eligibleNgmc,finishNgmcCount } from './ngmc-rules.js';
import { titleMatches, artistMatches, submittedArtists } from './play-artists.js';
import {saveDraft,applyTimeoutDrafts,applyTimeoutProposals} from './play-drafts.js';
export const PLAY_FORMATS=Object.freeze({[DUEL_FORMAT]:{size:2,teams:2},[ARENA_FORMAT]:{size:arenaRules.preferredPlayers},'ngmc-3v3':{size:6,teams:2},'ngmc-ranked':{size:8,teams:2},'1v1':{size:2,teams:2},'3v3':{size:6,teams:2},'1-team':{size:3,teams:1},[ONE_TEAM_FORMAT]:{size:oneTeamRules.maxPlayers,teams:1}});
export const FIELDS=songArtistFields;
function skipMajority(state){
  return Math.floor(state.players.filter(p=>!p.left).length/2)+1;
}
function allPlayersReadyToReveal(state,active,catalog) {
  if(usesTeamBallot(state.format)){
    const {ready,hasValidAnswer}=ballotStatus(state,catalog);
    return hasValidAnswer&&active.every(p=>p.autoSkip||ready.has(p.id));
  }
  const hasAutoskip = active.some(player => player.autoSkip);
  if (state.arena) return hasAutoskip && arenaVotesComplete(active);
  if (state.format==='1-team' && hasAutoskip) {
    const fields=matchGuessFields(state);
    const hasAnswer=p=>fields.some(field=>catalogAnswer(catalog,field,p.answers[field]));
    return active.some(hasAnswer)&&active.every(p=>p.autoSkip||((state.teamFields||p.locked)&&hasAnswer(p)));
  }
  if (state.teamFields && hasAutoskip) {
    return active.every(p=>p.autoSkip||!!p.answers[p.field]);
  }
  return active.every(player => player.locked || player.autoSkip);
}
export const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
export function makeMatch(id,format,players,songs,now=Date.now(),lobby=null) {
  const ngmc=['ngmc-ranked','ngmc-3v3','lobby-ngmc'].includes(format);
  const survival=format===ONE_TEAM_FORMAT;
  const arena=format===ARENA_FORMAT;
  const duelLobby=format===DUEL_LOBBY_FORMAT && players.length===2;
  const custom=lobby&&(survival||arena||duelLobby||players.length>=1&&players.length<=8&&
    (['lobby-team','lobby-ffa'].includes(format)||format==='lobby-ngmc'&&[6,8].includes(players.length)));
  const rules=arena?{size:players.length,teams:players.length/2}:survival?{size:players.length,teams:1}:custom?{size:players.length,teams:ngmc||duelLobby?2:format==='lobby-ffa'?players.length:1}:PLAY_FORMATS[format];
  const validSongs=survival?songs.length>0&&songs.length<=oneTeamRules.songs:
    songs.length===(arena?arenaSongCount(players.length):custom?lobby.songs:ngmc?35:format===DUEL_FORMAT?duelRules.songs:20);
  if(!rules||players.length!==rules.size||new Set(players.map(p=>p.id)).size!==rules.size||!validSongs||
    survival&&(players.length<oneTeamRules.minPlayers||players.length>oneTeamRules.maxPlayers))fail('Invalid match setup.');

  let roster=[...players];
  for(let i=roster.length-1;i>0;i--){const x=new Uint32Array(1);crypto.getRandomValues(x);const j=x[0]%(i+1);[roster[i],roster[j]]=[roster[j],roster[i]];}
  if(ngmc)roster=balanceNgmc(roster);
  if(arena)roster=pairPlayers(roster);
  const samples=new Uint32Array(songs.length);crypto.getRandomValues(samples);
  const mode=ngmc?'ngmc-ranked':survival?ONE_TEAM_MODE:queueMode(format)===ONE_TEAM_MODE?'song-artist':queueMode(format);
  return {id,format,...(custom?{lobby}:{readyDeadline:now+90000}),samplePositions:Array.from(samples,n=>n/4294967296),teamFields:['3v3','1-team'].includes(format),...(arena?{arena:arenaSchedule(rules.teams)}:{}),mode,...(ngmc?{counters:[null,null],autoCounting:[false,false],autoCountAt:now+NGMC_COUNTER_SIGNUP_MS}:{}),songs,index:0,phase:'loading',until:now+180000,created:now,teams:Array(rules.teams).fill(ngmc?5:survival?oneTeamRules.lives:0),history:[],players:roster.map((p,i)=>({id:p.id,name:p.name,avatar:p.avatar||null,team:ngmc||arena?p.team:i%rules.teams,...(arena?{elo:p.elo}:{}),...(ngmc?{elo:p.elo,guessRate:p.guessRate,initialGuesses:p.guessRate===null?3:ngmcGuesses(p.guessRate),guesses:p.guessRate===null?3:ngmcGuesses(p.guessRate)}:{}),score:0,loaded:[],acceptedReady:!!custom,ready:false,left:false,...(!custom||survival?{answeredMatch:false}:{}),answers:{},locked:false}))};
}
function recordRoundParticipation(state) {
  const usesProposals = state.arena || usesTeamBallot(state.format);
  for (const player of state.players) {
    if (player.left || player.answeredMatch !== false) continue;
    player.answeredMatch = Object.values(player.answers).some(Boolean) || !usesProposals &&
      (Object.values(player.draft?.answers || {}).some(Boolean) || !!player.draft?.artists?.length);
  }
}

export function gradeRound(state,now,catalog) {
  if(state.phase!=='guess')return;
  const expired = now >= state.until;
  if (expired && (state.arena || usesTeamBallot(state.format))) applyTimeoutProposals(state);
  if (state.arena) selectArenaTitles(state);
  else if (usesTeamBallot(state.format)) selectWinners(state,catalog);
  else applyTimeoutDrafts(state, expired);
  recordRoundParticipation(state);
  if(state.mode==='ngmc-ranked'){gradeNgmc(state,now);return;}
  const song=state.songs[state.index],teamHits=state.teams.map(()=>new Set());
  const scoringFields=matchGuessFields(state);
  const results=state.players.map(player=>{
    const correct=Object.fromEntries(scoringFields.map(field=>[field,!player.left&&(field==='artist'?song.answers.artist.some(expected=>artistMatches(expected,player.artists??player.answers.artist,song.artistRules)):titleMatches(song.answers[field],player.answers[field])) ]));
    const earned=Object.values(correct).filter(Boolean).length;
    player.score+=earned;
    for(const field of FIELDS)if(correct[field])teamHits[player.team].add(field);
    return {id:player.id,answers:{...player.answers},correct,earned,autoSubmitted:!!player.autoSubmitted};
  });
  const points=teamHits.map(hits=>hits.size);
  const survival=state.format===ONE_TEAM_FORMAT;
  if(survival){if(!points[0])state.teams[0]=Math.max(0,state.teams[0]-1);}
  else for(let i=0;i<teamHits.length;i++)state.teams[i]+=points[i];
  if(state.arena)recordArenaSong(state.arena,state.index,teamHits.map(h=>h.size),state.players);
  state.history.push({index:state.index,anime:song.anime,animeTitles:song.animeTitles,song:song.title,songType:song.songType,artist:song.artist,artistMembers:song.artistMembers||[song.artist],results,points,...(survival?{lives:[...state.teams]}:{})});
  state.phase='reveal';state.until=now+PLAY_REVEAL_MS;
}
export function advanceMatch(state,now=Date.now(),catalog) {
  if(['finished','cancelled'].includes(state.phase))return;
  const ngmc=state.mode==='ngmc-ranked';
  for(const p of state.players){
    if(!p.left && p.disconnectedAt!=null && now>=p.disconnectedAt+RECONNECT_MS && (state.arena || state.format===ONE_TEAM_FORMAT || activeRankedGame(state,now))){
      p.left=true;if(!state.arena&&state.format!==ONE_TEAM_FORMAT)p.rankedLeftAt=p.disconnectedAt+RECONNECT_MS;delete p.disconnectedAt;
    }
  }
  const active=state.players.filter(p=>!p.left);
  if((state.format===DUEL_FORMAT||state.format===DUEL_LOBBY_FORMAT) && active.length===1){
    const departed=state.players.find(p=>p.left);
    const forfeited=departed.rankedLeftAt!=null || state.format===DUEL_LOBBY_FORMAT&&state.phase!=='loading';
    if(forfeited||state.phase==='loading'){
      state.phase=forfeited?'finished':'cancelled';
      state.reason=departed.name+' left the match.';
      state.until=now+86400000;return;
    }
  }
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
  if(checkAbort(state,now)||checkReturn(state,now))return;
  if(ngmc&&state.history.length&&state.teams.some((_,team)=>!active.some(p=>p.team===team))){if(state.phase==='counting')finishNgmcCount(state,Infinity);for(let team=0;team<2;team++)if(!active.some(p=>p.team===team))state.teams[team]=0;state.phase='finished';state.reason='A team left the match.';state.until=now+86400000;return;}
  if(!active.length){state.phase='cancelled';state.reason='All players left the match.';state.until=now+86400000;return;}
  if(state.phase==='loading'||state.phase==='buffering') {
    if(ngmc && state.phase==='loading' && now>=ngmcCounterDeadline(state)){
      state.autoCounting=state.counters.map(id=>!id);
    }
    if((!ngmc||state.phase==='buffering'||state.counters.every((id,team)=>id||state.autoCounting?.[team]))&&active.every(p=>playerAudioReady(state,p))) {
      if(state.syncPlayback && active.some(p=>p.clipReadyIndex!==state.index)){
        if(!state.preparingClip){
          state.preparingClip=true;state.until=now+120000;
        }else if(now>=state.until){
          state.phase='cancelled';state.reason='Players could not prepare the current song in time.';state.until=now+86400000;
        }
        return;
      }
      delete state.preparingClip;
      state.phase='guess';state.startsAt=now+(state.syncPlayback?1000:0);
      if(state.index===0)for(const p of active)if(p.disconnectedAt!=null)p.disconnectedAt=state.startsAt;
      state.until=state.lobby?.seconds===0?8.64e15:state.startsAt+(state.lobby?.seconds??defaultPlayGuessSeconds(state.mode))*1000;
    } else if(now>=state.until){
      if((state.arena||state.format===ONE_TEAM_FORMAT) && active.some(p=>p.disconnectedAt!=null)){
        state.until=Math.max(now+1,...active.filter(p=>p.disconnectedAt!=null).map(p=>p.disconnectedAt+RECONNECT_MS));
        return;
      }
      state.phase='cancelled';state.reason='Not all players could load the audio in time.';state.until=now+86400000;}
  } else if(state.phase==='guess'){
    const needed=skipMajority(state);
    const skipped=needed>0&&active.filter(p=>p.skip).length>=needed;
    if(now>=state.until||now>=state.startsAt&&(skipped||allPlayersReadyToReveal(state,active,catalog)))gradeRound(state,now,catalog);
  }
  else if(state.phase==='counting')finishNgmcCount(state,now);
  else if(state.phase==='reveal'&&now>=state.until) {
    if(state.index===state.songs.length-1||(ngmc||state.format===ONE_TEAM_FORMAT)&&state.teams.includes(0)){
      state.completed=true;state.phase='finished';state.until=now+86400000;
      if(state.format===ONE_TEAM_FORMAT)state.rematch={until:now+90_000,votes:{}};
      return;
    }
    state.index++;state.phase='buffering';state.until=now+90000;delete state.audioWaitLimit;
    delete state.ballot;
    for(const p of state.players){delete p.votes;delete p.lastBallotChoice;delete p.arenaTitle;delete p.arenaVote;delete p.draft;delete p.autoSubmitted;delete p.skip;delete p.autoSkip;p.answers={};delete p.artists;p.locked=false;delete p.lockedElapsedMs;p.field=null;p.reactions={};}
    advanceMatch(state,now,catalog);
  }
}
export function matchMove(state,id,message,now=Date.now(),catalog) {
  const player=state.players.find(p=>p.id===id);if(!player)fail('You are not in this match.',403);
  advanceMatch(state,now,catalog);
  if(message.type==='leave'){
    if(player.left||['finished','cancelled'].includes(state.phase))return;
    if(activeRankedGame(state,now))player.rankedLeftAt=now;
    player.left=true;delete player.disconnectedAt;advanceMatch(state,now,catalog);return;
  }
  if(message.type==='clip-ready'){
    if(!player.left && state.preparingClip && ['loading','buffering'].includes(state.phase) &&
        message.index===state.index && message.revision===(state.audioRevision||0) && playerAudioReady(state,player)){
      player.clipReadyIndex=state.index;advanceMatch(state,now,catalog);
    }
    return;
  }
  if(state.readyForfeit)return;
  if(message.type==='accept-ready'&&state.phase==='loading'&&!player.left){player.acceptedReady=true;return;}
  if(player.left)fail('You left this match.',409);
  if(['abort-request','abort-vote'].includes(message.type)){
    voteToAbort(state,player,message);checkAbort(state,now);return;
  }
  if(state.lobby&&['return-request','return-vote'].includes(message.type)){
    returnVote(state,player,message);checkReturn(state,now);return;
  }
  if (state.arena && !['loaded','ready','skip','auto-skip','draft'].includes(message.type)) {
    if (!['propose','vote'].includes(message.type) || message.field !== 'anime' ||
        state.phase !== 'guess' || message.index !== state.index || now < state.startsAt || now >= state.until)
      fail('This song is no longer accepting titles or votes.',409);
    arenaVoteAction(state,player,message);
    advanceMatch(state,now,catalog);
    return;
  }
  if(usesTeamBallot(state.format)&&!['loaded','ready','skip','auto-skip','draft'].includes(message.type)){
    if(!['propose','vote','withdraw'].includes(message.type)||state.phase!=='guess'||state.index!==message.index||now<state.startsAt||now>=state.until)fail('Voting is unavailable.',409);
    proposeOrVote(state,player,message);advanceMatch(state,now,catalog);return;
  }
  if(message.type==='auto-count'&&state.mode==='ngmc-ranked'){
    if(state.autoCounting?.[player.team])return;
    if(state.phase!=='loading'||state.counters[player.team])fail('Your team already has a counting assignment.',409);
    state.autoCounting??=[false,false];
    state.autoCounting[player.team]=true;
  } else if(message.type==='volunteer'&&state.mode==='ngmc-ranked'){
    if(['finished','cancelled'].includes(state.phase))fail('This match has ended.',409);
    const team=player.team;
    if(state.counters[team]===id)return;
    if(state.counters[team])fail('Your team already has a counter.',409);
    if(!state.autoCounting?.[team]&&(state.phase!=='loading'||now>=ngmcCounterDeadline(state)))
      fail('The counter signup period has ended.',409);
    state.counters[team]=id;
    if(state.autoCounting)state.autoCounting[team]=false;
  } else if(message.type==='count'&&state.mode==='ngmc-ranked'){
    if(state.phase!=='counting'||message.index!==state.index||state.counters[player.team]!==id)fail('Only your team counter can choose during counting.',403);
    if(state.counts[player.team]!==null)return;
    if(!eligibleNgmc(state,player.team).some(p=>p.id===message.player))fail('Choose a correct teammate with guesses remaining.');
    state.counts[player.team]=message.player;finishNgmcCount(state,now);
  } else if(message.type==='loaded') {
    const slots=state.audioSealed?state.audioPool.length:state.songs.length;
    if(!Array.isArray(message.indices)||message.indices.length>slots||message.indices.some(i=>!Number.isInteger(i)||i<0||i>=slots))fail('Invalid download progress.');
    if(state.audioSealed && ['loading','buffering'].includes(state.phase)){
      const {start,end}=audioWindow(state);
      if(message.indices.some(i=>i>=start && i<end && !player.loaded.includes(i))){
        state.audioWaitLimit ??= state.until+180000;
        state.until=Math.max(state.until,Math.min(state.audioWaitLimit,now+120000));
      }
    }
    player.loaded=[...new Set([...player.loaded,...message.indices])];
  } else if(message.type==='ready'){player.acceptedReady=true;player.ready=true;}
  else if(message.type==='draft'){
    if(state.phase!=='guess'||message.index!==state.index||now<state.startsAt||now>=state.until)fail('This song is no longer accepting answers.',409);
    saveDraft(state,player,message,now);
    return;
  } else if(message.type==='skip'||message.type==='auto-skip'){
    if(!skipMajority(state)||state.phase!=='guess'||message.index!==state.index||now<state.startsAt||now>=state.until)fail('Skip voting is unavailable.',409);
    if(typeof message.vote!=='boolean')fail('Choose a valid skip vote.');
    if(message.type==='auto-skip')player.autoSkip=message.vote;
    else player.skip=message.vote;
  } else if(message.type==='unlock') {
    if(state.phase!=='guess'||message.index!==state.index||now<state.startsAt||now>=state.until)fail('This song is no longer accepting changes.',409);
    delete player.draft;player.locked=false;delete player.lockedElapsedMs;
    if(state.teamFields&&player.field){
      const field=player.field;player.field=null;player.answers={};delete player.artists;
      for(const teammate of state.players)if(teammate.team===player.team&&teammate.reactions)delete teammate.reactions[field];
    }
  } else if(message.type==='artists') {
    if(!matchGuessFields(state).includes('artist')||state.teamFields||state.phase!=='guess'||message.index!==state.index||now<state.startsAt||now>=state.until)fail('Artist entries cannot be changed now.',409);
    player.artists=submittedArtists(message.artists);player.answers.artist=player.artists.join(', ');
    if(player.draft){player.draft.artists=player.artists;player.draft.answers.artist='';if(player.draft.timeoutChoices)delete player.draft.timeoutChoices.artist;}
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
      if(player.answeredMatch===false && player.answers[field])player.answeredMatch=true;
      advanceMatch(state,now,catalog);
      return;
    }
    if(player.locked&&message.lock!==true)return;
    const fields=matchGuessFields(state);
    for(const field of fields){if(typeof message.answers?.[field]!=='string'||message.answers[field].length>(field==='artist'&&(player.artists||message.artists)?3500:300))fail('Keep each answer within 300 characters.');}
    if(fields.includes('artist')&&message.artists!==undefined){const artists=submittedArtists(message.artists);if(message.answers.artist!==artists.join(', '))fail('Artist list does not match the answer.');player.artists=artists;}
    else if(player.artists&&message.answers.artist!==player.artists.join(', '))delete player.artists;
    const answers=Object.fromEntries(fields.map(field=>[field,message.answers[field].trim()]));
    if(player.locked&&fields.every(field=>player.answers[field]===answers[field]))return;
    delete player.draft;player.answers=answers;
    if(player.answeredMatch===false && Object.values(answers).some(Boolean))player.answeredMatch=true;
    if(message.lock===true){player.locked=true;player.lockedElapsedMs=Math.max(0,now-state.startsAt);}
  } else fail('Unknown match action.');
  advanceMatch(state,now,catalog);
}
export function matchView(state,id,now=Date.now(),compactHistory=false,catalog) {
  const me=state.players.find(p=>p.id===id);if(!me)fail('You are not in this match.',403);
  const ended=['finished','cancelled'].includes(state.phase);
  const compact=compactHistory&&!ended;
  const ballotReady=state.format===ONE_TEAM_FORMAT&&state.phase==='guess'?ballotStatus(state,catalog).ready:null;
  // NGMC counting can revise the latest revealed round's lives and spent guesses.
  const historyFrom=compact?Math.max(0,state.history.length-1):0;
  return {id:state.id,mode:state.mode||'song-artist',pool:state.pool||state.lobby?.pool||'random',total:state.songs.length,preload:state.openingSongs??(state.mode==='ngmc-ranked'?12:10),audioWindow:state.audioSealed?audioWindow(state):undefined,counters:state.counters,autoCounting:state.autoCounting,counterDeadline:ngmcCounterDeadline(state),autoCountAt:ngmcCounterDeadline(state),readyDeadline:state.readyDeadline,counts:state.counts,ratings:state.ratings,format:state.format,phase:state.phase,index:state.index,now,startsAt:state.startsAt||null,until:state.until,reason:state.reason,
    ...(ended?{settlementPending:!state.rankingsSettled,ratingsPending:!state.ratingsDone&&!state.rankingsSettled,
      creditsPending:!!(state.completed&&(!state.lobby||state.format===ONE_TEAM_FORMAT)&&!me.left&&me.disconnectedAt==null&&me.rankedLeftAt==null&&!state.creditsDone&&!state.rankingsSettled)}:{}),
    preparingClip:!!state.preparingClip,...playbackView(state,me,now),skipRequired:skipMajority(state),myAutoSkip:!!me.autoSkip,skipVotes:state.players.filter(p=>!p.left&&p.skip).map(p=>p.id),
    ...(state.arena?{arena:{...state.arena,standings:arenaStandings(state.arena),ballot:arenaBallotView(state,me)}}:{}),lobby:state.lobby,creditReward:state.creditRewards?.find(row=>row.id===me.id),returnPoll:ended?undefined:state.returnPoll,abortPoll:ended?undefined:state.abortPoll,aborted:state.aborted,rematch:rematchView(state,now,id),ballot:state.ballot,myVotes:me.votes,
    voteCounts:state.ballot?Object.fromEntries(Object.entries(state.ballot).flatMap(([field,options])=>
      options.map(o=>[o.id,state.players.filter(p=>!p.left&&p.votes?.[field]===o.id).length]))):undefined,
    myDraft:me.draft,teams:state.teams,me:id,history:compact?state.history.slice(historyFrom):state.history,...(compact?{historyFrom}:{}),teamFields:!!state.teamFields,
    songList:ended&&!state.aborted&&state.format!==ONE_TEAM_FORMAT?state.songs.map((s,index)=>({index,anime:s.anime,animeTitles:state.history[index]?.animeTitles,song:s.title,artist:s.artist,artistMembers:s.artistMembers||[s.artist]})):compact?undefined:state.history.map(({index,anime,animeTitles,song,artist,artistMembers})=>({index,anime,animeTitles,song,artist,artistMembers})),
    players:state.players.map(p=>({id:p.id,name:p.name,avatar:p.avatar||null,audioReady:playerAudioReady(state,p)&&(!state.preparingClip||p.clipReadyIndex===state.index),team:p.team,score:p.score,...(ballotReady?{answerReady:ballotReady.has(p.id)}:{}),elo:p.elo,guessRate:p.guessRate,guesses:p.guesses,initialGuesses:p.initialGuesses,loaded:p.loaded.length,ready:p.ready,left:p.left,acceptedReady:p.acceptedReady||p.ready,locked:p.locked,lockedElapsedMs:p.lockedElapsedMs,submittedFields:state.format===ONE_TEAM_FORMAT
      ? (p.votes?.anime||(state.ballot?.anime||[]).some(option=>option.owner===p.id)?['anime']:[])
      : state.teamFields?(p.field?[p.field]:[]):p.locked?(matchGuessFields(state)):[],...((animeOnlyMode(state.mode)?p.id===me.id:p.team===me.team)?{answers:p.answers,artists:p.artists,field:p.field||null,reactions:p.reactions||{}}:{})}))};
}
